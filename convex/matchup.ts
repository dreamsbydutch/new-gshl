import { v } from "convex/values";

import { query } from "./_generated/server";
import {
  collectMatchupNhlAbbreviations,
  projectMatchupDetailsMatchup,
  projectMatchupDetailsTeam,
  projectMatchupNhlTeam,
  projectMatchupPlayerWeekRow,
  projectMatchupTeamWeekStats,
} from "./lib/matchupProjection";
import { utcTimestampToDateKey } from "./lib/timestamps";

function present<T>(value: T | null): value is T {
  return value !== null;
}

/**
 * Loads the complete public payload for one matchup detail page.
 *
 * All large stat reads use the season/week/team compound indexes. Everything
 * else is either a canonical id point read or an exact NHL abbreviation read.
 */
export const details = query({
  args: { matchupId: v.string() },
  handler: async (ctx, args) => {
    const matchupId = ctx.db.normalizeId("matchups", args.matchupId);
    if (!matchupId) return null;

    const matchup = await ctx.db.get(matchupId);
    if (!matchup) return null;

    const [
      season,
      week,
      homeTeam,
      awayTeam,
      homeTeamStats,
      awayTeamStats,
      homePlayerStats,
      awayPlayerStats,
    ] = await Promise.all([
      ctx.db.get(matchup.seasonId),
      ctx.db.get(matchup.weekId),
      ctx.db.get(matchup.homeTeamId),
      ctx.db.get(matchup.awayTeamId),
      ctx.db
        .query("teamWeekStatLines")
        .withIndex("by_seasonId_weekId_gshlTeamId", (q) =>
          q
            .eq("seasonId", matchup.seasonId)
            .eq("weekId", matchup.weekId)
            .eq("gshlTeamId", matchup.homeTeamId),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("teamWeekStatLines")
        .withIndex("by_seasonId_weekId_gshlTeamId", (q) =>
          q
            .eq("seasonId", matchup.seasonId)
            .eq("weekId", matchup.weekId)
            .eq("gshlTeamId", matchup.awayTeamId),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("playerWeekStatLines")
        .withIndex("by_seasonId_weekId_gshlTeamId", (q) =>
          q
            .eq("seasonId", matchup.seasonId)
            .eq("weekId", matchup.weekId)
            .eq("gshlTeamId", matchup.homeTeamId),
        )
        .collect(),
      ctx.db
        .query("playerWeekStatLines")
        .withIndex("by_seasonId_weekId_gshlTeamId", (q) =>
          q
            .eq("seasonId", matchup.seasonId)
            .eq("weekId", matchup.weekId)
            .eq("gshlTeamId", matchup.awayTeamId),
        )
        .collect(),
    ]);

    const teamRows = [homeTeam, awayTeam].filter(present);
    const franchiseIds = Array.from(
      new Set(teamRows.map((team) => team.franchiseId)),
    );
    const conferenceIds = Array.from(
      new Set(teamRows.map((team) => team.confId)),
    );
    const playerIds = Array.from(
      new Set(
        [...homePlayerStats, ...awayPlayerStats].map((stats) => stats.playerId),
      ),
    );
    const [franchiseRows, conferenceRows, playerRows] = await Promise.all([
      Promise.all(franchiseIds.map((franchiseId) => ctx.db.get(franchiseId))),
      Promise.all(
        conferenceIds.map((conferenceId) => ctx.db.get(conferenceId)),
      ),
      Promise.all(playerIds.map((playerId) => ctx.db.get(playerId))),
    ]);
    const franchises = franchiseRows.filter(present);
    const conferences = conferenceRows.filter(present);
    const players = playerRows.filter(present);
    const franchisesById = new Map(
      franchises.map((franchise) => [franchise._id, franchise] as const),
    );
    const conferencesById = new Map(
      conferences.map((conference) => [conference._id, conference] as const),
    );
    const playersById = new Map(
      players.map((player) => [player._id, player] as const),
    );

    const ownerIds = Array.from(
      new Set(franchises.map((franchise) => franchise.ownerId)),
    );
    const projectedHomePlayers = homePlayerStats.map((stats) =>
      projectMatchupPlayerWeekRow(
        stats,
        playersById.get(stats.playerId) ?? null,
      ),
    );
    const projectedAwayPlayers = awayPlayerStats.map((stats) =>
      projectMatchupPlayerWeekRow(
        stats,
        playersById.get(stats.playerId) ?? null,
      ),
    );
    const nhlAbbreviations = collectMatchupNhlAbbreviations([
      ...projectedHomePlayers,
      ...projectedAwayPlayers,
    ]);
    const [ownerRows, nhlTeamRows] = await Promise.all([
      Promise.all(ownerIds.map((ownerId) => ctx.db.get(ownerId))),
      Promise.all(
        nhlAbbreviations.map((abbr) =>
          ctx.db
            .query("nhlTeams")
            .withIndex("by_abbr", (q) => q.eq("abbr", abbr))
            .first(),
        ),
      ),
    ]);
    const ownersById = new Map(
      ownerRows.filter(present).map((owner) => [owner._id, owner] as const),
    );

    const projectTeam = (team: NonNullable<typeof homeTeam>) => {
      const franchise = franchisesById.get(team.franchiseId) ?? null;
      return projectMatchupDetailsTeam(
        team,
        franchise,
        conferencesById.get(team.confId) ?? null,
        franchise ? (ownersById.get(franchise.ownerId) ?? null) : null,
      );
    };

    return {
      matchup: projectMatchupDetailsMatchup(matchup),
      season: season
        ? {
            name: season.name,
            categories: season.categories,
          }
        : null,
      week: week
        ? {
            weekNum: week.weekNum,
            startDate: utcTimestampToDateKey(week.startDate),
            endDate: utcTimestampToDateKey(week.endDate),
          }
        : null,
      teams: {
        home: homeTeam ? projectTeam(homeTeam) : null,
        away: awayTeam ? projectTeam(awayTeam) : null,
      },
      teamStats: {
        home: homeTeamStats ? projectMatchupTeamWeekStats(homeTeamStats) : null,
        away: awayTeamStats ? projectMatchupTeamWeekStats(awayTeamStats) : null,
      },
      players: {
        home: projectedHomePlayers,
        away: projectedAwayPlayers,
      },
      nhlTeams: nhlTeamRows.filter(present).map(projectMatchupNhlTeam),
    };
  },
});
