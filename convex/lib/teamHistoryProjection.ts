type TeamHistoryMatchupSource = {
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

type TeamHistoryTeamSource = {
  [key: string]: unknown;
  _id: string;
};

type TeamHistoryFranchiseSource = {
  [key: string]: unknown;
  ownerId: string;
  name: string;
  logoUrl?: string | null;
};

type TeamHistoryConferenceSource = {
  [key: string]: unknown;
  abbr: string;
};

type TeamHistoryOwnerSource = {
  [key: string]: unknown;
  _id: string;
  firstName: string;
  lastName: string;
};

type TeamHistoryWeekSource = {
  [key: string]: unknown;
  _id: string;
  weekNum: string | number;
};

type TeamHistorySeasonSource = {
  [key: string]: unknown;
  _id: string;
  year: string;
  name: string;
  categories: string[];
};

const PLAYOFF_GAME_TYPES = new Set(["QF", "SF", "F"]);

function projectOutcome(matchup: TeamHistoryMatchupSource) {
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

/** Removes matchup metadata while preserving all history and row behavior. */
export function projectTeamHistoryMatchup(matchup: TeamHistoryMatchupSource) {
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

/** Projects only the public team identity used by history filters and rows. */
export function projectTeamHistoryTeam(
  team: TeamHistoryTeamSource,
  franchise: TeamHistoryFranchiseSource | null,
  conference: TeamHistoryConferenceSource | null,
  owner: TeamHistoryOwnerSource | null,
) {
  return {
    id: team._id,
    name: franchise?.name ?? null,
    logoUrl: franchise?.logoUrl ?? null,
    confAbbr: conference?.abbr ?? null,
    ownerId: owner?._id ?? franchise?.ownerId ?? null,
    ownerFirstName: owner?.firstName ?? null,
    ownerLastName: owner?.lastName ?? null,
  };
}

/** Projects the week fields used for ordering, labels, and completion state. */
export function projectTeamHistoryWeek(
  week: TeamHistoryWeekSource,
  endDate: string | null,
) {
  return {
    id: week._id,
    weekNum: week.weekNum,
    endDate,
  };
}

/** Projects the season fields used by filters, ordering, dividers, and stats. */
export function projectTeamHistorySeason(season: TeamHistorySeasonSource) {
  return {
    id: season._id,
    year: season.year,
    name: season.name,
    categories: season.categories,
  };
}
