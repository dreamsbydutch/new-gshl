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
) {
  return [...rows]
    .sort((left, right) => (right.rating ?? 0) - (left.rating ?? 0))
    .map((row) => {
      const outcome = projectMatchupOutcome(row);
      return {
        id: row._id,
        homeTeamId: row.homeTeamId,
        awayTeamId: row.awayTeamId,
        gameType: row.gameType,
        homeRank: row.homeRank ?? null,
        awayRank: row.awayRank ?? null,
        homeScore: row.homeScore ?? null,
        awayScore: row.awayScore ?? null,
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
