import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import {
  projectTeamHistoryMatchup,
  projectTeamHistorySeason,
  projectTeamHistoryTeam,
  projectTeamHistoryWeek,
} from "./lib/teamHistoryProjection";
import { utcTimestampToDateKey } from "./lib/timestamps";

function present<T>(value: T | null): value is T {
  return value !== null;
}

function uniqueIds<
  TableName extends "conferences" | "owners" | "seasons" | "weeks",
>(values: Id<TableName>[]) {
  return Array.from(new Set(values));
}

/**
 * Returns one owner's complete matchup history with only referenced relations.
 *
 * Every collection read is either owner/team indexed or a point lookup, keeping
 * the browser payload and reactive dependency set scoped to the selected owner.
 */
export const byOwner = query({
  args: {
    ownerId: v.id("owners"),
  },
  handler: async (ctx, args) => {
    const ownerFranchises = await ctx.db
      .query("franchises")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.ownerId))
      .collect();

    const ownerTeams = (
      await Promise.all(
        ownerFranchises.map((franchise) =>
          ctx.db
            .query("teams")
            .withIndex("by_franchiseId", (q) =>
              q.eq("franchiseId", franchise._id),
            )
            .collect(),
        ),
      )
    ).flat();

    const matchupGroups = await Promise.all(
      ownerTeams.map(async (team) => {
        const [homeMatchups, awayMatchups] = await Promise.all([
          ctx.db
            .query("matchups")
            .withIndex("by_homeTeamId", (q) => q.eq("homeTeamId", team._id))
            .collect(),
          ctx.db
            .query("matchups")
            .withIndex("by_awayTeamId", (q) => q.eq("awayTeamId", team._id))
            .collect(),
        ]);
        return [...homeMatchups, ...awayMatchups];
      }),
    );
    const matchupRows = Array.from(
      new Map(
        matchupGroups.flat().map((matchup) => [matchup._id, matchup] as const),
      ).values(),
    );

    if (!matchupRows.length) {
      return { matchups: [], teams: [], weeks: [], seasons: [] };
    }

    const referencedTeamIds = Array.from(
      new Set(
        matchupRows.flatMap((matchup) => [
          matchup.homeTeamId,
          matchup.awayTeamId,
        ]),
      ),
    );
    const ownerTeamsById = new Map(
      ownerTeams.map((team) => [team._id, team] as const),
    );
    const opponentTeamIds = referencedTeamIds.filter(
      (teamId) => !ownerTeamsById.has(teamId),
    );
    const opponentTeams = (
      await Promise.all(opponentTeamIds.map((teamId) => ctx.db.get(teamId)))
    ).filter(present);
    const opponentTeamsById = new Map(
      opponentTeams.map((team) => [team._id, team] as const),
    );
    const referencedTeams = referencedTeamIds
      .map(
        (teamId) =>
          ownerTeamsById.get(teamId) ?? opponentTeamsById.get(teamId) ?? null,
      )
      .filter(present);

    const ownerFranchisesById = new Map(
      ownerFranchises.map((franchise) => [franchise._id, franchise] as const),
    );
    const opponentFranchiseIds = Array.from(
      new Set(
        referencedTeams
          .map((team) => team.franchiseId)
          .filter((franchiseId) => !ownerFranchisesById.has(franchiseId)),
      ),
    );
    const opponentFranchises = (
      await Promise.all(
        opponentFranchiseIds.map((franchiseId) => ctx.db.get(franchiseId)),
      )
    ).filter(present);
    const franchisesById = new Map<Id<"franchises">, Doc<"franchises">>([
      ...ownerFranchises.map(
        (franchise) => [franchise._id, franchise] as const,
      ),
      ...opponentFranchises.map(
        (franchise) => [franchise._id, franchise] as const,
      ),
    ]);

    const referencedFranchises = Array.from(
      new Set(referencedTeams.map((team) => team.franchiseId)),
    )
      .map((franchiseId) => franchisesById.get(franchiseId) ?? null)
      .filter(present);
    const conferenceIds = uniqueIds(referencedTeams.map((team) => team.confId));
    const ownerIds = uniqueIds(
      referencedFranchises.map((franchise) => franchise.ownerId),
    );
    const weekIds = uniqueIds(matchupRows.map((matchup) => matchup.weekId));
    const seasonIds = uniqueIds(matchupRows.map((matchup) => matchup.seasonId));

    const [conferenceRows, ownerRows, weekRows, seasonRows] = await Promise.all(
      [
        Promise.all(
          conferenceIds.map((conferenceId) => ctx.db.get(conferenceId)),
        ),
        Promise.all(ownerIds.map((ownerId) => ctx.db.get(ownerId))),
        Promise.all(weekIds.map((weekId) => ctx.db.get(weekId))),
        Promise.all(seasonIds.map((seasonId) => ctx.db.get(seasonId))),
      ],
    );
    const conferencesById = new Map(
      conferenceRows
        .filter(present)
        .map((conference) => [conference._id, conference] as const),
    );
    const ownersById = new Map(
      ownerRows.filter(present).map((owner) => [owner._id, owner] as const),
    );

    const teams = referencedTeams.map((team) => {
      const franchise = franchisesById.get(team.franchiseId) ?? null;
      return projectTeamHistoryTeam(
        team,
        franchise,
        conferencesById.get(team.confId) ?? null,
        franchise ? (ownersById.get(franchise.ownerId) ?? null) : null,
      );
    });
    const weeks = weekRows
      .filter(present)
      .map((week) =>
        projectTeamHistoryWeek(week, utcTimestampToDateKey(week.endDate)),
      );
    const seasons = seasonRows
      .filter(present)
      .map(projectTeamHistorySeason)
      .sort(
        (left, right) =>
          Number(left.year) - Number(right.year) ||
          left.id.localeCompare(right.id),
      );

    return {
      matchups: matchupRows.map(projectTeamHistoryMatchup),
      teams,
      weeks,
      seasons,
    };
  },
});
