import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCommissioner } from "./lib/auth";
import {
  pairKey,
  validateSchedule,
} from "../src/lib/utils/features/schedule-builder";
import type { PairHistory } from "../src/lib/types/schedule-builder";
import type { Doc } from "./_generated/dataModel";
import {
  projectWeeklyScheduleMatchups,
  projectWeeklyScheduleTeam,
} from "./lib/scheduleProjection";
import {
  projectTeamScheduleRows,
  projectTeamScheduleTeam,
} from "./lib/teamScheduleProjection";
import { projectMatchupTeamWeekStats } from "./lib/matchupProjection";
import { toUtcTimestamp, utcTimestampToDateKey } from "./lib/timestamps";

function present<T>(value: T | null): value is T {
  return value !== null;
}

export const builderSeasons = query({
  args: {},
  handler: async (ctx) => {
    await requireCommissioner(ctx);
    const seasons = await ctx.db.query("seasons").collect();
    return [...seasons]
      .sort(
        (a, b) =>
          (toUtcTimestamp(b.startDate) ?? 0) -
          (toUtcTimestamp(a.startDate) ?? 0),
      )
      .map((s) => ({ id: s._id, name: s.name }));
  },
});

export const builderContext = query({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, { seasonId }) => {
    await requireCommissioner(ctx);
    const target = await ctx.db.get(seasonId);
    if (!target) throw new Error("Season not found.");
    const seasons = await ctx.db.query("seasons").collect();
    const targetStart = toUtcTimestamp(target.startDate);
    if (targetStart === null)
      throw new Error("Set the season start date before building a schedule.");
    if (seasons.some((s) => toUtcTimestamp(s.startDate) === null))
      throw new Error(
        "Every season needs a start date to establish historical order.",
      );
    const previous = seasons.filter(
      (s) => toUtcTimestamp(s.startDate)! < targetStart,
    );
    const franchises = await ctx.db.query("franchises").collect();
    const byFranchise = new Map(franchises.map((f) => [f._id, f]));
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", seasonId))
      .collect();
    const history = new Map<string, PairHistory>();
    let excluded = 0;
    for (const season of previous) {
      const [oldTeams, matchups, weeks] = await Promise.all([
        ctx.db
          .query("teams")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
          .collect(),
        ctx.db
          .query("matchups")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
          .collect(),
        ctx.db
          .query("weeks")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
          .collect(),
      ]);
      const owners = new Map(
        oldTeams.map((t) => [t._id, byFranchise.get(t.franchiseId)?.ownerId]),
      );
      const regularWeeks = new Set(
        weeks.filter((w) => !w.isPlayoffs).map((w) => w._id),
      );
      for (const game of matchups) {
        if (game.isComplete === false) continue;
        if (
          !["CC", "NC", "RS"].includes(game.gameType) ||
          !regularWeeks.has(game.weekId)
        )
          continue;
        const home = owners.get(game.homeTeamId);
        const away = owners.get(game.awayTeamId);
        if (!home || !away || home === away) {
          excluded++;
          continue;
        }
        const [a, b] = [String(home), String(away)].sort() as [string, string];
        const key = pairKey(a, b);
        const record = history.get(key) ?? { a, b, games: 0, aHome: 0 };
        record.games++;
        if (home === a) record.aHome++;
        history.set(key, record);
      }
    }
    const weeks = await ctx.db
      .query("weeks")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", seasonId))
      .collect();
    const existing = await ctx.db
      .query("matchups")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", seasonId))
      .collect();
    return {
      teams: teams.map((t) => {
        const franchise = byFranchise.get(t.franchiseId);
        if (!franchise)
          throw new Error("A team is missing its franchise / owner.");
        return {
          id: String(t._id),
          ownerId: String(franchise.ownerId),
          conferenceId: String(t.confId),
          name: franchise.name,
        };
      }),
      history: [...history.values()],
      historySeasons: previous.length,
      excluded,
      regularWeeks: weeks.filter((w) => !w.isPlayoffs).length,
      hasSchedule: existing.some(
        (g) =>
          ["CC", "NC", "RS"].includes(g.gameType) ||
          weeks.some((w) => w._id === g.weekId && !w.isPlayoffs),
      ),
    };
  },
});

