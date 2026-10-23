import type { NhlTalentForecastDataset } from "../../types/nhl-contract-talent-forecast";
import type {
  NhlLineupUsageArtifact,
  NhlLineupUsageCandidate,
  NhlLineupUsageFeatures,
  NhlLineupUsageLinear,
  NhlLineupUsageMetrics,
  NhlLineupUsageObservation,
  NhlLineupUsagePosition,
  NhlLineupUsagePrediction,
  NhlLineupUsageValidationRow,
} from "../../types/nhl-lineup-usage";

const candidates: readonly NhlLineupUsageCandidate[] = [
  "latest",
  "weighted3",
  1,
  10,
  100,
  1000,
];
const featureNames = [
  "latestMinutesPerAppearance",
  "weightedThreeSeasonMinutesPerAppearance",
  "knownAgeAtOrigin",
  "latestConsecutiveUsageChange",
];
const method: NhlLineupUsageArtifact["method"] = {
  target: "next-calendar-season-positive-exposure",
  selection: "expanding-origin-error",
  ageMissing: "origin-training-mean",
  featureNames,
  candidates,
  warmupOrigins: 3,
  minimumTrainingRows: 100,
};
const roles: NhlLineupUsagePosition[] = ["F", "D"];
const validatedArtifacts = new WeakSet<object>();
function freezeTree(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) freezeTree(child, seen);
  Object.freeze(value);
}
const finite = (n: number) => Number.isFinite(n);
const arrayValid = (value: unknown): boolean => Array.isArray(value);
function insist(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
const yearValid = (n: number) =>
  Number.isSafeInteger(n) && n >= 1900 && n <= 2200;
function teams(input: readonly string[] | undefined) {
  insist(
    input === undefined ||
      (arrayValid(input) &&
        input.length <= 40 &&
        input.every((t) => typeof t === "string" && /^[A-Z]{2,3}$/.test(t))),
    "Invalid NHL usage team context",
  );
  const aliases: Record<string, string> = {
    PHX: "UTA",
    ARI: "UTA",
    ATL: "WPG",
  };
  return [...new Set((input ?? []).map((t) => aliases[t] ?? t))].sort();
}
function validateObservation(o: NhlLineupUsageObservation) {
  insist(
    o &&
      yearValid(o.year) &&
      finite(o.minutes) &&
      o.minutes > 0 &&
      Number.isSafeInteger(o.games) &&
      o.games > 0 &&
      o.minutes / o.games <= 65 &&
      (o.age === null || (finite(o.age) && o.age >= 15 && o.age <= 60)),
    "Invalid NHL usage observation",
  );
  teams(o.teams);
}
/** No absence zeros or GAR qualification filter: this predicts workload when playing. */
export function nhlLineupUsageFeatures(
  observations: readonly NhlLineupUsageObservation[],
  origin: number,
): NhlLineupUsageFeatures | null {
  insist(yearValid(origin), "Invalid NHL usage origin");
  const h = observations.filter((o) => o.year <= origin);
  h.forEach((o, i) => {
    validateObservation(o);
    insist(i === 0 || o.year > h[i - 1]!.year, "Unordered NHL usage history");
  });
  const last = h.at(-1);
  if (!last) return null;
  const tail = h.slice(-3);
  let minutes = 0,
    games = 0;
  tail.forEach((o, i) => {
    const w = 0.5 ** (tail.length - i - 1);
    minutes += o.minutes * w;
    games += o.games * w;
  });
  const latest = last.minutes / last.games,
    previous = h.at(-2);
  return [
    latest,
    minutes / games,
    last.age === null ? null : last.age + origin - last.year,
    previous && last.year === previous.year + 1
      ? latest - previous.minutes / previous.games
      : 0,
  ];
}
function solve(matrix: number[][], rhs: number[]) {
  const a = matrix.map((r, i) => [...r, rhs[i]!]);
  for (let j = 0; j < rhs.length; j++) {
    let pivot = j;
    for (let i = j + 1; i < rhs.length; i++)
      if (Math.abs(a[i]![j]!) > Math.abs(a[pivot]![j]!)) pivot = i;
    [a[j], a[pivot]] = [a[pivot]!, a[j]!];
    const divisor = a[j]![j]!;
    insist(
      finite(divisor) && Math.abs(divisor) > 1e-12,
      "Unstable NHL usage fit",
    );
    for (let k = j; k <= rhs.length; k++) a[j]![k] = a[j]![k]! / divisor;
    for (let i = 0; i < rhs.length; i++)
      if (i !== j) {
        const m = a[i]![j]!;
        for (let k = j; k <= rhs.length; k++)
          a[i]![k] = a[i]![k]! - m * a[j]![k]!;
      }
  }
  return a.map((r) => r[rhs.length]!);
}
function fit(
  rows: NhlLineupUsageValidationRow[],
  ridge: number,
): NhlLineupUsageLinear {
  const means = [0, 1, 2, 3].map((j) => {
    const values = rows.flatMap((r) =>
      r.features[j] === null ? [] : [r.features[j]!],
    );
    return values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0;
  });
  const scales = means.map((m, j) => {
    const values = rows.flatMap((r) =>
      r.features[j] === null ? [] : [r.features[j]!],
    );
    const s = values.length
      ? Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length)
      : 1;
    return s > 1e-9 ? s : 1;
  });
  const intercept =
    rows.reduce((s, r) => s + r.actual - r.features[0], 0) / rows.length;
  const matrix = means.map((_, j) =>
      means.map((__, k) => (j === k ? ridge : 0)),
    ),
    rhs = means.map(() => 0);
  for (const r of rows) {
    const z = r.features.map((v, j) =>
      v === null ? 0 : (v - means[j]!) / scales[j]!,
    );
    for (let j = 0; j < 4; j++) {
      rhs[j] = rhs[j]! + z[j]! * (r.actual - r.features[0] - intercept);
      for (let k = 0; k < 4; k++)
        matrix[j]![k] = matrix[j]![k]! + z[j]! * z[k]!;
    }
  }
  return { means, scales, intercept, coefficients: solve(matrix, rhs) };
}
function predict(
  candidate: NhlLineupUsageCandidate,
  model: NhlLineupUsageLinear | null,
  x: NhlLineupUsageFeatures,
) {
  if (candidate === "latest") return x[0];
  if (candidate === "weighted3") return x[1];
  if (!model) return x[0];
  const result =
    x[0] +
    model.intercept +
    model.coefficients.reduce(
      (s, c, j) =>
        s +
        (x[j] === null
          ? 0
          : (c * (x[j]! - model.means[j]!)) / model.scales[j]!),
      0,
    );
  insist(finite(result), "Nonfinite NHL usage forecast");
  return result;
}
function metrics(
  rows: readonly NhlLineupUsageValidationRow[],
): NhlLineupUsageMetrics {
  const n = rows.length;
  return {
    rows: n,
    mse: n
      ? rows.reduce((s, r) => s + (r.predicted - r.actual) ** 2, 0) / n
      : null,
    latestMse: n
      ? rows.reduce((s, r) => s + (r.features[0] - r.actual) ** 2, 0) / n
      : null,
    weighted3Mse: n
      ? rows.reduce((s, r) => s + (r.features[1] - r.actual) ** 2, 0) / n
      : null,
    mae: n
      ? rows.reduce((s, r) => s + Math.abs(r.predicted - r.actual), 0) / n
      : null,
    latestMae: n
      ? rows.reduce((s, r) => s + Math.abs(r.features[0] - r.actual), 0) / n
      : null,
    bias: n ? rows.reduce((s, r) => s + r.predicted - r.actual, 0) / n : null,
  };
}
export function fitNhlLineupUsage(
  input: NhlTalentForecastDataset,
  cutoffYear: number,
  sourceSha256: string,
) {
  insist(
    yearValid(cutoffYear) &&
      /^[a-f0-9]{64}$/.test(sourceSha256) &&
      arrayValid(input.seasons) &&
      input.seasons.some(
        (s) =>
          s.year === cutoffYear && s.seasonComplete && s.officialCohortComplete,
      ),
    "Verified complete NHL usage cutoff required",
  );
  const histories = new Map<
      number,
      {
        nhlPlayerId: number;
        position: NhlLineupUsagePosition;
        observations: NhlLineupUsageObservation[];
      }
    >(),
    years = new Set<number>();
  for (const s of [...input.seasons].sort((a, b) => a.year - b.year)) {
    insist(
      yearValid(s.year) && !years.has(s.year),
      "Duplicate or invalid NHL usage season",
    );
    years.add(s.year);
    if (s.year > cutoffYear || !s.seasonComplete || !s.officialCohortComplete)
      continue;
    insist(
      s.modelVersion === "nhl-hockey-overall-reviewed-v1" &&
        arrayValid(s.players),
      "Unverified NHL usage population",
    );
    const ids = new Set<number>();
    for (const p of s.players) {
      insist(
        Number.isSafeInteger(p.nhlPlayerId) &&
          p.nhlPlayerId > 0 &&
          !ids.has(p.nhlPlayerId) &&
          ["F", "D", "G"].includes(p.position),
        "Duplicate or invalid NHL usage player",
      );
      ids.add(p.nhlPlayerId);
      if (p.position === "G") continue;
      const o: NhlLineupUsageObservation = {
        year: s.year,
        minutes: p.minutes,
        games: p.games,
        age: p.age,
        ...(p.teams ? { teams: teams(p.teams) } : {}),
      };
      validateObservation(o);
      const h: NhlLineupUsageArtifact["profiles"][number] = histories.get(
        p.nhlPlayerId,
      ) ?? {
        nhlPlayerId: p.nhlPlayerId,
        position: p.position,
        observations: [],
      };
      insist(h.position === p.position, "Conflicting NHL usage role");
      h.observations.push(o);
      histories.set(p.nhlPlayerId, h);
    }
  }
  const examples: NhlLineupUsageValidationRow[] = [];
  for (const h of histories.values())
    for (const target of h.observations) {
      const origin = target.year - 1,
        prior = h.observations.filter((o) => o.year <= origin),
        last = prior.at(-1);
      if (!last || origin - last.year > 4) continue;
      const x = nhlLineupUsageFeatures(prior, origin)!;
      const previous = prior.at(-2),
        oldTeams = teams(last.teams),
        nextTeams = teams(target.teams),
        beforeTeams = teams(previous?.teams);
      examples.push({
        nhlPlayerId: h.nhlPlayerId,
        position: h.position,
        originYear: origin,
        targetYear: target.year,
        lastObservedYear: last.year,
        targetGames: target.games,
        features: x,
        actual: target.minutes / target.games,
        predicted: x[0],
        selected: "latest",
        trainingRows: 0,
        knownTeamChange: !!(
          oldTeams.length &&
          beforeTeams.length &&
          oldTeams.join() !== beforeTeams.join()
        ),
        realizedNextTeamChange: !!(
          oldTeams.length &&
          nextTeams.length &&
          oldTeams.join() !== nextTeams.join()
        ),
      });
    }
  const validationRows: NhlLineupUsageValidationRow[] = [],
    references: NhlLineupUsageArtifact["references"] = [];
  for (const position of roles) {
    const rr = examples.filter((r) => r.position === position),
      scores = candidates.map(() => ({ error: 0, rows: 0 }));
    let scoredOrigins = 0;
    const select = () =>
      scoredOrigins < method.warmupOrigins
        ? 0
        : scores.reduce(
            (best, s, i) =>
              s.rows &&
              s.error / s.rows < scores[best]!.error / scores[best]!.rows
                ? i
                : best,
            0,
          );
    const result: NhlLineupUsageValidationRow[] = [];
    const origins = [...new Set(rr.map((r) => r.originYear))].sort(
      (a, b) => a - b,
    );
    for (const origin of origins) {
      const train = rr.filter((r) => r.targetYear <= origin),
        test = rr.filter((r) => r.originYear === origin),
        models = candidates.map((c) =>
          typeof c === "number" && train.length >= method.minimumTrainingRows
            ? fit(train, c)
            : null,
        ),
        selected = select();
      for (const r of test) {
        const pp = candidates.map((c, i) => predict(c, models[i]!, r.features));
        result.push({
          ...r,
          predicted: pp[selected]!,
          selected: candidates[selected]!,
          trainingRows: train.length,
        });
        if (train.length >= method.minimumTrainingRows)
          pp.forEach((p, i) => {
            scores[i]!.error += (p - r.actual) ** 2;
            scores[i]!.rows++;
          });
      }
      if (train.length >= method.minimumTrainingRows && test.length)
        scoredOrigins++;
    }
    const candidate = candidates[select()]!;
    references.push({
      position,
      candidate,
      model:
        typeof candidate === "number" && rr.length >= method.minimumTrainingRows
          ? fit(rr, candidate)
          : null,
      trainingRows: rr.length,
      trainingThroughYear: cutoffYear,
      validation: {
        ...metrics(result),
        origins: origins.length,
        winningOrigins: origins.filter((o) => {
          const m = metrics(result.filter((r) => r.originYear === o));
          return m.mse! < m.latestMse!;
        }).length,
        shortTargetGames: metrics(result.filter((r) => r.targetGames < 20)),
        regularTargetGames: metrics(result.filter((r) => r.targetGames >= 20)),
        lowUsage: metrics(result.filter((r) => r.features[0] < 12)),
        knownTeamChange: metrics(result.filter((r) => r.knownTeamChange)),
        realizedNextTeamChange: metrics(
          result.filter((r) => r.realizedNextTeamChange),
        ),
        afterAbsence: metrics(
          result.filter((r) => r.lastObservedYear < r.originYear),
        ),
        unknownAge: metrics(result.filter((r) => r.features[2] === null)),
      },
    });
    validationRows.push(...result);
  }
  const artifact: NhlLineupUsageArtifact = {
    version: "nhl-lineup-usage-v1",
    units: "minutes-per-appearance",
    cutoffYear,
    sourceSha256,
    method: {
      ...method,
      featureNames: [...featureNames],
      candidates: [...candidates],
    },
    references,
    profiles: [...histories.values()]
      .filter((h) => cutoffYear - h.observations.at(-1)!.year <= 4)
      .sort((a, b) => a.nhlPlayerId - b.nhlPlayerId),
  };
  return { artifact, validationRows };
}
/** Validate and freeze once; inference reuses the same immutable evidence. */
export function parseNhlLineupUsageArtifact(
  input: unknown,
): NhlLineupUsageArtifact {
  insist(input && typeof input === "object", "Invalid NHL usage artifact");
  const a = input as NhlLineupUsageArtifact;
  if (validatedArtifacts.has(a)) return a;
  insist(
    a.version === "nhl-lineup-usage-v1" &&
      a.units === "minutes-per-appearance" &&
      yearValid(a.cutoffYear) &&
      /^[a-f0-9]{64}$/.test(a.sourceSha256) &&
      a.method &&
      Object.entries(method).every(
        ([k, v]) =>
          JSON.stringify(a.method[k as keyof typeof method]) ===
          JSON.stringify(v),
      ) &&
      arrayValid(a.references) &&
      a.references.length === 2 &&
      arrayValid(a.profiles) &&
      a.profiles.length <= 5000,
    "Invalid NHL usage artifact",
  );
  const seenRoles = new Set<string>(),
    ids = new Set<number>();
  for (const r of a.references) {
    insist(
      r &&
        roles.includes(r.position) &&
        !seenRoles.has(r.position) &&
        candidates.includes(r.candidate) &&
        r.trainingThroughYear === a.cutoffYear &&
        Number.isSafeInteger(r.trainingRows) &&
        r.trainingRows >= 0,
      "Invalid NHL usage reference",
    );
    seenRoles.add(r.position);
    if (typeof r.candidate === "number") {
      const m = r.model;
      insist(
        m &&
          r.trainingRows >= method.minimumTrainingRows &&
          finite(m.intercept) &&
          [m.means, m.scales, m.coefficients].every(
            (x) => arrayValid(x) && x.length === 4 && x.every(finite),
          ) &&
          m.scales.every((x) => x > 0),
        "Invalid NHL usage coefficients",
      );
    } else insist(r.model === null, "Unexpected NHL usage coefficients");
    const v = r.validation;
    insist(
      v &&
        Number.isSafeInteger(v.origins) &&
        v.origins >= 0 &&
        Number.isSafeInteger(v.winningOrigins) &&
        v.winningOrigins >= 0 &&
        v.winningOrigins <= v.origins &&
        v.rows === r.trainingRows,
      "Invalid NHL usage validation",
    );
    for (const m of [
      v,
      v.shortTargetGames,
      v.regularTargetGames,
      v.lowUsage,
      v.knownTeamChange,
      v.realizedNextTeamChange,
      v.afterAbsence,
      v.unknownAge,
    ]) {
      insist(
        m && Number.isSafeInteger(m.rows) && m.rows >= 0 && m.rows <= v.rows,
        "Invalid NHL usage metrics",
      );
      for (const k of [
        "mse",
        "latestMse",
        "weighted3Mse",
        "mae",
        "latestMae",
        "bias",
      ] as const)
        insist(
          m.rows === 0
            ? m[k] === null
            : typeof m[k] === "number" &&
                finite(m[k]) &&
                (k === "bias" || m[k] >= 0),
          "Invalid NHL usage metrics",
        );
    }
    insist(
      v.shortTargetGames.rows + v.regularTargetGames.rows === v.rows,
      "Incomplete NHL usage target strata",
    );
  }
  for (const p of a.profiles) {
    insist(
      p &&
        Number.isSafeInteger(p.nhlPlayerId) &&
        p.nhlPlayerId > 0 &&
        !ids.has(p.nhlPlayerId) &&
        roles.includes(p.position) &&
        arrayValid(p.observations) &&
        p.observations.length > 0 &&
        p.observations.length <= 100,
      "Invalid NHL usage profile",
    );
    ids.add(p.nhlPlayerId);
    p.observations.forEach((o, i) => {
      validateObservation(o);
      insist(
        o.year <= a.cutoffYear &&
          (i === 0 || o.year > p.observations[i - 1]!.year),
        "Future or unordered NHL usage history",
      );
    });
    insist(
      a.cutoffYear - p.observations.at(-1)!.year <= 4,
      "Expired NHL usage profile",
    );
  }
  freezeTree(a);
  validatedArtifacts.add(a);
  return a;
}
export function predictNhlLineupUsage(
  artifact: NhlLineupUsageArtifact,
  nhlPlayerId: number,
  targetYear: number,
): NhlLineupUsagePrediction {
  artifact = parseNhlLineupUsageArtifact(artifact);
  insist(
    Number.isSafeInteger(nhlPlayerId) &&
      nhlPlayerId > 0 &&
      yearValid(targetYear) &&
      targetYear > artifact.cutoffYear,
    "Invalid NHL usage forecast request",
  );
  const p = artifact.profiles.find((p) => p.nhlPlayerId === nhlPlayerId),
    last = p?.observations.at(-1),
    ref = artifact.references.find((r) => r.position === p?.position),
    reasons: NhlLineupUsagePrediction["reasons"] = [];
  if (!p) reasons.push("no-positive-exposure-history");
  if (targetYear !== artifact.cutoffYear + 1)
    reasons.push("unsupported-horizon");
  let minutesPerAppearance: number | null = null;
  if (p && ref && targetYear === artifact.cutoffYear + 1) {
    const x = nhlLineupUsageFeatures(p.observations, artifact.cutoffYear)!;
    const forecast = predict(ref.candidate, ref.model, x);
    if (forecast > 0 && forecast <= 65) minutesPerAppearance = forecast;
    else reasons.push("invalid-model-output");
    if (last!.year < artifact.cutoffYear) reasons.push("stale-history");
    if (p.observations.length < 2) reasons.push("one-season-history");
    if (last!.games < 20) reasons.push("short-latest-season");
    if (last!.age === null) reasons.push("age-unavailable");
    const v = ref.validation;
    if (
      v.rows < 100 ||
      v.origins < 3 ||
      v.mse === null ||
      v.latestMse === null ||
      v.weighted3Mse === null ||
      v.mse >= Math.min(v.latestMse, v.weighted3Mse) ||
      v.winningOrigins * 3 < v.origins * 2
    )
      reasons.push("limited-role-validation");
  }
  return {
    nhlPlayerId,
    position: p?.position ?? null,
    targetYear,
    minutesPerAppearance,
    status:
      minutesPerAppearance === null
        ? "unavailable"
        : reasons.length
          ? "research"
          : "supported",
    reasons,
    lastObservedYear: last?.year ?? null,
    measuredSeasons: p?.observations.length ?? 0,
    latestGames: last?.games ?? null,
  };
}
