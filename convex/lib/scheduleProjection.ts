import {
  buildCategoryResults,
  resolveMatchupCategories,
  resolveMatchupScore,
} from "../../src/lib/utils/features/matchup-details";
import { projectMatchupTeamWeekStats } from "./matchupProjection";

type WeeklyScheduleMatchupSource = {
  _id: string;
  homeTeamId: string;
  awayTeamId: string;
  gameType: string;
  homeRank?: number | null;
  awayRank?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  homeWin?: boolean | null;
  awayWin?: boolean | null;
  tie?: boolean | null;
  isComplete?: boolean | null;
  rating?: number | null;
};

type WeeklyScheduleTeamSource = {
  _id: string;
};

type WeeklyScheduleFranchiseSource = {
  name: string;
  logoUrl?: string | null;
};

type WeeklyScheduleConferenceSource = {
  abbr: string;
};

const PLAYOFF_GAME_TYPES = new Set(["QF", "SF", "F"]);

function projectMatchupOutcome(row: WeeklyScheduleMatchupSource) {
  if (
    !PLAYOFF_GAME_TYPES.has(row.gameType) ||
    (!row.isComplete && row.tie !== true)
  ) {
    return {
      homeWin: row.homeWin ?? null,
      awayWin: row.awayWin ?? null,
    };
  }

  if (row.homeScore != null && row.awayScore != null) {
    return {
      homeWin: row.homeScore >= row.awayScore,
      awayWin: row.awayScore > row.homeScore,
    };
  }

  if (row.tie === true) {
    return { homeWin: true, awayWin: false };
  }

  return {
    homeWin: row.homeWin ?? null,
    awayWin: row.awayWin ?? null,
  };
}

/** Sorts weekly matchups by display priority and removes non-rendered fields. */
export function projectWeeklyScheduleMatchups(
  rows: readonly WeeklyScheduleMatchupSource[],
  live?: {
    isInProgress: boolean;
    categories: string[];
    teamStats: ReadonlyMap<
      string,
      Parameters<typeof projectMatchupTeamWeekStats>[0]
    >;
  },
) {
  return [...rows]
    .sort((left, right) => (right.rating ?? 0) - (left.rating ?? 0))
    .map((row) => {
      const outcome = projectMatchupOutcome(row);
      let homeScore = row.homeScore ?? null;
      let awayScore = row.awayScore ?? null;
      if (live?.isInProgress && !row.isComplete) {
        const home = live.teamStats.get(row.homeTeamId);
        const away = live.teamStats.get(row.awayTeamId);
        const categories =
          home && away
            ? buildCategoryResults(
                projectMatchupTeamWeekStats(home),
                projectMatchupTeamWeekStats(away),
                resolveMatchupCategories(live.categories),
              )
            : [];
        const score = resolveMatchupScore(
          { ...row, isComplete: row.isComplete ?? false },
          categories,
        );
        homeScore = score.home;
        awayScore = score.away;
      }
      return {
        id: row._id,
        homeTeamId: row.homeTeamId,
        awayTeamId: row.awayTeamId,
        gameType: row.gameType,
        homeRank: row.homeRank ?? null,
        awayRank: row.awayRank ?? null,
        homeScore,
        awayScore,
        homeWin: outcome.homeWin,
        awayWin: outcome.awayWin,
      };
    });
}

/** Builds the public team fragment needed by a weekly schedule row. */
export function projectWeeklyScheduleTeam(
  team: WeeklyScheduleTeamSource,
  franchise: WeeklyScheduleFranchiseSource | null,
  conference: WeeklyScheduleConferenceSource | null,
) {
  return {
    id: team._id,
    name: franchise?.name ?? null,
    logoUrl: franchise?.logoUrl ?? null,
    confAbbr: conference?.abbr ?? null,
  };
}
