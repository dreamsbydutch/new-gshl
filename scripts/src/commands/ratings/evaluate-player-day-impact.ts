import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readdir } from "node:fs/promises";
import {
  loadPlayerDayImpact,
  HISTORICAL_DAY_IMPACT_POLICY,
  type DayImpactReference,
  type DayImpactAppearance,
} from "../../domains/ranking/player-day-impact";
import {
  buildImpactEvaluationCases,
  actualLeaveOneOutImpact,
  fitScalarImpactCalibration,
  evaluatePlayerDayImpact,
  REVIEWED_PLAYER_DAY_IMPACT_POLICY,
  type ImpactMatchup,
  type ImpactEvaluationCase,
  type ImpactEvaluationFit,
  type ImpactEvaluationPrediction,
} from "../../domains/ranking/player-day-impact-evaluation";

export type ImpactAcceptanceEvaluation = {
  coverage: { requested: number; common: number };
  methods: Record<
    string,
    {
      overall: { n: number; mse: number | null };
      groups: Record<string, { n: number; mse: number | null }>;
    }
  >;
  paired: Record<string, { confidence95: readonly number[] }>;
  commonCaseKeys: readonly string[];
};
export function verifyImpactAcceptancePolicy(policy: unknown) {
  const p = policy as {
    version?: string;
    validation?: { years?: unknown; required?: unknown };
    final?: {
      required?: unknown;
      primarySeason?: string;
      secondaryOnly?: string;
    };
  };
  const validation = [
    "beat legacy-calibrated AND equal-category-z overall",
    "no more than5%relative MSE regression vs legacy for F/D/G withatleast1000 common cases",
    "atleast95%coverage overall andeachrole; disclose unsupported week lengths",
  ];
  const final = [
    "frozen choice only; no retuning on final labels",
    "lower point MSE thanbothbaselines",
    "whole-week95%bootstrap upper MSE-difference below0 vslegacy",
    "same subgroup/coverage checks",
  ];
  if (
    !p ||
    p.version !== "pre-results-acceptance-v1" ||
    JSON.stringify(p.validation?.years) !==
      JSON.stringify([2022, 2023, 2024]) ||
    JSON.stringify(p.validation?.required) !== JSON.stringify(validation) ||
    JSON.stringify(p.final?.required) !== JSON.stringify(final) ||
    p.final?.primarySeason !== "2025-26"
  )
    throw Error("Unrecognized frozen acceptance policy");
}
export function assessImpactAcceptance(
  evaluation: ImpactAcceptanceEvaluation,
  cases: readonly Pick<
    ImpactEvaluationCase,
    "key" | "appearance" | "weekDays" | "posGroup"
  >[],
  candidates: readonly string[],
  phase: "validation" | "final",
) {
  const byKey = new Map(cases.map((c) => [c.key, c]));
  if (
    byKey.size !== cases.length ||
    evaluation.coverage.requested !== cases.length ||
    new Set(evaluation.commonCaseKeys).size !==
      evaluation.commonCaseKeys.length ||
    evaluation.coverage.common !== evaluation.commonCaseKeys.length ||
    evaluation.commonCaseKeys.some((key) => !byKey.has(key))
  )
    throw Error("Acceptance cohort identity mismatch");
  const requestedRoles: Record<string, number> = {},
    commonPositions: Record<string, number> = {},
    commonRoles: Record<string, number> = {},
    excludedWeekDays: Record<string, number> = {};
  const common = new Set(evaluation.commonCaseKeys);
  for (const c of cases) {
    requestedRoles[c.appearance.role] =
      (requestedRoles[c.appearance.role] ?? 0) + 1;
    if (common.has(c.key)) {
      commonRoles[c.appearance.role] =
        (commonRoles[c.appearance.role] ?? 0) + 1;
      commonPositions[c.posGroup] = (commonPositions[c.posGroup] ?? 0) + 1;
    } else
      excludedWeekDays[c.weekDays] = (excludedWeekDays[c.weekDays] ?? 0) + 1;
  }
  const coverage = {
    overall: cases.length ? evaluation.coverage.common / cases.length : 0,
    roles: Object.fromEntries(
      Object.entries(requestedRoles).map(([role, n]) => [
        role,
        (commonRoles[role] ?? 0) / n,
      ]),
    ),
    excludedWeekDays,
  };
  const mse = (method: string, group?: string) => {
    if (
      !group &&
      evaluation.methods[method]?.overall.n !== evaluation.coverage.common
    )
      throw Error("Overall metric cohort mismatch");
    const value = group
      ? evaluation.methods[method]?.groups[group]?.mse
      : evaluation.methods[method]?.overall.mse;
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(value) ||
      value < 0
    )
      throw Error("Invalid acceptance metric");
    return value;
  };
  const baseline = mse("legacy-calibrated"),
    simple = mse("equal-category-z");
  const ranking = candidates
    .map((name) => {
      const error = mse(name),
        reasons: string[] = [];
      if (!(error < baseline && error < simple))
        reasons.push("Does not beat both frozen baselines overall");
      if (
        coverage.overall < 0.95 ||
        Object.values(coverage.roles).some((v) => v < 0.95)
      )
        reasons.push("Less than95%common coverage overall or by role");
      const subgroups: Record<
        string,
        { n: number; relativeMse: number | null }
      > = {};
      for (const pos of ["F", "D", "G"]) {
        const label = `position:${pos}`,
          metric = evaluation.methods[name]?.groups[label];
        if (!(commonPositions[pos] ?? 0)) continue;
        if (
          !metric ||
          metric.n !== commonPositions[pos] ||
          evaluation.methods["legacy-calibrated"]?.groups[label]?.n !== metric.n
        )
          throw Error("Subgroup cohort mismatch");
        if (!Number.isInteger(metric.n) || metric.n < 0)
          throw Error("Invalid subgroup count");
        if (metric.n >= 1000) {
          const old = mse("legacy-calibrated", label),
            current = mse(name, label);
          subgroups[pos] = {
            n: metric.n,
            relativeMse: old ? current / old : current === 0 ? 1 : null,
          };
          if (current > old * 1.05)
            reasons.push(`More than5%MSE regression for ${pos}`);
        }
      }
      if (phase === "final") {
        const ci = evaluation.paired[name]?.confidence95;
        if (
          !ci ||
          ci.length !== 2 ||
          !ci.every(Number.isFinite) ||
          ci[0]! > ci[1]!
        )
          throw Error("Invalid final paired confidence interval");
        if (!(ci[1]! < 0))
          reasons.push("Final whole-week95%upper MSE difference is not below0");
      }
      return {
        name,
        mse: error,
        eligible: reasons.length === 0,
        reasons,
        subgroups,
      };
    })
    .sort((a, b) => a.mse - b.mse || a.name.localeCompare(b.name));
  return {
    version: "player-day-impact-acceptance-v1",
    phase,
    coverage,
    ranking,
    chosen: ranking.find((r) => r.eligible)?.name ?? null,
    passed: ranking.some((r) => r.eligible),
  };
}
export function verifyImpactSelection(
  selection: unknown,
  evaluationBytes: Buffer,
  cases: readonly Pick<
    ImpactEvaluationCase,
    "key" | "appearance" | "weekDays" | "posGroup"
  >[],
  candidates: readonly string[],
) {
  const s = selection as {
    phase?: string;
    chosen?: string | null;
    evaluationSha256?: string;
    validationMatchupIds?: string[];
    acceptance?: unknown;
  };
  const digest = createHash("sha256").update(evaluationBytes).digest("hex");
  if (s.phase !== "validation" || s.evaluationSha256 !== digest)
    throw Error("Frozen validation evaluation hash differs");
  const evaluation = JSON.parse(
    evaluationBytes.toString(),
  ) as ImpactAcceptanceEvaluation & { phase?: string };
  if (evaluation.phase !== "validation")
    throw Error("Not a validation evaluation");
  const decision = assessImpactAcceptance(
    evaluation,
    cases,
    candidates,
    "validation",
  );
  if (
    !decision.chosen ||
    s.chosen !== decision.chosen ||
    JSON.stringify(s.acceptance) !== JSON.stringify(decision)
  )
    throw Error("Frozen selection does not match eligible validation choice");
  return decision;
}
export function verifyImpactCheckpoint(
  checkpoint: unknown,
  bindingSha256: string,
  year: number,
  offset: number,
  expectedCaseKeys: readonly string[],
  methods: readonly string[],
) {
  const c = checkpoint as {
    bindingSha256?: string;
    year?: number;
    offset?: number;
    caseKeys?: string[];
    predictions?: ImpactEvaluationPrediction[];
    examples?: unknown[];
  };
  if (
    c.bindingSha256 !== bindingSha256 ||
    c.year !== year ||
    c.offset !== offset ||
    JSON.stringify(c.caseKeys) !== JSON.stringify(expectedCaseKeys) ||
    !Array.isArray(c.predictions) ||
    !Array.isArray(c.examples)
  )
    throw Error("Checkpoint binding or case sequence differs");
  const seen = new Set<string>();
  for (const p of c.predictions) {
    const key = `${p.method}|${p.caseKey}`;
    if (
      !methods.includes(p.method) ||
      !expectedCaseKeys.includes(p.caseKey) ||
      seen.has(key) ||
      p.fitId !== `historical-${year}` ||
      (p.score !== null && !Number.isFinite(p.score))
    )
      throw Error("Invalid checkpoint prediction identity or score");
    seen.add(key);
  }
  if (seen.size !== methods.length * expectedCaseKeys.length)
    throw Error("Incomplete checkpoint methods/cohort");
  return { predictions: c.predictions, examples: c.examples };
}

