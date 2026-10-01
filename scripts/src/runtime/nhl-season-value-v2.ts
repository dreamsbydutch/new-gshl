import {
  VALUE_SITUATIONS,
  type ExpectedGoalInput,
  type ExpectedGoalPlayer,
} from "../domains/nhl/expected-goal-input";
import type { NhlPosition } from "./nhl-season-rating";

/** Policy assumptions remain explicit. Values are estimates, not fitted GAR or causal RAPM. */
export const NHL_VALUE_V2_CONFIG = {
  version: "nhl-season-value-v2",
  contextWeight: 0.5,
  offIcePriorMinutes: 300,
  qualifiedSkaterMinutes: 200,
  qualifiedGoalieMinutes: 300,
  minimumPeers: 5,
  minimumCalibrationPairs: 50,
  priorCandidates: [0, 60, 150, 300, 600, 1200, 2400, 4800],
  defaultPriorMinutes: 300,
  defaultFinishingMinutes: 600,
  defaultGoalieShots: 600,
} as const;

export type ValueObservation = {
  name: string;
  playerId: number;
  position: NhlPosition;
  exposure: number;
  /** Per exposure unit (minute for skaters; shot for goalies). */
  rate: number;
  observedValue: number;
};
export type ValueCalibration = Record<
  string,
  { prior: number; pairs: number; mse: number | null }
>;
export type PreparedValueSeason = {
  input: ExpectedGoalInput;
  observations: ValueObservation[];
  baselines: Record<
    string,
    {
      minutes: number;
      players: number;
      forRate: number;
      againstRate: number;
      rawForRate: number;
      rawAgainstRate: number;
      finishingRate: number;
    }
  >;
  penaltyGoalCost: number;
  missing: Record<number, string[]>;
};
export type NhlValueV2Rating = {
  playerId: number;
  name: string;
  team: string;
  position: NhlPosition;
  games: number;
  minutes: number;
  modeledMinutes: number;
  coverage: number;
  sourceCoverage: number;
  sourceGames: number;
  warnings: string[];
  status: "rated" | "provisional" | "incomplete";
  missing: string[];
  rank: number | null;
  seasonRating: number | null;
  seasonValue: number | null;
  observedValue: number | null;
  /** Estimated goal-equivalent contribution above average per 60 total NHL minutes. */
  impactPer60: number | null;
  components: Array<
    ValueObservation & {
      prior: number;
      calibrationPairs: number;
      reliability: number;
      value: number;
    }
  >;
  goalieGsax: number | null;
  /** Policy sensitivity only, not a statistical confidence interval. */
  contextSensitivity?: {
    minimumValue: number;
    maximumValue: number;
    bestRank: number | null;
    worstRank: number | null;
  };
};
const round = (n: number) => Math.round(n * 10000) / 10000;
const sum = <T>(rows: T[], f: (row: T) => number) =>
  rows.reduce((s, row) => s + f(row), 0);
const key = (o: ValueObservation) => `${o.position}:${o.name}`;

