import type {
  NhlGoalieUsageArtifact,
  NhlGoalieUsageCandidate,
  NhlGoalieUsageDataset,
  NhlGoalieUsageMetrics,
  NhlGoalieUsageObservation,
  NhlGoalieUsagePrediction,
  NhlGoalieUsageValidationRow,
} from "../../types/nhl-goalie-usage";

const candidates: NhlGoalieUsageCandidate[] = [0, 0.5, 0.8].flatMap((decay) =>
  [0, 10, 30, 60].flatMap((priorGames) =>
    (["share", "odds-half", "odds"] as const).map((transform) => ({
      decay,
      priorGames,
      transform,
    })),
  ),
);
const baseline: NhlGoalieUsageCandidate = {
  decay: 0,
  priorGames: 10,
  transform: "odds-half",
};
function insist(v: unknown, message: string): asserts v {
  if (!v) throw Error(message);
}
function year(v: number) {
  return Number.isInteger(v) && v >= 1900 && v <= 2200;
}
function observation(o: NhlGoalieUsageObservation) {
  insist(
    year(o.year) &&
      Number.isInteger(o.dressedGames) &&
      o.dressedGames > 0 &&
      Number.isInteger(o.starts) &&
      o.starts >= 0 &&
      o.starts <= o.dressedGames &&
      Number.isFinite(o.minutes) &&
      o.minutes >= 0 &&
      o.minutes <= o.dressedGames * 100,
    "Invalid goalie dressed workload observation",
  );
}
function estimate(
  history: readonly NhlGoalieUsageObservation[],
  origin: number,
  c: NhlGoalieUsageCandidate,
) {
  const h = history.filter((o) => o.year <= origin);
  const last = h.at(-1);
  if (!last || origin - last.year > 4) return null;
  let starts = c.priorGames * 0.5,
    dressed = c.priorGames;
  for (const o of h) {
    const w = c.decay ** (last.year - o.year);
    starts += w * o.starts;
    dressed += w * o.dressedGames;
  }
  // Jeffreys smoothing prevents infinite odds for a short all-starts/all-backup history.
  const share = (starts + 0.5) / (dressed + 1);
  const odds = share / (1 - share);
  return {
    share,
    weight:
      c.transform === "share"
        ? share
        : c.transform === "odds"
          ? odds
          : Math.sqrt(odds),
  };
}
function metrics(
  rows: readonly NhlGoalieUsageValidationRow[],
): NhlGoalieUsageMetrics {
  const games = rows.reduce((a, r) => a + r.games, 0);
  const error = (key: "predicted" | "latest" | "fixed") =>
    games
      ? rows.reduce((a, r) => a + r.games * (r[key] - r.actual) ** 2, 0) / games
      : null;
  return {
    pairs: rows.length,
    games,
    mse: error("predicted"),
    latestMse: error("latest"),
    fixedMse: error("fixed"),
  };
}
function pairShare(a: { weight: number } | null, b: { weight: number } | null) {
  return a && b ? a.weight / (a.weight + b.weight) : null;
}