export const publishBuilderSchedule = mutation({
  args: {
    seasonId: v.id("seasons"),
    weeks: v.number(),
    games: v.array(
      v.object({ week: v.number(), home: v.id("teams"), away: v.id("teams") }),
    ),
  },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const [teams, allWeeks, existing] = await Promise.all([
      ctx.db
        .query("teams")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", args.seasonId))
        .collect(),
      ctx.db
        .query("weeks")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", args.seasonId))
        .collect(),
      ctx.db
        .query("matchups")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", args.seasonId))
        .collect(),
    ]);
    const weeks = allWeeks
      .filter((w) => !w.isPlayoffs)
      .sort((a, b) => Number(a.weekNum) - Number(b.weekNum));
    if (
      weeks.length !== args.weeks ||
      new Set(weeks.map((w) => Number(w.weekNum))).size !== weeks.length ||
      weeks.some((w) => !Number.isFinite(Number(w.weekNum)))
    ) {
      throw new Error(
        "Create exactly the requested number of distinct regular-season weeks before publishing.",
      );
    }
    if (weeks.some((w) => (toUtcTimestamp(w.startDate) ?? 0) <= Date.now()))
      throw new Error(
        "Publishing requires valid future start dates for every regular-season week.",
      );
    if (
      existing.some(
        (g) =>
          ["CC", "NC", "RS"].includes(g.gameType) ||
          weeks.some((w) => w._id === g.weekId),
      )
    )
      throw new Error(
        "This season already has regular-season matchups. Nothing was overwritten.",
      );
    const builderTeams = await Promise.all(
      teams.map(async (t) => {
        const franchise = await ctx.db.get(t.franchiseId);
        if (!franchise) throw new Error("Missing franchise / owner.");
        return {
          id: String(t._id),
          ownerId: String(franchise.ownerId),
          conferenceId: String(t.confId),
          name: franchise.name,
        };
      }),
    );
    validateSchedule(builderTeams, args.weeks, args.games);
    const byId = new Map(teams.map((t) => [t._id, t]));
    const now = Date.now();
    for (const game of args.games)
      await ctx.db.insert("matchups", {
        seasonId: args.seasonId,
        weekId: weeks[game.week - 1]!._id,
        homeTeamId: game.home,
        awayTeamId: game.away,
        gameType:
          byId.get(game.home)!.confId === byId.get(game.away)!.confId
            ? "CC"
            : "NC",
        isComplete: false,
        createdAt: now,
        updatedAt: now,
      });
    return { games: args.games.length };
  },
});

/**
 * Returns the complete public payload for one weekly schedule view.
 *
 * The indexed matchup read and related point reads keep both the payload and
 * the query's reactive dependency set bounded to the selected week.
 */
export const weeklySchedule = query({
  args: {
    seasonId: v.id("seasons"),
    weekId: v.id("weeks"),
  },
  handler: async (ctx, args) => {
    const matchupRows = await ctx.db
      .query("matchups")
      .withIndex("by_seasonId_weekId", (q) =>
        q.eq("seasonId", args.seasonId).eq("weekId", args.weekId),
      )
      .collect();

    const referencedTeamIds = Array.from(
      new Set(
        matchupRows.flatMap((matchup) => [
          matchup.awayTeamId,
          matchup.homeTeamId,
        ]),
      ),
    );
    const teamRows = (
      await Promise.all(referencedTeamIds.map((teamId) => ctx.db.get(teamId)))
    ).filter(present);

    const franchiseIds = Array.from(
      new Set(teamRows.map((team) => team.franchiseId)),
    );
    const conferenceIds = Array.from(
      new Set(teamRows.map((team) => team.confId)),
    );
    const [franchiseRows, conferenceRows] = await Promise.all([
      Promise.all(franchiseIds.map((franchiseId) => ctx.db.get(franchiseId))),
      Promise.all(
        conferenceIds.map((conferenceId) => ctx.db.get(conferenceId)),
      ),
    ]);
    const franchisesById = new Map(
      franchiseRows
        .filter(present)
        .map((franchise) => [franchise._id, franchise] as const),
    );
    const conferencesById = new Map(
      conferenceRows
        .filter(present)
        .map((conference) => [conference._id, conference] as const),
    );

    return {
      matchups: projectWeeklyScheduleMatchups(matchupRows),
      teams: teamRows.map((team: Doc<"teams">) =>
        projectWeeklyScheduleTeam(
          team,
          franchisesById.get(team.franchiseId) ?? null,
          conferencesById.get(team.confId) ?? null,
        ),
      ),
    };
  },
});

