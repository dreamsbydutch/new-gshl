type TeamScheduleMatchupSource = {
  [key: string]: unknown;
  _id: string;
  seasonId: string;
  weekId: string;
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
};

type TeamScheduleWeekSource = {
  id: string;
  weekNum: string | number;
  endDate: string | null;
};

type TeamSource = {
  [key: string]: unknown;
  _id: string;
};

type FranchiseSource = {
  [key: string]: unknown;
  name: string;
  logoUrl?: string | null;
};

type ConferenceSource = {
  [key: string]: unknown;
  abbr: string;
};

const PLAYOFF_GAME_TYPES = new Set(["QF", "SF", "F"]);

function projectOutcome(matchup: TeamScheduleMatchupSource) {
  if (
    !PLAYOFF_GAME_TYPES.has(matchup.gameType) ||
    (!matchup.isComplete && matchup.tie !== true)
  ) {
    return {
      homeWin: matchup.homeWin ?? null,
      awayWin: matchup.awayWin ?? null,
      tie: matchup.tie ?? null,
    };
  }

  if (matchup.homeScore != null && matchup.awayScore != null) {
    return {
      homeWin: matchup.homeScore >= matchup.awayScore,
      awayWin: matchup.awayScore > matchup.homeScore,
      tie: false,
    };
  }

  if (matchup.tie === true) {
    return { homeWin: true, awayWin: false, tie: false };
  }

  return {
    homeWin: matchup.homeWin ?? null,
    awayWin: matchup.awayWin ?? null,
    tie: matchup.tie ?? null,
  };
}

function projectTeamScheduleMatchup(matchup: TeamScheduleMatchupSource) {
  const outcome = projectOutcome(matchup);
  return {
    id: matchup._id,
    seasonId: matchup.seasonId,
    weekId: matchup.weekId,
    homeTeamId: matchup.homeTeamId,
    awayTeamId: matchup.awayTeamId,
    gameType: matchup.gameType,
    homeRank: matchup.homeRank ?? null,
    awayRank: matchup.awayRank ?? null,
    homeScore: matchup.homeScore ?? null,
    awayScore: matchup.awayScore ?? null,
    homeWin: outcome.homeWin,
    awayWin: outcome.awayWin,
    tie: outcome.tie,
  };
}

/** Builds sorted schedule rows with only the week fields rendered by the UI. */
export function projectTeamScheduleRows(
  matchups: readonly TeamScheduleMatchupSource[],
  weeks: readonly TeamScheduleWeekSource[],
) {
  const weeksById = new Map(weeks.map((week) => [week.id, week] as const));

  return matchups
    .map((matchup) => {
      const week = weeksById.get(matchup.weekId);
      return {
        matchup: projectTeamScheduleMatchup(matchup),
        week: week ? { weekNum: week.weekNum, endDate: week.endDate } : null,
      };
    })
    .sort((left, right) => {
      const leftWeek = Number(left.week?.weekNum ?? 0);
      const rightWeek = Number(right.week?.weekNum ?? 0);
      return leftWeek - rightWeek;
    });
}

/** Projects the team branding used by schedule rows and lazy stat details. */
export function projectTeamScheduleTeam(
  team: TeamSource,
  franchise: FranchiseSource | null,
  conference: ConferenceSource | null,
) {
  return {
    id: team._id,
    name: franchise?.name ?? null,
    logoUrl: franchise?.logoUrl ?? null,
    confAbbr: conference?.abbr ?? null,
  };
}
