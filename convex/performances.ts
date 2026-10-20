import { ConvexError, v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireActiveUser } from "./lib/auth";
import type { Id } from "./_generated/dataModel";
import {
  PLAYER_DAY_SCORES,
  type PlayerDayScore,
} from "./lib/playerDayPerformanceIndex";
import type {
  PerformanceFilters,
  PerformanceResult,
  PerformanceRow,
} from "../src/lib/types/performances";
import type { CareerAggregate } from "../src/lib/types/records";
import {
  addCareerPerformances,
  careerLeaders,
  isCareerPerformance,
} from "../src/lib/utils/features/records";
import {
  performanceNumber,
  performanceStats,
  qualifiesForPerformance,
  topPerformances,
} from "../src/lib/utils/features/performances";

const filterFields = {
  kind: v.union(
    v.literal("playerDay"),
    v.literal("playerWeek"),
    v.literal("playerSplit"),
    v.literal("playerTotal"),
    v.literal("playerNhl"),
    v.literal("teamDay"),
    v.literal("teamWeek"),
    v.literal("teamSeason"),
    v.literal("playerCareer"),
    v.literal("teamCareer"),
  ),
  stat: v.string(),
  direction: v.union(v.literal("asc"), v.literal("desc")),
  position: v.union(v.literal("all"), v.literal("skater"), v.literal("goalie")),
  seasonType: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  minimumGames: v.optional(v.number()),
};
const filtersValidator = v.object({
  ...filterFields,
  seasonIds: v.array(v.id("seasons")),
});
const seasonFiltersValidator = v.object({
  ...filterFields,
  seasonId: v.id("seasons"),
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
  playerCareer: "playerTotalStatLines",
  teamCareer: "teamSeasonStatLines",
} as const;

function validateFilters(filters: Omit<PerformanceFilters, "seasonIds">) {
  if (filters.minimumGames !== undefined && filters.kind.endsWith("Day"))
    throw new Error(
      "Minimum games applies to weekly, season, and career records",
    );
  if (
    filters.minimumGames !== undefined &&
    (!Number.isInteger(filters.minimumGames) ||
      filters.minimumGames < 1 ||
      filters.minimumGames > 100000)
  )
    throw new Error(
      "Minimum games must be a whole number between 1 and 100000",
    );
  if (!["", "RS", "PO", "LT"].includes(filters.seasonType))
    throw new Error("Invalid season type");
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

// Player days use normalized score indexes; no request-time source scan.
export const page = internalQuery({
  args: {
    filters: seasonFiltersValidator,
    cursor: v.union(v.string(), v.null()),
  },
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
    const season = await ctx.db.get(filters.seasonId);
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
    if (filters.kind === "playerDay") {
      const source = highlightsOnly
        ? "playerDayHighlights"
        : "playerDayStatLines";
      const coverage = await ctx.db
        .query("playerDayPerformanceCoverage")
        .withIndex("by_source_season", (q) =>
          q.eq("source", source).eq("seasonId", filters.seasonId),
        )
        .unique();
      if (!coverage?.ready)
        throw new ConvexError(
          "Player-day comparisons are not ready for this season yet. The league administrator needs to prepare its performance index.",
        );
      if (!PLAYER_DAY_SCORES.includes(filters.stat as PlayerDayScore))
        throw new Error("Invalid player-day statistic");
      const stat = filters.stat as PlayerDayScore;
      const positions =
        filters.position === "all"
          ? (["skater", "goalie"] as const)
          : [filters.position];
      let candidates;
      if (filters.startDate || filters.endDate) {
        // Date-first index prevents examining unrelated days. Refuse oversized
        // ranges instead of silently scanning a season or returning partial tops.
        candidates = await ctx.db
          .query("playerDayPerformanceIndex")
          .withIndex("by_source_seasonId_date", (q) => {
            const range = q
              .eq("source", source)
              .eq("seasonId", filters.seasonId);
            if (filters.startDate && filters.endDate)
              return range
                .gte("date", filters.startDate)
                .lte("date", filters.endDate);
            if (filters.startDate) return range.gte("date", filters.startDate);
            return range.lte("date", filters.endDate);
          })
          .take(1001);
        if (candidates.length > 1000)
          throw new ConvexError(
            "This date range includes too many player days. Shorten the date range, or remove the date filter to compare indexed season leaders.",
          );
      } else {
        const index =
          `by_source_seasonId_position_scores_${stat}_sourceId` as const;
        const field = `scores.${stat}` as const;
        candidates = (
          await Promise.all(
            positions.map((position) =>
              ctx.db
                .query("playerDayPerformanceIndex")
                .withIndex(index, (q) =>
                  q
                    .eq("source", source)
                    .eq("seasonId", filters.seasonId)
                    .eq("position", position)
                    .gte(field, -Number.MAX_VALUE),
                )
                .order(filters.direction)
                .take(100),
            ),
          )
        ).flat();
      }
      const rows: PerformanceRow[] = candidates
        .filter(
          (row) =>
            positions.includes(row.position) && row.scores[stat] !== undefined,
        )
        .map((row) => ({
          id: row.sourceId,
          season: season?.name ?? "Unknown season",
          playerId: null,
          teamIds: [],
          weekId: null,
          period: row.date ?? "Season",
          position: row.position,
          stats: Object.fromEntries(
            Object.entries(row.scores).filter(
              (entry): entry is [string, number] => entry[1] !== undefined,
            ),
          ),
          name: "",
          team: "",
        }));
      return {
        rows: topPerformances(rows, stat, filters.direction),
        cursor: "",
        done: true,
        highlightsOnly,
      };
    }
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
    const career = isCareerPerformance(filters.kind);
    const weeks =
      filters.kind.endsWith("Week") && filters.seasonType
        ? await ctx.db
            .query("weeks")
            .withIndex("by_seasonId", (q) => q.eq("seasonId", filters.seasonId))
            .collect()
        : [];
    const weekTypes = new Map(
      weeks.map((week) => [String(week._id), week.weekType]),
    );
    const franchises = new Map<string, string>();
    const rows: PerformanceRow[] = [];
    for (const document of result.page) {
      const row: Record<string, unknown> = document;
      if (
        filters.kind === "playerCareer" &&
        filters.position === "skater" &&
        ["W", "GA", "GAA", "SV", "SA", "SVP", "SO"].includes(filters.stat)
      )
        continue;
      const qualification = career
        ? {
            ...filters,
            minimumGames: 1,
            stat: "GP",
            position:
              ["W", "GA", "GAA", "SV", "SA", "SVP", "SO"].includes(
                filters.stat,
              ) && filters.kind === "playerCareer"
                ? ("goalie" as const)
                : filters.position,
          }
        : filters;
      const source = weekTypes.size
        ? { ...row, seasonType: weekTypes.get(String(row.weekId)) }
        : row;
      if (!qualifiesForPerformance(source, qualification)) continue;
      let franchiseId: string | undefined;
      if (filters.kind === "teamCareer" && typeof row.gshlTeamId === "string") {
        franchiseId = franchises.get(row.gshlTeamId);
        if (!franchiseId) {
          const teamId = ctx.db.normalizeId("teams", row.gshlTeamId);
          const team = teamId ? await ctx.db.get(teamId) : null;
          if (!team)
            throw new ConvexError(
              "A historical team is missing. Please ask the commissioner to review this record.",
            );
          franchiseId = String(team.franchiseId);
          franchises.set(row.gshlTeamId, franchiseId);
        }
      }
      rows.push({
        id: document._id,
        ...(franchiseId ? { franchiseId } : {}),
        season: season?.name ?? "Unknown season",
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
      rows: career
        ? rows
        : topPerformances(rows, filters.stat, filters.direction),
      cursor: result.continueCursor,
      done: result.isDone,
      highlightsOnly,
    };
  },
});

const rowValidator = v.object({
  id: v.string(),
  season: v.string(),
  playerId: v.union(v.string(), v.null()),
  teamIds: v.array(v.string()),
  weekId: v.union(v.string(), v.null()),
  period: v.string(),
  position: v.string(),
  stats: v.record(v.string(), v.union(v.number(), v.null())),
  name: v.string(),
  team: v.string(),
  franchiseId: v.optional(v.string()),
});
export const hydrate = internalQuery({
  args: { rows: v.array(rowValidator) },
  handler: async (ctx, { rows }): Promise<PerformanceRow[]> => {
    await requireActiveUser(ctx);
    if (rows.length > 100) throw new Error("Too many performances");
    const teamNamesById = new Map<string, Promise<string>>();
    const franchiseNamesById = new Map<string, Promise<string>>();
    const teamName = (id: string): Promise<string> => {
      const cached = teamNamesById.get(id);
      if (cached) return cached;
      const pending = ctx.db.get(id as Id<"teams">).then((team) => {
        if (!team) return "Unknown team";
        let name = franchiseNamesById.get(team.franchiseId);
        if (!name) {
          name = ctx.db
            .get(team.franchiseId)
            .then((franchise) => franchise?.name ?? "Unknown team");
          franchiseNamesById.set(team.franchiseId, name);
        }
        return name;
      });
      teamNamesById.set(id, pending);
      return pending;
    };
    return Promise.all(
      rows.map(async (row) => {
        // Only the final combined winners need their full source documents.
        const dayId =
          ctx.db.normalizeId("playerDayStatLines", row.id) ??
          ctx.db.normalizeId("playerDayHighlights", row.id);
        if (dayId) {
          const day = await ctx.db.get(dayId);
          if (!day)
            throw new ConvexError(
              "Performance records changed. Please run the comparison again.",
            );
          row = {
            ...row,
            playerId: day.playerId,
            teamIds: [day.gshlTeamId],
            weekId: day.weekId,
            position: day.posGroup,
            stats: Object.fromEntries(
              performanceStats("playerDay").map((stat) => [
                stat,
                performanceNumber((day as Record<string, unknown>)[stat]),
              ]),
            ),
          };
        }
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
        const teamNames = [
          ...new Set(await Promise.all(row.teamIds.map(teamName))),
        ];
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
    const { seasonIds, ...commonFilters } = filters;
    if (seasonIds.length === 0 || seasonIds.length > 100)
      throw new Error("Select between 1 and 100 seasons");
    let rows: PerformanceRow[] = [];
    let careers = new Map<string, CareerAggregate>();
    let highlightsOnly = false;
    for (const seasonId of new Set(seasonIds)) {
      let cursor: string | null = null;
      let seasonHighlightsOnly: boolean | undefined;
      for (;;) {
        const result: {
          rows: PerformanceRow[];
          cursor: string;
          done: boolean;
          highlightsOnly: boolean;
        } = await ctx.runQuery(internal.performances.page, {
          filters: { ...commonFilters, seasonId },
          cursor,
        });
        if (
          seasonHighlightsOnly !== undefined &&
          seasonHighlightsOnly !== result.highlightsOnly
        )
          throw new Error("Season archive changed. Please refresh results.");
        seasonHighlightsOnly = result.highlightsOnly;
        highlightsOnly ||= result.highlightsOnly;
        if (isCareerPerformance(filters.kind)) {
          careers = addCareerPerformances(careers, result.rows, filters.kind);
        } else {
          rows = topPerformances(
            [...rows, ...result.rows],
            filters.stat,
            filters.direction,
          );
        }
        if (result.done) break;
        cursor = result.cursor;
      }
    }
    if (isCareerPerformance(filters.kind))
      rows = careerLeaders(
        careers,
        filters.kind,
        filters.stat,
        filters.direction,
        filters.minimumGames,
      );
    return {
      rows: await ctx.runQuery(internal.performances.hydrate, { rows }),
      highlightsOnly,
    };
  },
});