/** Returns one owner's indexed season schedule and only referenced relations. */
export const teamSchedule = query({
  args: {
    seasonId: v.id("seasons"),
    ownerId: v.id("owners"),
  },
  handler: async (ctx, args) => {
    const [season, franchiseRows] = await Promise.all([
      ctx.db.get(args.seasonId),
      ctx.db
        .query("franchises")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", args.ownerId))
        .collect(),
    ]);
    const ownerTeamRows = (
      await Promise.all(
        franchiseRows.map((franchise) =>
          ctx.db
            .query("teams")
            .withIndex("by_seasonId_franchiseId", (q) =>
              q.eq("seasonId", args.seasonId).eq("franchiseId", franchise._id),
            )
            .first(),
        ),
      )
    ).filter(present);
    const selectedTeam = ownerTeamRows[0] ?? null;

    if (!selectedTeam) {
      return {
        selectedTeam: null,
        matchups: [],
        teams: [],
        seasonCategories: season?.categories ?? [],
      };
    }

    const [homeMatchups, awayMatchups] = await Promise.all([
      ctx.db
        .query("matchups")
        .withIndex("by_seasonId_homeTeamId", (q) =>
          q.eq("seasonId", args.seasonId).eq("homeTeamId", selectedTeam._id),
        )
        .collect(),
      ctx.db
        .query("matchups")
        .withIndex("by_seasonId_awayTeamId", (q) =>
          q.eq("seasonId", args.seasonId).eq("awayTeamId", selectedTeam._id),
        )
        .collect(),
    ]);
    const matchupRows = Array.from(
      new Map(
        [...homeMatchups, ...awayMatchups].map((matchup) => [
          matchup._id,
          matchup,
        ]),
      ).values(),
    );
    const weekIds = Array.from(
      new Set(matchupRows.map((matchup) => matchup.weekId)),
    );
    const referencedTeamIds = Array.from(
      new Set([
        selectedTeam._id,
        ...matchupRows.flatMap((matchup) => [
          matchup.homeTeamId,
          matchup.awayTeamId,
        ]),
      ]),
    );
    const [weekRows, teamRows] = await Promise.all([
      Promise.all(weekIds.map((weekId) => ctx.db.get(weekId))),
      Promise.all(referencedTeamIds.map((teamId) => ctx.db.get(teamId))),
    ]);
    const weeks = weekRows.filter(present).map((week) => ({
      id: String(week._id),
      weekNum: week.weekNum,
      endDate: utcTimestampToDateKey(week.endDate),
    }));
    const teams = teamRows.filter(present);
    const franchiseIds = Array.from(
      new Set(teams.map((team) => team.franchiseId)),
    );
    const conferenceIds = Array.from(new Set(teams.map((team) => team.confId)));
    const [referencedFranchises, referencedConferences] = await Promise.all([
      Promise.all(franchiseIds.map((franchiseId) => ctx.db.get(franchiseId))),
      Promise.all(
        conferenceIds.map((conferenceId) => ctx.db.get(conferenceId)),
      ),
    ]);
    const franchisesById = new Map(
      referencedFranchises
        .filter(present)
        .map((franchise) => [franchise._id, franchise] as const),
    );
    const conferencesById = new Map(
      referencedConferences
        .filter(present)
        .map((conference) => [conference._id, conference] as const),
    );
    const projectedTeams = teams.map((team) =>
      projectTeamScheduleTeam(
        team,
        franchisesById.get(team.franchiseId) ?? null,
        conferencesById.get(team.confId) ?? null,
      ),
    );

    return {
      selectedTeam:
        projectedTeams.find((team) => team.id === selectedTeam._id) ?? null,
      matchups: projectTeamScheduleRows(matchupRows, weeks),
      teams: projectedTeams,
      seasonCategories: season?.categories ?? [],
    };
  },
});

/** Lazily returns only the two category rows for one expanded schedule item. */
export const teamScheduleStats = query({
  args: {
    seasonId: v.id("seasons"),
    weekId: v.id("weeks"),
    homeTeamId: v.id("teams"),
    awayTeamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const [homeStats, awayStats] = await Promise.all([
      ctx.db
        .query("teamWeekStatLines")
        .withIndex("by_seasonId_weekId_gshlTeamId", (q) =>
          q
            .eq("seasonId", args.seasonId)
            .eq("weekId", args.weekId)
            .eq("gshlTeamId", args.homeTeamId),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("teamWeekStatLines")
        .withIndex("by_seasonId_weekId_gshlTeamId", (q) =>
          q
            .eq("seasonId", args.seasonId)
            .eq("weekId", args.weekId)
            .eq("gshlTeamId", args.awayTeamId),
        )
        .order("desc")
        .first(),
    ]);

    return {
      home: homeStats ? projectMatchupTeamWeekStats(homeStats) : null,
      away: awayStats ? projectMatchupTeamWeekStats(awayStats) : null,
    };
  },
});
