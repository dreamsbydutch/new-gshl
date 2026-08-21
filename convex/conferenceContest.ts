import { query } from "./_generated/server";
import { utcTimestampToDateKey } from "./lib/timestamps";
import {
  buildConferenceContestOverallFromSeasonModels,
  buildConferenceContestSeasonViewModels,
  getConferenceContestVisibleSeasons,
  projectConferenceContestBrowserView,
} from "../src/lib/utils/features/conference-contest";
import type { GSHLTeam, Matchup, Season, TeamAward } from "../src/lib/types";

function present<T>(value: T | null): value is T {
  return value !== null;
}

/**
 * Builds the complete Conference Contest browser view on the server. Historical
 * source rows stay inside Convex; the subscription returns only rendered
 * ratings, wins, counts, and conference branding.
 */
export const view = query({
  args: {},
  handler: async (ctx) => {
    const seasonDocs = await ctx.db.query("seasons").collect();
    const seasons = seasonDocs.map(
      (season) =>
        ({
          id: String(season._id),
          year: Number(season.year),
          name: season.name,
          startDate: utcTimestampToDateKey(season.startDate),
          endDate: utcTimestampToDateKey(season.endDate),
          isActive: season.isActive,
        }) as Season,
    );
    const visibleSeasons = getConferenceContestVisibleSeasons(seasons);
    if (!visibleSeasons.length) return { overall: null, seasons: [] };

    const sourcePages = await Promise.all(
      visibleSeasons.map(async (season) => {
        const seasonId = ctx.db.normalizeId("seasons", season.id);
        if (!seasonId) return { teams: [], matchups: [], awards: [] };
        const [teams, matchups, awards] = await Promise.all([
          ctx.db
            .query("teams")
            .withIndex("by_seasonId", (range) => range.eq("seasonId", seasonId))
            .collect(),
          ctx.db
            .query("matchups")
            .withIndex("by_seasonId", (range) => range.eq("seasonId", seasonId))
            .collect(),
          ctx.db
            .query("teamAwards")
            .withIndex("by_seasonId", (range) => range.eq("seasonId", seasonId))
            .collect(),
        ]);
        return { teams, matchups, awards };
      }),
    );
    const teamDocs = sourcePages.flatMap((page) => page.teams);
    const franchiseIds = [...new Set(teamDocs.map((team) => team.franchiseId))];
    const conferenceIds = [...new Set(teamDocs.map((team) => team.confId))];
    const [franchiseDocs, conferenceDocs] = await Promise.all([
      Promise.all(franchiseIds.map((id) => ctx.db.get(id))),
      Promise.all(conferenceIds.map((id) => ctx.db.get(id))),
    ]);
    const franchisesById = new Map(
      franchiseDocs
        .filter(present)
        .map((franchise) => [franchise._id, franchise] as const),
    );
    const conferencesById = new Map(
      conferenceDocs
        .filter(present)
        .map((conference) => [conference._id, conference] as const),
    );
    const teams = teamDocs.map((team) => {
      const franchise = franchisesById.get(team.franchiseId);
      const conference = conferencesById.get(team.confId);
      return {
        id: String(team._id),
        seasonId: String(team.seasonId),
        franchiseId: String(team.franchiseId),
        confId: String(team.confId),
        confName: conference?.name ?? null,
        confAbbr: conference?.abbr ?? null,
        confLogoUrl: conference?.logoUrl ?? null,
        ownerId: franchise ? String(franchise.ownerId) : null,
      } as GSHLTeam;
    });
    const matchups = sourcePages.flatMap((page) =>
      page.matchups.map(
        (matchup) =>
          ({
            id: String(matchup._id),
            seasonId: String(matchup.seasonId),
            weekId: String(matchup.weekId),
            homeTeamId: String(matchup.homeTeamId),
            awayTeamId: String(matchup.awayTeamId),
            gameType: matchup.gameType,
            homeScore: matchup.homeScore ?? null,
            awayScore: matchup.awayScore ?? null,
            homeWin: matchup.homeWin ?? null,
            awayWin: matchup.awayWin ?? null,
            tie: matchup.tie ?? null,
          }) as Matchup,
      ),
    );
    const teamAwards = sourcePages.flatMap((page) =>
      page.awards.map(
        (award) =>
          ({
            id: String(award._id),
            seasonId: String(award.seasonId),
            ownerId: award.ownerId ? String(award.ownerId) : "",
            ...(award.teamId ? { teamId: String(award.teamId) } : {}),
            award: award.award,
          }) as TeamAward,
      ),
    );
    const seasonViewModels = buildConferenceContestSeasonViewModels({
      seasons: visibleSeasons,
      matchups,
      gshlTeams: teams,
      teamAwards,
    });
    const overall =
      buildConferenceContestOverallFromSeasonModels(seasonViewModels);

    return projectConferenceContestBrowserView({
      overall,
      seasons: seasonViewModels,
    });
  },
});
