import type {
  NhlRatingInput,
  NhlRatingPlayer,
  NhlRatingProfile,
} from "../../runtime/nhl-season-rating";

export const NHL_RATING_REPORTS = [
  "summary",
  "timeonice",
  "scoringRates",
  "goalsForAgainst",
  "powerplay",
  "penaltykill",
] as const;
export type NhlStatRow = Record<string, unknown>;
export type NhlRatingSource = {
  season: number;
  gameType: 2 | 3;
  profile: NhlRatingProfile;
  fetchedAt: string;
  skaters: Record<(typeof NHL_RATING_REPORTS)[number], NhlStatRow[]>;
  goalies: NhlStatRow[];
  edge: Record<string, NhlStatRow>;
  warnings: string[];
};

export function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
const minutes = (value: unknown) =>
  numeric(value) === undefined ? undefined : numeric(value)! / 60;
const object = (value: unknown): NhlStatRow | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as NhlStatRow)
    : undefined;

export function indexNhlRows(
  rows: NhlStatRow[],
  season: number,
): Map<number, NhlStatRow> {
  const index = new Map<number, NhlStatRow>();
  for (const row of rows) {
    const id = numeric(row.playerId);
    if (
      id === undefined ||
      !Number.isInteger(id) ||
      id <= 0 ||
      row.seasonId !== season ||
      index.has(id)
    ) {
      throw new Error(
        "NHL report has invalid identities, duplicate players or a different season",
      );
    }
    index.set(id, row);
  }
  return index;
}

function goalieBuckets(
  edge: NhlStatRow | undefined,
): NhlRatingPlayer["saveBuckets"] {
  if (!Array.isArray(edge?.shotLocationSummary)) return undefined;
  const rows = edge.shotLocationSummary.map(object);
  const bucket = (location: string) => {
    const row = rows.find((x) => x?.locationCode === location);
    const saves = numeric(row?.saves);
    const goals = numeric(row?.goalsAgainst);
    return saves !== undefined && goals !== undefined
      ? { shots: saves + goals, saves }
      : undefined;
  };
  const all = bucket("all");
  const groups = [bucket("high"), bucket("mid"), bucket("long")];
  if (!all || groups.some((x) => !x)) return undefined;
  const known = groups as { shots: number; saves: number }[];
  const rest = {
    shots: all.shots - known.reduce((sum, x) => sum + x.shots, 0),
    saves: all.saves - known.reduce((sum, x) => sum + x.saves, 0),
  };
  if (rest.shots < 0 || rest.saves < 0 || rest.saves > rest.shots)
    return undefined;
  return [...known, rest];
}

/** Join on official NHL id; traded players arrive as one season-total row. */
export function buildNhlRatingInput(source: NhlRatingSource): NhlRatingInput {
  const summary = indexNhlRows(source.skaters.summary, source.season);
  const toi = indexNhlRows(source.skaters.timeonice, source.season);
  const scoring = indexNhlRows(source.skaters.scoringRates, source.season);
  const goals = indexNhlRows(source.skaters.goalsForAgainst, source.season);
  const pp = indexNhlRows(source.skaters.powerplay, source.season);
  const pk = indexNhlRows(source.skaters.penaltykill, source.season);
  const players: NhlRatingPlayer[] = [];
  for (const [playerId, row] of summary) {
    if (!["C", "L", "R", "D"].includes(String(row.positionCode)))
      throw new Error(`Unknown NHL position for ${playerId}`);
    const time = toi.get(playerId);
    const five = scoring.get(playerId);
    const games = numeric(row.gamesPlayed);
    const totalMinutes = minutes(time?.timeOnIce);
    if (games === undefined || totalMinutes === undefined)
      throw new Error(`Missing games/TOI for ${playerId}`);
    const edge = source.edge[String(playerId)];
    const high = Array.isArray(edge?.sogSummary)
      ? edge.sogSummary.map(object).find((x) => x?.locationCode === "high")
      : undefined;
    players.push({
      playerId,
      name: String(row.skaterFullName),
      team: String(row.teamAbbrevs),
      position: row.positionCode === "D" ? "D" : "F",
      games,
      minutes: totalMinutes,
      fiveMinutes:
        minutes(five?.timeOnIcePerGame5v5) === undefined
          ? undefined
          : minutes(five?.timeOnIcePerGame5v5)! * games,
      fiveGoals: numeric(five?.goals5v5),
      fivePrimaryAssists: numeric(five?.primaryAssists5v5),
      fiveSecondaryAssists: numeric(five?.secondaryAssists5v5),
      relativeShotShare: numeric(five?.satRelative5v5),
      netMinorPenaltiesPer60: numeric(five?.netMinorPenaltiesPer60),
      evMinutes: minutes(time?.evTimeOnIce),
      evGoalsAgainst: numeric(goals.get(playerId)?.evenStrengthGoalsAgainst),
      ppMinutes: minutes(pp.get(playerId)?.ppTimeOnIce),
      ppGoals: numeric(pp.get(playerId)?.ppGoals),
      ppPrimaryAssists: numeric(pp.get(playerId)?.ppPrimaryAssists),
      ppSecondaryAssists: numeric(pp.get(playerId)?.ppSecondaryAssists),
      pkMinutes: minutes(pk.get(playerId)?.shTimeOnIce),
      pkGoalsAgainstPer60: numeric(pk.get(playerId)?.ppGoalsAgainstPer60),
      highDangerShots: numeric(high?.shots),
    });
  }
  for (const [playerId, row] of indexNhlRows(source.goalies, source.season)) {
    const games = numeric(row.gamesPlayed);
    const totalMinutes = minutes(row.timeOnIce);
    if (games === undefined || totalMinutes === undefined)
      throw new Error(`Missing goalie games/TOI for ${playerId}`);
    players.push({
      playerId,
      name: String(row.goalieFullName),
      team: String(row.teamAbbrevs),
      position: "G",
      games,
      minutes: totalMinutes,
      shotsAgainst: numeric(row.shotsAgainst),
      saves: numeric(row.saves),
      saveBuckets: goalieBuckets(source.edge[String(playerId)]),
    });
  }
  return {
    season: source.season,
    gameType: source.gameType,
    profile: source.profile,
    players,
  };
}