/** Pure contextual season accounting. Does not read historical or future player results. */
export function prepareValueSeason(
  input: ExpectedGoalInput,
  contextWeight: number = NHL_VALUE_V2_CONFIG.contextWeight,
): PreparedValueSeason {
  if (!Number.isFinite(contextWeight) || contextWeight < 0 || contextWeight > 1)
    throw new Error("Invalid context weight");
  const c = NHL_VALUE_V2_CONFIG;
  const ids = new Set<number>();
  for (const { player: p } of input.players) {
    if (
      !Number.isInteger(p.playerId) ||
      ids.has(p.playerId) ||
      !Number.isFinite(p.minutes) ||
      p.minutes < 0
    )
      throw new Error("Invalid value player identity/exposure");
    ids.add(p.playerId);
  }
  const usable = input.players.filter(
    (p) => !p.missing.length && p.player.minutes > 0,
  );
  const skaters = usable.filter((p) => p.player.position !== "G");
  const baselines: PreparedValueSeason["baselines"] = {};
  for (const situation of VALUE_SITUATIONS) {
    const lines = skaters
      .flatMap((p) =>
        p.situations[situation] ? [p.situations[situation]!] : [],
      )
      .filter((l) => l.minutes > 0);
    const minutes = sum(lines, (l) => l.minutes);
    baselines[situation] = {
      minutes,
      players: lines.length,
      forRate: minutes ? sum(lines, (l) => l.xFor) / minutes : 0,
      againstRate: minutes ? sum(lines, (l) => l.xAgainst) / minutes : 0,
      rawForRate: minutes ? sum(lines, (l) => l.rawXFor) / minutes : 0,
      rawAgainstRate: minutes ? sum(lines, (l) => l.rawXAgainst) / minutes : 0,
      finishingRate: minutes
        ? sum(lines, (l) => l.goals - l.individualXGoals) / minutes
        : 0,
    };
  }
  const pp = baselines["5on4"]!;
  // Two-minute minor, truncated when the PP scores. SH scoring reduces the net benefit.
  const penaltyGoalCost =
    pp.rawForRate > 0
      ? Math.max(
          0,
          (1 - Math.exp(-2 * pp.rawForRate)) *
            (1 - pp.rawAgainstRate / pp.rawForRate),
        )
      : 0;
  const totalMinutes = sum(skaters, (p) => p.player.minutes);
  const penaltyMean = totalMinutes
    ? sum(skaters, (p) => p.netPenalties!) / totalMinutes
    : 0;
  const goalies = usable.filter(
    (p) => p.player.position === "G" && p.goalie && p.goalie.shots > 0,
  );
  const goalieShots = sum(goalies, (p) => p.goalie!.shots);
  // Correct the provider's league-wide xG calibration offset, retaining raw GSAx separately.
  const goalieBias = goalieShots
    ? sum(goalies, (p) => p.goalie!.expected - p.goalie!.goals) / goalieShots
    : 0;
  const observations: ValueObservation[] = [];
  const missing: Record<number, string[]> = {};
  const add = (
    p: ExpectedGoalPlayer,
    name: string,
    observedValue: number,
    exposure: number,
  ) => {
    if (![observedValue, exposure].every(Number.isFinite) || exposure < 0)
      throw new Error("Invalid component value/exposure");
    observations.push({
      name,
      playerId: p.player.playerId,
      position: p.player.position,
      exposure,
      observedValue,
      rate: exposure ? observedValue / exposure : 0,
    });
  };
  for (const p of input.players) {
    missing[p.player.playerId] = [...p.missing];
    if (p.missing.length || !p.player.minutes) continue;
    if (p.player.position === "G") {
      if (!p.goalie?.shots || goalies.length < c.minimumPeers) {
        missing[p.player.playerId]!.push("goalie expected-goal peers/exposure");
        continue;
      }
      add(
        p,
        "saving",
        p.goalie.expected - p.goalie.goals - goalieBias * p.goalie.shots,
        p.goalie.shots,
      );
      continue;
    }
    let finishing = 0,
      finishingMinutes = 0;
    for (const situation of VALUE_SITUATIONS) {
      const line = p.situations[situation];
      if (!line) {
        missing[p.player.playerId]!.push(`${situation} coverage`);
        continue;
      }
      if (!line.minutes) continue;
      const baseline = baselines[situation]!;
      if (baseline.players < c.minimumPeers) {
        missing[p.player.playerId]!.push(`${situation} peer population`);
        continue;
      }
      const share = situation === "4on5" ? 4 : 5;
      const offReliability =
        line.benchMinutes / (line.benchMinutes + c.offIcePriorMinutes);
      for (const [suffix, on, league, off, rawLeague, sign] of [
        [
          "offense",
          line.xFor,
          baseline.forRate,
          line.offXFor,
          baseline.rawForRate,
          1,
        ],
        [
          "defense",
          line.xAgainst,
          baseline.againstRate,
          line.offXAgainst,
          baseline.rawAgainstRate,
          -1,
        ],
      ] as const) {
        // Off-ice raw xG is centered on raw league xG; never subtract raw from adjusted xG directly.
        const context = line.benchMinutes
          ? off / line.benchMinutes - rawLeague
          : 0;
        const excess =
          on -
          (league + contextWeight * offReliability * context) * line.minutes;
        add(p, `${situation}:${suffix}`, (sign * excess) / share, line.minutes);
      }
      finishing +=
        line.goals -
        line.individualXGoals -
        baseline.finishingRate * line.minutes;
      finishingMinutes += line.minutes;
    }
    add(p, "finishing", finishing, finishingMinutes);
    if (pp.players < c.minimumPeers || !Number.isFinite(p.netPenalties))
      missing[p.player.playerId]!.push("penalty baseline/input");
    else
      add(
        p,
        "penalties",
        (p.netPenalties! - penaltyMean * p.player.minutes) * penaltyGoalCost,
        p.player.minutes,
      );
  }
  return { input, observations, baselines, penaltyGoalCost, missing };
}