async function main() {
  const { values } = parseArgs({
    options: {
      corpus: { type: "string" },
      legacy: { type: "string" },
      positions: { type: "string" },
      output: { type: "string" },
      phase: { type: "string", default: "validation" },
      selection: { type: "string" },
      "acceptance-policy": {
        type: "string",
        default:
          ".local-data/player-day-impact-20261019/acceptance-policy.json",
      },
      resume: { type: "boolean", default: false },
      help: { type: "boolean" },
    },
  });
  const sha = (b: Buffer | string) =>
    createHash("sha256").update(b).digest("hex");
  const variants = [
    {
      name: "empirical-history",
      historyYears: 99,
      backgroundWeighting: "side-week",
      countModel: "empirical",
    },
    {
      name: "empirical-recent3",
      historyYears: 3,
      backgroundWeighting: "side-week",
      countModel: "empirical",
    },
    {
      name: "empirical-appearance",
      historyYears: 99,
      backgroundWeighting: "appearance",
      countModel: "empirical",
    },
    {
      name: "normal-history",
      historyYears: 99,
      backgroundWeighting: "side-week",
      countModel: "normal",
    },
  ] as const;
  const fields = [
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
    "SV",
    "SO",
  ];
  const deviation = (xs: number[]) => {
    if (!xs.length) return null;
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  };
  function simpleReference(rows: readonly ImpactMatchup[], days: number) {
    const matched = rows.filter(
      (m) => (m.configuredGameDays || m.calendarDays) === days,
    );
    const scales: Record<string, number> = {};
    for (const c of fields) {
      const s = deviation(
        matched
          .filter((m) => m.categories.includes(c))
          .map((m) => m.home.raw[c]! - m.away.raw[c]!),
      );
      if (s && s > 0) scales[c] = s;
    }
    for (const c of ["GAA", "SVP"]) {
      const s = deviation(
        matched
          .filter(
            (m) =>
              m.home.goalieStarts >= m.home.goalieMinimum &&
              m.away.goalieStarts >= m.away.goalieMinimum,
          )
          .flatMap((m) => {
            const a = m.home.raw,
              b = m.away.raw;
            if (c === "GAA" && a.TOI! > 0 && b.TOI! > 0)
              return [(60 * a.GA!) / a.TOI! - (60 * b.GA!) / b.TOI!];
            if (c === "SVP" && a.SA! > 0 && b.SA! > 0)
              return [a.SV! / a.SA! - b.SV! / b.SA!];
            return [];
          }),
      );
      if (s && s > 0) scales[c] = s;
    }
    const sides = matched
        .flatMap((m) => [m.home, m.away])
        .filter((s) => s.goalieStarts > 0),
      base: Record<string, number> = {};
    for (const f of ["GA", "SV", "SA", "TOI"]) {
      base[f] = sides.length
        ? sides.reduce(
            (n, s) => n + (s.raw[f]! * (s.goalieStarts - 1)) / s.goalieStarts,
            0,
          ) / sides.length
        : 0;
    }
    return { scales, base };
  }
  function simpleScore(
    c: ImpactEvaluationCase,
    ref: ReturnType<typeof simpleReference>,
  ): number | null {
    let sum = 0;
    const goalie = c.appearance.role === "goalie",
      r = c.appearance.raw;
    for (const category of c.categories) {
      if (
        goalie
          ? !["W", "SV", "SO", "GAA", "SVP"].includes(category)
          : !["G", "A", "P", "PM", "PIM", "PPP", "SOG", "HIT", "BLK"].includes(
              category,
            )
      )
        continue;
      const scale = ref.scales[category];
      if (!scale) return null;
      if (category === "GAA") {
        const b = ref.base;
        if (!(b.TOI! > 0)) return null;
        sum +=
          ((60 * b.GA!) / b.TOI! - (60 * (b.GA! + r.GA!)) / (b.TOI! + r.TOI!)) /
          scale;
      } else if (category === "SVP") {
        const b = ref.base;
        if (!(b.SA! > 0)) return null;
        sum += ((b.SV! + r.SV!) / (b.SA! + r.SA!) - b.SV! / b.SA!) / scale;
      } else sum += r[category]! / scale;
    }
    return sum;
  }
  if (values.help)
    console.log(
      "Offline, read-only, season-blocked player-day rating experiment. --corpus JSON --legacy JSON --positions JSON --output NEW_DIRECTORY [--phase validation|final --selection VALIDATION/selection.json] [--acceptance-policy JSON] [--resume]. Progress and immutable resumable prediction checkpoints every500 cases. Validation uses2022-23 through2024-25; final uses untouched2025-26 and early2026-27 separately. Trains strictly earlier seasons only. No database writes, deployments or rating publication.",
    );
  else {
    if (
      !values.corpus ||
      !values.legacy ||
      !values.positions ||
      !values.output ||
      !["validation", "final"].includes(values.phase!) ||
      (values.phase === "final" && !values.selection)
    )
      throw Error("Explicit offline source/output/phase required");
    const inputs: { path: string; sha256: string }[] = [];
    async function read(path: string) {
      const b = await readFile(resolve(path));
      inputs.push({ path: resolve(path), sha256: sha(b) });
      return JSON.parse(b.toString());
    }
    const corpus = (await read(values.corpus)) as { matchups: ImpactMatchup[] },
      positionSource = await read(values.positions),
      legacySource = await read(values.legacy);
    const positions: Record<string, string> = Object.fromEntries(
      positionSource.appearances.map(
        (r: { statLineId: string; posGroup: string }) => [
          r.statLineId,
          r.posGroup,
        ],
      ),
    );
    // Baseline producer writes a compact, source/hash-bound appearance array.
    const legacy: Map<string, number> = new Map(
      legacySource.ratings.map(
        (r: { statLineId: string; legacyDayRating: number }) => [
          r.statLineId,
          r.legacyDayRating,
        ],
      ),
    );
    if (
      positionSource.corpusSha256 !== inputs[0]!.sha256 ||
      legacySource.corpus.sha256 !== inputs[0]!.sha256
    )
      throw Error("Sidecars refer to a different source corpus");
    const acceptancePolicy = await read(values["acceptance-policy"]!);
    verifyImpactAcceptancePolicy(acceptancePolicy);
    const selection = values.selection ? await read(values.selection) : null;
    const selected = selection
      ? variants.find((v) => v.name === selection.chosen)
      : null;
    if (selection && (!selected || selection.phase !== "validation"))
      throw Error("Unknown frozen validation choice");
    const active = values.phase === "final" ? [selected!] : [...variants];
    const sourceFiles = [
      "scripts/src/commands/ratings/evaluate-player-day-impact.ts",
      "scripts/src/domains/ranking/player-day-impact.ts",
      "scripts/src/domains/ranking/player-day-impact-evaluation.ts",
      "scripts/src/runtime/RankingEngine/player-day-impact.js",
    ];
    const code = [];
    for (const path of sourceFiles)
      code.push({ path, sha256: sha(await readFile(path)) });
    if (
      selection &&
      (JSON.stringify(selection.code) !== JSON.stringify(code) ||
        JSON.stringify(selection.inputs) !== JSON.stringify(inputs.slice(0, 4)))
    )
      throw Error(
        "Final evaluation must use the frozen validation code and inputs",
      );
    const api = await loadPlayerDayImpact(),
      allCases = buildImpactEvaluationCases(corpus, positions);
    if (values.phase === "final") {
      const evaluationPath = join(
        dirname(resolve(values.selection!)),
        "evaluation.json",
      );
      const evaluationBytes = await readFile(evaluationPath);
      const valCases = allCases.filter((c) =>
        [2022, 2023, 2024].includes(Number(c.season.slice(0, 4))),
      );
      verifyImpactSelection(
        selection,
        evaluationBytes,
        valCases,
        variants.map((v) => v.name),
      );
      inputs.push({ path: evaluationPath, sha256: sha(evaluationBytes) });
    }
    const years = values.phase === "final" ? [2025, 2026] : [2022, 2023, 2024];
    const output = resolve(values.output);
    const binding = {
      version: "player-day-impact-experiment-run-v2",
      phase: values.phase,
      inputs,
      code,
      years,
      variants: active,
      policy: REVIEWED_PLAYER_DAY_IMPACT_POLICY,
      acceptancePolicy,
    };
    const bindingText = JSON.stringify(binding),
      bindingSha256 = sha(bindingText);
    if (values.resume) {
      if ((await readFile(join(output, "run.json"), "utf8")) !== bindingText)
        throw Error("Resume code/input/policy binding differs");
    } else {
      await mkdir(output, { recursive: false });
      await writeFile(join(output, "run.json"), bindingText, { flag: "wx" });
    }
    const targets = new Map(
      allCases
        .filter((c) => Number(c.season.slice(0, 4)) <= Math.max(...years))
        .map((c) => [
          c.key,
          actualLeaveOneOutImpact(c, REVIEWED_PLAYER_DAY_IMPACT_POLICY),
        ]),
    );
    const cases = allCases.filter((c) =>
      years.includes(Number(c.season.slice(0, 4))),
    );
    const methods = [
      ...active.map((v) => v.name),
      "legacy-calibrated",
      "equal-category-z",
      "zero",
    ];
    const predictions: ImpactEvaluationPrediction[] = [],
      fits: ImpactEvaluationFit[] = [],
      diagnostics = [];
    const examples = [];
    for (const year of years) {
      const cutoff = `${year}-07-01`,
        training = corpus.matchups.filter((m) => m.endDate < cutoff),
        trainingCases = allCases.filter((c) => c.endDate < cutoff),
        foldCases = cases.filter((c) => Number(c.season.slice(0, 4)) === year);
      const fitId = `historical-${year}`,
        trainingMatchupIds = training.map((m) => m.matchupId);
      const selectionIds =
        values.phase === "final"
          ? (selection.validationMatchupIds as string[])
          : [];
      fits.push({
        id: fitId,
        trainedBefore: cutoff,
        trainingMatchupIds,
        selectionMatchupIds: selectionIds,
      });
      const foldPath = join(output, `fold-${year}.json`);
      const files = await readdir(output);
      if (files.includes(`fold-${year}.json`)) {
        const checkpoint = JSON.parse(await readFile(foldPath, "utf8"));
        if (
          checkpoint.bindingSha256 !== bindingSha256 ||
          checkpoint.year !== year ||
          !Array.isArray(checkpoint.chunks)
        )
          throw Error("Completed fold binding differs");
        let offset = 0;
        for (const item of checkpoint.chunks) {
          const file = join(
              output,
              `year-${year}-chunk-${String(offset).padStart(6, "0")}.json`,
            ),
            bytes = await readFile(file);
          if (sha(bytes) !== item.sha256 || item.offset !== offset)
            throw Error("Completed checkpoint checksum differs");
          const count = Math.min(500, foldCases.length - offset),
            restored = verifyImpactCheckpoint(
              JSON.parse(bytes.toString()),
              bindingSha256,
              year,
              offset,
              foldCases.slice(offset, offset + count).map((c) => c.key),
              methods,
            );
          predictions.push(...restored.predictions);
          examples.push(...restored.examples);
          offset += count;
        }
        if (offset !== foldCases.length)
          throw Error("Incomplete completed fold");
        diagnostics.push(checkpoint.diagnostic);
        console.log(
          JSON.stringify({
            year,
            resumedCompletedFold: true,
            targetCases: offset,
          }),
        );
        continue;
      }
      const references = new Map<number, ReturnType<typeof simpleReference>>();
      for (const d of new Set(
        [...trainingCases, ...foldCases].map((c) => c.weekDays),
      ))
        references.set(d, simpleReference(training, d));
      const calibrations = new Map<
        string,
        ReturnType<typeof fitScalarImpactCalibration>
      >();
      for (const role of ["skater", "goalie"]) {
        const historical = trainingCases.filter(
          (c) =>
            c.appearance.role === role && targets.get(c.key)!.score !== null,
        );
        for (const kind of ["legacy", "simple"]) {
          const rows = historical.flatMap((c) => {
            const value =
              kind === "legacy"
                ? legacy.get(c.appearance.statLineId)
                : simpleScore(c, references.get(c.weekDays)!);
            return value === undefined || value === null
              ? []
              : [
                  {
                    value,
                    target: targets.get(c.key)!.score!,
                    endDate: c.endDate,
                  },
                ];
          });
          if (rows.length)
            calibrations.set(
              `${kind}|${role}`,
              fitScalarImpactCalibration(rows, cutoff),
            );
        }
      }
      const models = new Map<string, DayImpactReference>();
      for (const v of active) {
        const history = training.filter(
          (m) => m.endDate >= `${year - v.historyYears}-07-01`,
        );
        const model = api.fitContexts(history, {
          ...HISTORICAL_DAY_IMPACT_POLICY,
          trainedBefore: cutoff,
          backgroundWeighting: v.backgroundWeighting,
          countModel: v.countModel,
        });
        models.set(v.name, model);
      }
      const scoreCaches = new Map(
        [...models].map(([name]) => [
          name,
          new Map<string, ReturnType<typeof api.score>>(),
        ]),
      );
      let completed = 0;
      const chunkLedger: { offset: number; sha256: string }[] = [];
      while (
        files.includes(
          `year-${year}-chunk-${String(completed).padStart(6, "0")}.json`,
        )
      ) {
        const file = join(
            output,
            `year-${year}-chunk-${String(completed).padStart(6, "0")}.json`,
          ),
          bytes = await readFile(file),
          count = Math.min(500, foldCases.length - completed);
        if (count <= 0) throw Error("Extra checkpoint after fold completion");
        const restored = verifyImpactCheckpoint(
          JSON.parse(bytes.toString()),
          bindingSha256,
          year,
          completed,
          foldCases.slice(completed, completed + count).map((c) => c.key),
          methods,
        );
        predictions.push(...restored.predictions);
        examples.push(...restored.examples);
        chunkLedger.push({ offset: completed, sha256: sha(bytes) });
        completed += count;
      }
      let chunkOffset = completed,
        chunkPredictionStart = predictions.length,
        chunkExampleStart = examples.length;
      console.log(
        JSON.stringify({
          year,
          phase: values.phase,
          resumedCases: completed,
          totalCases: foldCases.length,
        }),
      );
      for (const c of foldCases.slice(completed)) {
        const appearance: DayImpactAppearance = {
          GP: 1,
          role: c.appearance.role,
          raw: { ...c.appearance.raw },
          availableFields: c.appearance.availableFields,
        };
        for (const [name, model] of models) {
          const cacheKey = JSON.stringify([
            appearance.GP,
            appearance.role,
            appearance.availableFields,
            appearance.raw,
            c.categories,
            c.weekDays,
            c.own.goalieMinimum,
          ]);
          const cache = scoreCaches.get(name)!;
          let rating = cache.get(cacheKey);
          if (!rating) {
            rating = api.score(appearance, model, {
              categories: [...c.categories],
              weekDays: c.weekDays,
              goalieMinimum: c.own.goalieMinimum,
              started: true,
            });
            cache.set(cacheKey, rating);
          }
          predictions.push({
            caseKey: c.key,
            method: name,
            fitId,
            score: rating.ifStarted,
            categoryContributions: rating.categoryContributions,
          });
          if (
            examples.length < 100 &&
            c.appearance.role === "goalie" &&
            rating.ifStarted !== null &&
            rating.ifStarted < 0
          )
            examples.push({
              season: c.season,
              appearance: c.appearance,
              prediction: rating,
              actual: targets.get(c.key),
            });
        }
        for (const [kind, method] of [
          ["legacy", "legacy-calibrated"],
          ["simple", "equal-category-z"],
        ]) {
          const value =
            kind === "legacy"
              ? legacy.get(c.appearance.statLineId)
              : simpleScore(c, references.get(c.weekDays)!);
          const cal = calibrations.get(`${kind}|${c.appearance.role}`);
          predictions.push({
            caseKey: c.key,
            method: method!,
            fitId,
            score:
              value === undefined || value === null || !cal
                ? null
                : cal.slope * value + cal.intercept,
          });
        }
        predictions.push({ caseKey: c.key, method: "zero", fitId, score: 0 });
        completed++;
        if (completed % 500 === 0 || completed === foldCases.length) {
          const payload = {
            version: "player-day-impact-prediction-checkpoint-v1",
            bindingSha256,
            year,
            offset: chunkOffset,
            caseKeys: foldCases.slice(chunkOffset, completed).map((c) => c.key),
            predictions: predictions.slice(chunkPredictionStart),
            examples: examples.slice(chunkExampleStart),
          };
          const bytes = JSON.stringify(payload),
            file = join(
              output,
              `year-${year}-chunk-${String(chunkOffset).padStart(6, "0")}.json`,
            );
          await writeFile(file, bytes, { flag: "wx" });
          chunkLedger.push({ offset: chunkOffset, sha256: sha(bytes) });
          chunkOffset = completed;
          chunkPredictionStart = predictions.length;
          chunkExampleStart = examples.length;
          console.log(
            JSON.stringify({
              year,
              phase: values.phase,
              completed,
              totalCases: foldCases.length,
              checkpoint: true,
            }),
          );
        }
      }
      const diagnostic = {
        year,
        trainingMatchups: training.length,
        targetCases: completed,
        calibrations: Object.fromEntries(calibrations),
        models: [...models].map(([name, m]) => ({
          name,
          provenance: m.provenance,
        })),
      };
      diagnostics.push(diagnostic);
      await writeFile(
        foldPath,
        JSON.stringify({
          version: "player-day-impact-completed-fold-v1",
          bindingSha256,
          year,
          chunks: chunkLedger,
          diagnostic,
        }),
        { flag: "wx" },
      );
      console.log(
        JSON.stringify({ year, targetCases: completed, models: models.size }),
      );
    }
    const evaluation = evaluatePlayerDayImpact({
      cases,
      matchups: corpus.matchups,
      fits,
      predictions,
      methods,
      referenceMethod: "legacy-calibrated",
      policy: REVIEWED_PLAYER_DAY_IMPACT_POLICY,
      bootstrapSamples: 1000,
      clusterUnit: "week",
    });
    const result = {
      phase: values.phase,
      inputs,
      code,
      diagnostics,
      ...evaluation,
    };
    for (const file of inputs)
      if (sha(await readFile(file.path)) !== file.sha256)
        throw Error("Input changed during experiment");
    for (const file of code)
      if (sha(await readFile(file.path)) !== file.sha256)
        throw Error("Code changed during experiment");
    await writeFile(
      resolve(output, "evaluation.json"),
      JSON.stringify(result, null, 2),
      { flag: "wx" },
    );
    await writeFile(
      resolve(output, "examples.json"),
      JSON.stringify(examples, null, 2),
      { flag: "wx" },
    );
    if (values.phase === "validation") {
      const acceptance = assessImpactAcceptance(
        evaluation as unknown as ImpactAcceptanceEvaluation,
        cases,
        active.map((v) => v.name),
        "validation",
      );
      await writeFile(
        join(output, "selection.json"),
        JSON.stringify(
          {
            phase: "validation",
            chosen: acceptance.chosen,
            acceptance,
            validationMatchupIds: [...new Set(cases.map((c) => c.matchupId))],
            evaluationSha256: sha(
              await readFile(join(output, "evaluation.json")),
            ),
            inputs,
            code,
          },
          null,
          2,
        ),
        { flag: "wx" },
      );
    } else {
      const primaryCases = cases.filter((c) => c.season === "2025-26"),
        primaryKeys = new Set(primaryCases.map((c) => c.key));
      const primary = evaluatePlayerDayImpact({
        cases: primaryCases,
        matchups: corpus.matchups,
        fits,
        predictions: predictions.filter((p) => primaryKeys.has(p.caseKey)),
        methods,
        referenceMethod: "legacy-calibrated",
        policy: REVIEWED_PLAYER_DAY_IMPACT_POLICY,
        bootstrapSamples: 1000,
        clusterUnit: "week",
      });
      const acceptance = assessImpactAcceptance(
        primary as unknown as ImpactAcceptanceEvaluation,
        primaryCases,
        active.map((v) => v.name),
        "final",
      );
      await writeFile(
        join(output, "primary-2025-confirmation.json"),
        JSON.stringify(
          {
            primarySeason: "2025-26",
            secondaryCannotRescue: true,
            acceptance,
            evaluation: primary,
          },
          null,
          2,
        ),
        { flag: "wx" },
      );
    }
    console.log(
      JSON.stringify({
        phase: values.phase,
        coverage: evaluation.coverage,
        methods: Object.fromEntries(
          Object.entries(evaluation.methods).map(([k, v]) => [
            k,
            (v as { overall: unknown }).overall,
          ]),
        ),
        paired: evaluation.paired,
      }),
    );
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
