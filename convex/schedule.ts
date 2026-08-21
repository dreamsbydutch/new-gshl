import { v } from "convex/values";
import { query } from "./_generated/server";
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
import { utcTimestampToDateKey } from "./lib/timestamps";

function present<T>(value: T | null): value is T {
  return value !== null;
}

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
