import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActiveUser } from "./lib/auth";
import type { Id } from "./_generated/dataModel";
import type {
  PerformanceFilters,
  PerformanceResult,
  PerformanceRow,
} from "../src/lib/types/performances";
import {
  performanceNumber,
  performanceStats,
  qualifiesForPerformance,
  topPerformances,
} from "../src/lib/utils/features/performances";

const filtersValidator = v.object({
  kind: v.union(
    v.literal("playerDay"),
    v.literal("playerWeek"),
    v.literal("playerSplit"),
    v.literal("playerTotal"),
    v.literal("playerNhl"),
    v.literal("teamDay"),
    v.literal("teamWeek"),
    v.literal("teamSeason"),
  ),
  seasonId: v.id("seasons"),
  stat: v.string(),
  direction: v.union(v.literal("asc"), v.literal("desc")),
  position: v.union(v.literal("all"), v.literal("skater"), v.literal("goalie")),
  seasonType: v.string(),
  startDate: v.string(),
  endDate: v.string(),
});
const tables = {
  playerDay: "playerDayStatLines",
  playerWeek: "playerWeekStatLines",
  playerSplit: "playerSplitStatLines",
  playerTotal: "playerTotalStatLines",
  playerNhl: "playerNhlStatLines",
  teamDay: "teamDayStatLines",
  teamWeek: "teamWeekStatLines",
  teamSeason: "teamSeasonStatLines",
} as const;

function validateFilters(filters: PerformanceFilters) {
  if (!performanceStats(filters.kind).includes(filters.stat))
    throw new Error("Invalid statistic");
  for (const date of [filters.startDate, filters.endDate]) {
    if (
      date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date)
    )
      throw new Error("Invalid date");
  }
  if (
    filters.startDate &&
    filters.endDate &&
    filters.startDate > filters.endDate
  )
    throw new Error("Start date must precede end date");
  if (!filters.kind.endsWith("Day") && (filters.startDate || filters.endDate))
    throw new Error("Date ranges apply to daily performances");
}

// Each transaction reads a bounded page; the action retains only the best 100.
// Numeric strings in historical stats prevent correct numeric index ordering.
export const page = internalQuery({
  args: { filters: filtersValidator, cursor: v.union(v.string(), v.null()) },
  handler: async (
    ctx,
    { filters, cursor },
  ): Promise<{
    rows: PerformanceRow[];
    cursor: string;
    done: boolean;
    highlightsOnly: boolean;
  }> => {
    await requireActiveUser(ctx);
    validateFilters(filters);
    const archive =
      filters.kind === "playerDay"
        ? await ctx.db
            .query("seasonDataArchives")
            .withIndex("by_seasonId", (q) => q.eq("seasonId", filters.seasonId))
            .unique()
        : null;
    if (archive?.status === "deleting" || archive?.status === "failed")
      throw new Error(
        "This season's archive is being updated. Please try again later.",
      );
    const highlightsOnly = archive?.status === "archived";
    const table = highlightsOnly ? "playerDayHighlights" : tables[filters.kind];
    const query =
      table === "playerDayStatLines" ||
      table === "playerDayHighlights" ||
      table === "teamDayStatLines"
        ? ctx.db.query(table).withIndex("by_seasonId_date", (q) => {
            const range = q.eq("seasonId", filters.seasonId);
            if (filters.startDate && filters.endDate)
              return range
                .gte("date", filters.startDate)
                .lte("date", filters.endDate);
            if (filters.startDate) return range.gte("date", filters.startDate);
            if (filters.endDate) return range.lte("date", filters.endDate);
            return range;
          })
        : ctx.db
            .query(table)
            .withIndex("by_seasonId", (q) =>
              q.eq("seasonId", filters.seasonId),
            );
    const result = await query.paginate({ cursor, numItems: 500 });
    const rows: PerformanceRow[] = [];
    for (const document of result.page) {
      const row: Record<string, unknown> = document;
      if (!qualifiesForPerformance(row, filters)) continue;
      rows.push({
        id: document._id,
        playerId: typeof row.playerId === "string" ? row.playerId : null,
        teamIds:
          typeof row.gshlTeamId === "string"
            ? [row.gshlTeamId]
            : Array.isArray(row.gshlTeamIds)
              ? row.gshlTeamIds.filter(
                  (id): id is string => typeof id === "string",
                )
              : [],
        weekId: typeof row.weekId === "string" ? row.weekId : null,
        period:
          typeof row.date === "string"
            ? row.date
            : typeof row.seasonType === "string"
              ? row.seasonType
              : "Season",
        position: typeof row.posGroup === "string" ? row.posGroup : "",
        stats: Object.fromEntries(
          performanceStats(filters.kind).map((stat) => [
            stat,
            performanceNumber(row[stat]),
          ]),
        ),
        name: "",
        team: Array.isArray(row.nhlTeam) ? row.nhlTeam.join(" / ") : "",
      });
    }
    return {
      rows: topPerformances(rows, filters.stat, filters.direction),
      cursor: result.continueCursor,
      done: result.isDone,
      highlightsOnly,
    };
  },
});

