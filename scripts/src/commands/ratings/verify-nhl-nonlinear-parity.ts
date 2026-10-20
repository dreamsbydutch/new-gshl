import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import {
  parseNhlNonlinearShotModel,
  predictNhlNonlinearShot,
  nonlinearShotFeatures,
} from "../../runtime/nhl-shot-nonlinear";
import type { ShotTrainingRow } from "../../runtime/nhl-shot-quality";

const { values } = parseArgs({
  options: {
    model: { type: "string" },
    rows: { type: "string" },
    predictions: { type: "string" },
    synthetic: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Offline TypeScript/Python inference parity. --model <export.json> --rows <shot-rows.json> --predictions <test-predictions.json> --output <NEW ledger.json> [--synthetic <Python missing-context predictions.json>]. Checks every held-out shot and source hashes; no training or publication.",
  );
} else {
  if (!values.model || !values.rows || !values.predictions || !values.output)
    throw new Error("--model, --rows, --predictions and --output required");
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const [modelText, rowsText, predictionsText] = await Promise.all([
    readFile(values.model, "utf8"),
    readFile(values.rows, "utf8"),
    readFile(values.predictions, "utf8"),
  ]);
  const raw = JSON.parse(modelText) as {
    provenance: { sourceRowsFileSha256: string };
  };
  const model = parseNhlNonlinearShotModel(raw);
  const source = JSON.parse(rowsText) as { rows: ShotTrainingRow[] };
  const predictions = JSON.parse(predictionsText) as (Pick<
    ShotTrainingRow,
    "gameId" | "eventId" | "goal"
  > & { candidate: number })[];
  const canonicalRowsSha256 = digest(JSON.stringify(source.rows));
  if (
    canonicalRowsSha256 !== model.provenance.sourceRowsSha256 ||
    digest(rowsText) !== raw.provenance.sourceRowsFileSha256 ||
    digest(predictionsText) !== model.provenance.sourcePredictionsSha256
  )
    throw new Error("Parity source hashes differ from export");
  const expected = source.rows.filter(
    (row) => row.date >= model.provenance.testFrom,
  );
  if (!expected.length || expected.length !== predictions.length)
    throw new Error("Parity does not cover every held-out shot");
  let maximumAbsoluteError = 0;
  for (let i = 0; i < expected.length; i++) {
    const row = expected[i]!,
      prediction = predictions[i]!;
    if (
      row.gameId !== prediction.gameId ||
      row.eventId !== prediction.eventId ||
      row.goal !== prediction.goal ||
      !Number.isFinite(prediction.candidate)
    )
      throw new Error("Parity observation mismatch");
    maximumAbsoluteError = Math.max(
      maximumAbsoluteError,
      Math.abs(predictNhlNonlinearShot(model, row) - prediction.candidate),
    );
  }
  if (!(maximumAbsoluteError < 1e-12))
    throw new Error("TypeScript/Python nonlinear parity failed");
  let syntheticCases = 0,
    syntheticMaximumAbsoluteError = 0;
  let syntheticSha256: string | undefined;
  if (values.synthetic) {
    const text = await readFile(values.synthetic, "utf8");
    syntheticSha256 = digest(text);
    const cases = JSON.parse(text) as {
      row: ShotTrainingRow;
      features: (number | null)[];
      probability: number;
    }[];
    if (!cases.length) throw new Error("Synthetic parity input is empty");
    for (const item of cases) {
      const features = nonlinearShotFeatures(item.row).map((x) =>
        Number.isNaN(x) ? null : x,
      );
      if (
        JSON.stringify(features) !== JSON.stringify(item.features) ||
        !Number.isFinite(item.probability)
      )
        throw new Error("Python/TypeScript context encoding differs");
      syntheticMaximumAbsoluteError = Math.max(
        syntheticMaximumAbsoluteError,
        Math.abs(predictNhlNonlinearShot(model, item.row) - item.probability),
      );
      syntheticCases++;
    }
    if (!(syntheticMaximumAbsoluteError < 1e-12))
      throw new Error("Synthetic missing-context parity failed");
  }
  const result = {
    version: "nhl-shot-nonlinear-parity-v1",
    passed: true,
    modelSha256: digest(modelText),
    sourceRowsSha256: canonicalRowsSha256,
    sourceRowsFileSha256: digest(rowsText),
    sourcePredictionsSha256: digest(predictionsText),
    trainedBefore: model.provenance.trainedBefore,
    testFrom: model.provenance.testFrom,
    predictions: expected.length,
    maximumAbsoluteError,
    tolerance: 1e-12,
    syntheticCases,
    syntheticMaximumAbsoluteError,
    syntheticSha256,
    interpretation:
      "Full held-out TypeScript versus retained Python inference parity; no model-accuracy or promotion claim.",
  };
  await writeFile(values.output, JSON.stringify(result, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(JSON.stringify(result));
}
