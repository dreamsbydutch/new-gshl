import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  nonlinearShotFeatures,
  NHL_NONLINEAR_SHOT_FEATURES,
} from "../../runtime/nhl-shot-nonlinear";
import {
  SHOT_FEATURES,
  type ShotTrainingRow,
} from "../../runtime/nhl-shot-quality";
export type RetrospectivePrediction = {
  gameId: number;
  eventId: number;
  date: string;
  goal: number;
  outerFold: number;
  trainingGameIdsSha256: string;
  foldFitSha256: string;
  baseline: number;
  candidate: number;
};
type Metrics = {
  shots: number;
  actualGoals: number;
  expectedGoals: number;
  brier: number;
  logLoss: number;
};
export type RetrospectiveShotSource = {
  season: number;
  gameType: 2 | 3;
  rowsSha256: string;
  rows: ShotTrainingRow[];
};
type GameError = {
  gameId: number;
  shots: number;
  baselineBrierSum: number;
  candidateBrierSum: number;
  baselineLogLossSum: number;
  candidateLogLossSum: number;
};
type Analysis = {
  version: string;
  season: number;
  gameType: 2 | 3;
  policySha256: string;
  sourceOnly?: boolean;
  sourceMetadataSha256?: string | null;
  rowsSha256: string;
  foldManifestSha256: string;
  foldFitManifestSha256: string;
  baseline: Metrics;
  candidate: Metrics;
  pairedTestGames: GameError[];
};
type Fold = {
  outerFold: number;
  trainingGameIds: number[];
  heldOutGameIds: number[];
  trainingGameIdsSha256: string;
  heldOutGameIdsSha256: string;
  innerTrainEnd: string;
  innerValidationEnd: string;
  innerTrainingGameIds: number[];
  innerValidationGameIds: number[];
};
type Fit = Fold & {
  foldFitSha256: string;
  gbModelSha256: string;
  glmModelSha256: string;
};
type TreeNode = {
  featureIndex: number;
  threshold: number;
  left: number;
  right: number;
  leaf: number;
  value: number;
  missingLeft: number;
};
type Provenance = {
  outerFold: number;
  foldFitSha256: string;
  trainingGameIdsSha256: string;
  sourceRowsSha256: string;
  trainedBefore?: string;
  testFrom?: string;
};
type GbModel = {
  version: string;
  featureNames: string[];
  initialLogOdds: number;
  trees: TreeNode[][];
  provenance: Provenance;
};
type GlmModel = {
  version: string;
  coefficients: number[];
  converged: boolean;
  provenance: Provenance;
};

