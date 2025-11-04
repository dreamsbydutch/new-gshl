/**
 * Yahoo Scraper TRPC Router
 * ==========================
 * Exposes endpoints for triggering Yahoo roster scrapes and syncing data.
 */

import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import {
  YahooRosterScraper,
  createYahooScraper,
} from "../../../scripts/yahoo-roster-scraper";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { findCurrentSeason } from "@gshl-utils";
import type {
  Player,
  Team,
  Franchise,
  Season,
  Owner,
  Week,
  RosterPosition,
  PositionGroup,
  PlayerDayStatLine,
} from "@gshl-types";

// ============================================================================
// SCHEMAS
// ============================================================================

const targetDateSchema = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Target date must be YYYY-MM-DD.")
  .optional();

const scrapeTeamSchema = z.object({
  teamId: z.string(),
  leagueId: z.string().optional(),
  targetDate: targetDateSchema,
});

const scrapeAllTeamsSchema = z.object({
  leagueId: z.string().optional(),
  teamIds: z.array(z.string()).optional(),
  targetDate: targetDateSchema,
});

const syncPlayersSchema = z.object({
  leagueId: z.string().optional(),
  teamIds: z.array(z.string()).optional(),
  targetDate: targetDateSchema,
  dryRun: z.boolean().default(false),
});

// ============================================================================
// ROUTER
// ============================================================================

