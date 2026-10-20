import { SHOT_FEATURES, type ShotTrainingRow } from "./nhl-shot-quality";

export const NHL_NONLINEAR_SHOT_FEATURES = [
  ...SHOT_FEATURES,
  "shootingHome",
  "ownSkaters",
  "opposingSkaters",
  "ownGoaliePresent",
  "opposingGoaliePresent",
] as const;

type Node = Readonly<{
  featureIndex: number;
  threshold: number;
  left: number;
  right: number;
  leaf: number;
  value: number;
  missingLeft: number;
}>;
export type NhlNonlinearShotModel = Readonly<{
  version: "nhl-shot-nonlinear-research-v1";
  featureNames: readonly string[];
  initialLogOdds: number;
  trees: readonly (readonly Node[])[];
  provenance: Readonly<{
    sklearnVersion: "1.7.1";
    trainedBefore: string;
    testFrom: string;
    sourceRowsSha256: string;
    sourceAnalysisSha256: string;
    sourcePredictionsSha256: string;
    learningRate: number;
    leafValuesIncludeLearningRate: true;
  }>;
}>;
const validated = new WeakSet<object>();
const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Expected nonlinear model object");
  return value as Record<string, unknown>;
};
const finite = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Nonfinite nonlinear model scalar");
  return value;
};
const integer = (value: unknown, max: number): number => {
  const result = finite(value);
  if (!Number.isInteger(result) || result < 0 || result >= max)
    throw new Error("Invalid nonlinear tree index/flag");
  return result;
};

/** Validate once and clone/freeze the artifact; prediction never trusts mutable JSON. */
export function parseNhlNonlinearShotModel(
  value: unknown,
): NhlNonlinearShotModel {
  const input = record(value);
  const featureNames = input.featureNames;
  if (
    input.version !== "nhl-shot-nonlinear-research-v1" ||
    !Array.isArray(featureNames) ||
    featureNames.length !== NHL_NONLINEAR_SHOT_FEATURES.length ||
    NHL_NONLINEAR_SHOT_FEATURES.some((name, i) => featureNames[i] !== name)
  )
    throw new Error("Unknown nonlinear model feature contract");
  if (!Array.isArray(input.trees) || input.trees.length === 0)
    throw new Error("Nonlinear model requires trees");
  const trees = Array.from(input.trees, (rawTree: unknown) => {
    if (!Array.isArray(rawTree) || rawTree.length === 0)
      throw new Error("Nonlinear tree requires nodes");
    const tree = Array.from(rawTree, (rawNode: unknown) => {
      const node = record(rawNode);
      const result = Object.freeze({
        featureIndex: integer(
          node.featureIndex,
          NHL_NONLINEAR_SHOT_FEATURES.length,
        ),
        threshold: finite(node.threshold),
        left: integer(node.left, rawTree.length),
        right: integer(node.right, rawTree.length),
        leaf: integer(node.leaf, 2),
        value: finite(node.value),
        missingLeft: integer(node.missingLeft, 2),
      });
      if (result.leaf === 1 && (result.left !== 0 || result.right !== 0))
        throw new Error("Nonlinear leaf cannot have children");
      return result;
    });
    const seen = new Set<number>(),
      pending = [0];
    while (pending.length) {
      const index = pending.pop()!;
      if (seen.has(index))
        throw new Error("Nonlinear tree contains a cycle or shared child");
      seen.add(index);
      const node = tree[index]!;
      if (!node.leaf) pending.push(node.left, node.right);
    }
    if (seen.size !== tree.length)
      throw new Error("Nonlinear tree contains unreachable nodes");
    return Object.freeze(tree);
  });
  const rawProvenance = record(input.provenance);
  const date = (value: unknown) => {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      throw new Error("Invalid nonlinear model chronology");
    return value;
  };
  const digest = (value: unknown) => {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
      throw new Error("Invalid nonlinear source hash");
    return value;
  };
  const trainedBefore = date(rawProvenance.trainedBefore),
    testFrom = date(rawProvenance.testFrom);
  const learningRate = finite(rawProvenance.learningRate);
  if (
    trainedBefore >= testFrom ||
    learningRate <= 0 ||
    rawProvenance.sklearnVersion !== "1.7.1" ||
    rawProvenance.leafValuesIncludeLearningRate !== true
  )
    throw new Error("Invalid nonlinear exporter/scaling contract");
  const model: NhlNonlinearShotModel = Object.freeze({
    version: "nhl-shot-nonlinear-research-v1",
    featureNames: Object.freeze([...NHL_NONLINEAR_SHOT_FEATURES]),
    initialLogOdds: finite(input.initialLogOdds),
    trees: Object.freeze(trees),
    provenance: Object.freeze({
      sklearnVersion: "1.7.1",
      trainedBefore,
      testFrom,
      sourceRowsSha256: digest(rawProvenance.sourceRowsSha256),
      sourceAnalysisSha256: digest(rawProvenance.sourceAnalysisSha256),
      sourcePredictionsSha256: digest(rawProvenance.sourcePredictionsSha256),
      learningRate,
      leafValuesIncludeLearningRate: true,
    }),
  });
  validated.add(model);
  return model;
}

/** Encoding matches the pinned Python research encoder, including explicit NaNs. */
export function nonlinearShotFeatures(row: ShotTrainingRow): number[] {
  if (
    row.features.length !== SHOT_FEATURES.length ||
    SHOT_FEATURES.some((_, i) => !Number.isFinite(row.features[i]))
  )
    throw new Error("Invalid nonlinear shot features");
  const code = row.situation,
    home = row.shootingHome;
  if (
    typeof code !== "string" ||
    code.length !== 4 ||
    typeof home !== "boolean"
  )
    return [...row.features, NaN, NaN, NaN, NaN, NaN];
  if (!/^[01][3-6][3-6][01]$/.test(code))
    return [...row.features, Number(home), NaN, NaN, NaN, NaN];
  return [
    ...row.features,
    Number(home),
    Number(home ? code[2] : code[1]),
    Number(home ? code[1] : code[2]),
    Number(home ? code[3] : code[0]),
    Number(home ? code[0] : code[3]),
  ];
}

/** Research only. Parse the model once before scoring a batch. Leaf values already include shrinkage. */
export function predictNhlNonlinearShot(
  model: NhlNonlinearShotModel,
  row: ShotTrainingRow,
): number {
  if (!validated.has(model))
    throw new Error("Parse the nonlinear model before prediction");
  const features = nonlinearShotFeatures(row);
  let logOdds = model.initialLogOdds;
  for (const tree of model.trees) {
    let node = tree[0]!;
    while (!node.leaf) {
      const feature = features[node.featureIndex]!;
      const left = Number.isNaN(feature)
        ? node.missingLeft === 1
        : feature <= node.threshold;
      node = tree[left ? node.left : node.right]!;
    }
    logOdds += node.value;
  }
  if (!Number.isFinite(logOdds))
    throw new Error("Nonfinite nonlinear prediction log odds");
  if (logOdds >= 0) return 1 / (1 + Math.exp(-logOdds));
  const exp = Math.exp(logOdds);
  return exp / (1 + exp);
}

export function createNhlNonlinearShotPredictor(value: unknown) {
  const model = parseNhlNonlinearShotModel(value);
  return (row: ShotTrainingRow) => predictNhlNonlinearShot(model, row);
}
