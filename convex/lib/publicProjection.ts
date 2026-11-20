export const PLAYER_NHL_DISPLAY_FIELDS = [
  "playerId",
  "seasonId",
  "GP",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "QS",
  "RBS",
] as const;

/** Returns only the named, defined fields for a browser-facing DTO. */
export function pickDefinedFields(
  row: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields.flatMap((field) =>
      row[field] === undefined ? [] : [[field, row[field]]],
    ),
  );
}

type ScheduleMatchupSource = {
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

const PLAYOFF_GAME_TYPES = new Set(["QF", "SF", "F"]);

export function projectMatchupOutcome(
  matchup: Pick<
    ScheduleMatchupSource,
    | "gameType"
    | "isComplete"
    | "homeScore"
    | "awayScore"
    | "homeWin"
    | "awayWin"
    | "tie"
  >,
) {
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

export function projectScheduleMatchup(matchup: ScheduleMatchupSource) {
  const outcome = projectMatchupOutcome(matchup);
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
