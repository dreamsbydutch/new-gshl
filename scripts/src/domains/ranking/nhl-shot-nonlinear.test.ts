import assert from "node:assert/strict";
import test from "node:test";
import {
  NHL_NONLINEAR_SHOT_FEATURES,
  createNhlNonlinearShotPredictor,
  nonlinearShotFeatures,
  parseNhlNonlinearShotModel,
  predictNhlNonlinearShot,
} from "../../runtime/nhl-shot-nonlinear";
import {
  SHOT_FEATURES,
  type ShotTrainingRow,
} from "../../runtime/nhl-shot-quality";

const leaf = (value: number) => ({
  featureIndex: 0,
  threshold: 0,
  left: 0,
  right: 0,
  leaf: 1,
  value,
  missingLeft: 0,
});
function artifact() {
  return {
    version: "nhl-shot-nonlinear-research-v1",
    featureNames: [...NHL_NONLINEAR_SHOT_FEATURES],
    initialLogOdds: 0,
    trees: [
      [
        {
          featureIndex: 1,
          threshold: 0.5,
          left: 1,
          right: 2,
          leaf: 0,
          value: 0,
          missingLeft: 1,
        },
        leaf(1),
        leaf(-1),
      ],
    ],
    provenance: {
      sklearnVersion: "1.7.1",
      trainedBefore: "2025-01-01",
      testFrom: "2025-02-01",
      sourceRowsSha256: "a".repeat(64),
      sourceAnalysisSha256: "b".repeat(64),
      sourcePredictionsSha256: "c".repeat(64),
      learningRate: 0.05,
      leafValuesIncludeLearningRate: true,
    },
  };
}
const row = (): ShotTrainingRow => ({
  gameId: 1,
  eventId: 1,
  date: "2025-02-01",
  goal: 0,
  features: SHOT_FEATURES.map((_, i) => Number(i === 0)),
  situation: "1451",
  shootingHome: true,
});
const logistic = (x: number) => 1 / (1 + Math.exp(-x));

test("tree threshold equality goes left and frozen imports cannot change through source mutation", () => {
  const raw = artifact();
  const before = structuredClone(raw);
  const model = parseNhlNonlinearShotModel(raw);
  assert.deepEqual(raw, before);
  const shot = row();
  shot.features[1] = 0.5;
  assert.equal(predictNhlNonlinearShot(model, shot), logistic(1));
  shot.features[1] = 0.5000000001;
  assert.equal(predictNhlNonlinearShot(model, shot), logistic(-1));
  raw.trees[0]![2]!.value = 100;
  assert.equal(predictNhlNonlinearShot(model, shot), logistic(-1));
  assert.ok(Object.isFrozen(model.trees[0]![0]));
});

test("unknown context follows missing direction and exact shooting-side encoding", () => {
  const raw = artifact();
  raw.trees[0]![0]!.featureIndex = 17;
  const shot = row();
  assert.deepEqual(nonlinearShotFeatures(shot).slice(16), [1, 5, 4, 1, 1]);
  assert.deepEqual(
    nonlinearShotFeatures({ ...shot, shootingHome: false }).slice(16),
    [0, 4, 5, 1, 1],
  );
  shot.situation = undefined;
  assert.ok(nonlinearShotFeatures(shot).slice(16).every(Number.isNaN));
  assert.equal(createNhlNonlinearShotPredictor(raw)(shot), logistic(1));
  raw.trees[0]![0]!.missingLeft = 0;
  assert.equal(createNhlNonlinearShotPredictor(raw)(shot), logistic(-1));
  shot.situation = "9999";
  assert.equal(nonlinearShotFeatures(shot)[16], 1);
  assert.ok(nonlinearShotFeatures(shot).slice(17).every(Number.isNaN));
});

test("raw leaf values include learning rate once and trees add to initial log odds", () => {
  const raw = artifact();
  raw.initialLogOdds = -0.2;
  raw.trees = [[leaf(0.7)], [leaf(-0.1)]];
  const predict = createNhlNonlinearShotPredictor(raw);
  assert.ok(Math.abs(predict(row()) - logistic(0.4)) < 1e-15);
  raw.initialLogOdds = -1000;
  assert.equal(createNhlNonlinearShotPredictor(raw)(row()), 0);
});

test("malformed tree graphs and numeric contracts fail before traversal", () => {
  const cases: Array<(model: ReturnType<typeof artifact>) => void> = [
    (m) => {
      m.trees[0]![0]!.left = 0;
    },
    (m) => {
      m.trees[0]![0]!.right = 1;
    },
    (m) => {
      m.trees[0]!.push(leaf(5));
    },
    (m) => {
      m.trees[0]![0]!.right = 99;
    },
    (m) => {
      m.trees[0]![0]!.featureIndex = 21;
    },
    (m) => {
      m.trees[0]![0]!.threshold = NaN;
    },
    (m) => {
      m.trees[0]![1]!.value = Infinity;
    },
    (m) => {
      m.trees[0]![1]!.left = 1;
    },
    (m) => {
      m.trees[0]![0]!.missingLeft = 2;
    },
    (m) => {
      m.provenance.leafValuesIncludeLearningRate = false;
    },
    (m) => {
      m.provenance.sklearnVersion = "1.8.0";
    },
    (m) => {
      m.provenance.trainedBefore = m.provenance.testFrom;
    },
    (m) => {
      m.provenance.trainedBefore = "2025-02-31";
    },
    (m) => {
      m.provenance.sourceRowsSha256 = "unknown";
    },
  ];
  for (const change of cases) {
    const raw = artifact();
    change(raw);
    assert.throws(() => parseNhlNonlinearShotModel(raw));
  }
  assert.throws(
    () => parseNhlNonlinearShotModel({ ...artifact(), featureNames: [] }),
    /feature contract/,
  );
  assert.throws(
    () => parseNhlNonlinearShotModel({ ...artifact(), trees: new Array(1) }),
    /requires nodes/,
  );
  assert.throws(
    () => parseNhlNonlinearShotModel({ ...artifact(), trees: [new Array(3)] }),
    /object/,
  );
  const invalid = row();
  invalid.features[0] = NaN;
  assert.throws(
    () => createNhlNonlinearShotPredictor(artifact())(invalid),
    /features/,
  );
});
