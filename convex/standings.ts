import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  projectStandingsPowerHistory,
  projectStandingsTeamDetail,
  selectStandingsDetailMatchups,
  selectStandingsPlayerTotalLookupSplits,
  selectStandingsTopPlayerTotals,
} from "./lib/standingsProjection";

function present<T>(value: T | null): value is T {
  return value !== null;
}

/** Returns only the ranked week fields required by the power table and chart. */
export const powerHistory = query({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const [weeks, weeklyStats] = await Promise.all([
      ctx.db
        .query("weeks")
        .withIndex("by_seasonId", (range) =>
          range.eq("seasonId", args.seasonId),
        )
        .collect(),
      ctx.db
        .query("teamWeekStatLines")
        .withIndex("by_seasonId", (range) =>
          range.eq("seasonId", args.seasonId),
        )
        .collect(),
    ]);

    return projectStandingsPowerHistory({ weeks, weeklyStats });
  },
});

/**
 * Returns the public snapshot rendered only after one standings row expands.
 * Reads are season/team scoped and the browser receives the final compact DTO.
 */
export const teamDetail = query({
  args: {
    seasonId: v.id("seasons"),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (team?.seasonId !== args.seasonId) return null;

    const [
      franchise,
      conference,
      teamStats,
      homeMatchups,
      awayMatchups,
      teamPlayerSplits,
    ] = await Promise.all([
      ctx.db.get(team.franchiseId),
      ctx.db.get(team.confId),
      ctx.db
        .query("teamSeasonStatLines")
        .withIndex("by_seasonId_seasonType_gshlTeamId", (range) =>
          range.eq("seasonId", args.seasonId).eq("seasonType", "RS"),
        )
        .collect(),
      ctx.db
        .query("matchups")
        .withIndex("by_seasonId_homeTeamId", (range) =>
          range.eq("seasonId", args.seasonId).eq("homeTeamId", args.teamId),
        )
        .collect(),
      ctx.db
        .query("matchups")
        .withIndex("by_seasonId_awayTeamId", (range) =>
          range.eq("seasonId", args.seasonId).eq("awayTeamId", args.teamId),
        )
        .collect(),
      ctx.db
        .query("playerSplitStatLines")
        .withIndex("by_gshlTeamId", (range) =>
          range.eq("gshlTeamId", args.teamId),
        )
        .collect(),
    ]);

    const matchupRows = [
      ...new Map(
        [...homeMatchups, ...awayMatchups].map((matchup) => [
          matchup._id,
          matchup,
        ]),
      ).values(),
    ];
    const weekIds = [...new Set(matchupRows.map((matchup) => matchup.weekId))];
    const playerTotalLookupSplits = selectStandingsPlayerTotalLookupSplits(
      String(args.seasonId),
      teamPlayerSplits,
    );
    const [weekRows, playerTotalPages] = await Promise.all([
      Promise.all(weekIds.map((weekId) => ctx.db.get(weekId))),
      Promise.all(
        playerTotalLookupSplits.map((split) =>
          ctx.db
            .query("playerTotalStatLines")
            .withIndex("by_seasonId_seasonType_playerId", (range) =>
              range
                .eq("seasonId", args.seasonId)
                .eq("seasonType", split.seasonType)
                .eq("playerId", split.playerId),
            )
            .collect(),
        ),
      ),
    ]);
    const weeks = weekRows.filter(present);
    const seasonPlayerTotals = playerTotalPages
      .flat()
      .sort((left, right) => left._creationTime - right._creationTime);
    const selectedMatchups = selectStandingsDetailMatchups(
      String(team._id),
      matchupRows,
      weeks,
    );
    const opponentTeamIds = [
      ...new Set(
        selectedMatchups.map((matchup) =>
          matchup.homeTeamId === team._id
            ? matchup.awayTeamId
            : matchup.homeTeamId,
        ),
      ),
    ];
    const topPlayerTotals = selectStandingsTopPlayerTotals(
      String(team._id),
      String(team.franchiseId),
      seasonPlayerTotals,
    );
    const playerIds = [
      ...new Set(topPlayerTotals.map((total) => total.playerId)),
    ];
    const [owner, opponentTeams, players] = await Promise.all([
      franchise ? ctx.db.get(franchise.ownerId) : Promise.resolve(null),
      Promise.all(opponentTeamIds.map((teamId) => ctx.db.get(teamId))),
      Promise.all(playerIds.map((playerId) => ctx.db.get(playerId))),
    ]);
    const presentOpponentTeams = opponentTeams.filter(present);
    const opponentFranchiseIds = [
      ...new Set(presentOpponentTeams.map((row) => row.franchiseId)),
    ];
    const opponentFranchises = (
      await Promise.all(
        opponentFranchiseIds.map((franchiseId) => ctx.db.get(franchiseId)),
      )
    ).filter(present);
    const opponentFranchiseById = new Map(
      opponentFranchises.map((row) => [row._id, row] as const),
    );

    return projectStandingsTeamDetail({
      teamId: String(team._id),
      owner,
      conference,
      teamStats,
      matchups: selectedMatchups,
      weeks,
      opponents: presentOpponentTeams.map((opponentTeam) => {
        const opponentFranchise = opponentFranchiseById.get(
          opponentTeam.franchiseId,
        );
        return {
          id: String(opponentTeam._id),
          name: opponentFranchise?.name ?? "Opponent",
          logoUrl: opponentFranchise?.logoUrl ?? null,
        };
      }),
      playerTotals: topPlayerTotals,
      players: players.filter(present),
    });
  },
});
