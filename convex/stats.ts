import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { StatsRow } from "../src/lib/types/stats-browser";
import {
  selectStatsPage,
  statsColumns,
} from "../src/lib/utils/features/stats-browser";
import { performanceDisplayStats } from "../src/lib/utils/features/performances";

/** Public hockey statistics only; owner offers and other private data never enter this projection. */
export const browse = query({
  args: {
    seasonId: v.id("seasons"),
    weekId: v.optional(v.id("weeks")),
    teamId: v.optional(v.id("teams")),
    seasonType: v.union(v.literal("RS"), v.literal("PO"), v.literal("LT")),
    position: v.union(
      v.literal("skater"),
      v.literal("goalie"),
      v.literal("C"),
      v.literal("LW"),
      v.literal("RW"),
      v.literal("D"),
    ),
    stat: v.string(),
    direction: v.union(v.literal("asc"), v.literal("desc")),
    page: v.number(),
  },
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.page) ||
      args.page < 0 ||
      !statsColumns(args.position).some((stat) => stat === args.stat)
    )
      throw new ConvexError("Choose a valid statistic and page.");
    const season = await ctx.db.get(args.seasonId);
    if (!season) throw new ConvexError("This season is unavailable.");
    if (args.weekId) {
      const week = await ctx.db.get(args.weekId);
      if (week?.seasonId !== args.seasonId)
        throw new ConvexError("Choose a week in this season.");
    }
    if (args.teamId) {
      const team = await ctx.db.get(args.teamId);
      if (team?.seasonId !== args.seasonId)
        throw new ConvexError("Choose a team in this season.");
    }
    const source = args.weekId
      ? await ctx.db
          .query("playerWeekStatLines")
          .withIndex("by_seasonId_weekId_gshlTeamId", (q) => {
            const range = q
              .eq("seasonId", args.seasonId)
              .eq("weekId", args.weekId!);
            return args.teamId ? range.eq("gshlTeamId", args.teamId) : range;
          })
          .take(2001)
      : args.teamId
        ? await ctx.db
            .query("playerSplitStatLines")
            .withIndex("by_seasonId_seasonType_gshlTeamId_playerId", (q) =>
              q
                .eq("seasonId", args.seasonId)
                .eq("seasonType", args.seasonType)
                .eq("gshlTeamId", args.teamId!),
            )
            .take(2001)
        : await ctx.db
            .query("playerTotalStatLines")
            .withIndex("by_seasonId_seasonType_playerId", (q) =>
              q.eq("seasonId", args.seasonId).eq("seasonType", args.seasonType),
            )
            .take(2001);
    if (source.length > 2000)
      throw new ConvexError(
        "This selection is too large. Choose a team or a single week.",
      );
    const players = new Map<Id<"players">, Doc<"players"> | null>();
    const teams = new Map<Id<"teams">, Doc<"teams"> | null>();
    const franchises = new Map<Id<"franchises">, Doc<"franchises"> | null>();
    const rows: StatsRow[] = [];
    for (const row of source) {
      if (!players.has(row.playerId))
        players.set(row.playerId, await ctx.db.get(row.playerId));
      const player = players.get(row.playerId);
      const ids =
        "gshlTeamId" in row ? [row.gshlTeamId] : (row.gshlTeamIds ?? []);
      const labels: StatsRow["teams"] = [];
      for (const id of ids) {
        if (!teams.has(id)) teams.set(id, await ctx.db.get(id));
        const team = teams.get(id);
        if (!team) continue;
        if (!franchises.has(team.franchiseId))
          franchises.set(team.franchiseId, await ctx.db.get(team.franchiseId));
        const franchise = franchises.get(team.franchiseId);
        labels.push({
          id,
          name: franchise?.abbr ?? franchise?.name ?? "Team",
          ownerId: franchise?.ownerId ?? null,
        });
      }
      rows.push({
        id: row._id,
        playerId: row.playerId,
        name: player?.fullName ?? "Unknown player",
        positions: row.nhlPos?.length
          ? row.nhlPos
          : player?.nhlPos?.length
            ? player.nhlPos
            : [row.posGroup],
        nhlTeams: row.nhlTeam ?? [],
        teams: labels,
        stats: performanceDisplayStats(
          args.weekId
            ? "playerWeek"
            : args.teamId
              ? "playerSplit"
              : "playerTotal",
          row,
        ),
      });
    }
    return selectStatsPage(rows, args);
  },
});
