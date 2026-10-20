import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadAuditedRetrospectiveShots } from "../../integrations/nhl/retrospective-shot-source";
import { NHL_NONLINEAR_SHOT_FEATURES } from "../../runtime/nhl-shot-nonlinear";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const textHash = (value: unknown) =>
  createHash("sha256").update(text(value)).digest("hex");
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "nhl-crossfit-audit-"));
  await mkdir(join(directory, "folds"));
  const rows = Array.from({ length: 60 }, (_, index) => ({
    gameId: 2024020000 + index,
    eventId: 1,
    date: new Date(Date.UTC(2024, 9, 1 + index)).toISOString().slice(0, 10),
    goal: Number(index % 10 === 0),
    features: [1, ...Array<number>(15).fill(0)],
  }));
  const season = 20242025,
    rowsSha256 = hash(rows),
    logit = Math.log(0.1 / 0.9);
  const policy = "Synthetic audit protocol\n";
  const policySha256 = createHash("sha256").update(policy).digest("hex");
  await writeFile(join(directory, "frozen-policy.md"), policy);
  const assigned = (id: number) =>
    parseInt(
      createHash("sha256")
        .update(`${season}:${id}:retrospective-v1:14731`)
        .digest("hex")
        .slice(0, 8),
      16,
    ) % 5;
  const folds = Array.from({ length: 5 }, (_, outerFold) => {
    const train = rows.filter((row) => assigned(row.gameId) !== outerFold),
      held = rows.filter((row) => assigned(row.gameId) === outerFold);
    const before = train[Math.floor(train.length * 0.4)].date,
      until = train[Math.floor(train.length * 0.6)].date;
    return {
      outerFold,
      trainingGameIds: train.map((row) => row.gameId),
      heldOutGameIds: held.map((row) => row.gameId),
      trainingGameIdsSha256: hash(train.map((row) => row.gameId)),
      heldOutGameIdsSha256: hash(held.map((row) => row.gameId)),
      innerTrainEnd: before,
      innerValidationEnd: until,
      innerTrainingGameIds: train
        .filter((row) => row.date < before)
        .map((row) => row.gameId),
      innerValidationGameIds: train
        .filter((row) => row.date >= before && row.date < until)
        .map((row) => row.gameId),
    };
  });
  const models = folds.map((fold) => {
    const provenance = {
      outerFold: fold.outerFold,
      foldFitSha256: `producer-${fold.outerFold}`,
      trainingGameIdsSha256: fold.trainingGameIdsSha256,
      sourceRowsSha256: rowsSha256,
    };
    return {
      gb: {
        version: "nhl-shot-nonlinear-crossfit-research-v1",
        featureNames: NHL_NONLINEAR_SHOT_FEATURES,
        initialLogOdds: logit,
        trees: [
          [
            {
              featureIndex: 0,
              threshold: 0,
              left: 0,
              right: 0,
              leaf: 1,
              value: 0,
              missingLeft: 1,
            },
          ],
        ],
        provenance,
      },
      glm: {
        version: "nhl-shot-linear-crossfit-research-v1",
        coefficients: [logit, ...Array<number>(15).fill(0)],
        converged: true,
        provenance: { ...provenance },
      },
    };
  });
  const predictions = rows.map((row) => ({
    ...row,
    features: undefined,
    outerFold: assigned(row.gameId),
    trainingGameIdsSha256: folds[assigned(row.gameId)].trainingGameIdsSha256,
    foldFitSha256: `producer-${assigned(row.gameId)}`,
    baseline: 0.1,
    candidate: 0.1,
  }));
  const pairedTestGames = rows.map((row) => ({
    gameId: row.gameId,
    shots: 1,
    baselineBrierSum: (0.1 - row.goal) ** 2,
    candidateBrierSum: (0.1 - row.goal) ** 2,
    baselineLogLossSum: -(
      row.goal * Math.log(0.1) +
      (1 - row.goal) * Math.log(0.9)
    ),
    candidateLogLossSum: -(
      row.goal * Math.log(0.1) +
      (1 - row.goal) * Math.log(0.9)
    ),
  }));
  const metrics = {
    shots: rows.length,
    actualGoals: 6,
    expectedGoals: 6,
    brier:
      pairedTestGames.reduce((s, g) => s + g.baselineBrierSum, 0) / rows.length,
    logLoss:
      pairedTestGames.reduce((s, g) => s + g.baselineLogLossSum, 0) /
      rows.length,
  };
  const source = { season, gameType: 2, rowsSha256, rows },
    manifest = { season, rowsSha256, policySha256, folds };
  const fits = {
    folds: folds.map((fold, i) => ({
      ...structuredClone(fold),
      foldFitSha256: `producer-${i}`,
      gbModelSha256: textHash(models[i].gb),
      glmModelSha256: textHash(models[i].glm),
    })),
  };
  const analysis = {
    version: "nhl-retrospective-crossfit-experiment-v1",
    season,
    gameType: 2,
    policySha256,
    rowsSha256,
    foldManifestSha256: textHash(manifest),
    foldFitManifestSha256: textHash(fits),
    baseline: metrics,
    candidate: metrics,
    pairedTestGames,
  };
  const save = async () => {
    await Promise.all([
      ...[
        ["source.json", source],
        ["analysis.json", analysis],
        ["fold-manifest.json", manifest],
        ["fold-fit-manifest.json", fits],
        ["predictions.json", predictions],
      ].map(([name, value]) =>
        writeFile(join(directory, String(name)), text(value)),
      ),
      ...models.flatMap((model, i) => [
        writeFile(join(directory, `folds/gb-fold-${i}.json`), text(model.gb)),
        writeFile(join(directory, `folds/glm-fold-${i}.json`), text(model.glm)),
      ]),
    ]);
  };
  await save();
  return {
    directory,
    source,
    manifest,
    fits,
    models,
    analysis,
    predictions,
    save,
    load: () =>
      loadAuditedRetrospectiveShots(directory, join(directory, "source.json")),
    cleanup: async () => {
      assert.ok(directory.startsWith(join(tmpdir(), "nhl-crossfit-audit-")));
      await rm(directory, { recursive: true });
    },
  };
}