/** Expanding-window fit. Only completed adjacent-season pairs strictly before target are used. */
export function calibrateValueShrinkage(
  history: PreparedValueSeason[],
  targetSeason: number,
  gameType: 2 | 3,
): ValueCalibration {
  const past = history
    .filter(
      (s) => s.input.season < targetSeason && s.input.gameType === gameType,
    )
    .sort((a, b) => a.input.season - b.input.season);
  const pairs = new Map<
    string,
    Array<{ rate: number; next: number; exposure: number; weight: number }>
  >();
  for (let i = 0; i < past.length - 1; i++) {
    const a = past[i]!,
      b = past[i + 1]!;
    if (b.input.season - a.input.season !== 10001) continue;
    const next = new Map(
      b.observations
        .filter((o) => !b.missing[o.playerId]?.length)
        .map((o) => [`${o.playerId}:${key(o)}`, o]),
    );
    for (const o of a.observations) {
      const n = next.get(`${o.playerId}:${key(o)}`);
      const minimum =
        o.position === "G"
          ? 300
          : o.name.includes("5on4") || o.name.includes("4on5")
            ? 30
            : 200;
      if (
        a.missing[o.playerId]?.length ||
        !n ||
        o.exposure < minimum ||
        n.exposure < minimum
      )
        continue;
      const list = pairs.get(key(o)) ?? [];
      list.push({
        rate: o.rate,
        next: n.rate,
        exposure: o.exposure,
        weight: Math.min(n.exposure, o.position === "G" ? 2000 : 1000),
      });
      pairs.set(key(o), list);
    }
  }
  const result: ValueCalibration = {};
  for (const [name, rows] of pairs) {
    if (rows.length < NHL_VALUE_V2_CONFIG.minimumCalibrationPairs) continue;
    const trials = NHL_VALUE_V2_CONFIG.priorCandidates.map((prior) => ({
      prior,
      pairs: rows.length,
      mse:
        sum(
          rows,
          (r) =>
            r.weight *
            ((r.rate * r.exposure) / (r.exposure + prior) - r.next) ** 2,
        ) / sum(rows, (r) => r.weight),
    }));
    result[name] = trials.sort(
      (a, b) => a.mse - b.mse || b.prior - a.prior,
    )[0]!;
  }
  return result;
}

export function rankValueSeason(
  prepared: PreparedValueSeason,
  calibration: ValueCalibration = {},
): NhlValueV2Rating[] {
  const c = NHL_VALUE_V2_CONFIG;
  const ratings = prepared.input.players
    .filter((p) => p.player.games > 0 && p.player.minutes > 0)
    .map((p): NhlValueV2Rating => {
      const components = prepared.observations
        .filter((o) => o.playerId === p.player.playerId)
        .map((o) => {
          const fitted = calibration[key(o)];
          const prior =
            fitted?.prior ??
            (o.position === "G"
              ? c.defaultGoalieShots
              : o.name === "finishing"
                ? c.defaultFinishingMinutes
                : c.defaultPriorMinutes);
          if (!Number.isFinite(prior) || prior < 0)
            throw new Error("Invalid shrinkage prior");
          const reliability = o.exposure
            ? o.exposure / (o.exposure + prior)
            : 0;
          return {
            ...o,
            prior,
            calibrationPairs: fitted?.pairs ?? 0,
            reliability,
            value: o.observedValue * reliability,
          };
        });
      const missing = prepared.missing[p.player.playerId] ?? [
        "unprepared player",
      ];
      const seasonValue = sum(components, (o) => o.value);
      const threshold =
        p.player.position === "G"
          ? c.qualifiedGoalieMinutes
          : c.qualifiedSkaterMinutes;
      return {
        playerId: p.player.playerId,
        name: p.player.name,
        team: p.player.team,
        position: p.player.position,
        games: p.player.games,
        minutes: p.player.minutes,
        modeledMinutes: p.modeledMinutes,
        coverage: round(Math.min(1, p.modeledMinutes / p.player.minutes)),
        sourceCoverage: round(Math.min(1, p.sourceMinutes / p.player.minutes)),
        sourceGames: p.sourceGames,
        warnings: [...p.warnings],
        status: missing.length
          ? "incomplete"
          : p.modeledMinutes >= threshold
            ? "rated"
            : "provisional",
        missing: [...missing],
        rank: null,
        seasonRating: null,
        seasonValue: missing.length ? null : round(seasonValue),
        observedValue: missing.length
          ? null
          : round(sum(components, (o) => o.observedValue)),
        impactPer60: missing.length
          ? null
          : round((seasonValue * 60) / p.player.minutes),
        components,
        goalieGsax: p.goalie ? round(p.goalie.expected - p.goalie.goals) : null,
      };
    });
  for (const position of ["F", "D", "G"] as const) {
    const pool = ratings.filter(
      (p) => p.position === position && p.status === "rated",
    );
    for (const p of pool) {
      const better = pool.filter((q) => q.seasonValue! > p.seasonValue!).length;
      const equal = pool.filter((q) => q.seasonValue === p.seasonValue).length;
      p.rank = better + 1;
      p.seasonRating =
        pool.length > 1
          ? round(
              (100 * (pool.length - better - (equal + 1) / 2)) /
                (pool.length - 1),
            )
          : 50;
    }
  }
  return ratings.sort(
    (a, b) =>
      a.position.localeCompare(b.position) ||
      (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
      a.playerId - b.playerId,
  );
}