/** Offline, hash-bound all-row inference and excluded-game audit. Never forward validation. */
export async function loadAuditedRetrospectiveShots(
  directory: string,
  rowsPath: string,
) {
  const read = async <T>(path: string): Promise<T> =>
    JSON.parse(await readFile(path, "utf8")) as T;
  const hash = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const fileHash = async (path: string) =>
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  const [source, analysis, manifest, fits, predictions] = await Promise.all([
    read<RetrospectiveShotSource>(rowsPath),
    read<Analysis>(`${directory}/analysis.json`),
    read<{
      season: number;
      rowsSha256: string;
      policySha256: string;
      folds: Fold[];
    }>(`${directory}/fold-manifest.json`),
    read<{ folds: Fit[] }>(`${directory}/fold-fit-manifest.json`),
    read<RetrospectivePrediction[]>(`${directory}/predictions.json`),
  ]);
  if (
    analysis.version !== "nhl-retrospective-crossfit-experiment-v1" ||
    source.season !== analysis.season ||
    source.season !== manifest.season ||
    source.gameType !== analysis.gameType ||
    ![2, 3].includes(source.gameType) ||
    manifest.rowsSha256 !== analysis.rowsSha256 ||
    manifest.policySha256 !== analysis.policySha256 ||
    manifest.folds.length !== 5 ||
    fits.folds.length !== 5
  )
    throw Error("Wrong retrospective experiment/fold schema");
  if (
    (await fileHash(`${directory}/frozen-policy.md`)) !== analysis.policySha256
  )
    throw Error("Frozen policy bytes differ from recorded protocol");
  if (
    hash(source.rows) !== analysis.rowsSha256 ||
    source.rowsSha256 !== analysis.rowsSha256 ||
    source.rows.length !== predictions.length ||
    analysis.foldManifestSha256 !==
      (await fileHash(`${directory}/fold-manifest.json`)) ||
    analysis.foldFitManifestSha256 !==
      (await fileHash(`${directory}/fold-fit-manifest.json`))
  )
    throw Error("Manifest/source binding mismatch");
  const identities = new Set<string>();
  const rowDates = new Map<number, string>();
  if (!source.rows.length) throw Error("Empty retrospective source");
  for (const row of source.rows) {
    const identity = `${row.gameId}:${row.eventId}`;
    if (
      identities.has(identity) ||
      !Number.isSafeInteger(row.gameId) ||
      !Number.isSafeInteger(row.eventId) ||
      ![0, 1].includes(row.goal) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !Number.isFinite(Date.parse(row.date)) ||
      new Date(row.date).toISOString().slice(0, 10) !== row.date ||
      (rowDates.has(row.gameId) && rowDates.get(row.gameId) !== row.date)
    )
      throw Error("Duplicate event or conflicting game dates");
    identities.add(identity);
    rowDates.set(row.gameId, row.date);
  }
  const dates = new Map(source.rows.map((row) => [row.gameId, row.date]));
  const gameIds = [...dates.keys()].sort((a, b) => a - b);
  const assigned = (id: number) =>
    parseInt(
      createHash("sha256")
        .update(`${source.season}:${id}:retrospective-v1:14731`)
        .digest("hex")
        .slice(0, 8),
      16,
    ) % 5;
  for (let fold = 0; fold < 5; fold++) {
    const plan = manifest.folds[fold],
      fit = fits.folds[fold];
    if (plan.outerFold !== fold || fit.outerFold !== fold)
      throw Error("Fold identities differ");
    const train = gameIds.filter((id) => assigned(id) !== fold),
      held = gameIds.filter((id) => assigned(id) === fold);
    // Python's sorted numeric identities and canonical compact JSON match Node here.
    for (const [key, expected] of [
      ["trainingGameIds", train],
      ["heldOutGameIds", held],
    ] as const) {
      if (
        JSON.stringify(plan[key]) !== JSON.stringify(expected) ||
        JSON.stringify(fit[key]) !== JSON.stringify(expected) ||
        hash(expected) !== plan[`${key}Sha256`] ||
        hash(expected) !== fit[`${key}Sha256`]
      )
        throw Error("Outer fold assignment/hash mismatch");
    }
    const trainDates = [...new Set(train.map((id) => dates.get(id)))].sort();
    const before = trainDates[Math.floor(trainDates.length * 0.4)],
      until = trainDates[Math.floor(trainDates.length * 0.6)];
    if (
      plan.innerTrainEnd !== before ||
      plan.innerValidationEnd !== until ||
      fit.innerTrainEnd !== before ||
      fit.innerValidationEnd !== until
    )
      throw Error("Inner chronology differs");
    for (const [key, ids] of [
      ["innerTrainingGameIds", train.filter((id) => dates.get(id)! < before)],
      [
        "innerValidationGameIds",
        train.filter(
          (id) => dates.get(id)! >= before && dates.get(id)! < until,
        ),
      ],
    ] as const)
      if (
        JSON.stringify(plan[key]) !== JSON.stringify(ids) ||
        JSON.stringify(fit[key]) !== JSON.stringify(ids)
      )
        throw Error("Inner split leaks or differs");
  }
  const models = await Promise.all(
    fits.folds.map(async (fit) => {
      const gbPath = `${directory}/folds/gb-fold-${fit.outerFold}.json`,
        glmPath = `${directory}/folds/glm-fold-${fit.outerFold}.json`;
      if (
        (await fileHash(gbPath)) !== fit.gbModelSha256 ||
        (await fileHash(glmPath)) !== fit.glmModelSha256
      )
        throw Error("Model hash mismatch");
      const [gb, glm] = await Promise.all([
        read<GbModel>(gbPath),
        read<GlmModel>(glmPath),
      ]);
      if (
        gb.version !== "nhl-shot-nonlinear-crossfit-research-v1" ||
        glm.version !== "nhl-shot-linear-crossfit-research-v1"
      )
        throw Error("Wrong crossfit schema");
      for (const model of [gb, glm])
        if (
          "trainedBefore" in model.provenance ||
          "testFrom" in model.provenance
        )
          throw Error("Retrospective model fakes chronological provenance");
      if (
        JSON.stringify(gb.featureNames) !==
          JSON.stringify(NHL_NONLINEAR_SHOT_FEATURES) ||
        !Number.isFinite(gb.initialLogOdds) ||
        !Array.isArray(gb.trees) ||
        !gb.trees.length ||
        !glm.converged ||
        glm.coefficients.length !== 16 ||
        SHOT_FEATURES.some((_, i) => !Number.isFinite(glm.coefficients[i]))
      )
        throw Error("Malformed crossfit model");
      for (const model of [gb, glm])
        if (
          model.provenance.outerFold !== fit.outerFold ||
          model.provenance.foldFitSha256 !== fit.foldFitSha256 ||
          model.provenance.trainingGameIdsSha256 !==
            fit.trainingGameIdsSha256 ||
          model.provenance.sourceRowsSha256 !== analysis.rowsSha256
        )
          throw Error("Crossfit model provenance differs");
      for (const tree of gb.trees) {
        if (!Array.isArray(tree) || !tree.length) throw Error("Empty tree");
        const visited = new Set<number>(),
          active = new Set<number>();
        const visit = (index: number): void => {
          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= tree.length ||
            active.has(index) ||
            visited.has(index)
          )
            throw Error("Malformed tree graph");
          active.add(index);
          visited.add(index);
          const n = tree[index];
          if (
            !n ||
            ![n.threshold, n.value].every(Number.isFinite) ||
            ![0, 1].includes(n.leaf) ||
            ![0, 1].includes(n.missingLeft)
          )
            throw Error("Malformed tree scalar");
          if (!n.leaf) {
            if (
              !Number.isInteger(n.featureIndex) ||
              n.featureIndex < 0 ||
              n.featureIndex >= 21
            )
              throw Error("Invalid tree feature");
            visit(n.left);
            visit(n.right);
          }
          active.delete(index);
        };
        visit(0);
        if (visited.size !== tree.length) throw Error("Unreachable tree node");
      }
      return {
        gb,
        glm,
        train: new Set(fit.trainingGameIds),
        held: new Set(fit.heldOutGameIds),
      };
    }),
  );
  const logistic = (x: number) =>
    x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
  let maxGb = 0,
    maxGlm = 0;
  const recomputedGames = new Map<number, GameError>();
  const recomputed = {
    baseline: {
      shots: 0,
      actualGoals: 0,
      expectedGoals: 0,
      brier: 0,
      logLoss: 0,
    },
    candidate: {
      shots: 0,
      actualGoals: 0,
      expectedGoals: 0,
      brier: 0,
      logLoss: 0,
    },
  };
  for (let i = 0; i < source.rows.length; i++) {
    const row = source.rows[i],
      p = predictions[i];
    if (
      !Number.isInteger(p.outerFold) ||
      p.outerFold < 0 ||
      p.outerFold >= 5 ||
      ![p.baseline, p.candidate].every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      )
    )
      throw Error("Invalid retained prediction");
    const fold = p.outerFold,
      fit = fits.folds[fold],
      m = models[fold];
    if (
      row.gameId !== p.gameId ||
      row.eventId !== p.eventId ||
      row.date !== p.date ||
      row.goal !== p.goal ||
      m.train.has(row.gameId) ||
      !m.held.has(row.gameId) ||
      p.trainingGameIdsSha256 !== fit.trainingGameIdsSha256 ||
      p.foldFitSha256 !== fit.foldFitSha256
    )
      throw Error("Observation/model isolation mismatch");
    const x = nonlinearShotFeatures(row);
    let logit = m.gb.initialLogOdds;
    for (const tree of m.gb.trees) {
      let index = 0,
        steps = 0;
      while (!tree[index].leaf) {
        if (++steps > tree.length) throw Error("Tree cycle");
        const n = tree[index],
          v = x[n.featureIndex];
        index = Number.isNaN(v)
          ? n.missingLeft
            ? n.left
            : n.right
          : v <= n.threshold
            ? n.left
            : n.right;
      }
      logit += tree[index].value;
    }
    maxGb = Math.max(maxGb, Math.abs(logistic(logit) - p.candidate));
    const linear = row.features.reduce(
      (sum, v, j) => sum + v * m.glm.coefficients[j],
      0,
    );
    maxGlm = Math.max(
      maxGlm,
      Math.abs(logistic(Math.max(-30, Math.min(30, linear))) - p.baseline),
    );
    const game = recomputedGames.get(row.gameId) ?? {
      gameId: row.gameId,
      shots: 0,
      baselineBrierSum: 0,
      candidateBrierSum: 0,
      baselineLogLossSum: 0,
      candidateLogLossSum: 0,
    };
    game.shots++;
    game.baselineBrierSum += (p.baseline - row.goal) ** 2;
    game.candidateBrierSum += (p.candidate - row.goal) ** 2;
    for (const name of ["baseline", "candidate"] as const) {
      const value = p[name],
        safe = Math.max(1e-15, Math.min(1 - 1e-15, value));
      recomputed[name].shots++;
      recomputed[name].actualGoals += row.goal;
      recomputed[name].expectedGoals += value;
      recomputed[name].brier += (value - row.goal) ** 2;
      recomputed[name].logLoss -=
        row.goal * Math.log(safe) + (1 - row.goal) * Math.log1p(-safe);
    }
    for (const [key, value] of [
      ["baselineLogLossSum", p.baseline],
      ["candidateLogLossSum", p.candidate],
    ] as const) {
      const safe = Math.max(1e-15, Math.min(1 - 1e-15, value));
      game[key] -=
        row.goal * Math.log(safe) + (1 - row.goal) * Math.log1p(-safe);
    }
    recomputedGames.set(row.gameId, game);
  }
  if (!(maxGb < 1e-12 && maxGlm < 1e-12))
    throw Error("Crossfit independent prediction parity failed");
  for (const name of ["baseline", "candidate"] as const) {
    recomputed[name].brier /= source.rows.length;
    recomputed[name].logLoss /= source.rows.length;
    for (const key of Object.keys(recomputed[name]) as Array<keyof Metrics>)
      if (
        !Number.isFinite(analysis[name][key]) ||
        Math.abs(analysis[name][key] - recomputed[name][key]) > 1e-8
      )
        throw Error("Aggregate metrics differ from retained predictions");
  }
  if (analysis.pairedTestGames.length !== recomputedGames.size)
    throw Error("Paired game support differs");
  const seenGames = new Set<number>();
  for (const game of analysis.pairedTestGames) {
    const expected = recomputedGames.get(game.gameId);
    if (
      !expected ||
      !Number.isInteger(game.gameId) ||
      seenGames.has(game.gameId) ||
      Object.keys(expected).some(
        (key) =>
          !Number.isFinite(game[key as keyof GameError]) ||
          Math.abs(
            expected[key as keyof GameError] - game[key as keyof GameError],
          ) > 1e-9,
      )
    )
      throw Error("Paired game errors differ from retained predictions");
    seenGames.add(game.gameId);
  }
  let state = 14731;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const draws: { brier: number[]; logLoss: number[] } = {
      brier: [],
      logLoss: [],
    },
    games = analysis.pairedTestGames;
  for (let i = 0; i < 2000; i++) {
    let n = 0,
      b = 0,
      l = 0;
    for (let j = 0; j < games.length; j++) {
      const g = games[Math.floor(random() * games.length)];
      n += g.shots;
      b += g.candidateBrierSum - g.baselineBrierSum;
      l += g.candidateLogLossSum - g.baselineLogLossSum;
    }
    draws.brier.push(b / n);
    draws.logLoss.push(l / n);
  }
  const intervals: Partial<
    Record<
      "brier" | "logLoss",
      {
        difference: number;
        relativeImprovement: number;
        low: number;
        high: number;
      }
    >
  > = {};
  for (const metric of ["brier", "logLoss"] as const) {
    draws[metric].sort((a, b) => a - b);
    intervals[metric] = {
      difference: analysis.candidate[metric] - analysis.baseline[metric],
      relativeImprovement:
        1 - analysis.candidate[metric] / analysis.baseline[metric],
      low: draws[metric][49],
      high: draws[metric][1949],
    };
  }
  const result = {
    version: "nhl-retrospective-crossfit-audit-v1",
    passed: true,
    sourceRowsSha256: analysis.rowsSha256,
    policySha256: analysis.policySha256,
    sourceOnly: analysis.sourceOnly,
    sourceMetadataSha256: analysis.sourceMetadataSha256,
    sourceRowsFileSha256: await fileHash(rowsPath),
    foldManifestSha256: analysis.foldManifestSha256,
    foldFitManifestSha256: analysis.foldFitManifestSha256,
    analysisSha256: await fileHash(`${directory}/analysis.json`),
    predictionsSha256: await fileHash(`${directory}/predictions.json`),
    shots: predictions.length,
    games: games.length,
    maximumGbProbabilityError: maxGb,
    maximumGlmProbabilityError: maxGlm,
    intervals,
    bootstrap: {
      replicates: 2000,
      seed: 14731,
      unit: "paired whole game",
      modelsFixed: true,
      limitation:
        "Conditional descriptive uncertainty only; shared/overlapping model-training outcomes and parameter selection are not resampled.",
    },
    interpretation:
      "Excluded-game identity/hash/inference audit. Exact fit-manifest bytes are bound; foldFitSha256 is an opaque producer ID, not proof of training execution. Retrospective crossfit evidence, never forward confirmation or automatic model adoption.",
  };
  return { audit: result, source, analysis, predictions };
}