test("replays every excluded-game prediction and preserves saved source bytes", async () => {
  const f = await fixture();
  try {
    const original = await readFile(join(f.directory, "source.json"), "utf8");
    const result = await f.load();
    assert.equal(result.audit.shots, 60);
    assert.ok(result.audit.maximumGbProbabilityError < 1e-12);
    assert.equal(
      await readFile(join(f.directory, "source.json"), "utf8"),
      original,
    );
  } finally {
    await f.cleanup();
  }
});
test("rejects own-game selection membership even when manifest file hashes are updated", async () => {
  const f = await fixture();
  try {
    f.manifest.folds[0].innerTrainingGameIds.push(
      f.manifest.folds[0].heldOutGameIds[0],
    );
    f.analysis.foldManifestSha256 = textHash(f.manifest);
    await f.save();
    await assert.rejects(f.load(), /Inner split/);
  } finally {
    await f.cleanup();
  }
});
test("rejects changed policy bytes without rewriting the retained audit manifest", async () => {
  const f = await fixture();
  try {
    await writeFile(
      join(f.directory, "frozen-policy.md"),
      "Changed protocol\n",
    );
    await assert.rejects(f.load(), /Frozen policy bytes/);
  } finally {
    await f.cleanup();
  }
});
test("rejects corrupted predictions and nonfinite/missing report errors", async () => {
  const f = await fixture();
  try {
    f.predictions[0].candidate = 0.2;
    await f.save();
    await assert.rejects(f.load(), /prediction parity/);
    f.predictions[0].candidate = 0.1;
    f.analysis.pairedTestGames[0].candidateBrierSum = NaN;
    await f.save();
    await assert.rejects(f.load(), /Paired game errors/);
  } finally {
    await f.cleanup();
  }
});
test("rejects false aggregate metrics, changed fold identities and fake chronological provenance", async () => {
  const f = await fixture();
  try {
    f.analysis.baseline.brier += 0.1;
    await f.save();
    await assert.rejects(f.load(), /Aggregate metrics/);
    f.analysis.baseline.brier -= 0.1;
    f.manifest.folds[0].outerFold = 1;
    f.analysis.foldManifestSha256 = textHash(f.manifest);
    await f.save();
    await assert.rejects(f.load(), /Fold identities/);
  } finally {
    await f.cleanup();
  }
  const g = await fixture();
  try {
    Object.assign(g.models[0].glm.provenance, { trainedBefore: "2024-01-01" });
    g.fits.folds[0].glmModelSha256 = textHash(g.models[0].glm);
    g.analysis.foldFitManifestSha256 = textHash(g.fits);
    await g.save();
    await assert.rejects(g.load(), /fakes chronological/);
  } finally {
    await g.cleanup();
  }
});