const rowValidator = v.object({
  id: v.string(),
  playerId: v.union(v.string(), v.null()),
  teamIds: v.array(v.string()),
  weekId: v.union(v.string(), v.null()),
  period: v.string(),
  position: v.string(),
  stats: v.record(v.string(), v.union(v.number(), v.null())),
  name: v.string(),
  team: v.string(),
});
export const hydrate = internalQuery({
  args: { rows: v.array(rowValidator) },
  handler: async (ctx, { rows }): Promise<PerformanceRow[]> => {
    await requireActiveUser(ctx);
    if (rows.length > 100) throw new Error("Too many performances");
    return Promise.all(
      rows.map(async (row) => {
        const playerId = row.playerId
          ? ctx.db.normalizeId("players", row.playerId)
          : null;
        const player = playerId
          ? await ctx.db.get(playerId)
          : row.playerId
            ? await ctx.db
                .query("players")
                .withIndex("by_legacyId", (q) =>
                  q.eq("legacyId", row.playerId!),
                )
                .first()
            : null;
        const teamNames = await Promise.all(
          row.teamIds.map(async (id) => {
            const team = await ctx.db.get(id as Id<"teams">);
            const franchise = team ? await ctx.db.get(team.franchiseId) : null;
            return franchise?.name ?? "Unknown team";
          }),
        );
        const week = row.weekId
          ? await ctx.db.get(row.weekId as Id<"weeks">)
          : null;
        return {
          ...row,
          name: row.playerId
            ? (player?.fullName ?? "Unknown player")
            : teamNames.join(" / "),
          team: teamNames.join(" / ") || row.team,
          period:
            row.period === "Season" && week
              ? `Week ${week.weekNum}`
              : row.period,
        };
      }),
    );
  },
});

export const leaderboard = action({
  args: { filters: filtersValidator },
  handler: async (ctx, { filters }): Promise<PerformanceResult> => {
    validateFilters(filters);
    let cursor: string | null = null;
    let rows: PerformanceRow[] = [];
    let highlightsOnly = false;
    for (;;) {
      const result: {
        rows: PerformanceRow[];
        cursor: string;
        done: boolean;
        highlightsOnly: boolean;
      } = await ctx.runQuery(internal.performances.page, { filters, cursor });
      if (cursor !== null && highlightsOnly !== result.highlightsOnly)
        throw new Error("Season archive changed. Please refresh results.");
      highlightsOnly = result.highlightsOnly;
      rows = topPerformances(
        [...rows, ...result.rows],
        filters.stat,
        filters.direction,
      );
      if (result.done) break;
      cursor = result.cursor;
    }
    return {
      rows: await ctx.runQuery(internal.performances.hydrate, { rows }),
      highlightsOnly,
    };
  },
});