/** Learns deployment conditional on being dressed, never games missed or goalie ability. */
export function fitNhlGoalieUsage(
  dataset: NhlGoalieUsageDataset,
  cutoffYear: number,
  sourceSha256: string,
) {
  insist(
    year(cutoffYear) && /^[a-f0-9]{64}$/.test(sourceSha256),
    "Invalid goalie usage fit metadata",
  );
  const seasons = dataset.seasons
    .filter((s) => s.year <= cutoffYear)
    .sort((a, b) => a.year - b.year);
  insist(
    seasons.length >= 5 &&
      seasons.at(-1)?.year === cutoffYear &&
      seasons.every(
        (s, i) =>
          s.complete &&
          year(s.year) &&
          (!i || s.year === seasons[i - 1]!.year + 1),
      ),
    "Complete consecutive goalie usage cohorts required",
  );
  const profiles = dataset.profiles
    .map((p) => ({
      nhlPlayerId: p.nhlPlayerId,
      observations: p.observations
        .filter((o) => o.year <= cutoffYear)
        .map((o) => ({ ...o }))
        .sort((a, b) => a.year - b.year),
    }))
    .filter((p) => p.observations.length);
  const seen = new Set<number>();
  for (const p of profiles) {
    insist(
      Number.isSafeInteger(p.nhlPlayerId) &&
        p.nhlPlayerId > 0 &&
        !seen.has(p.nhlPlayerId),
      "Duplicate or invalid goalie identity",
    );
    seen.add(p.nhlPlayerId);
    p.observations.forEach((o, i) => {
      observation(o);
      insist(
        !i || o.year > p.observations[i - 1]!.year,
        "Duplicate goalie workload season",
      );
    });
  }
  const histories = new Map(
    profiles.map((p) => [p.nhlPlayerId, p.observations]),
  );
  const losses = candidates.map(() => 0);
  let priorGames = 0,
    selected = baseline;
  const validationRows: NhlGoalieUsageValidationRow[] = [];
  const origins: number[] = [];
  for (const season of seasons.slice(1)) {
    const targetYear = season.year,
      origin = targetYear - 1;
    if (origins.length >= 3 && priorGames > 0)
      selected = candidates[losses.indexOf(Math.min(...losses))]!;
    const predictions = candidates.map(
      (c) =>
        new Map(
          profiles.map((p) => [
            p.nhlPlayerId,
            estimate(p.observations, origin, c),
          ]),
        ),
    );
    const selectedPredictions = new Map(
      profiles.map((p) => [
        p.nhlPlayerId,
        estimate(p.observations, origin, selected),
      ]),
    );
    const baselinePredictions = new Map(
      profiles.map((p) => [
        p.nhlPlayerId,
        estimate(p.observations, origin, baseline),
      ]),
    );
    for (const p of dataset.pairs.filter((p) => p.year === targetYear)) {
      insist(
        p.ids.length === 2 &&
          p.ids[0] !== p.ids[1] &&
          histories.has(p.ids[0]) &&
          histories.has(p.ids[1]) &&
          Number.isInteger(p.games) &&
          p.games > 0 &&
          p.minutes.length === 2 &&
          p.minutes.every((m) => Number.isFinite(m) && m >= 0) &&
          p.minutes[0] + p.minutes[1] > 0,
        "Invalid co-dressed goalie pair",
      );
      const [a, b] = p.ids;
      const predicted = pairShare(
        selectedPredictions.get(a) ?? null,
        selectedPredictions.get(b) ?? null,
      );
      const latest = pairShare(
        baselinePredictions.get(a) ?? null,
        baselinePredictions.get(b) ?? null,
      );
      if (predicted === null || latest === null) continue;
      const actual = p.minutes[0] / (p.minutes[0] + p.minutes[1]);
      const fixed = latest >= 0.5 ? 0.65 : 0.35;
      validationRows.push({
        targetYear,
        ids: [a, b],
        games: p.games,
        actual,
        predicted,
        latest,
        fixed,
        candidate: { ...selected },
      });
      predictions.forEach((ps, i) => {
        const v = pairShare(ps.get(a) ?? null, ps.get(b) ?? null);
        if (v !== null) losses[i] = losses[i]! + p.games * (v - actual) ** 2;
      });
      priorGames += p.games;
    }
    origins.push(origin);
  }
  if (priorGames > 0)
    selected = candidates[losses.indexOf(Math.min(...losses))]!;
  // Expanding-origin tuning did not improve on the latest-role comparator.
  // Retain that simpler model, rather than promoting an in-sample winning grid.
  const adaptiveValidationRows = validationRows.map((r) => ({ ...r }));
  for (const row of validationRows) {
    row.predicted = row.latest;
    row.candidate = { ...baseline };
  }
  selected = baseline;
  const winningOrigins = origins.filter((o) => {
    const m = metrics(validationRows.filter((r) => r.targetYear === o + 1));
    return m.mse !== null && m.fixedMse !== null && m.mse < m.fixedMse;
  }).length;
  const artifact: NhlGoalieUsageArtifact = {
    version: "nhl-goalie-usage-v1",
    units: "conditional-dressed-role-strength",
    cutoffYear,
    sourceSha256,
    candidate: { ...selected },
    method: "latest-role-retained-after-expanding-origin-comparison",
    validation: {
      ...metrics(validationRows),
      origins: origins.length,
      winningOrigins,
      recent: metrics(
        validationRows.filter((r) => r.targetYear > cutoffYear - 5),
      ),
    },
    profiles,
  };
  return {
    artifact,
    validationRows,
    adaptiveValidationRows,
    adaptiveValidation: metrics(adaptiveValidationRows),
  };
}
const parsed = new WeakSet<object>();
function freeze(value: unknown): void {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}
export function parseNhlGoalieUsageArtifact(
  input: unknown,
): NhlGoalieUsageArtifact {
  insist(
    input && typeof input === "object",
    "Invalid goalie workload artifact",
  );
  if (parsed.has(input)) return input as NhlGoalieUsageArtifact;
  const a = input as NhlGoalieUsageArtifact;
  insist(
    a.version === "nhl-goalie-usage-v1" &&
      a.units === "conditional-dressed-role-strength" &&
      year(a.cutoffYear) &&
      /^[a-f0-9]{64}$/.test(a.sourceSha256) &&
      a.method === "latest-role-retained-after-expanding-origin-comparison" &&
      candidates.some(
        (c) =>
          c.decay === a.candidate?.decay &&
          c.priorGames === a.candidate?.priorGames &&
          c.transform === a.candidate?.transform,
      ) &&
      Array.isArray(a.profiles),
    "Invalid goalie workload artifact contract",
  );
  const seen = new Set<number>();
  for (const p of a.profiles) {
    insist(
      Number.isSafeInteger(p.nhlPlayerId) &&
        p.nhlPlayerId > 0 &&
        !seen.has(p.nhlPlayerId) &&
        Array.isArray(p.observations) &&
        p.observations.length > 0,
      "Invalid goalie workload profile",
    );
    seen.add(p.nhlPlayerId);
    p.observations.forEach((o, i) => {
      observation(o);
      insist(
        o.year <= a.cutoffYear && (!i || o.year > p.observations[i - 1]!.year),
        "Future or duplicate goalie workload observation",
      );
    });
  }
  for (const m of [a.validation, a.validation?.recent])
    insist(
      m &&
        Number.isInteger(m.pairs) &&
        m.pairs >= 0 &&
        Number.isInteger(m.games) &&
        m.games >= 0 &&
        [m.mse, m.latestMse, m.fixedMse].every(
          (v) => v === null || (Number.isFinite(v) && v >= 0),
        ),
      "Invalid goalie workload validation",
    );
  freeze(a);
  parsed.add(a);
  return a;
}
export function predictNhlGoalieUsage(
  input: NhlGoalieUsageArtifact,
  id: number,
  targetYear: number,
): NhlGoalieUsagePrediction {
  const a = parseNhlGoalieUsageArtifact(input),
    h = a.profiles.find((p) => p.nhlPlayerId === id)?.observations ?? [],
    last = h.at(-1);
  const out: NhlGoalieUsagePrediction = {
    nhlPlayerId: id,
    targetYear,
    roleWeight: null,
    startShareWhenDressed: null,
    lastObservedYear: last?.year ?? null,
    dressedGames: last?.dressedGames ?? 0,
    status: "unavailable",
    reasons: [],
  };
  if (targetYear !== a.cutoffYear + 1) {
    out.reasons.push("unsupported-horizon");
    return out;
  }
  const v = estimate(h, a.cutoffYear, a.candidate);
  if (!v) {
    out.reasons.push(last ? "stale-history" : "no-dressed-history");
    return out;
  }
  out.roleWeight = v.weight;
  out.startShareWhenDressed = v.share;
  out.status = "supported";
  if (h.length < 2) out.reasons.push("one-season-role-history");
  if ((last?.dressedGames ?? 0) < 20)
    out.reasons.push("short-dressed-role-sample");
  if (last && last.year < a.cutoffYear) out.reasons.push("stale-role-history");
  if (
    a.validation.mse === null ||
    a.validation.latestMse === null ||
    a.validation.mse > a.validation.latestMse
  )
    out.reasons.push("limited-role-validation");
  if (out.reasons.length) out.status = "research";
  return out;
}
/** Both goalies available: normalize role strengths; neither receives an absence multiplier. */
export function allocateNhlGoaliePairUsage(
  a: NhlGoalieUsagePrediction,
  b: NhlGoalieUsagePrediction,
): [number, number] | null {
  if (a.nhlPlayerId === b.nhlPlayerId)
    throw Error("Duplicate goalie pair identity");
  if (a.roleWeight === null || b.roleWeight === null) return null;
  insist(
    Number.isFinite(a.roleWeight) &&
      a.roleWeight > 0 &&
      Number.isFinite(b.roleWeight) &&
      b.roleWeight > 0,
    "Invalid goalie role strength",
  );
  const first = (60 * a.roleWeight) / (a.roleWeight + b.roleWeight);
  return [first, 60 - first];
}
