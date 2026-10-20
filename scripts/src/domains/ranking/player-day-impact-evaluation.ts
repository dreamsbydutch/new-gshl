/** Independent held-out evaluation. Does not import the candidate scorer or legacy engine. */
export type ImpactRaw = Readonly<Record<string, number>>;
export const REVIEWED_PLAYER_DAY_IMPACT_POLICY = {
  ratioPrecision: { GAA: 5, SVP: 5 },
  qualificationCategories: ["W", "GAA", "SV", "SVP", "SO"],
} as const;
export type ImpactPolicy = {
  ratioPrecision: { GAA: number; SVP: number };
  qualificationCategories: readonly string[];
};
export type ImpactAppearance = {
  statLineId: string;
  playerId: string;
  date: string;
  role: "skater" | "goalie";
  GS: number;
  raw: ImpactRaw;
  availableFields: readonly string[];
};
export type ImpactSide = {
  teamId: string;
  raw: ImpactRaw;
  goalieStarts: number;
  appearances: readonly ImpactAppearance[];
};
export type ImpactMatchup = {
  matchupId: string;
  seasonId: string;
  season: string;
  weekId: string;
  weekType: string;
  startDate: string;
  endDate: string;
  calendarDays: number;
  configuredGameDays?: number | null;
  categories: readonly string[];
  home: ImpactSide & { goalieMinimum: number };
  away: ImpactSide & { goalieMinimum: number };
};
export type ImpactEvaluationCase = {
  key: string;
  matchupId: string;
  seasonId: string;
  season: string;
  weekId: string;
  weekType: string;
  startDate: string;
  endDate: string;
  calendarDays: number;
  weekDays: number;
  categories: readonly string[];
  own: ImpactSide & { goalieMinimum: number };
  opponent: ImpactSide & { goalieMinimum: number };
  appearance: ImpactAppearance;
  posGroup: string;
  block: string;
};
export type ImpactEvaluationFit = {
  id: string;
  trainedBefore: string;
  trainingMatchupIds: readonly string[];
  selectionMatchupIds?: readonly string[];
  calibrationMatchupIds?: readonly string[];
};
export type ImpactEvaluationPrediction = {
  caseKey: string;
  method: string;
  fitId: string;
  score: number | null;
  categoryContributions?: Readonly<Record<string, number>>;
};
const skater = new Set([
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
]);
const goalie = new Set(["W", "GAA", "SV", "SVP", "SO"]);
const goalieRaw = new Set(["W", "GA", "SV", "SA", "SO", "TOI"]);
function checkDate(date: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw Error("Invalid ISO date");
}
function finite(value: number) {
  if (!Number.isFinite(value)) throw Error("Nonfinite numerical evidence");
  return value;
}
function validatePolicy(policy: ImpactPolicy) {
  for (const p of [policy.ratioPrecision.GAA, policy.ratioPrecision.SVP])
    if (!Number.isInteger(p) || p < 0 || p > 8)
      throw Error("Explicit ratio precision required");
  if (
    !Array.isArray(policy.qualificationCategories) ||
    new Set(policy.qualificationCategories).size !==
      policy.qualificationCategories.length ||
    policy.qualificationCategories.some((c) => !goalie.has(c))
  )
    throw Error("Invalid explicit qualification policy");
}
function validateCategories(categories: readonly string[]) {
  if (
    !categories.length ||
    new Set(categories).size !== categories.length ||
    categories.some((c) => !skater.has(c) && !goalie.has(c))
  )
    throw Error("Unknown or duplicate categories");
}
export function impactEvaluationBlock(season: string) {
  const year = Number(/^(\d{4})-/.exec(season)?.[1]);
  if (!Number.isInteger(year)) throw Error("Invalid season");
  return year === 2025
    ? "final-2025-26"
    : year >= 2026
      ? "current-or-future"
      : year >= 2022
        ? "validation-2022-2024"
        : year >= 2015
          ? "development-2015-2021"
          : "warmup";
}
export function buildImpactEvaluationCases(
  corpus: { matchups: readonly ImpactMatchup[] },
  positionByStatLineId: Readonly<Record<string, string>> = {},
): ImpactEvaluationCase[] {
  const out: ImpactEvaluationCase[] = [],
    ids = new Set<string>(),
    matchupIds = new Set<string>();
  for (const m of corpus.matchups) {
    if (matchupIds.has(m.matchupId)) throw Error("Duplicate matchup");
    matchupIds.add(m.matchupId);
    checkDate(m.startDate);
    checkDate(m.endDate);
    if (m.endDate < m.startDate) throw Error("Reversed matchup");
    if (
      !Number.isInteger(m.calendarDays) ||
      m.calendarDays < 1 ||
      m.calendarDays !==
        1 + (Date.parse(m.endDate) - Date.parse(m.startDate)) / 86400000
    )
      throw Error("Calendar length mismatch");
    validateCategories(m.categories);
    const weekDays = m.configuredGameDays || m.calendarDays;
    if (!Number.isInteger(weekDays) || weekDays < 1 || weekDays > 31)
      throw Error("Invalid configured matchup duration");
    if (m.home.teamId === m.away.teamId) throw Error("Self matchup");
    for (const [own, opponent] of [
      [m.home, m.away],
      [m.away, m.home],
    ]) {
      if (
        !Number.isInteger(own.goalieStarts) ||
        own.goalieStarts < 0 ||
        !Number.isInteger(own.goalieMinimum) ||
        own.goalieMinimum < 1
      )
        throw Error("Invalid goalie appearances/minimum");
      for (const a of own.appearances) {
        checkDate(a.date);
        if (
          a.date < m.startDate ||
          a.date > m.endDate ||
          a.GS !== 1 ||
          !["skater", "goalie"].includes(a.role)
        )
          throw Error("Invalid started appearance");
        if (ids.has(a.statLineId))
          throw Error("Physical appearance belongs to multiple matchups");
        ids.add(a.statLineId);
        const pos =
          positionByStatLineId[a.statLineId] ??
          (a.role === "goalie" ? "G" : "skater");
        if (
          a.role === "goalie"
            ? pos !== "G"
            : !["F", "D", "skater"].includes(pos)
        )
          throw Error("Role/position mismatch");
        out.push({
          key: `${m.matchupId}|${own.teamId}|${a.statLineId}`,
          matchupId: m.matchupId,
          seasonId: m.seasonId,
          season: m.season,
          weekId: m.weekId,
          weekType: m.weekType,
          startDate: m.startDate,
          endDate: m.endDate,
          calendarDays: m.calendarDays,
          weekDays: m.configuredGameDays || m.calendarDays,
          categories: [...m.categories],
          own,
          opponent,
          appearance: a,
          posGroup: pos,
          block: impactEvaluationBlock(m.season),
        });
      }
    }
  }
  return out;
}
function compare(a: number, b: number, lower: boolean) {
  return a === b ? 0.5 : (lower ? a < b : a > b) ? 1 : 0;
}
function value(raw: ImpactRaw, c: string, policy: ImpactPolicy): number | null {
  if (c === "GAA")
    return finite(raw.TOI) > 0
      ? Number(
          ((60 * finite(raw.GA)) / raw.TOI).toFixed(policy.ratioPrecision.GAA),
        )
      : null;
  if (c === "SVP")
    return finite(raw.SA) > 0
      ? Number((finite(raw.SV) / raw.SA).toFixed(policy.ratioPrecision.SVP))
      : null;
  return finite(raw[c]);
}
function utility(
  own: ImpactRaw,
  opponent: ImpactRaw,
  c: string,
  ownStarts: number,
  opponentStarts: number,
  ownMinimum: number,
  opponentMinimum: number,
  policy: ImpactPolicy,
): number | null {
  if (policy.qualificationCategories.includes(c)) {
    const aq = ownStarts >= ownMinimum,
      bq = opponentStarts >= opponentMinimum;
    if (aq !== bq) return aq ? 1 : 0;
    if (!aq) return 0.5;
  }
  const a = value(own, c, policy),
    b = value(opponent, c, policy);
  return a === null || b === null ? null : compare(a, b, c === "GAA");
}
/** Exact descriptive leave-one-appearance-out category points, independently recomputed. */
export function actualLeaveOneOutImpact(
  c: ImpactEvaluationCase,
  policy: ImpactPolicy,
) {
  validatePolicy(policy);
  validateCategories(c.categories);
  const a = c.appearance,
    background = { ...c.own.raw };
  for (const field of a.role === "goalie" ? goalieRaw : skater) {
    const amount = finite(a.raw[field] ?? 0),
      next = finite(background[field] ?? 0) - amount;
    if (field !== "PM" && next < -1e-8)
      throw Error("Appearance exceeds final own total");
    background[field] = Math.abs(next) < 1e-8 ? 0 : next;
  }
  const starts = c.own.goalieStarts - (a.role === "goalie" ? 1 : 0);
  if (starts < 0) throw Error("Negative background appearances");
  const byCategory: Record<string, number | null> = {},
    reasons: string[] = [];
  for (const category of c.categories) {
    if (a.role === "goalie" ? !goalie.has(category) : !skater.has(category)) {
      byCategory[category] = 0;
      continue;
    }
    const required =
      category === "GAA"
        ? ["GA", "TOI"]
        : category === "SVP"
          ? ["SV", "SA"]
          : [category];
    if (required.some((f) => !a.availableFields.includes(f))) {
      byCategory[category] = null;
      reasons.push(`Missing ${category} appearance input`);
      continue;
    }
    const before = utility(
      background,
      c.opponent.raw,
      category,
      starts,
      c.opponent.goalieStarts,
      c.own.goalieMinimum,
      c.opponent.goalieMinimum,
      policy,
    );
    const after = utility(
      c.own.raw,
      c.opponent.raw,
      category,
      c.own.goalieStarts,
      c.opponent.goalieStarts,
      c.own.goalieMinimum,
      c.opponent.goalieMinimum,
      policy,
    );
    byCategory[category] =
      before === null || after === null ? null : after - before;
    if (byCategory[category] === null)
      reasons.push(`Undefined qualified ${category} ratio`);
  }
  return {
    score: Object.values(byCategory).some((v) => v === null)
      ? null
      : Object.values(byCategory).reduce<number>((n, v) => n + v!, 0),
    byCategory,
    reasons,
    minimumCrossing:
      a.role === "goalie" &&
      starts < c.own.goalieMinimum &&
      c.own.goalieStarts >= c.own.goalieMinimum,
  };
}
export function fitScalarImpactCalibration(
  rows: readonly { value: number; target: number; endDate: string }[],
  trainedBefore: string,
) {
  checkDate(trainedBefore);
  if (!rows.length) throw Error("Calibration training data required");
  let x = 0,
    y = 0,
    xx = 0,
    xy = 0;
  for (const r of rows) {
    checkDate(r.endDate);
    if (r.endDate >= trainedBefore) throw Error("Future calibration label");
    finite(r.value);
    finite(r.target);
    x += r.value;
    y += r.target;
    xx += r.value * r.value;
    xy += r.value * r.target;
  }
  const n = rows.length,
    den = xx - (x * x) / n,
    slope = den > 1e-12 ? (xy - (x * y) / n) / den : 0,
    intercept = y / n - (slope * x) / n;
  return { slope, intercept, n, trainedBefore };
}
function metric(rows: readonly { prediction: number; target: number }[]) {
  let error = 0,
    squared = 0,
    absolute = 0,
    prediction = 0,
    target = 0,
    negative = 0,
    negativeCaptured = 0;
  for (const r of rows) {
    const d = r.prediction - r.target;
    error += d;
    squared += d * d;
    absolute += Math.abs(d);
    prediction += r.prediction;
    target += r.target;
    if (r.target < 0) {
      negative++;
      if (r.prediction < 0) negativeCaptured++;
    }
  }
  const n = rows.length;
  return {
    n,
    mse: n ? squared / n : null,
    mae: n ? absolute / n : null,
    bias: n ? error / n : null,
    meanPrediction: n ? prediction / n : null,
    meanTarget: n ? target / n : null,
    negativeTargets: negative,
    negativeSignRecall: negative ? negativeCaptured / negative : null,
  };
}
function quantile(sorted: readonly number[], q: number) {
  const x = (sorted.length - 1) * q,
    lo = Math.floor(x),
    hi = Math.ceil(x);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (x - lo);
}
export function evaluatePlayerDayImpact(input: {
  cases: readonly ImpactEvaluationCase[];
  matchups: readonly ImpactMatchup[];
  fits: readonly ImpactEvaluationFit[];
  predictions: readonly ImpactEvaluationPrediction[];
  methods: readonly string[];
  referenceMethod: string;
  policy: ImpactPolicy;
  bootstrapSamples?: number;
  seed?: number;
  clusterUnit?: "week" | "matchup";
}) {
  validatePolicy(input.policy);
  if (
    input.policy.ratioPrecision.GAA !== 5 ||
    input.policy.ratioPrecision.SVP !== 5 ||
    input.policy.qualificationCategories.length !== 5 ||
    [...goalie].some((c) => !input.policy.qualificationCategories.includes(c))
  )
    throw Error(
      "Evaluation policy differs from frozen historical five-category/five-decimal contract",
    );
  const methods = [...input.methods];
  if (
    !methods.length ||
    new Set(methods).size !== methods.length ||
    !methods.includes(input.referenceMethod)
  )
    throw Error("Explicit unique methods/reference required");
  const caseMap = new Map(input.cases.map((c) => [c.key, c]));
  if (caseMap.size !== input.cases.length || !caseMap.size)
    throw Error("Empty or duplicate evaluation cases");
  const matchups = new Map(input.matchups.map((m) => [m.matchupId, m]));
  if (matchups.size !== input.matchups.length)
    throw Error("Duplicate training matchup identity");
  const fits = new Map(input.fits.map((f) => [f.id, f]));
  if (fits.size !== input.fits.length) throw Error("Duplicate fit identity");
  const proven = new Map<string, string>();
  for (const f of input.fits) {
    checkDate(f.trainedBefore);
    let latest = "";
    for (const field of [
      "trainingMatchupIds",
      "selectionMatchupIds",
      "calibrationMatchupIds",
    ] as const) {
      const ids = f[field] ?? [];
      if (new Set(ids).size !== ids.length)
        throw Error("Duplicate training evidence");
      for (const id of ids) {
        const m = matchups.get(id);
        if (!m) throw Error("Unknown training evidence");
        checkDate(m.endDate);
        if (m.endDate >= f.trainedBefore)
          throw Error("Fit consumes future/unfinished matchup");
        if (m.endDate > latest) latest = m.endDate;
      }
    }
    proven.set(f.id, latest);
  }
  const predictions = new Map<string, ImpactEvaluationPrediction>();
  for (const p of input.predictions) {
    if (!methods.includes(p.method)) throw Error("Unknown prediction method");
    const c = caseMap.get(p.caseKey);
    if (!c) throw Error("Unknown prediction identity");
    const key = `${p.method}|${p.caseKey}`;
    if (predictions.has(key)) throw Error("Duplicate prediction");
    const fit = fits.get(p.fitId);
    if (!fit) throw Error("Unknown fitted model");
    if (
      fit.trainedBefore > c.startDate ||
      (proven.get(fit.id) ?? "") >= c.startDate
    )
      throw Error("Prediction leaks target-week or future evidence");
    if (p.score !== null) finite(p.score);
    for (const [category, v] of Object.entries(p.categoryContributions ?? {})) {
      if (!c.categories.includes(category))
        throw Error("Prediction uses inactive category");
      finite(v);
    }
    if (
      p.score !== null &&
      p.categoryContributions !== undefined &&
      Math.abs(
        Object.values(p.categoryContributions).reduce((n, v) => n + v, 0) -
          p.score,
      ) > 1e-8
    )
      throw Error("Per-category predictions do not sum to total");
    predictions.set(key, p);
  }
  const missing: Record<string, number> = Object.fromEntries(
    methods.map((m) => [m, 0]),
  );
  let unavailableTargets = 0;
  const common: {
    c: ImpactEvaluationCase;
    target: ReturnType<typeof actualLeaveOneOutImpact>;
    p: Record<string, ImpactEvaluationPrediction>;
  }[] = [];
  for (const c of input.cases) {
    const target = actualLeaveOneOutImpact(c, input.policy),
      p: Record<string, ImpactEvaluationPrediction> = {};
    for (const method of methods) {
      const prediction = predictions.get(`${method}|${c.key}`);
      if (!prediction)
        throw Error(
          "Missing prediction record: declare unsupported explicitly",
        );
      p[method] = prediction;
      if (prediction.score === null) missing[method]++;
    }
    if (target.score === null) {
      unavailableTargets++;
      continue;
    }
    if (methods.every((m) => p[m]!.score !== null))
      common.push({ c, target, p });
  }
  if (!common.length) throw Error("No identical supported evaluation cohort");
  const results: Record<string, unknown> = {};
  for (const method of methods) {
    const overall = metric(
      common.map((r) => ({
        prediction: r.p[method]!.score!,
        target: r.target.score!,
      })),
    );
    const groups: Record<string, ReturnType<typeof metric>> = {};
    const labels = (r: (typeof common)[number]) => [
      `role:${r.c.appearance.role}`,
      `position:${r.c.posGroup}`,
      `block:${r.c.block}`,
      `season:${r.c.season}`,
      `weekDays:${r.c.weekDays}`,
      `type:${r.c.weekType === "LT" ? "PO" : r.c.weekType}`,
      `minimumCrossing:${r.target.minimumCrossing}`,
      `minimum:${r.c.own.goalieMinimum}`,
      `mask:${[...r.c.categories].sort().join(",")}`,
    ];
    const buckets = new Map<string, { prediction: number; target: number }[]>();
    for (const r of common)
      for (const label of labels(r)) {
        const b = buckets.get(label) ?? [];
        b.push({ prediction: r.p[method]!.score!, target: r.target.score! });
        buckets.set(label, b);
      }
    for (const [label, rows] of buckets) groups[label] = metric(rows);
    const categories: Record<string, ReturnType<typeof metric>> = {};
    for (const category of new Set(
      common.flatMap((r) => [...r.c.categories]),
    )) {
      const rows = common
        .filter(
          (r) =>
            r.c.categories.includes(category) &&
            (goalie.has(category)
              ? r.c.appearance.role === "goalie"
              : r.c.appearance.role === "skater") &&
            r.p[method]!.categoryContributions?.[category] !== undefined &&
            r.target.byCategory[category] !== null,
        )
        .map((r) => ({
          prediction: r.p[method]!.categoryContributions![category]!,
          target: r.target.byCategory[category]!,
        }));
      categories[category] = metric(rows);
    }
    const edges = [-1, -0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5, 1];
    const calibration = Array.from({ length: edges.length + 1 }, (_, i) => ({
      lower: i === 0 ? null : edges[i - 1]!,
      upper: i === edges.length ? null : edges[i]!,
      ...metric(
        common
          .filter(
            (r) =>
              (i === 0 || r.p[method]!.score! >= edges[i - 1]!) &&
              (i === edges.length || r.p[method]!.score! < edges[i]!),
          )
          .map((r) => ({
            prediction: r.p[method]!.score!,
            target: r.target.score!,
          })),
      ),
    }));
    results[method] = { overall, groups, categories, calibration };
  }
  const clusterUnit = input.clusterUnit ?? "week";
  if (!["week", "matchup"].includes(clusterUnit))
    throw Error("Invalid bootstrap cluster unit");
  const samples = input.bootstrapSamples ?? 2000;
  if (!Number.isInteger(samples) || samples < 1 || samples > 10000)
    throw Error("Invalid bounded bootstrap count");
  let state = (input.seed ?? 282761) >>> 0;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const paired: Record<string, unknown> = {};
  for (const method of methods.filter((m) => m !== input.referenceMethod)) {
    state = (input.seed ?? 282761) >>> 0;
    const strata = new Map<string, Map<string, { sum: number; n: number }>>();
    let sum = 0;
    for (const r of common) {
      const target = r.target.score!,
        delta =
          (r.p[method]!.score! - target) ** 2 -
          (r.p[input.referenceMethod]!.score! - target) ** 2;
      sum += delta;
      const clusters = strata.get(r.c.season) ?? new Map(),
        clusterKey = clusterUnit === "week" ? r.c.weekId : r.c.matchupId,
        cluster = clusters.get(clusterKey) ?? { sum: 0, n: 0 };
      cluster.sum += delta;
      cluster.n++;
      clusters.set(clusterKey, cluster);
      strata.set(r.c.season, clusters);
    }
    const arrays = [...strata.values()].map((m) => [...m.values()]),
      draws: number[] = [];
    for (let b = 0; b < samples; b++) {
      let loss = 0,
        n = 0;
      for (const clusters of arrays)
        for (let j = 0; j < clusters.length; j++) {
          const c = clusters[Math.floor(random() * clusters.length)]!;
          loss += c.sum;
          n += c.n;
        }
      draws.push(loss / n);
    }
    draws.sort((a, b) => a - b);
    paired[method] = {
      reference: input.referenceMethod,
      clusterUnit,
      mseDifference: sum / common.length,
      confidence95: [quantile(draws, 0.025), quantile(draws, 0.975)],
      samples,
      clusters: [...strata.values()].reduce((n, m) => n + m.size, 0),
    };
  }
  return {
    version: "player-day-impact-independent-evaluation-v1",
    policy: input.policy,
    clusterUnit,
    coverage: {
      requested: input.cases.length,
      common: common.length,
      unavailableTargets,
      unavailableByMethod: missing,
    },
    methods: results,
    paired,
    commonCaseKeys: common.map((r) => r.c.key),
    limitations: [
      "Actual leave-one-out targets are descriptive counterfactual arithmetic, not causal attribution or pregame forecasts.",
      "Intervals resample whole declared fantasy-week clusters (or explicit matchup sensitivity) within seasons and condition on frozen trained models.",
      "Fit chronology validates declared source identities/dates, not execution of the external training program.",
      "All reported methods use the exact same supported target cohort; unsupported records remain explicit.",
    ],
  };
}
