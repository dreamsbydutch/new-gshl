import { parseCsv } from "../ranking/nhl-rating-diagnostics";
import {
  buildNhlRatingInput,
  indexNhlRows,
  numeric,
  type NhlStatRow,
  type NhlRatingSource,
} from "./season-rating-input";
import type { NhlRatingPlayer } from "../../runtime/nhl-season-rating";

export const VALUE_SITUATIONS = ["5on5", "5on4", "4on5"] as const;
export type ValueSituation = (typeof VALUE_SITUATIONS)[number];
export type ChanceLine = {
  minutes: number;
  benchMinutes: number;
  xFor: number;
  xAgainst: number;
  rawXFor: number;
  rawXAgainst: number;
  offXFor: number;
  offXAgainst: number;
  goals: number;
  individualXGoals: number;
};
export type ExpectedGoalPlayer = {
  player: NhlRatingPlayer;
  missing: string[];
  warnings: string[];
  sourceMinutes: number;
  sourceGames: number;
  situations: Partial<Record<ValueSituation, ChanceLine>>;
  netPenalties?: number;
  goalie?: { expected: number; goals: number; shots: number };
  modeledMinutes: number;
};
export type ExpectedGoalInput = {
  season: number;
  gameType: 2 | 3;
  players: ExpectedGoalPlayer[];
  unmatchedProviderIds: number[];
};

type Row = Record<string, string>;
const n = (row: Row, key: string) => {
  const text = row[key];
  const value = text?.trim() ? Number(text) : NaN;
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`Invalid MoneyPuck ${key} for ${row.playerId}`);
  return value;
};

/** One season-total row per player/situation; fail on duplicates instead of double counting trades. */
export function parseExpectedGoalRows(
  text: string,
  season: number,
  goalie: boolean,
) {
  const index = new Map<number, Map<string, Row>>();
  for (const row of parseCsv(text.replace(/^\uFEFF/, ""))) {
    const id = n(row, "playerId");
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      n(row, "season") !== Math.floor(season / 10000)
    )
      throw new Error("MoneyPuck identity/season mismatch");
    if (
      !(goalie
        ? row.position === "G"
        : ["C", "L", "R", "D"].includes(row.position!))
    )
      throw new Error("MoneyPuck position mismatch");
    if (!["all", "other", ...VALUE_SITUATIONS].includes(row.situation!))
      throw new Error("Unknown MoneyPuck situation");
    const situations = index.get(id) ?? new Map<string, Row>();
    if (situations.has(row.situation!))
      throw new Error(`Duplicate MoneyPuck identity/situation ${id}`);
    situations.set(row.situation!, row);
    index.set(id, situations);
  }
  if (!index.size) throw new Error("Empty MoneyPuck file");
  return index;
}

export function buildExpectedGoalInput(
  source: NhlRatingSource,
  skaterCsv: string,
  goalieCsv: string,
  penaltyRows: NhlStatRow[],
): ExpectedGoalInput {
  const nhl = buildNhlRatingInput(source);
  const skaters = parseExpectedGoalRows(skaterCsv, source.season, false);
  const goalies = parseExpectedGoalRows(goalieCsv, source.season, true);
  const penalties = indexNhlRows(penaltyRows, source.season);
  const ids = new Set(nhl.players.map((p) => p.playerId));
  const players = nhl.players.map((player): ExpectedGoalPlayer => {
    const rows = (player.position === "G" ? goalies : skaters).get(
      player.playerId,
    );
    const result: ExpectedGoalPlayer = {
      player,
      missing: [],
      warnings: [],
      sourceMinutes: 0,
      sourceGames: 0,
      situations: {},
      modeledMinutes: 0,
    };
    const all = rows?.get("all");
    if (!all) {
      result.missing.push("expected-goal season coverage");
      return result;
    }
    // Fail closed when a provider is stale, partial, or joined to the wrong season.
    result.sourceMinutes = n(all, "icetime") / 60;
    result.sourceGames = n(all, "games_played");
    if (
      Math.abs(result.sourceMinutes - player.minutes) >
        Math.max(1, player.minutes * 0.02) ||
      result.sourceGames > player.games ||
      result.sourceGames < player.games * 0.975
    )
      result.missing.push("NHL/MoneyPuck games or TOI disagreement");
    if (
      result.sourceGames !== player.games ||
      Math.abs(result.sourceMinutes - player.minutes) > 1
    )
      result.warnings.push(
        "Provider coverage differs from NHL totals; no missing-game extrapolation",
      );
    if (player.position === "G") {
      result.goalie = {
        expected: n(all, "xGoals"),
        goals: n(all, "goals"),
        shots: n(all, "ongoal"),
      };
      if (
        result.goalie.goals > result.goalie.shots ||
        Math.abs(result.goalie.shots - (player.shotsAgainst ?? 0)) >
          Math.max(3, result.goalie.shots * 0.02)
      )
        result.missing.push("NHL/MoneyPuck goalie shots disagreement");
      result.modeledMinutes = n(all, "icetime") / 60;
      return result;
    }
    const penalty = penalties.get(player.playerId);
    const drawn = numeric(penalty?.penaltiesDrawn),
      taken = numeric(penalty?.penalties);
    if (
      drawn === undefined ||
      taken === undefined ||
      drawn < 0 ||
      taken < 0 ||
      penalty?.gamesPlayed !== player.games
    )
      result.missing.push("NHL explicit penalty counts");
    else {
      result.netPenalties = drawn - taken;
      if (numeric(penalty?.netPenalties) !== result.netPenalties)
        result.warnings.push(
          "NHL net-penalty report uses a different counting convention; explicit drawn minus taken counts used",
        );
    }
    for (const situation of VALUE_SITUATIONS) {
      const row = rows?.get(situation);
      // An absent row is unknown, never assumed to be zero deployment.
      if (!row) {
        result.missing.push(`${situation} coverage`);
        continue;
      }
      const line: ChanceLine = {
        minutes: n(row, "icetime") / 60,
        benchMinutes: n(row, "timeOnBench") / 60,
        xFor: n(row, "OnIce_F_flurryScoreVenueAdjustedxGoals"),
        xAgainst: n(row, "OnIce_A_flurryScoreVenueAdjustedxGoals"),
        rawXFor: n(row, "OnIce_F_xGoals"),
        rawXAgainst: n(row, "OnIce_A_xGoals"),
        offXFor: n(row, "OffIce_F_xGoals"),
        offXAgainst: n(row, "OffIce_A_xGoals"),
        goals: n(row, "I_F_goals"),
        individualXGoals: n(row, "I_F_xGoals"),
      };
      if (
        !line.minutes &&
        [
          line.xFor,
          line.xAgainst,
          line.rawXFor,
          line.rawXAgainst,
          line.goals,
          line.individualXGoals,
        ].some((x) => x > 0)
      )
        result.missing.push(`${situation} events without exposure`);
      result.situations[situation] = line;
      result.modeledMinutes += line.minutes;
    }
    if (
      result.modeledMinutes >
      player.minutes + Math.max(5, player.minutes * 0.02)
    )
      result.missing.push("situational TOI exceeds NHL total");
    if (result.modeledMinutes > result.sourceMinutes + 1)
      result.missing.push("situational TOI exceeds provider total");
    return result;
  });
  return {
    season: source.season,
    gameType: source.gameType,
    players,
    unmatchedProviderIds: [...skaters.keys(), ...goalies.keys()].filter(
      (id) => !ids.has(id),
    ),
  };
}