export const yahooScraperRouter = createTRPCRouter({
  /**
   * Scrape a single team's roster
   */
  scrapeTeam: publicProcedure
    .input(scrapeTeamSchema)
    .mutation(async ({ input }) => {
      const leagueId = input.leagueId ?? process.env.YAHOO_LEAGUE_ID ?? "";

      if (!leagueId) {
        throw new Error(
          "Yahoo League ID not configured. Set YAHOO_LEAGUE_ID environment variable.",
        );
      }

      // Fetch team mapping and seasons
      const [teams, franchises, seasons] = await Promise.all([
        optimizedSheetsAdapter.findMany("Team", {}) as unknown as Team[],
        optimizedSheetsAdapter.findMany(
          "Franchise",
          {},
        ) as unknown as Franchise[],
        optimizedSheetsAdapter.findMany("Season", {}) as unknown as Season[],
      ]);

      // Determine which season the target date falls into
      const targetDate = input.targetDate
        ? new Date(input.targetDate)
        : new Date();
      const season = findCurrentSeason(seasons, targetDate);

      if (!season) {
        throw new Error(
          `No season found for date ${targetDate.toISOString().split("T")[0]}`,
        );
      }

      // Find franchise by yahooApiId
      const franchise = franchises.find((f) => f.yahooApiId === input.teamId);

      // Find team for this franchise in the determined season
      const gshlTeam =
        franchise && season
          ? teams.find(
              (t) => t.franchiseId === franchise.id && t.seasonId === season.id,
            )
          : null;

      const scraper = createYahooScraper(leagueId, [input.teamId], {
        targetDate: input.targetDate,
      });
      const results = await scraper.scrapeAllTeams();
      const teamRoster = results[0];

      if (!teamRoster) {
        throw new Error(`Failed to scrape team ${input.teamId}`);
      }

      return {
        success: true,
        gshlTeamId: gshlTeam?.id ?? null,
        franchiseId: franchise?.id ?? null,
        franchiseName: franchise?.name ?? null,
        seasonId: season.id,
        seasonName: season.name,
        targetDate: targetDate.toISOString().split("T")[0],
        teamRoster,
        playerCount: teamRoster.players.length,
        errors: teamRoster.errors,
      };
    }),

  /**
   * Scrape all teams' rosters
   */
  scrapeAllTeams: publicProcedure
    .input(scrapeAllTeamsSchema)
    .mutation(async ({ input }) => {
      const leagueId = input.leagueId ?? process.env.YAHOO_LEAGUE_ID ?? "";
      const teamIds = input.teamIds ?? getDefaultTeamIds();

      if (!leagueId) {
        throw new Error(
          "Yahoo League ID not configured. Set YAHOO_LEAGUE_ID environment variable.",
        );
      }

      if (teamIds.length === 0) {
        throw new Error(
          "No team IDs provided. Set YAHOO_TEAM_IDS environment variable or pass teamIds.",
        );
      }

      // Fetch team mapping and seasons
      const [teams, franchises, owners, seasons] = await Promise.all([
        optimizedSheetsAdapter.findMany("Team", {}) as unknown as Team[],
        optimizedSheetsAdapter.findMany(
          "Franchise",
          {},
        ) as unknown as Franchise[],
        optimizedSheetsAdapter.findMany("Owner", {}) as unknown as Owner[],
        optimizedSheetsAdapter.findMany("Season", {}) as unknown as Season[],
      ]);

      // Determine which season the target date falls into
      const targetDate = input.targetDate
        ? new Date(input.targetDate)
        : new Date();
      const season = findCurrentSeason(seasons, targetDate);

      if (!season) {
        throw new Error(
          `No season found for date ${targetDate.toISOString().split("T")[0]}`,
        );
      }

      // Build map: yahooApiId -> franchise and team (for determined season)
      const franchiseByYahooId = new Map<string, Franchise>();
      const teamByYahooId = new Map<string, Team>();

      for (const franchise of franchises) {
        if (franchise.yahooApiId) {
          franchiseByYahooId.set(franchise.yahooApiId, franchise);
          // Find team for THIS franchise in the DETERMINED season
          const team = teams.find(
            (t) => t.franchiseId === franchise.id && t.seasonId === season.id,
          );
          if (team) {
            teamByYahooId.set(franchise.yahooApiId, team);
          }
        }
      }

      const scraper = createYahooScraper(leagueId, teamIds, {
        targetDate: input.targetDate,
      });
      const results = await scraper.scrapeAllTeams();

      // Enrich results with GSHL team mapping
      const enrichedResults = results.map((roster) => {
        const franchise = franchiseByYahooId.get(roster.teamId);
        const gshlTeam = teamByYahooId.get(roster.teamId);
        const owner = franchise
          ? owners.find((o) => o.id === franchise.ownerId)
          : null;

        return {
          ...roster,
          gshlTeamId: gshlTeam?.id ?? null,
          franchiseId: franchise?.id ?? null,
          franchiseName: franchise?.name ?? null,
          ownerName: owner?.nickName ?? null,
          seasonId: season.id,
          seasonName: season.name,
        };
      });

      const summary = {
        totalTeams: results.length,
        mappedTeams: enrichedResults.filter((r) => r.gshlTeamId !== null)
          .length,
        unmappedTeams: enrichedResults.filter((r) => r.gshlTeamId === null)
          .length,
        successfulTeams: results.filter(
          (r) => !r.errors || r.errors.length === 0,
        ).length,
        totalPlayers: results.reduce((sum, r) => sum + r.players.length, 0),
        seasonId: season.id,
        seasonName: season.name,
        targetDate: targetDate.toISOString().split("T")[0],
        errors: results
          .filter((r) => r.errors && r.errors.length > 0)
          .map((r) => ({
            teamId: r.teamId,
            errors: r.errors,
          })),
      };

      return {
        success: true,
        results: enrichedResults,
        summary,
      };
    }),

  /**
   * Scrape rosters and sync to Google Sheets
   */
  syncPlayers: publicProcedure
    .input(syncPlayersSchema)
    .mutation(async ({ input }) => {
      const leagueId = input.leagueId ?? process.env.YAHOO_LEAGUE_ID ?? "";
      const teamIds = input.teamIds ?? getDefaultTeamIds();

      if (!leagueId) {
        throw new Error(
          "Yahoo League ID not configured. Set YAHOO_LEAGUE_ID environment variable.",
        );
      }

      if (teamIds.length === 0) {
        throw new Error(
          "No team IDs provided. Set YAHOO_TEAM_IDS environment variable or pass teamIds.",
        );
      }

      // Step 1: Scrape Yahoo rosters
      const scraper = createYahooScraper(leagueId, teamIds, {
        targetDate: input.targetDate,
      });
      const rosters = await scraper.scrapeAllTeams();

      // Step 2: Fetch GSHL teams, franchises, and seasons to map Yahoo team IDs
      const [teams, franchises, seasons] = await Promise.all([
        optimizedSheetsAdapter.findMany("Team", {}) as unknown as Team[],
        optimizedSheetsAdapter.findMany(
          "Franchise",
          {},
        ) as unknown as Franchise[],
        optimizedSheetsAdapter.findMany("Season", {}) as unknown as Season[],
      ]);

      // Determine which season the target date falls into
      const targetDate = input.targetDate
        ? new Date(input.targetDate)
        : new Date();
      const season = findCurrentSeason(seasons, targetDate);

      if (!season) {
        throw new Error(
          `No season found for date ${targetDate.toISOString().split("T")[0]}`,
        );
      }

      // Build map: yahooApiId -> GSHL team (for determined season)
      const teamByYahooId = new Map<string, Team>();
      for (const franchise of franchises) {
        if (franchise.yahooApiId) {
          const team = teams.find(
            (t) => t.franchiseId === franchise.id && t.seasonId === season.id,
          );
          if (team) {
            teamByYahooId.set(franchise.yahooApiId, team);
          }
        }
      }

      // Step 3: Fetch existing players from Sheets
      const existingPlayers = (await optimizedSheetsAdapter.findMany(
        "Player",
        {},
      )) as unknown as Player[];
      const playerByName = new Map(
        existingPlayers.map((p) => [normalizePlayerName(p.fullName), p]),
      );

      // Step 4: Build update operations
      const updates: Array<{
        playerId: string;
        playerName: string;
        gshlTeamId: string | null;
        changes: Partial<Player>;
      }> = [];

      const unmappedTeams = new Set<string>();

      for (const roster of rosters) {
        const gshlTeam = teamByYahooId.get(roster.teamId);

        if (!gshlTeam) {
          unmappedTeams.add(roster.teamId);
          console.warn(
            `Yahoo team ID ${roster.teamId} not mapped to any GSHL team/franchise`,
          );
        }

        for (const yahooPlayer of roster.players) {
          const normalizedName = normalizePlayerName(yahooPlayer.playerName);
          const existingPlayer = playerByName.get(normalizedName);

          if (!existingPlayer) {
            console.warn(
              `Player not found in database: ${yahooPlayer.playerName}`,
            );
            continue;
          }

          const changes: Partial<Player> = {};

          // Update team assignment if we have a valid GSHL team
          if (gshlTeam && existingPlayer.gshlTeamId !== gshlTeam.id) {
            changes.gshlTeamId = gshlTeam.id;
          }

          // Map Yahoo lineup position to GSHL position
          const newLineupPos = YahooRosterScraper.mapYahooPosition(
            yahooPlayer.lineupPosition,
          );
          if (existingPlayer.lineupPos !== newLineupPos) {
            changes.lineupPos = newLineupPos;
          }

          // Update NHL team if different
          if (
            yahooPlayer.nhlTeam &&
            existingPlayer.nhlTeam !== yahooPlayer.nhlTeam
          ) {
            changes.nhlTeam = yahooPlayer.nhlTeam;
          }

          // Track updates
          if (Object.keys(changes).length > 0) {
            updates.push({
              playerId: existingPlayer.id,
              playerName: existingPlayer.fullName,
              gshlTeamId: gshlTeam?.id ?? null,
              changes,
            });
          }
        }
      }

      // Step 4: Apply updates (if not dry run)
      if (!input.dryRun && updates.length > 0) {
        for (const update of updates) {
          await optimizedSheetsAdapter.update("Player", {
            where: { id: update.playerId },
            data: update.changes,
          });
        }
      }

      return {
        success: true,
        dryRun: input.dryRun,
        seasonId: season.id,
        seasonName: season.name,
        targetDate: targetDate.toISOString().split("T")[0],
        scrapedTeams: rosters.length,
        mappedTeams: rosters.length - unmappedTeams.size,
        unmappedYahooTeamIds: Array.from(unmappedTeams),
        totalPlayers: rosters.reduce((sum, r) => sum + r.players.length, 0),
        updatesPlanned: updates.length,
        updatesApplied: input.dryRun ? 0 : updates.length,
        updates: updates.map((u) => ({
          playerId: u.playerId,
          playerName: u.playerName,
          gshlTeamId: u.gshlTeamId,
          changes: u.changes,
        })),
      };
    }),

  /**
   * Scrape rosters and create/update PlayerDay records
   * Automatically handles duplicates via upsert
   */
  scrapeAndSyncPlayerDays: publicProcedure
    .input(
      z.object({
        leagueId: z.string().optional(),
        teamIds: z.array(z.string()).optional(),
        targetDate: targetDateSchema,
        weekId: z.string().optional(), // Optional: will be determined from targetDate if not provided
        dryRun: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const leagueId = input.leagueId ?? process.env.YAHOO_LEAGUE_ID ?? "";
      const teamIds = input.teamIds ?? getDefaultTeamIds();

      if (!leagueId) {
        throw new Error(
          "Yahoo League ID not configured. Set YAHOO_LEAGUE_ID environment variable.",
        );
      }

      if (teamIds.length === 0) {
        throw new Error(
          "No team IDs provided. Set YAHOO_TEAM_IDS environment variable or pass teamIds.",
        );
      }

      // Step 1: Fetch teams, franchises, seasons, weeks, and players
      const [teams, franchises, seasons, weeks, players] = await Promise.all([
        optimizedSheetsAdapter.findMany("Team", {}) as unknown as Team[],
        optimizedSheetsAdapter.findMany(
          "Franchise",
          {},
        ) as unknown as Franchise[],
        optimizedSheetsAdapter.findMany("Season", {}) as unknown as Season[],
        optimizedSheetsAdapter.findMany("Week", {}) as unknown as Week[],
        optimizedSheetsAdapter.findMany("Player", {}) as unknown as Player[],
      ]);

      // Step 2: Determine season and week from target date
      // Parse date string as UTC midnight to avoid timezone issues
      const targetDate = input.targetDate
        ? new Date(input.targetDate + "T00:00:00.000Z")
        : new Date();
      const season = findCurrentSeason(seasons, targetDate);

      if (!season) {
        throw new Error(
          `No season found for date ${targetDate.toISOString().split("T")[0]}`,
        );
      }

      // Determine weekId: use provided value or find from targetDate
      let weekId: string;
      if (input.weekId) {
        weekId = input.weekId;
      } else {
        const { findWeekByDate } = await import("@gshl-utils");
        const week = findWeekByDate(weeks, targetDate, season.id);

        if (!week) {
          // Log all weeks for this season to help debug
          const seasonWeeks = weeks.filter(
            (w) => String(w.seasonId) === String(season.id),
          );
          console.error(
            `❌ No week found for date ${targetDate.toISOString().split("T")[0]} in season ${season.name}`,
          );
          console.error(
            "Available weeks:",
            seasonWeeks.map((w) => ({
              id: w.id,
              num: w.weekNum,
              start: w.startDate,
              end: w.endDate,
            })),
          );
          throw new Error(
            `No week found for date ${targetDate.toISOString().split("T")[0]} in season ${season.name}`,
          );
        }

        const startDateStr =
          week.startDate instanceof Date
            ? week.startDate.toISOString().split("T")[0]
            : String(week.startDate).split("T")[0];
        const endDateStr =
          week.endDate instanceof Date
            ? week.endDate.toISOString().split("T")[0]
            : String(week.endDate).split("T")[0];

        console.log(
          `📅 Matched date ${targetDate.toISOString().split("T")[0]} to week ${week.weekNum} (${week.id}): ${startDateStr} to ${endDateStr}`,
        );
        weekId = week.id;
      }

      // Step 3: Build mapping tables and determine which Yahoo teams to scrape
      const teamByYahooId = new Map<string, Team>();
      const yahooTeamIdsForSeason: string[] = [];

      for (const franchise of franchises) {
        if (franchise.yahooApiId) {
          const team = teams.find(
            (t) => t.franchiseId === franchise.id && t.seasonId === season.id,
          );
          if (team) {
            teamByYahooId.set(franchise.yahooApiId, team);
            yahooTeamIdsForSeason.push(franchise.yahooApiId);
          }
        }
      }

      // Only scrape teams that exist in this season
      // If teamIds were explicitly provided, filter to only those that exist in this season
      const teamsToScrape = input.teamIds
        ? input.teamIds.filter((id) => yahooTeamIdsForSeason.includes(id))
        : yahooTeamIdsForSeason;

      if (teamsToScrape.length === 0) {
        throw new Error(
          `No active teams found for season ${season.name}. Check that franchises have yahooApiId set.`,
        );
      }

      console.log(
        `📊 [Yahoo Scraper] Season ${season.name} has ${teamsToScrape.length} active teams (filtered from ${teamIds.length} provided)`,
      );

      const playerByName = new Map(
        players.map((p) => [normalizePlayerName(p.fullName), p]),
      );

      // Step 4: Scrape Yahoo rosters
      console.log(
        `🤖 [Yahoo Scraper] Starting scrape for ${teamsToScrape.length} teams in ${season.name}...`,
      );
      const scraper = createYahooScraper(leagueId, teamsToScrape, {
        targetDate: input.targetDate,
        seasonId: season.id,
      });
      const rosters = await scraper.scrapeAllTeams();
      console.log(`✅ [Yahoo Scraper] Scraped ${rosters.length} team rosters`);

      // Step 5: Transform scraped data to PlayerDay records
      console.log(
        `🔄 [Yahoo Scraper] Transforming ${rosters.reduce((sum, r) => sum + r.players.length, 0)} players to PlayerDay records...`,
      );
      const playerDayRecords: Array<{
        playerId: string;
        seasonId: string;
        weekId: string;
        gshlTeamId: string;
        date: Date;
        nhlPos: string[];
        posGroup: "F" | "D" | "G";
        nhlTeam: string;
        dailyPos: string;
        bestPos: string;
        fullPos: string;
        opp?: string;
        score?: string;
        // Skater stats (undefined if no game played)
        GP?: string;
        MG?: string;
        IR?: string;
        IRplus?: string;
        GS?: string;
        G?: string;
        A?: string;
        P?: string;
        PM?: string;
        PIM?: string;
        PPP?: string;
        SOG?: string;
        HIT?: string;
        BLK?: string;
        // Goalie stats (undefined if no game played or not a goalie)
        W?: string;
        GA?: string;
        GAA?: string;
        SV?: string;
        SA?: string;
        SVP?: string;
        SO?: string;
        TOI?: string;
        // Calculated stats
        Rating?: string;
        ADD?: string;
        MS?: string;
        BS?: string;
      }> = [];

      const errors: string[] = [];
      const unmappedTeams = new Set<string>();
      const unmappedPlayers = new Set<string>();

      // Fetch previous day's roster to calculate ADD column
      const previousDate = new Date(targetDate);
      previousDate.setDate(previousDate.getDate() - 1);
      const previousDateStr = previousDate.toISOString().split("T")[0]!;

      // Fetch ALL PlayerDayStatLine records and filter in memory
      const allPlayerDayRecords = (await optimizedSheetsAdapter.findMany(
        "PlayerDayStatLine",
        {},
      )) as unknown as Array<{
        playerId: string;
        gshlTeamId: string;
        date: Date;
      }>;

      // Filter to previous day's records - compare date strings
      const previousDayRecords = allPlayerDayRecords.filter((record) => {
        const recordDateStr = new Date(record.date).toISOString().split("T")[0];
        return recordDateStr === previousDateStr;
      });

      // Build a set of "playerId:teamId" combinations from previous day for quick lookup
      const previousDayRoster = new Set<string>();
      for (const record of previousDayRecords) {
        previousDayRoster.add(`${record.playerId}:${record.gshlTeamId}`);
      }

      for (const roster of rosters) {
        const gshlTeam = teamByYahooId.get(roster.teamId);

        if (!gshlTeam) {
          unmappedTeams.add(roster.teamId);
          continue;
        }

        for (const yahooPlayer of roster.players) {
          try {
            const normalizedName = normalizePlayerName(yahooPlayer.playerName);
            const player = findPlayerByName(normalizedName, playerByName);

            if (!player) {
              unmappedPlayers.add(yahooPlayer.playerName);
              continue;
            }

            // Determine position group (using enum)
            const { PositionGroup } = await import("@gshl-types");
            const posGroup =
              yahooPlayer.playerType === "goalie"
                ? PositionGroup.G
                : yahooPlayer.positions.includes("D")
                  ? PositionGroup.D
                  : PositionGroup.F;

            // Helper to convert stats based on whether player played
            const playerPlayed =
              yahooPlayer.stats?.GP === 1 || yahooPlayer.stats?.GP === "1";

            // Convert stat to string or undefined
            // - If player didn't play (GP=0), return undefined for all stats
            // - If player played (GP=1), return "0" for zero values, actual value otherwise
            // - For skaters: all skater stats should have values when played
            // - For goalies: all goalie stats should have values when played
            const toStatString = (
              val: string | number | null | undefined,
              isGoalieStat = false,
            ): string | undefined => {
              if (!playerPlayed) return undefined; // No game played = no stats

              // Player played - provide value
              if (val === undefined || val === null) {
                // For goalie stats when not a goalie, leave undefined
                if (isGoalieStat && yahooPlayer.playerType !== "goalie") {
                  return undefined;
                }
                // For skater stats when a goalie, leave undefined
                if (!isGoalieStat && yahooPlayer.playerType === "goalie") {
                  return undefined;
                }
                return "0"; // Played but no value = 0
              }
              return String(val);
            };

            // Map injury tag to IR/IRplus fields
            // IRplus: Can be any injury designation (all tags are valid)
            // IR: Any injury designation EXCEPT DTD and O
            const isIRplus = yahooPlayer.injuryTag !== null;
            const isIR =
              yahooPlayer.injuryTag !== null &&
              yahooPlayer.injuryTag !== "DTD" &&
              yahooPlayer.injuryTag !== "O";

            // Calculate MG (Missed Games)
            // MG = 1 if: team played (teamPlayed=true) AND player did not play (GP=0 or undefined)
            const missedGame =
              yahooPlayer.teamPlayed && !playerPlayed ? "1" : undefined;

            // Map Yahoo positions to RosterPosition enum
            const { RosterPosition } = await import("@gshl-types");

            const mapPosition = (pos: string) => {
              const upper = pos.trim().toUpperCase();
              if (upper === "LW") return RosterPosition.LW;
              if (upper === "C") return RosterPosition.C;
              if (upper === "RW") return RosterPosition.RW;
              if (upper === "D") return RosterPosition.D;
              if (upper === "G") return RosterPosition.G;
              if (upper === "UTIL") return RosterPosition.Util;
              if (upper === "IR") return RosterPosition.IR;
              if (upper === "IR+") return RosterPosition.IRPlus;
              if (upper === "BN") return RosterPosition.BN;
              return RosterPosition.BN; // Default to bench
            };

            const mappedNhlPos = yahooPlayer.positions.map(mapPosition);
            const mappedDailyPos = mapPosition(yahooPlayer.lineupPosition);

            // Calculate ADD: "1" if player was NOT on this team yesterday, undefined otherwise
            const playerTeamKey = `${player.id}:${gshlTeam.id}`;
            const isAdd = !previousDayRoster.has(playerTeamKey)
              ? "1"
              : undefined;

            // Build PlayerDay record (all fields from schema)
            playerDayRecords.push({
              // Core identifiers
              playerId: player.id,
              seasonId: season.id,
              weekId: weekId,
              gshlTeamId: gshlTeam.id,
              date: new Date(targetDate.toISOString().split("T")[0]!), // Store as YYYY-MM-DD date
              // Position & game info
              nhlPos: mappedNhlPos,
              posGroup,
              nhlTeam: yahooPlayer.nhlTeam,
              dailyPos: mappedDailyPos,
              bestPos: "BN", // Will be set by lineup optimizer
              fullPos: "BN", // Will be set by lineup optimizer
              opp: yahooPlayer.opponent ?? undefined, // Store opponent
              score: yahooPlayer.score ?? undefined, // Store score
              // Skater stats (undefined if no game played, "0" or value if played)
              GP: toStatString(yahooPlayer.stats?.GP),
              MG: missedGame, // "1" if missed, undefined otherwise
              IR: isIR ? "1" : undefined, // "1" if on IR, undefined otherwise
              IRplus: isIRplus ? "1" : undefined, // "1" if on IR+, undefined otherwise
              GS: toStatString(yahooPlayer.stats?.GS),
              G: toStatString(yahooPlayer.stats?.G),
              A: toStatString(yahooPlayer.stats?.A),
              P: toStatString(yahooPlayer.stats?.P),
              PM: toStatString(yahooPlayer.stats?.PM),
              PIM: toStatString(yahooPlayer.stats?.PIM),
              PPP: toStatString(yahooPlayer.stats?.PPP),
              SOG: toStatString(yahooPlayer.stats?.SOG),
              HIT: toStatString(yahooPlayer.stats?.HIT),
              BLK: toStatString(yahooPlayer.stats?.BLK),
              // Goalie stats (undefined if no game played or not a goalie)
              W: toStatString(yahooPlayer.stats?.W, true),
              GA: toStatString(yahooPlayer.stats?.GA, true),
              GAA:
                playerPlayed && yahooPlayer.playerType === "goalie"
                  ? yahooPlayer.stats?.GAA
                    ? String(yahooPlayer.stats.GAA)
                    : "0.00"
                  : undefined,
              SV: toStatString(yahooPlayer.stats?.SV, true),
              SA: toStatString(yahooPlayer.stats?.SA, true),
              SVP:
                playerPlayed && yahooPlayer.playerType === "goalie"
                  ? yahooPlayer.stats?.SVP
                    ? String(yahooPlayer.stats.SVP)
                    : "0.000"
                  : undefined,
              SO: toStatString(yahooPlayer.stats?.SO, true),
              TOI: toStatString(yahooPlayer.stats?.TOI, true),
              // Calculated stats
              Rating:
                yahooPlayer.stats?.GP === 1 || yahooPlayer.stats?.GP === "1"
                  ? String(yahooPlayer.stats.Rating ?? 0)
                  : undefined,
              ADD: isAdd, // "1" if added today, undefined otherwise
              MS: undefined,
              BS: undefined,
            });
          } catch (error) {
            errors.push(
              `Failed to process player ${yahooPlayer.playerName}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      console.log(
        `📝 [Yahoo Scraper] Built ${playerDayRecords.length} PlayerDay records`,
      );
      console.log(
        `⚠️  [Yahoo Scraper] ${unmappedPlayers.size} unmapped players, ${errors.length} processing errors`,
      );

      // Log unmapped players if any
      if (unmappedPlayers.size > 0) {
        console.log(
          `⚠️  [Yahoo Scraper] Unmapped players: ${Array.from(unmappedPlayers).join(", ")}`,
        );
      }

      // Log errors if any
      if (errors.length > 0) {
        console.log(`⚠️  [Yahoo Scraper] Processing errors:`);
        for (const error of errors) {
          console.log(`   - ${error}`);
        }
      }

      // Step 5.5: Run lineup optimizer for each team
      console.log(
        `🎯 [Yahoo Scraper] Running lineup optimizer for each team...`,
      );

      const { optimizeLineup } = await import("@gshl-utils");

      // Group players by team
      const playersByTeam = new Map<string, typeof playerDayRecords>();
      for (const playerDay of playerDayRecords) {
        const teamId = String(playerDay.gshlTeamId);
        if (!playersByTeam.has(teamId)) {
          playersByTeam.set(teamId, []);
        }
        playersByTeam.get(teamId)!.push(playerDay);
      }

      // Optimize each team's lineup
      for (const [teamId, teamPlayers] of playersByTeam) {
        try {
          // Convert PlayerDay records to LineupPlayer format
          const lineupPlayers = teamPlayers.map((p) => ({
            playerId: String(p.playerId),
            nhlPos: p.nhlPos as RosterPosition[],
            posGroup: p.posGroup as PositionGroup,
            dailyPos: p.dailyPos as RosterPosition,
            GP: Number(p.GP) || 0,
            GS: Number(p.GS) || 0,
            IR: Number(p.IR) || 0,
            IRplus: Number(p.IRplus) || 0,
            Rating: Number(p.Rating) || 0,
          }));

          // Run optimizer
          const optimized = optimizeLineup(lineupPlayers);

          // Update playerDayRecords with optimized positions and calculate MS/BS
          for (let i = 0; i < teamPlayers.length; i++) {
            const playerDay = teamPlayers[i]!;
            const optimizedPlayer = optimized[i]!;

            // Update fullPos and bestPos
            playerDay.fullPos = optimizedPlayer.fullPos;
            playerDay.bestPos = optimizedPlayer.bestPos;

            // Active lineup positions (not bench/IR)
            const activePositions = ["C", "LW", "RW", "D", "Util", "G"];

            // MS (Missed Start): Player didn't start (GS ≠ 1) but played (GP = 1)
            // and should have been in active lineup based on fullPos
            if (
              playerDay.GS !== "1" &&
              playerDay.GP === "1" &&
              activePositions.includes(playerDay.fullPos)
            ) {
              playerDay.MS = "1";
            } else {
              playerDay.MS = undefined;
            }

            // BS (Bench Start): Player started (GS = 1) but shouldn't have
            // been based on bestPos (optimal lineup)
            if (playerDay.GS === "1" && playerDay.bestPos === "BN") {
              playerDay.BS = "1";
            } else {
              playerDay.BS = undefined;
            }
          }
        } catch (error) {
          console.warn(
            `⚠️  [Yahoo Scraper] Failed to optimize lineup for team ${teamId}:`,
            error,
          );
        }
      }

      console.log(
        `✅ [Yahoo Scraper] Lineup optimization complete for ${playersByTeam.size} teams`,
      );

      // Build set of player IDs that are currently on rosters for this date
      const scrapedPlayerIds = new Set(
        playerDayRecords.map((r) => `${r.playerId}:${r.gshlTeamId}`),
      );

      // Step 6: Upsert PlayerDay records
      let upsertResult = {
        created: 0,
        updated: 0,
        rejected: [] as Array<{ record: unknown; reason: string }>,
        errors: [] as string[],
      };

      let deletedCount = 0;

      if (!input.dryRun && playerDayRecords.length > 0) {
        console.log(
          `💾 [Yahoo Scraper] Upserting ${playerDayRecords.length} records to database...`,
        );
        // Import the playerStats router to use its upsertMany
        const { playerStatsRouter } = await import("./playerStats");

        // Call upsertMany through the router
        try {
          const caller = playerStatsRouter.createCaller({
            headers: new Headers(),
          });

          upsertResult = await caller.daily.upsertMany({
            data: playerDayRecords as unknown as PlayerDayStatLine[], // Type assertion to handle complex nested types
            dryRun: false,
          });

          console.log(
            `✅ [Yahoo Scraper] Upsert complete: ${upsertResult.created} created, ${upsertResult.updated} updated`,
          );
          if (upsertResult.errors.length > 0) {
            console.log(
              `⚠️  [Yahoo Scraper] ${upsertResult.errors.length} errors during upsert`,
            );
          }
          if (upsertResult.rejected.length > 0) {
            console.log(
              `⚠️  [Yahoo Scraper] ${upsertResult.rejected.length} records rejected (outside update window)`,
            );
          }
        } catch (error) {
          console.error(`❌ [Yahoo Scraper] Upsert failed:`, error);
          errors.push(
            `Failed to upsert PlayerDay records: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Step 7: Delete PlayerDay records for players no longer on rosters
        try {
          console.log(
            `🗑️  [Yahoo Scraper] Checking for dropped players to delete...`,
          );

          // Fetch all existing PlayerDay records for this date
          const existingPlayerDays = (await optimizedSheetsAdapter.findMany(
            "PlayerDayStatLine",
            {
              where: {
                date: targetDate.toISOString().split("T")[0],
                seasonId: season.id,
              },
            },
          )) as unknown as {
            id: string;
            playerId: string;
            gshlTeamId: string;
          }[];

          // Find records that exist in database but weren't in the scraped rosters
          const recordsToDelete: string[] = [];
          for (const existingRecord of existingPlayerDays) {
            const key = `${existingRecord.playerId}:${existingRecord.gshlTeamId}`;
            if (!scrapedPlayerIds.has(key)) {
              recordsToDelete.push(existingRecord.id);
            }
          }

          if (recordsToDelete.length > 0) {
            console.log(
              `🗑️  [Yahoo Scraper] Deleting ${recordsToDelete.length} records for dropped players...`,
            );

            // Delete each record
            for (const recordId of recordsToDelete) {
              await optimizedSheetsAdapter.delete("PlayerDayStatLine", {
                where: { id: recordId },
              });
            }

            deletedCount = recordsToDelete.length;
            console.log(`✅ [Yahoo Scraper] Deleted ${deletedCount} records`);
          } else {
            console.log(`✅ [Yahoo Scraper] No dropped players found`);
          }
        } catch (error) {
          console.error(`❌ [Yahoo Scraper] Deletion failed:`, error);
          errors.push(
            `Failed to delete dropped player records: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else if (input.dryRun) {
        console.log(
          `🔍 [Yahoo Scraper] Dry run mode - skipping database upsert and deletion`,
        );
      }

      console.log(
        `🏁 [Yahoo Scraper] Scrape complete for ${targetDate.toISOString().split("T")[0]}`,
      );

      return {
        success: true,
        dryRun: input.dryRun,
        seasonId: season.id,
        seasonName: season.name,
        weekId: weekId,
        targetDate: targetDate.toISOString().split("T")[0],
        scrapedTeams: rosters.length,
        mappedTeams: rosters.length - unmappedTeams.size,
        unmappedYahooTeamIds: Array.from(unmappedTeams),
        unmappedPlayerNames: Array.from(unmappedPlayers).slice(0, 20), // Limit to first 20
        totalPlayersScraped: rosters.reduce(
          (sum, r) => sum + r.players.length,
          0,
        ),
        playerDayRecordsBuilt: playerDayRecords.length,
        upsertResult: {
          created: upsertResult.created,
          updated: upsertResult.updated,
          deleted: deletedCount,
          rejected: upsertResult.rejected.length,
          errors: upsertResult.errors.length,
        },
        errors: [...errors, ...upsertResult.errors],
      };
    }),

  /**
   * Recalculate ADD column for all PlayerDay records in the sheet
   * Compares each day with the previous day to determine if player was added
   * First day of season: no ADDs (everyone is new)
   */
  recalculateAddColumn: publicProcedure
    .input(
      z.object({
        dryRun: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      console.log(`🔄 [Yahoo Scraper] Starting ADD column recalculation...`);

      // Step 1: Fetch all PlayerDay records
      const allPlayerDayRecords = (await optimizedSheetsAdapter.findMany(
        "PlayerDayStatLine",
        {},
      )) as unknown as Array<{
        id: string;
        playerId: string;
        gshlTeamId: string;
        seasonId: string;
        date: Date;
        ADD?: string;
      }>;

      console.log(
        `📊 [Yahoo Scraper] Found ${allPlayerDayRecords.length} PlayerDay records`,
      );

      // Step 2: Sort records by date
      const sortedRecords = allPlayerDayRecords.sort((a, b) => {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });

      // Step 3: Group records by date
      const recordsByDate = new Map<
        string,
        Array<{
          id: string;
          playerId: string;
          gshlTeamId: string;
          seasonId: string;
          date: Date;
          ADD?: string;
        }>
      >();

      for (const record of sortedRecords) {
        const dateStr = new Date(record.date).toISOString().split("T")[0]!;
        if (!recordsByDate.has(dateStr)) {
          recordsByDate.set(dateStr, []);
        }
        recordsByDate.get(dateStr)!.push(record);
      }

      const uniqueDates = Array.from(recordsByDate.keys()).sort();
      console.log(
        `📅 [Yahoo Scraper] Processing ${uniqueDates.length} unique dates`,
      );

      // Step 4: Process each date and calculate ADD
      const updatesToApply: Array<{
        id: string;
        ADD: string | undefined;
      }> = [];

      for (const currentDateStr of uniqueDates) {
        const currentRecords = recordsByDate.get(currentDateStr)!;

        // Calculate previous date (the day before)
        const currentDate = new Date(currentDateStr);
        const previousDate = new Date(currentDate);
        previousDate.setDate(previousDate.getDate() - 1);
        const previousDateStr = previousDate.toISOString().split("T")[0]!;

        // Check if previous day has ANY records in the table
        const previousDayHasRecords = recordsByDate.has(previousDateStr);

        if (!previousDayHasRecords) {
          console.log(
            `🎬 [Yahoo Scraper] ${currentDateStr} has no previous day in table - treating as season start (no ADDs)`,
          );
          // No previous day found = season start date: everyone is new, no one is an ADD
          for (const record of currentRecords) {
            updatesToApply.push({
              id: record.id,
              ADD: undefined,
            });
          }
        } else {
          // Regular date: check against previous day
          const previousDayRecords = recordsByDate.get(previousDateStr)!;
          const previousDayRoster = new Set(
            previousDayRecords.map((r) => `${r.playerId}:${r.gshlTeamId}`),
          );

          for (const record of currentRecords) {
            const playerTeamKey = `${record.playerId}:${record.gshlTeamId}`;
            const isAdd = !previousDayRoster.has(playerTeamKey);

            updatesToApply.push({
              id: record.id,
              ADD: isAdd ? "1" : undefined,
            });
          }
        }
      }

      console.log(
        `✏️  [Yahoo Scraper] Prepared ${updatesToApply.length} updates`,
      );

      const addCount = updatesToApply.filter((u) => u.ADD === "1").length;
      const noAddCount = updatesToApply.filter(
        (u) => u.ADD === undefined,
      ).length;

      console.log(
        `📈 [Yahoo Scraper] ADD breakdown: ${addCount} adds, ${noAddCount} no-adds`,
      );

      // Step 5: Apply updates
      let updateCount = 0;
      if (!input.dryRun) {
        console.log(`💾 [Yahoo Scraper] Applying updates to database...`);

        // Use bulkUpdateByIds for maximum performance
        try {
          await optimizedSheetsAdapter.bulkUpdateByIds(
            "PlayerDayStatLine",
            updatesToApply.map((update) => ({
              id: update.id,
              data: { ADD: update.ADD } as Partial<PlayerDayStatLine>,
            })),
          );

          updateCount = updatesToApply.length;
          console.log(
            `✅ [Yahoo Scraper] Updated ${updateCount} records using bulk update`,
          );
        } catch (error) {
          console.error(`❌ [Yahoo Scraper] Bulk update failed:`, error);
          throw error;
        }
      } else {
        console.log(
          `🔍 [Yahoo Scraper] Dry run mode - skipping database updates`,
        );
      }

      return {
        success: true,
        dryRun: input.dryRun,
        totalRecords: allPlayerDayRecords.length,
        uniqueDates: uniqueDates.length,
        updatesPlanned: updatesToApply.length,
        updatesApplied: updateCount,
        addCount,
        noAddCount,
      };
    }),

  /**
   * Get scraper status and configuration
   */
  getStatus: publicProcedure.query(() => {
    const leagueId = process.env.YAHOO_LEAGUE_ID ?? "";
    const teamIds = getDefaultTeamIds();
    const hasCookies = !!(process.env.YAHOO_SESSION_COOKIE ?? "");

    return {
      configured: !!leagueId && teamIds.length > 0,
      leagueId: leagueId || "(not set)",
      teamCount: teamIds.length,
      authenticated: hasCookies,
      lastRun: null, // TODO: track last run in DB/cache
    };
  }),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get default team IDs from environment
 */
function getDefaultTeamIds(): string[] {
  const teamIdsStr = process.env.YAHOO_TEAM_IDS ?? "";
  return teamIdsStr
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Normalize player name for matching
 */
/**
 * Normalize player name for matching by removing special characters,
 * handling accents, and standardizing format.
 */
function normalizePlayerName(name: string): string {
  return (
    name
      .toLowerCase()
      // Remove accents and diacritics (é→e, á→a, ý→y, etc.)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // Remove all non-alphanumeric characters
      .replace(/[^a-z0-9]/g, "")
      .trim()
  );
}

/**
 * Map of Yahoo name variations to database name patterns.
 * Used to match shortened names like "J. Marchessault" to "Jonathan Marchessault"
 * or alternate names like "Mitch Marner" to "Mitchell Marner".
 */
const PLAYER_NAME_ALIASES: Record<string, string[]> = {
  // Shortened first names
  jmarchessault: ["jonathanmarchessault"],
  // Alternate first names (nicknames vs full names)
  mitchmarner: ["mitchellmarner"],
  mattcoronato: ["matthewcoronato"], // Matt Coronato → Matthew Coronato
  danvladar: ["danielvladar"], // Dan Vladar → Daniel Vladar
  danielvladar: ["danvladar"], // Daniel Vladar → Dan Vladar
  // Add more as needed
};

/**
 * Try to find a player by name, checking both the exact normalized name
 * and any known aliases.
 */
function findPlayerByName(
  normalizedYahooName: string,
  playerMap: Map<string, { id: string; fullName: string }>,
): { id: string; fullName: string } | undefined {
  // Try exact match first
  let player = playerMap.get(normalizedYahooName);
  if (player) return player;

  // Try aliases
  const aliases = PLAYER_NAME_ALIASES[normalizedYahooName];
  if (aliases) {
    for (const alias of aliases) {
      player = playerMap.get(alias);
      if (player) return player;
    }
  }

  // Try reverse lookup - check if any database name aliases match this Yahoo name
  for (const [dbName, aliasList] of Object.entries(PLAYER_NAME_ALIASES)) {
    if (aliasList.includes(normalizedYahooName)) {
      player = playerMap.get(dbName);
      if (player) return player;
    }
  }

  return undefined;
}
