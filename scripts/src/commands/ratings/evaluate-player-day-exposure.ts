import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import {
  loadPlayerDayImpact,
  HISTORICAL_DAY_IMPACT_POLICY,
  type DayImpactReference,
  type DayImpactAppearance,
} from "../../domains/ranking/player-day-impact";
import {
  attachPlayerDayCalendarExposure,
  CALENDAR_EXPOSURE_CHRONOLOGY_LIMITATION,
} from "../../domains/ranking/player-day-calendar-exposure";
import {
  buildImpactEvaluationCases,
  actualLeaveOneOutImpact,
  evaluatePlayerDayImpact,
  REVIEWED_PLAYER_DAY_IMPACT_POLICY,
  type ImpactMatchup,
  type ImpactEvaluationCase,
  type ImpactEvaluationPrediction,
  type ImpactEvaluationFit,
} from "../../domains/ranking/player-day-impact-evaluation";
import { verifyImpactCheckpoint } from "./evaluate-player-day-impact";
const digest = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
export const EXPOSURE_BANDWIDTHS = [0.15, 0.3, 0.6] as const;
const name = (h: number) => `schedule-h${h.toFixed(2)}`;
export function verifyExposureResearchPolicy(input: unknown) {
  const p = input as {
    version?: string;
    bandwidths?: number[];
    contextModel?: string;
    countModel?: string;
    backgroundWeighting?: string;
    selection?: {
      years?: number[];
      minimumCoverage?: number;
      minimumRoleCoverage?: number;
      researchChoiceOnly?: boolean;
    };
    diagnostic?: {
      years?: number[];
      confirmation?: boolean;
      selectedBandwidthOnly?: boolean;
    };
  };
  if (
    !p ||
    p.version !== "player-day-exposure-iteration-v1" ||
    JSON.stringify(p.bandwidths) !== JSON.stringify(EXPOSURE_BANDWIDTHS) ||
    p.contextModel !== "schedule-kernel" ||
    p.countModel !== "empirical" ||
    p.backgroundWeighting !== "side-week" ||
    JSON.stringify(p.selection?.years) !== JSON.stringify([2022, 2023, 2024]) ||
    p.selection?.minimumCoverage !== 0.95 ||
    p.selection.minimumRoleCoverage !== 0.95 ||
    p.selection.researchChoiceOnly !== true ||
    JSON.stringify(p.diagnostic?.years) !== JSON.stringify([2025, 2026]) ||
    p.diagnostic?.confirmation !== false ||
    p.diagnostic.selectedBandwidthOnly !== true
  )
    throw Error("Unknown frozen exposure research policy");
}
type MetricEvaluation = {
  coverage: { requested: number; common: number };
  commonCaseKeys: readonly string[];
  methods: Record<string, { overall: { n: number; mse: number | null } }>;
};
export function chooseExposureResearchCandidate(
  e: MetricEvaluation,
  cases: readonly Pick<ImpactEvaluationCase, "key" | "appearance">[],
  methods: readonly string[],
) {
  const known = new Map(cases.map((c) => [c.key, c]));
  if (
    known.size !== cases.length ||
    e.coverage.requested !== cases.length ||
    new Set(e.commonCaseKeys).size !== e.commonCaseKeys.length ||
    e.commonCaseKeys.length !== e.coverage.common ||
    e.commonCaseKeys.some((k) => !known.has(k))
  )
    throw Error("Research selection cohort mismatch");
  const common = new Set(e.commonCaseKeys),
    requested: Record<string, number> = {},
    supported: Record<string, number> = {};
  for (const c of cases) {
    requested[c.appearance.role] = (requested[c.appearance.role] ?? 0) + 1;
    if (common.has(c.key))
      supported[c.appearance.role] = (supported[c.appearance.role] ?? 0) + 1;
  }
  const coverage = {
      overall: cases.length ? common.size / cases.length : 0,
      roles: Object.fromEntries(
        Object.entries(requested).map(([role, n]) => [
          role,
          (supported[role] ?? 0) / n,
        ]),
      ),
    },
    eligible =
      coverage.overall >= 0.95 &&
      Object.values(coverage.roles).every((x) => x >= 0.95);
  const ranking = methods
    .map((method) => {
      const m = e.methods[method]?.overall;
      if (
        !m ||
        m.n !== common.size ||
        m.mse === null ||
        !Number.isFinite(m.mse) ||
        m.mse < 0
      )
        throw Error("Invalid research selection metric");
      return { method, mse: m.mse, coverageEligible: eligible };
    })
    .sort((a, b) => a.mse - b.mse || a.method.localeCompare(b.method));
  return {
    version: "player-day-exposure-research-choice-v1",
    coverage,
    ranking,
    chosen: ranking.find((r) => r.coverageEligible)?.method ?? null,
    confirmation: false,
    productionApproved: false,
  };
}
async function main() {
  const { values } = parseArgs({
    options: {
      corpus: { type: "string" },
      positions: { type: "string" },
      calendar: { type: "string" },
      "old-validation": { type: "string" },
      "old-diagnostic": { type: "string" },
      policy: {
        type: "string",
        default:
          ".local-data/player-day-impact-20261019/exposure-policy-v1.json",
      },
      output: { type: "string" },
      phase: { type: "string", default: "validation" },
      selection: { type: "string" },
      resume: { type: "boolean", default: false },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "Offline schedule-exposure research iteration. --corpus JSON --positions JSON --calendar JSON --old-validation DIRECTORY --old-diagnostic DIRECTORY --output NEW_DIRECTORY [--policy JSON] [--phase validation|diagnostic --selection VALIDATION/selection.json] [--resume]. Three frozen bandwidths .15/.30/.60; diagnostic2025 is already inspected, never untouched confirmation. Frozen legacy/old empirical/z reused by exact identity; new full-coverage and frozen-old-common comparisons remain separate. No production writes/network.",
    );
    return;
  }
  if (
    !values.corpus ||
    !values.positions ||
    !values.calendar ||
    !values["old-validation"] ||
    !values["old-diagnostic"] ||
    !values.output ||
    !["validation", "diagnostic"].includes(values.phase!) ||
    (values.phase === "diagnostic" && !values.selection)
  )
    throw Error("Explicit offline research inputs/phase/output required");
  const inputs: { path: string; sha256: string }[] = [],
    inputMap = new Map<string, string>();
  async function bytes(path: string) {
    const absolute = resolve(path),
      b = await readFile(absolute),
      sha = digest(b);
    if (inputMap.has(absolute) && inputMap.get(absolute) !== sha)
      throw Error("Input changed while loading");
    if (!inputMap.has(absolute)) {
      inputs.push({ path: absolute, sha256: sha });
      inputMap.set(absolute, sha);
    }
    return b;
  }
  const corpusBytes = await bytes(values.corpus),
    corpus = JSON.parse(corpusBytes.toString()) as {
      matchups: ImpactMatchup[];
    },
    positions = JSON.parse((await bytes(values.positions)).toString()),
    calendar = JSON.parse((await bytes(values.calendar)).toString()),
    policy = JSON.parse((await bytes(values.policy!)).toString());
  verifyExposureResearchPolicy(policy);
  if (
    positions.corpusSha256 !== digest(corpusBytes) ||
    calendar.corpus?.sha256 !== digest(corpusBytes)
  )
    throw Error("Exposure/position sidecar corpus hash differs");
  const contexts = attachPlayerDayCalendarExposure(corpus.matchups, calendar),
    byMatchup = new Map(contexts.map((m) => [m.matchupId, m])),
    allCases = buildImpactEvaluationCases(
      corpus,
      Object.fromEntries(
        positions.appearances.map(
          (r: { statLineId: string; posGroup: string }) => [
            r.statLineId,
            r.posGroup,
          ],
        ),
      ),
    ),
    caseByKey = new Map(allCases.map((c) => [c.key, c]));
  const old = new Map<string, ImpactEvaluationPrediction>(),
    oldCommon = new Set<string>(),
    oldBindings: unknown[] = [];
  for (const directory of [
    values["old-validation"],
    values["old-diagnostic"],
  ]) {
    const dir = resolve(directory),
      runBytes = await bytes(join(dir, "run.json")),
      run = JSON.parse(runBytes.toString()),
      binding = digest(runBytes),
      report = JSON.parse(
        (await bytes(join(dir, "evaluation.json"))).toString(),
      );
    if (
      run.inputs[0]?.sha256 !== digest(corpusBytes) ||
      run.inputs[1]?.sha256 !== inputMap.get(resolve(values.positions))
    )
      throw Error("Frozen old run uses different corpus/positions");
    for (const file of run.inputs)
      if (digest(await bytes(file.path)) !== file.sha256)
        throw Error("Frozen old producer input changed");
    for (const key of report.commonCaseKeys) {
      if (!caseByKey.has(key)) throw Error("Unknown frozen old common case");
      oldCommon.add(key);
    }
    const methods = Object.keys(report.methods);
    let count = 0;
    for (const year of run.years) {
      const fold = JSON.parse(
          (await bytes(join(dir, `fold-${year}.json`))).toString(),
        ),
        fc = allCases.filter((c) => Number(c.season.slice(0, 4)) === year);
      if (fold.bindingSha256 !== binding || fold.year !== year)
        throw Error("Frozen old fold binding differs");
      let offset = 0;
      for (const item of fold.chunks) {
        const b = await bytes(
          join(
            dir,
            `year-${year}-chunk-${String(offset).padStart(6, "0")}.json`,
          ),
        );
        if (digest(b) !== item.sha256 || item.offset !== offset)
          throw Error("Frozen old chunk checksum differs");
        const n = Math.min(500, fc.length - offset),
          restored = verifyImpactCheckpoint(
            JSON.parse(b.toString()),
            binding,
            year,
            offset,
            fc.slice(offset, offset + n).map((c) => c.key),
            methods,
          );
        for (const p of restored.predictions)
          if (
            [
              "empirical-history",
              "legacy-calibrated",
              "equal-category-z",
            ].includes(p.method)
          ) {
            const key = `${p.method}|${p.caseKey}`;
            if (old.has(key)) throw Error("Duplicated frozen prediction");
            old.set(key, p);
            count++;
          }
        offset += n;
      }
      if (offset !== fc.length) throw Error("Incomplete frozen old cohort");
    }
    oldBindings.push({
      directory: dir,
      runSha256: binding,
      code: run.code,
      producerInputs: run.inputs,
      predictions: count,
      codeInterpretation:
        "Historical producer hashes preserved; current additive kernel code is not claimed to have produced these frozen scores.",
    });
  }
  const codePaths = [
      "scripts/src/commands/ratings/evaluate-player-day-exposure.ts",
      "scripts/src/commands/ratings/evaluate-player-day-impact.ts",
      "scripts/src/domains/ranking/player-day-impact-evaluation.ts",
      "scripts/src/domains/ranking/player-day-calendar-exposure.ts",
      "scripts/src/domains/ranking/player-day-impact.ts",
      "scripts/src/runtime/RankingEngine/player-day-impact.js",
    ],
    code = [];
  for (const path of codePaths)
    code.push({ path, sha256: digest(await readFile(path)) });
  let chosen: string | null = null,
    selection: any = null;
  if (values.phase === "diagnostic") {
    selection = JSON.parse((await bytes(values.selection!)).toString());
    const evaluationBytes = await bytes(
        join(dirname(resolve(values.selection!)), "evaluation.json"),
      ),
      prior = JSON.parse(evaluationBytes.toString());
    if (
      selection.phase !== "validation" ||
      selection.evaluationSha256 !== digest(evaluationBytes) ||
      JSON.stringify(selection.code) !== JSON.stringify(code)
    )
      throw Error("Diagnostic frozen research selection/code differs");
    const originalInputs = inputs.filter(
      (f) =>
        f.path !== resolve(values.selection!) &&
        f.path !== join(dirname(resolve(values.selection!)), "evaluation.json"),
    );
    if (JSON.stringify(selection.inputs) !== JSON.stringify(originalInputs))
      throw Error("Diagnostic frozen research inputs differ");
    const valCases = allCases.filter((c) =>
        [2022, 2023, 2024].includes(Number(c.season.slice(0, 4))),
      ),
      decision = chooseExposureResearchCandidate(
        prior,
        valCases,
        EXPOSURE_BANDWIDTHS.map(name),
      );
    if (
      !decision.chosen ||
      selection.chosen !== decision.chosen ||
      JSON.stringify(selection.choice) !== JSON.stringify(decision)
    )
      throw Error(
        "Diagnostic choice differs from coverage-eligible validation research choice",
      );
    chosen = decision.chosen;
  }
  const active = EXPOSURE_BANDWIDTHS.filter(
      (h) => values.phase === "validation" || name(h) === chosen,
    ),
    years = values.phase === "validation" ? [2022, 2023, 2024] : [2025, 2026],
    cases = allCases.filter((c) =>
      years.includes(Number(c.season.slice(0, 4))),
    ),
    methods = [...active.map(name), "legacy-calibrated"],
    output = resolve(values.output),
    bindingObject = {
      version: "player-day-exposure-run-v1",
      phase: values.phase,
      inputs,
      code,
      years,
      bandwidths: active,
      policy,
      oldBindings,
    },
    bindingText = JSON.stringify(bindingObject),
    binding = digest(bindingText);
  if (values.resume) {
    if ((await readFile(join(output, "run.json"), "utf8")) !== bindingText)
      throw Error("Exposure resume code/input/policy binding differs");
  } else {
    await mkdir(output, { recursive: false });
    await writeFile(join(output, "run.json"), bindingText, { flag: "wx" });
  }
  const api = await loadPlayerDayImpact(),
    predictions: ImpactEvaluationPrediction[] = [],
    fits: ImpactEvaluationFit[] = [],
    diagnostics: unknown[] = [];
  const contextSummaries = new Map<
    string,
    { key: string; year: number; [key: string]: unknown }
  >();
  const restoreExamples = (examples: unknown[]) => {
    for (const value of examples) {
      const record = value as {
        key: string;
        year: number;
        [key: string]: unknown;
      };
      if (typeof record?.key !== "string" || !Number.isInteger(record.year))
        throw Error("Malformed exposure context summary");
      contextSummaries.set(record.key, record);
    }
  };
  for (const year of years) {
    const cutoff = `${year}-07-01`,
      training = contexts.filter((m) => m.endDate < cutoff),
      fc = cases.filter((c) => Number(c.season.slice(0, 4)) === year),
      fitId = `historical-${year}`,
      foldPath = join(output, `fold-${year}.json`),
      files = await readdir(output);
    fits.push({
      id: fitId,
      trainedBefore: cutoff,
      trainingMatchupIds: training.map((m) => m.matchupId),
      selectionMatchupIds:
        values.phase === "diagnostic" ? selection.validationMatchupIds : [],
    });
    if (files.includes(`fold-${year}.json`)) {
      const fold = JSON.parse(await readFile(foldPath, "utf8"));
      if (fold.bindingSha256 !== binding || fold.year !== year)
        throw Error("Exposure completed fold binding differs");
      let offset = 0;
      for (const item of fold.chunks) {
        const b = await readFile(
          join(
            output,
            `year-${year}-chunk-${String(offset).padStart(6, "0")}.json`,
          ),
        );
        if (digest(b) !== item.sha256 || item.offset !== offset)
          throw Error("Exposure completed chunk checksum differs");
        const n = Math.min(500, fc.length - offset),
          restored = verifyImpactCheckpoint(
            JSON.parse(b.toString()),
            binding,
            year,
            offset,
            fc.slice(offset, offset + n).map((c) => c.key),
            methods,
          );
        predictions.push(...restored.predictions);
        restoreExamples(restored.examples);
        offset += n;
      }
      if (offset !== fc.length)
        throw Error("Incomplete exposure completed fold");
      diagnostics.push(fold.diagnostic);
      console.log(
        JSON.stringify({ year, resumedCompletedFold: true, cases: offset }),
      );
      continue;
    }
    const models = new Map<string, DayImpactReference>();
    for (const h of active) {
      const model = api.fitContexts(training, {
        ...HISTORICAL_DAY_IMPACT_POLICY,
        trainedBefore: cutoff,
        countModel: "empirical",
        backgroundWeighting: "side-week",
        contextModel: "schedule-kernel",
        exposureBandwidth: h,
      });
      models.set(name(h), model);
    }
    const caches = new Map(
        [...models].map(([n]) => [
          n,
          new Map<string, ReturnType<typeof api.score>>(),
        ]),
      ),
      ledger: { offset: number; sha256: string }[] = [];
    let completed = 0;
    while (
      files.includes(
        `year-${year}-chunk-${String(completed).padStart(6, "0")}.json`,
      )
    ) {
      const b = await readFile(
          join(
            output,
            `year-${year}-chunk-${String(completed).padStart(6, "0")}.json`,
          ),
        ),
        n = Math.min(500, fc.length - completed);
      if (n <= 0) throw Error("Unexpected extra exposure chunk");
      const restored = verifyImpactCheckpoint(
        JSON.parse(b.toString()),
        binding,
        year,
        completed,
        fc.slice(completed, completed + n).map((c) => c.key),
        methods,
      );
      predictions.push(...restored.predictions);
      restoreExamples(restored.examples);
      ledger.push({ offset: completed, sha256: digest(b) });
      completed += n;
    }
    let offset = completed,
      predictionStart = predictions.length,
      summaryStart = contextSummaries.size;
    console.log(
      JSON.stringify({
        phase: values.phase,
        year,
        resumed: completed,
        total: fc.length,
        models: models.size,
      }),
    );
    for (const c of fc.slice(completed)) {
      const exposure = byMatchup.get(c.matchupId)!.nhlGamesPerTeam,
        appearance: DayImpactAppearance = {
          GP: 1,
          role: c.appearance.role,
          raw: { ...c.appearance.raw },
          availableFields: c.appearance.availableFields,
        };
      for (const [method, model] of models) {
        const key = JSON.stringify([
            appearance.GP,
            appearance.role,
            appearance.availableFields,
            appearance.raw,
            c.categories,
            c.weekDays,
            c.own.goalieMinimum,
            exposure,
          ]),
          cache = caches.get(method)!;
        let rating = cache.get(key);
        if (!rating) {
          rating = api.score(appearance, model, {
            categories: [...c.categories],
            weekDays: c.weekDays,
            goalieMinimum: c.own.goalieMinimum,
            started: true,
            nhlGamesPerTeam: exposure,
          });
          cache.set(key, rating);
        }
        if (rating.context) {
          const key = `${year}|${method}|${c.weekId}`;
          if (!contextSummaries.has(key)) {
            const { sources, ...summary } = rating.context;
            void sources;
            contextSummaries.set(key, {
              key,
              year,
              method,
              weekId: c.weekId,
              weekDays: c.weekDays,
              ...summary,
            });
          }
        }
        predictions.push({
          caseKey: c.key,
          method,
          fitId,
          score: rating.ifStarted,
          categoryContributions: rating.categoryContributions,
        });
      }
      const baseline = old.get(`legacy-calibrated|${c.key}`);
      if (!baseline) throw Error("Frozen legacy prediction missing");
      predictions.push({ ...baseline, fitId });
      completed++;
      if (completed % 500 === 0 || completed === fc.length) {
        const checkpoint = {
            version: "player-day-impact-prediction-checkpoint-v1",
            bindingSha256: binding,
            year,
            offset,
            caseKeys: fc.slice(offset, completed).map((c) => c.key),
            predictions: predictions.slice(predictionStart),
            examples: [...contextSummaries.values()].slice(summaryStart),
          },
          text = JSON.stringify(checkpoint);
        await writeFile(
          join(
            output,
            `year-${year}-chunk-${String(offset).padStart(6, "0")}.json`,
          ),
          text,
          { flag: "wx" },
        );
        ledger.push({ offset, sha256: digest(text) });
        offset = completed;
        predictionStart = predictions.length;
        summaryStart = contextSummaries.size;
        console.log(
          JSON.stringify({
            phase: values.phase,
            year,
            completed,
            total: fc.length,
            checkpoint: true,
          }),
        );
      }
    }
    const diagnostic = {
      year,
      trainingMatchups: training.length,
      cases: completed,
      models: [...models].map(([method, m]) => ({
        method,
        provenance: m.provenance,
      })),
    };
    diagnostics.push(diagnostic);
    await writeFile(
      foldPath,
      JSON.stringify({
        version: "player-day-exposure-completed-fold-v1",
        bindingSha256: binding,
        year,
        chunks: ledger,
        diagnostic,
      }),
      { flag: "wx" },
    );
    if (values.phase === "diagnostic" && year === 2026)
      await writeFile(
        join(output, "research-reference-2026.json"),
        JSON.stringify({
          version: "player-day-exposure-research-reference-v1",
          bindingSha256: binding,
          method: chosen,
          model: models.get(chosen!),
        }),
        { flag: "wx" },
      );
  }
  function evaluate(
    selectedCases: ImpactEvaluationCase[],
    selectedPredictions: ImpactEvaluationPrediction[],
    selectedMethods: string[],
  ) {
    return evaluatePlayerDayImpact({
      cases: selectedCases,
      matchups: corpus.matchups,
      fits,
      predictions: selectedPredictions,
      methods: selectedMethods,
      referenceMethod: "legacy-calibrated",
      policy: REVIEWED_PLAYER_DAY_IMPACT_POLICY,
      bootstrapSamples: 1000,
      clusterUnit: "week",
    });
  }
  const primary = evaluate(cases, predictions, methods),
    shadowCases = cases.filter((c) => oldCommon.has(c.key)),
    shadowKeys = new Set(shadowCases.map((c) => c.key)),
    shadowPredictions = predictions.filter((p) => shadowKeys.has(p.caseKey));
  for (const c of shadowCases)
    for (const oldMethod of ["empirical-history", "equal-category-z"]) {
      const p = old.get(`${oldMethod}|${c.key}`);
      if (!p) throw Error("Frozen old-common comparator missing");
      shadowPredictions.push({
        ...p,
        method:
          oldMethod === "empirical-history"
            ? "old-empirical-history"
            : oldMethod,
      });
    }
  const shadow = shadowCases.length
      ? evaluate(shadowCases, shadowPredictions, [
          ...methods,
          "old-empirical-history",
          "equal-category-z",
        ])
      : null,
    outsideCases = cases.filter((c) => !oldCommon.has(c.key)),
    outsideKeys = new Set(outsideCases.map((c) => c.key)),
    outside = outsideCases.length
      ? evaluate(
          outsideCases,
          predictions.filter((p) => outsideKeys.has(p.caseKey)),
          methods,
        )
      : null;
  const perSeason: Record<string, unknown> = {};
  for (const year of years) {
    const rows = cases.filter((c) => Number(c.season.slice(0, 4)) === year),
      keys = new Set(rows.map((c) => c.key));
    if (rows.length)
      perSeason[year] = evaluate(
        rows,
        predictions.filter((p) => keys.has(p.caseKey)),
        methods,
      );
  }
  for (const file of inputs)
    if (digest(await readFile(file.path)) !== file.sha256)
      throw Error("Exposure input changed during experiment");
  for (const file of code)
    if (digest(await readFile(file.path)) !== file.sha256)
      throw Error("Exposure code changed during experiment");
  const result = {
    phase: values.phase,
    confirmation: false,
    originalConfirmationFailed: true,
    scheduleVintaging: CALENDAR_EXPOSURE_CHRONOLOGY_LIMITATION,
    inputs,
    code,
    researchPolicy: policy,
    oldBindings,
    diagnostics,
    exposureContexts: [...contextSummaries.values()],
    interpretation: [
      "2025 was already inspected; all new results are retrospective diagnostic iteration, never a rescued untouched confirmation.",
      "Outside-old-common comparisons may contain only one rare calendar week: a degenerate bootstrap interval is not independent generalization evidence.",
      CALENDAR_EXPOSURE_CHRONOLOGY_LIMITATION,
    ],
    ...primary,
    version: "player-day-exposure-research-evaluation-v1",
    oldCommon: shadow,
    outsideFrozenOldCommon: outside,
    perSeason,
  };
  await writeFile(
    join(output, "evaluation.json"),
    JSON.stringify(result, null, 2),
    { flag: "wx" },
  );
  if (values.phase === "validation") {
    const choice = chooseExposureResearchCandidate(
      primary as unknown as MetricEvaluation,
      cases,
      active.map(name),
    );
    await writeFile(
      join(output, "selection.json"),
      JSON.stringify(
        {
          version: "player-day-exposure-research-selection-v1",
          phase: "validation",
          chosen: choice.chosen,
          choice,
          validationMatchupIds: [...new Set(cases.map((c) => c.matchupId))],
          evaluationSha256: digest(
            await readFile(join(output, "evaluation.json")),
          ),
          inputs,
          code,
          confirmation: false,
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
      confirmation: false,
      coverage: primary.coverage,
      methods: Object.fromEntries(
        Object.entries(primary.methods).map(([k, v]) => [
          k,
          (v as { overall: unknown }).overall,
        ]),
      ),
      outsideFrozenOldCommon: outside?.coverage ?? null,
    }),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
