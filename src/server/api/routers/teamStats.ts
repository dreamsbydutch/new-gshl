import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { baseQuerySchema } from "./_schemas";
import {
  type TeamDayStatLine,
  type TeamSeasonStatLine,
  type TeamWeekStatLine,
  type PlayerDayStatLine,
  type PlayerWeekStatLine,
  type Week,
  type Matchup,
  type Team,
  type AggregationConfig,
  SeasonType,
} from "@gshl-types";
import { calculateMatchupScores } from "./matchup";

/**
 * Calculate team season statistics from team weeks and matchups
 */
function calculateTeamSeasonStats(
  teamWeeks: TeamWeekStatLine[],
  matchups: Matchup[],
  teamConfMap: Map<string, string>,
  playerWeeks: PlayerWeekStatLine[],
  allWeeks: Week[],
): TeamSeasonStatLine[] {
  // Create a map of weekId -> weekType
  const weekTypeMap = new Map(allWeeks.map((w) => [w.id, w.weekType]));

  // Group team weeks by team and season type (derived from week)
  const teamGroups = new Map<
    string,
    { weeks: TeamWeekStatLine[]; seasonType: SeasonType }
  >();

  for (const week of teamWeeks) {
    const weekType = weekTypeMap.get(week.weekId);
    if (!weekType) continue;

    // weekType is already a SeasonType enum value
    const seasonType = weekType;

    const key = `${week.gshlTeamId}:${seasonType}`;
    if (!teamGroups.has(key)) {
      teamGroups.set(key, { weeks: [], seasonType });
    }
    teamGroups.get(key)!.weeks.push(week);
  }

  const teamSeasonStats: TeamSeasonStatLine[] = [];

  for (const [key, { weeks, seasonType }] of teamGroups) {
    const teamId = key.split(":")[0]!;
    const seasonId = weeks[0]!.seasonId;
    const teamConf = teamConfMap.get(teamId);

    // Aggregate basic stats (sum all weeks)
    const aggregated = weeks.reduce(
      (acc, week) => {
        acc.days += 1;
        acc.GP += Number(week.GP) || 0;
        acc.MG += Number(week.MG) || 0;
        acc.IR += Number(week.IR) || 0;
        acc.IRplus += Number(week.IRplus) || 0;
        acc.GS += Number(week.GS) || 0;
        acc.G += Number(week.G) || 0;
        acc.A += Number(week.A) || 0;
        acc.P += Number(week.P) || 0;
        acc.PM += Number(week.PM) || 0;
        acc.PIM += Number(week.PIM) || 0;
        acc.PPP += Number(week.PPP) || 0;
        acc.SOG += Number(week.SOG) || 0;
        acc.HIT += Number(week.HIT) || 0;
        acc.BLK += Number(week.BLK) || 0;
        acc.W += Number(week.W) || 0;
        acc.GA += Number(week.GA) || 0;
        acc.SV += Number(week.SV) || 0;
        acc.SA += Number(week.SA) || 0;
        acc.SO += Number(week.SO) || 0;
        acc.TOI += Number(week.TOI) || 0;
        acc.Rating += Number(week.Rating) || 0;
        acc.ADD += Number(week.ADD) || 0;
        acc.MS += Number(week.MS) || 0;
        acc.BS += Number(week.BS) || 0;
        return acc;
      },
      {
        days: 0,
        GP: 0,
        MG: 0,
        IR: 0,
        IRplus: 0,
        GS: 0,
        G: 0,
        A: 0,
        P: 0,
        PM: 0,
        PIM: 0,
        PPP: 0,
        SOG: 0,
        HIT: 0,
        BLK: 0,
        W: 0,
        GA: 0,
        SV: 0,
        SA: 0,
        SO: 0,
        TOI: 0,
        Rating: 0,
        ADD: 0,
        MS: 0,
        BS: 0,
      },
    );

    // Calculate GAA and SVP
    const GAA = aggregated.GS > 0 ? aggregated.GA / aggregated.GS : 0;
    const SVP = aggregated.SA > 0 ? aggregated.SV / aggregated.SA : 0;

    // Get week IDs for this season type
    const weekIdsInSeasonType = new Set(
      allWeeks
        .filter((w) => {
          if (seasonType === SeasonType.PLAYOFFS)
            return w.weekType === SeasonType.PLAYOFFS;
          if (seasonType === SeasonType.LOSERS_TOURNAMENT)
            return w.weekType === SeasonType.LOSERS_TOURNAMENT;
          return w.weekType === SeasonType.REGULAR_SEASON;
        })
        .map((w) => w.id),
    );

    // Filter matchups for this team and season type
    const teamMatchups = matchups.filter((m) => {
      const isCorrectType = weekIdsInSeasonType.has(m.weekId);
      return (
        isCorrectType &&
        m.isCompleted &&
        (m.homeTeamId === teamId || m.awayTeamId === teamId)
      );
    });

    // Sort matchups by week to calculate streak
    const sortedMatchups = [...teamMatchups].sort((a, b) =>
      a.weekId.localeCompare(b.weekId),
    );

    // Calculate matchup stats
    let teamW = 0;
    let teamHW = 0;
    let teamHL = 0;
    let teamL = 0;
    let teamTie = 0;
    let teamCCW = 0;
    let teamCCHW = 0;
    let teamCCHL = 0;
    let teamCCL = 0;
    let teamCCTie = 0;

    const recentResults: Array<"W" | "L" | "T"> = [];

    for (const matchup of sortedMatchups) {
      const isHome = matchup.homeTeamId === teamId;
      const opponentId = isHome ? matchup.awayTeamId : matchup.homeTeamId;
      const opponentConf = teamConfMap.get(opponentId);
      const isConference =
        teamConf && opponentConf && teamConf === opponentConf;
      // const isPostseason = seasonType === SeasonType.PLAYOFFS;

      const homeScore = matchup.homeScore ?? 0;
      const awayScore = matchup.awayScore ?? 0;
      const isTie = matchup.tie === true;
      const isHomeWin = matchup.homeWin === true;
      const isAwayWin = matchup.awayWin === true;

      let result: "W" | "L" | "T" | null = null;

      if (isTie) {
        teamTie++;
        if (isConference) teamCCTie++;
        result = "T";
      } else if (isHome && isHomeWin) {
        // Home team won
        teamW++;
        if (isConference) teamCCW++;

        // If tied score, home team gets HW (home win on tie)
        if (homeScore === awayScore) {
          teamHW++;
          if (isConference) teamCCHW++;
        }
        result = "W";
      } else if (!isHome && isAwayWin) {
        // Away team won
        teamW++;
        if (isConference) teamCCW++;
        result = "W";
      } else if (isHome && isAwayWin) {
        // Home team lost normally
        teamL++;
        if (isConference) teamCCL++;

        // Away team won, so home team doesn't get HL here
        result = "L";
      } else if (!isHome && isHomeWin) {
        // Away team lost (home team won)
        teamL++;
        if (isConference) teamCCL++;

        // If tied score, away team gets HL (home loss on tie)
        if (homeScore === awayScore) {
          teamHL++;
          if (isConference) teamCCHL++;
        }
        result = "L";
      }

      if (result) {
        recentResults.push(result);
      }
    }

    // Calculate current streak (from most recent backwards)
    let streak = "";
    if (recentResults.length > 0) {
      const lastResult = recentResults[recentResults.length - 1]!;
      let streakCount = 1;

      for (let i = recentResults.length - 2; i >= 0; i--) {
        if (recentResults[i] === lastResult) {
          streakCount++;
        } else {
          break;
        }
      }

      streak = `${streakCount}${lastResult}`;
    }

    // Count unique players for this team in this season type
    const uniquePlayers = new Set(
      playerWeeks
        .filter(
          (pw) =>
            pw.gshlTeamId === teamId &&
            pw.seasonId === seasonId &&
            weekIdsInSeasonType.has(pw.weekId),
        )
        .map((pw) => pw.playerId),
    );

    teamSeasonStats.push({
      id: `${teamId}-${seasonId}-${seasonType}`,
      seasonId,
      seasonType,
      gshlTeamId: teamId,
      days: aggregated.days,
      GP: aggregated.GP,
      MG: aggregated.MG,
      IR: aggregated.IR,
      IRplus: aggregated.IRplus,
      GS: aggregated.GS,
      G: aggregated.G,
      A: aggregated.A,
      P: aggregated.P,
      PM: aggregated.PM,
      PIM: aggregated.PIM,
      PPP: aggregated.PPP,
      SOG: aggregated.SOG,
      HIT: aggregated.HIT,
      BLK: aggregated.BLK,
      W: aggregated.W,
      GA: aggregated.GA,
      GAA,
      SV: aggregated.SV,
      SA: aggregated.SA,
      SVP,
      SO: aggregated.SO,
      TOI: aggregated.TOI,
      Rating: aggregated.Rating,
      ADD: aggregated.ADD,
      MS: aggregated.MS,
      BS: aggregated.BS,
      streak,
      powerRk: 0,
      powerRating: 0,
      prevPowerRk: 0,
      prevPowerRating: 0,
      teamW,
      teamHW,
      teamHL,
      teamL,
      teamTie,
      teamCCW,
      teamCCHW,
      teamCCHL,
      teamCCL,
      teamCCTie,
      overallRk: 0,
      conferenceRk: 0,
      wildcardRk: null,
      playersUsed: uniquePlayers.size,
      norrisRating: null,
      norrisRk: null,
      vezinaRating: null,
      vezinaRk: null,
      calderRating: null,
      calderRk: null,
      jackAdamsRating: null,
      jackAdamsRk: null,
      GMOYRating: null,
      GMOYRk: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Calculate rankings
  calculateRankings(teamSeasonStats, teamConfMap);

  return teamSeasonStats;
}

/**
 * Calculate overall, conference, and wildcard rankings
 */
function calculateRankings(
  teamSeasons: TeamSeasonStatLine[],
  teamConfMap: Map<string, string>,
) {
  // Group by season type
  const seasonTypeGroups = new Map<SeasonType, TeamSeasonStatLine[]>();
  for (const ts of teamSeasons) {
    if (!seasonTypeGroups.has(ts.seasonType)) {
      seasonTypeGroups.set(ts.seasonType, []);
    }
    seasonTypeGroups.get(ts.seasonType)!.push(ts);
  }

  // Calculate rankings for each season type separately
  for (const [, teams] of seasonTypeGroups) {
    // Calculate points: (3*(W-HW))+(2*HW)+HL
    const teamsWithPoints = teams.map((t) => ({
      team: t,
      points: 3 * (t.teamW - t.teamHW) + 2 * t.teamHW + t.teamHL,
    }));

    // Sort by points (descending)
    teamsWithPoints.sort((a, b) => b.points - a.points);

    // Assign overall rank
    teamsWithPoints.forEach((tp, index) => {
      tp.team.overallRk = index + 1;
    });

    // Calculate conference rankings
    const conferences = new Set(
      teams.map((t) => teamConfMap.get(t.gshlTeamId)).filter(Boolean),
    );

    for (const conf of conferences) {
      const confTeams = teamsWithPoints.filter(
        (tp) => teamConfMap.get(tp.team.gshlTeamId) === conf,
      );
      confTeams.sort((a, b) => b.points - a.points);

      confTeams.forEach((tp, index) => {
        tp.team.conferenceRk = index + 1;
      });
    }

    // Calculate wildcard rankings (exclude top 3 from each conference)
    const wildcardTeams = teamsWithPoints.filter((tp) => {
      const conf = teamConfMap.get(tp.team.gshlTeamId);
      if (!conf) return true;

      const confTeams = teamsWithPoints.filter(
        (t) => teamConfMap.get(t.team.gshlTeamId) === conf,
      );
      confTeams.sort((a, b) => b.points - a.points);

      const isTop3 = confTeams.slice(0, 3).some((t) => t === tp);
      return !isTop3;
    });

    wildcardTeams.sort((a, b) => b.points - a.points);
    wildcardTeams.forEach((tp, index) => {
      tp.team.wildcardRk = index + 1;
    });

    // Teams in top 3 of conference have no wildcard rank
    teamsWithPoints.forEach((tp) => {
      const conf = teamConfMap.get(tp.team.gshlTeamId);
      if (conf) {
        const confTeams = teamsWithPoints.filter(
          (t) => teamConfMap.get(t.team.gshlTeamId) === conf,
        );
        confTeams.sort((a, b) => b.points - a.points);
        const isTop3 = confTeams.slice(0, 3).some((t) => t === tp);
        if (isTop3) {
          tp.team.wildcardRk = null;
        }
      }
    });
  }
}

// Team Stats router
const teamStatsWhereSchema = z
  .object({
    gshlTeamId: z.string().optional(),
    seasonId: z.string().optional(),
    weekId: z.string().optional(),
    seasonType: z.nativeEnum(SeasonType).optional(),
  })
  .optional();

// Team Day Stats Schema
const teamDayStatsCreateSchema = z.object({
  seasonId: z.string(),
  gshlTeamId: z.string(),
  weekId: z.string(),
  date: z.date(),
  GP: z.string().default("0"),
  MG: z.string().default("0"),
  IR: z.string().default("0"),
  IRplus: z.string().default("0"),
  GS: z.string().default("0"),
  G: z.string().default("0"),
  A: z.string().default("0"),
  P: z.string().default("0"),
  PM: z.string().default("0"),
  PIM: z.string().default("0"),
  PPP: z.string().default("0"),
  SOG: z.string().default("0"),
  HIT: z.string().default("0"),
  BLK: z.string().default("0"),
  W: z.string().default("0"),
  GA: z.string().default("0"),
  GAA: z.string().default("0"),
  SV: z.string().default("0"),
  SA: z.string().default("0"),
  SVP: z.string().default("0"),
  SO: z.string().default("0"),
  TOI: z.string().default("0"),
  Rating: z.string().default("0"),
  ADD: z.string().default("0"),
  MS: z.string().default("0"),
  BS: z.string().default("0"),
});

// Team Week Stats Schema
const teamWeekStatsCreateSchema = z.object({
  seasonId: z.string(),
  gshlTeamId: z.string(),
  weekId: z.string(),
  days: z.string().default("0"),
  GP: z.string().default("0"),
  MG: z.string().default("0"),
  IR: z.string().default("0"),
  IRplus: z.string().default("0"),
  GS: z.string().default("0"),
  G: z.string().default("0"),
  A: z.string().default("0"),
  P: z.string().default("0"),
  PM: z.string().default("0"),
  PIM: z.string().default("0"),
  PPP: z.string().default("0"),
  SOG: z.string().default("0"),
  HIT: z.string().default("0"),
  BLK: z.string().default("0"),
  W: z.string().default("0"),
  GA: z.string().default("0"),
  GAA: z.string().default("0"),
  SV: z.string().default("0"),
  SA: z.string().default("0"),
  SVP: z.string().default("0"),
  SO: z.string().default("0"),
  TOI: z.string().default("0"),
  Rating: z.string().default("0"),
  yearToDateRating: z.string().default("0"),
  powerRating: z.string().default("0"),
  powerRk: z.string().default("0"),
  ADD: z.string().default("0"),
  MS: z.string().default("0"),
  BS: z.string().default("0"),
});

// Team Season Stats Schema
const teamSeasonStatsCreateSchema = z.object({
  seasonId: z.string(),
  seasonType: z.nativeEnum(SeasonType),
  gshlTeamId: z.string(),
  days: z.string().default("0"),
  GP: z.string().default("0"),
  MG: z.string().default("0"),
  IR: z.string().default("0"),
  IRplus: z.string().default("0"),
  GS: z.string().default("0"),
  G: z.string().default("0"),
  A: z.string().default("0"),
  P: z.string().default("0"),
  PM: z.string().default("0"),
  PIM: z.string().default("0"),
  PPP: z.string().default("0"),
  SOG: z.string().default("0"),
  HIT: z.string().default("0"),
  BLK: z.string().default("0"),
  W: z.string().default("0"),
  GA: z.string().default("0"),
  GAA: z.string().default("0"),
  SV: z.string().default("0"),
  SA: z.string().default("0"),
  SVP: z.string().default("0"),
  SO: z.string().default("0"),
  TOI: z.string().default("0"),
  Rating: z.string().default("0"),
  ADD: z.string().default("0"),
  MS: z.string().default("0"),
  BS: z.string().default("0"),
  teamW: z.string().default("0"),
  teamL: z.string().default("0"),
  teamHW: z.string().default("0"),
  teamHL: z.string().default("0"),
  streak: z.string().default(""),
  powerRk: z.string().default("0"),
  powerRating: z.string().default("0"),
  prevPowerRk: z.string().default("0"),
  prevPowerRating: z.string().default("0"),
  overallRk: z.string().default("0"),
  conferenceRk: z.string().default("0"),
  wildcardRk: z.number().optional(),
  losersTournRk: z.number().optional(),
  playersUsed: z.number().default(0),
  norrisRating: z.number().optional(),
  norrisRk: z.number().optional(),
  vezinaRating: z.number().optional(),
  vezinaRk: z.number().optional(),
  calderRating: z.number().optional(),
  calderRk: z.number().optional(),
  jackAdamsRating: z.number().optional(),
  jackAdamsRk: z.number().optional(),
  GMOYRating: z.number().optional(),
  GMOYRk: z.number().optional(),
});

export const teamStatsRouter = createTRPCRouter({
  // Daily team stats
  daily: createTRPCRouter({
    getAll: publicProcedure
      .input(baseQuerySchema.extend({ where: teamStatsWhereSchema }))
      .query(async ({ input }): Promise<TeamDayStatLine[]> => {
        return optimizedSheetsAdapter.findMany(
          "TeamDayStatLine",
          input,
        ) as unknown as Promise<TeamDayStatLine[]>;
      }),

    getByTeam: publicProcedure
      .input(
        z.object({
          gshlTeamId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamDayStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamDayStatLine", {
          where: {
            gshlTeamId: input.gshlTeamId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<TeamDayStatLine[]>;
      }),

    getByWeek: publicProcedure
      .input(
        z.object({
          weekId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamDayStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamDayStatLine", {
          where: {
            weekId: input.weekId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<TeamDayStatLine[]>;
      }),

    getByDate: publicProcedure
      .input(
        z.object({
          date: z.date(),
          seasonId: z.number().int().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamDayStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamDayStatLine", {
          where: {
            date: input.date,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<TeamDayStatLine[]>;
      }),

    create: publicProcedure
      .input(teamDayStatsCreateSchema)
      .mutation(async ({ input }): Promise<TeamDayStatLine> => {
        return optimizedSheetsAdapter.create("TeamDayStatLine", {
          data: input,
        }) as unknown as Promise<TeamDayStatLine>;
      }),

    createMany: publicProcedure
      .input(
        z.object({
          data: z.array(teamDayStatsCreateSchema),
        }),
      )
      .mutation(async ({ input }): Promise<{ count: number }> => {
        return optimizedSheetsAdapter.createMany("TeamDayStatLine", {
          data: input.data,
        });
      }),

    // Aggregate player days into team days
    aggregateAndCreateFromPlayerDays: publicProcedure
      .input(
        z.object({
          weekId: z.string(),
          dryRun: z.boolean().default(false),
        }),
      )
      .mutation(
        async ({
          input,
        }): Promise<{
          count: number;
          created?: number;
          updated?: number;
          summary: {
            input: {
              totalPlayerDays: number;
              uniqueTeams: number;
              uniqueDates: number;
            };
            output: {
              totalTeamDays: number;
              averagePlayersPerTeamDay: string;
            };
          };
          preview?: unknown[];
        }> => {
          const { aggregate, playerDayToTeamDayConfig, convertToSheets } =
            await import("@gshl-utils");
          const { playerDayAdapter } = await import("@gshl-sheets");

          // First, fetch the week to get its seasonId
          const week = (await optimizedSheetsAdapter.findUnique("Week", {
            where: { id: input.weekId },
          })) as unknown as Week | null;

          if (!week) {
            throw new Error(`Week not found: ${input.weekId}`);
          }

          // Fetch all player day stat lines for the specified week using the partitioned adapter
          const playerDays = (await playerDayAdapter.findMany({
            where: { weekId: input.weekId, seasonId: week.seasonId },
          })) as unknown as PlayerDayStatLine[];

          if (playerDays.length === 0) {
            return {
              count: 0,
              summary: {
                input: {
                  totalPlayerDays: 0,
                  uniqueTeams: 0,
                  uniqueDates: 0,
                },
                output: {
                  totalTeamDays: 0,
                  averagePlayersPerTeamDay: "0.00",
                },
              },
            };
          }

          // Aggregate player days into team days using unified system
          const teamDayStats = aggregate(
            playerDays as unknown as Record<string, unknown>[],
            playerDayToTeamDayConfig as unknown as AggregationConfig<
              Record<string, unknown>,
              TeamDayStatLine
            >,
          );

          // Convert numeric stats to strings for Google Sheets
          const teamDayStatsForSheets = convertToSheets(
            teamDayStats as unknown as Record<string, unknown>[],
          );

          // Generate summary
          const uniqueTeams = new Set(playerDays.map((d) => d.gshlTeamId));
          const uniqueDates = new Set(
            playerDays.map((d) =>
              d.date instanceof Date
                ? d.date.toISOString().split("T")[0]
                : String(d.date).split("T")[0],
            ),
          );

          const summary = {
            input: {
              totalPlayerDays: playerDays.length,
              uniqueTeams: uniqueTeams.size,
              uniqueDates: uniqueDates.size,
            },
            output: {
              totalTeamDays: teamDayStats.length,
              averagePlayersPerTeamDay:
                teamDayStats.length > 0
                  ? (playerDays.length / teamDayStats.length).toFixed(2)
                  : "0.00",
            },
          };

          // If dry run, return preview without inserting
          if (input.dryRun) {
            return {
              count: 0,
              summary,
              preview: teamDayStatsForSheets.slice(0, 10), // Preview first 10
            };
          }

          // Fetch existing team day records for this week
          const existingTeamDayRecords = (await optimizedSheetsAdapter.findMany(
            "TeamDayStatLine",
            {
              where: { weekId: input.weekId },
            },
          )) as unknown as TeamDayStatLine[];

          // Build a map of existing records by composite key (gshlTeamId-date)
          const existingRecordsMap = new Map<string, TeamDayStatLine>();
          for (const record of existingTeamDayRecords) {
            const dateStr =
              record.date instanceof Date
                ? record.date.toISOString().split("T")[0]
                : String(record.date).split("T")[0];
            const key = `${record.gshlTeamId}:${dateStr}`;
            existingRecordsMap.set(key, record);
          }

          // Categorize records into create vs update
          const recordsToCreate: typeof teamDayStatsForSheets = [];
          const recordsToUpdate: Array<{
            id: string;
            data: (typeof teamDayStatsForSheets)[0];
          }> = [];

          for (const teamDayStat of teamDayStatsForSheets) {
            // convertToSheets converts dates to strings, so just extract the date part
            const dateStr = String(teamDayStat.date).split("T")[0];
            const key = `${teamDayStat.gshlTeamId}:${dateStr}`;
            const existing = existingRecordsMap.get(key);

            if (existing) {
              // Record exists - prepare for update
              recordsToUpdate.push({
                id: existing.id,
                data: teamDayStat,
              });
            } else {
              // New record - prepare for create
              recordsToCreate.push(teamDayStat);
            }
          }

          console.log(
            `📊 Team day upsert breakdown: ${recordsToCreate.length} to create, ${recordsToUpdate.length} to update`,
          );

          let createCount = 0;
          let updateCount = 0;

          // Bulk create new records
          if (recordsToCreate.length > 0) {
            const createResult = await optimizedSheetsAdapter.createMany(
              "TeamDayStatLine",
              {
                data: recordsToCreate as Partial<TeamDayStatLine>[],
              },
            );
            createCount = createResult.count;
          }

          // Bulk update existing records
          if (recordsToUpdate.length > 0) {
            const updateResult = await optimizedSheetsAdapter.bulkUpdateByIds(
              "TeamDayStatLine",
              recordsToUpdate as Array<{
                id: string;
                data: Partial<TeamDayStatLine>;
              }>,
            );
            updateCount = updateResult.count;
          }

          return {
            count: createCount + updateCount,
            created: createCount,
            updated: updateCount,
            summary,
          };
        },
      ),
  }),

  // Weekly team stats
  weekly: createTRPCRouter({
    getAll: publicProcedure
      .input(baseQuerySchema.extend({ where: teamStatsWhereSchema }))
      .query(async ({ input }): Promise<TeamWeekStatLine[]> => {
        return optimizedSheetsAdapter.findMany(
          "TeamWeekStatLine",
          input,
        ) as unknown as Promise<TeamWeekStatLine[]>;
      }),

    getByTeam: publicProcedure
      .input(
        z.object({
          gshlTeamId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamWeekStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamWeekStatLine", {
          where: {
            gshlTeamId: input.gshlTeamId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<TeamWeekStatLine[]>;
      }),

    getByWeek: publicProcedure
      .input(
        z.object({
          weekId: z.union([z.number().int(), z.string()]),
          seasonId: z.union([z.number().int(), z.string()]).optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamWeekStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamWeekStatLine", {
          where: {
            weekId: String(input.weekId),
            ...(input.seasonId && { seasonId: String(input.seasonId) }),
          },
        }) as unknown as Promise<TeamWeekStatLine[]>;
      }),

    create: publicProcedure
      .input(teamWeekStatsCreateSchema)
      .mutation(async ({ input }): Promise<TeamWeekStatLine> => {
        return optimizedSheetsAdapter.create("TeamWeekStatLine", {
          data: input,
        }) as unknown as Promise<TeamWeekStatLine>;
      }),

    createMany: publicProcedure
      .input(
        z.object({
          data: z.array(teamWeekStatsCreateSchema),
        }),
      )
      .mutation(async ({ input }): Promise<{ count: number }> => {
        return optimizedSheetsAdapter.createMany("TeamWeekStatLine", {
          data: input.data,
        });
      }),

    // Aggregate team days into team weeks
    aggregateAndCreateFromDays: publicProcedure
      .input(
        z.object({
          weekId: z.string(),
          dryRun: z.boolean().default(false),
        }),
      )
      .mutation(
        async ({
          input,
        }): Promise<{
          count: number;
          created?: number;
          updated?: number;
          summary: {
            input: {
              totalTeamDays: number;
              uniqueTeams: number;
              uniqueWeeks: number;
            };
            output: {
              totalTeamWeeks: number;
              averageDaysPerWeek: string;
            };
          };
          matchups?: {
            updated: number;
            errors: Array<{ id: string; error: string }>;
          };
          preview?: unknown[];
        }> => {
          const { aggregate, teamDayToWeekConfig, convertToSheets } =
            await import("@gshl-utils");

          // Fetch all team day stat lines for the specified week
          const teamDays = (await optimizedSheetsAdapter.findMany(
            "TeamDayStatLine",
            {
              where: { weekId: input.weekId },
            },
          )) as unknown as TeamDayStatLine[];

          if (teamDays.length === 0) {
            return {
              count: 0,
              summary: {
                input: {
                  totalTeamDays: 0,
                  uniqueTeams: 0,
                  uniqueWeeks: 0,
                },
                output: {
                  totalTeamWeeks: 0,
                  averageDaysPerWeek: "0.00",
                },
              },
            };
          }

          // Aggregate team days into team weeks using unified system
          const teamWeekStats = aggregate(
            teamDays as unknown as Record<string, unknown>[],
            teamDayToWeekConfig as unknown as AggregationConfig<
              Record<string, unknown>,
              TeamWeekStatLine
            >,
          );

          // Convert numeric stats to strings for Google Sheets
          const teamWeekStatsForSheets = convertToSheets(
            teamWeekStats as unknown as Record<string, unknown>[],
          );

          // Generate summary
          const uniqueTeams = new Set(teamDays.map((d) => d.gshlTeamId));
          const uniqueWeeks = new Set(teamDays.map((d) => d.weekId));

          const summary = {
            input: {
              totalTeamDays: teamDays.length,
              uniqueTeams: uniqueTeams.size,
              uniqueWeeks: uniqueWeeks.size,
            },
            output: {
              totalTeamWeeks: teamWeekStats.length,
              averageDaysPerWeek:
                teamWeekStats.length > 0
                  ? (teamDays.length / teamWeekStats.length).toFixed(2)
                  : "0.00",
            },
          };

          // If dry run, return preview without inserting
          if (input.dryRun) {
            return {
              count: 0,
              summary,
              preview: teamWeekStatsForSheets.slice(0, 10), // Preview first 10
            };
          }

          // Fetch existing team week records for this week
          const existingTeamWeekRecords =
            (await optimizedSheetsAdapter.findMany("TeamWeekStatLine", {
              where: { weekId: input.weekId },
            })) as unknown as TeamWeekStatLine[];

          // Build a map of existing records by composite key (gshlTeamId-weekId)
          const existingRecordsMap = new Map<string, TeamWeekStatLine>();
          for (const record of existingTeamWeekRecords) {
            const key = `${record.gshlTeamId}:${record.weekId}`;
            existingRecordsMap.set(key, record);
          }

          // Categorize records into create vs update
          const recordsToCreate: typeof teamWeekStatsForSheets = [];
          const recordsToUpdate: Array<{
            id: string;
            data: (typeof teamWeekStatsForSheets)[0];
          }> = [];

          for (const teamWeekStat of teamWeekStatsForSheets) {
            const key = `${teamWeekStat.gshlTeamId}:${teamWeekStat.weekId}`;
            const existing = existingRecordsMap.get(key);

            if (existing) {
              // Record exists - prepare for update
              recordsToUpdate.push({
                id: existing.id,
                data: teamWeekStat,
              });
            } else {
              // New record - prepare for create
              recordsToCreate.push(teamWeekStat);
            }
          }

          console.log(
            `📊 Team week upsert breakdown: ${recordsToCreate.length} to create, ${recordsToUpdate.length} to update`,
          );

          let createCount = 0;
          let updateCount = 0;

          // Bulk create new records
          if (recordsToCreate.length > 0) {
            const createResult = await optimizedSheetsAdapter.createMany(
              "TeamWeekStatLine",
              {
                data: recordsToCreate as Partial<TeamWeekStatLine>[],
              },
            );
            createCount = createResult.count;
          }

          // Bulk update existing records
          if (recordsToUpdate.length > 0) {
            const updateResult = await optimizedSheetsAdapter.bulkUpdateByIds(
              "TeamWeekStatLine",
              recordsToUpdate as Array<{
                id: string;
                data: Partial<TeamWeekStatLine>;
              }>,
            );
            updateCount = updateResult.count;
          }

          // Update matchup scores for this week after stats are updated
          const matchupResults = {
            updated: 0,
            errors: [] as Array<{ id: string; error: string }>,
          };

          try {
            // Get all matchups for this week
            const matchups = (await optimizedSheetsAdapter.findMany("Matchup", {
              where: { weekId: input.weekId },
            })) as unknown as Matchup[];

            if (matchups.length === 0) {
              console.log(`ℹ️  No matchups found for week ${input.weekId}`);
            } else {
              console.log(
                `🏒 Updating scores for ${matchups.length} matchups in week ${input.weekId}...`,
              );

              // Build a lookup map from the TeamWeek stats we already have
              // This avoids extra API calls to fetch team stats
              const teamWeekMap = new Map<string, (typeof teamWeekStats)[0]>();
              for (const tw of teamWeekStats) {
                teamWeekMap.set(tw.gshlTeamId, tw);
              }

              // Prepare batch updates for all matchups
              const matchupUpdates: Array<{
                id: string;
                data: Partial<Matchup>;
              }> = [];

              for (const matchup of matchups) {
                try {
                  const homeTeamStats = teamWeekMap.get(matchup.homeTeamId);
                  const awayTeamStats = teamWeekMap.get(matchup.awayTeamId);

                  if (!homeTeamStats || !awayTeamStats) {
                    matchupResults.errors.push({
                      id: matchup.id,
                      error: `Team stats not found (home: ${!!homeTeamStats}, away: ${!!awayTeamStats})`,
                    });
                    continue;
                  }

                  const { homeScore, awayScore } = calculateMatchupScores(
                    homeTeamStats,
                    awayTeamStats,
                  );

                  const homeWin = homeScore >= awayScore;
                  const awayWin = awayScore > homeScore;

                  matchupUpdates.push({
                    id: matchup.id,
                    data: {
                      homeScore,
                      awayScore,
                      homeWin,
                      awayWin,
                      isCompleted: true,
                    },
                  });
                } catch (error) {
                  matchupResults.errors.push({
                    id: matchup.id,
                    error:
                      error instanceof Error ? error.message : "Unknown error",
                  });
                }
              }

              // Batch update all matchups at once
              if (matchupUpdates.length > 0) {
                const updateResult =
                  await optimizedSheetsAdapter.bulkUpdateByIds(
                    "Matchup",
                    matchupUpdates,
                  );
                matchupResults.updated = updateResult.count;
              }

              console.log(
                `✅ Updated ${matchupResults.updated} matchup scores, ${matchupResults.errors.length} errors`,
              );
            }
          } catch (error) {
            console.error("❌ Error updating matchup scores:", error);
            // Don't fail the whole operation if matchup updates fail
          }

          return {
            count: createCount + updateCount,
            created: createCount,
            updated: updateCount,
            summary,
            matchups: matchupResults,
          };
        },
      ),
  }),

  // Season totals
  season: createTRPCRouter({
    getAll: publicProcedure
      .input(baseQuerySchema.extend({ where: teamStatsWhereSchema }))
      .query(async ({ input }): Promise<TeamSeasonStatLine[]> => {
        return optimizedSheetsAdapter.findMany(
          "TeamSeasonStatLine",
          input,
        ) as unknown as Promise<TeamSeasonStatLine[]>;
      }),

    getByTeam: publicProcedure
      .input(
        z.object({
          gshlTeamId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamSeasonStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamSeasonStatLine", {
          where: {
            gshlTeamId: input.gshlTeamId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<TeamSeasonStatLine[]>;
      }),

    getBySeason: publicProcedure
      .input(z.object({ seasonId: z.number().int() }))
      .query(async ({ input }): Promise<TeamSeasonStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamSeasonStatLine", {
          where: { seasonId: input.seasonId },
        }) as unknown as Promise<TeamSeasonStatLine[]>;
      }),

    getBySeasonType: publicProcedure
      .input(
        z.object({
          seasonId: z.number().int(),
          seasonType: z.nativeEnum(SeasonType),
        }),
      )
      .query(async ({ input }): Promise<TeamSeasonStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamSeasonStatLine", {
          where: {
            seasonId: input.seasonId,
            seasonType: input.seasonType,
          },
        }) as unknown as Promise<TeamSeasonStatLine[]>;
      }),

    create: publicProcedure
      .input(teamSeasonStatsCreateSchema)
      .mutation(async ({ input }): Promise<TeamSeasonStatLine> => {
        return optimizedSheetsAdapter.create("TeamSeasonStatLine", {
          data: input,
        }) as unknown as Promise<TeamSeasonStatLine>;
      }),

    createMany: publicProcedure
      .input(
        z.object({
          data: z.array(teamSeasonStatsCreateSchema),
        }),
      )
      .mutation(async ({ input }): Promise<{ count: number }> => {
        return optimizedSheetsAdapter.createMany("TeamSeasonStatLine", {
          data: input.data,
        });
      }),

    // Aggregate team weeks into team seasons (split by RS/PO)
    aggregateAndCreateFromWeeks: publicProcedure
      .input(
        z.object({
          seasonId: z.string(),
          dryRun: z.boolean().default(false),
        }),
      )
      .mutation(
        async ({
          input,
        }): Promise<{
          count: number;
          created?: number;
          updated?: number;
          summary: {
            input: {
              totalTeamWeeks: number;
              uniqueTeams: number;
              totalMatchups: number;
            };
            output: {
              totalTeamSeasons: number;
              regularSeasons: number;
              playoffs: number;
            };
          };
          preview?: unknown[];
        }> => {
          const { convertToSheets } = await import("@gshl-utils");

          // Fetch all team week stat lines for the specified season
          const teamWeeks = (await optimizedSheetsAdapter.findMany(
            "TeamWeekStatLine",
            {
              where: { seasonId: input.seasonId },
            },
          )) as unknown as TeamWeekStatLine[];

          if (teamWeeks.length === 0) {
            return {
              count: 0,
              summary: {
                input: {
                  totalTeamWeeks: 0,
                  uniqueTeams: 0,
                  totalMatchups: 0,
                },
                output: {
                  totalTeamSeasons: 0,
                  regularSeasons: 0,
                  playoffs: 0,
                },
              },
            };
          }

          // Fetch all matchups for this season
          const matchups = (await optimizedSheetsAdapter.findMany("Matchup", {
            where: { seasonId: input.seasonId },
          })) as unknown as Matchup[];

          // Fetch all teams to get conference info
          const teams = (await optimizedSheetsAdapter.findMany("Team", {
            where: { seasonId: input.seasonId },
          })) as unknown as Team[];

          const teamConfMap = new Map(teams.map((t) => [t.id, t.confId]));

          // Fetch all weeks to get seasonType metadata
          const weeks = (await optimizedSheetsAdapter.findMany("Week", {
            where: { seasonId: input.seasonId },
          })) as unknown as Week[];

          // Fetch all player weeks to count unique players per team
          const playerWeeks = (await optimizedSheetsAdapter.findMany(
            "PlayerWeekStatLine",
            {
              where: { seasonId: input.seasonId },
            },
          )) as unknown as PlayerWeekStatLine[];

          // Calculate team season stats
          const teamSeasonStats = calculateTeamSeasonStats(
            teamWeeks,
            matchups,
            teamConfMap,
            playerWeeks,
            weeks,
          );

          // Convert numeric stats to strings for Google Sheets
          const teamSeasonStatsForSheets = convertToSheets(
            teamSeasonStats as unknown as Record<string, unknown>[],
          );

          // Generate summary
          const uniqueTeams = new Set(teamWeeks.map((w) => w.gshlTeamId));

          const summary = {
            input: {
              totalTeamWeeks: teamWeeks.length,
              uniqueTeams: uniqueTeams.size,
              totalMatchups: matchups.length,
            },
            output: {
              totalTeamSeasons: teamSeasonStats.length,
              regularSeasons: teamSeasonStats.filter(
                (s) => s.seasonType === SeasonType.REGULAR_SEASON,
              ).length,
              playoffs: teamSeasonStats.filter(
                (s) => s.seasonType === SeasonType.PLAYOFFS,
              ).length,
            },
          };

          // If dry run, return preview without inserting
          if (input.dryRun) {
            return {
              count: 0,
              summary,
              preview: teamSeasonStatsForSheets.slice(0, 10), // Preview first 10
            };
          }

          // Fetch existing team season records for this season
          const existingTeamSeasonRecords =
            (await optimizedSheetsAdapter.findMany("TeamSeasonStatLine", {
              where: { seasonId: input.seasonId },
            })) as unknown as TeamSeasonStatLine[];

          // Build a map of existing records by composite key (gshlTeamId-seasonId-seasonType)
          const existingRecordsMap = new Map<string, TeamSeasonStatLine>();
          for (const record of existingTeamSeasonRecords) {
            const key = `${record.gshlTeamId}:${record.seasonId}:${record.seasonType}`;
            existingRecordsMap.set(key, record);
          }

          // Categorize records into create vs update
          const recordsToCreate: typeof teamSeasonStatsForSheets = [];
          const recordsToUpdate: Array<{
            id: string;
            data: (typeof teamSeasonStatsForSheets)[0];
          }> = [];

          for (const teamSeasonStat of teamSeasonStatsForSheets) {
            const key = `${teamSeasonStat.gshlTeamId}:${teamSeasonStat.seasonId}:${teamSeasonStat.seasonType}`;
            const existing = existingRecordsMap.get(key);

            if (existing) {
              // Record exists - prepare for update
              recordsToUpdate.push({
                id: existing.id,
                data: teamSeasonStat,
              });
            } else {
              // New record - prepare for create
              recordsToCreate.push(teamSeasonStat);
            }
          }

          console.log(
            `📊 Team season upsert breakdown: ${recordsToCreate.length} to create, ${recordsToUpdate.length} to update`,
          );

          let createCount = 0;
          let updateCount = 0;

          // Bulk create new records
          if (recordsToCreate.length > 0) {
            const createResult = await optimizedSheetsAdapter.createMany(
              "TeamSeasonStatLine",
              {
                data: recordsToCreate as Partial<TeamSeasonStatLine>[],
              },
            );
            createCount = createResult.count;
          }

          // Bulk update existing records
          if (recordsToUpdate.length > 0) {
            const updateResult = await optimizedSheetsAdapter.bulkUpdateByIds(
              "TeamSeasonStatLine",
              recordsToUpdate as Array<{
                id: string;
                data: Partial<TeamSeasonStatLine>;
              }>,
            );
            updateCount = updateResult.count;
          }

          return {
            count: createCount + updateCount,
            created: createCount,
            updated: updateCount,
            summary,
          };
        },
      ),
  }),
});
