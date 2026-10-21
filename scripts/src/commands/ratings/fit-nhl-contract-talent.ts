import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import {
  fitNhlContractTalentForecast,
  parseNhlTalentForecastArtifact,
} from "../../../../src/lib/utils/domain/nhl-contract-talent-forecast";
import type { NhlTalentForecastDataset } from "../../../../src/lib/types/nhl-contract-talent-forecast";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    "cutoff-year": { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Fit and validate an offline holistic NHL contract forecast. --input <verified complete official-cohort JSON> --cutoff-year <ENDING year> --output <NEW directory>. Keeps unknown positive-GP values unknown. No network, production writes, deployment or automatic reference replacement.",
  );
} else {
  const cutoffYear = Number(values["cutoff-year"]);
  if (
    !values.input ||
    !values.output ||
    !Number.isInteger(cutoffYear) ||
    cutoffYear < 1900 ||
    cutoffYear > 2200
  )
    throw Error(
      "Verified input, ending cutoff year and new output directory required",
    );
  const bytes = await readFile(resolve(values.input));
  const input = JSON.parse(bytes.toString("utf8")) as NhlTalentForecastDataset;
  const result = fitNhlContractTalentForecast(input, { cutoffYear });
  parseNhlTalentForecastArtifact(result.artifact);
  const artifact = JSON.stringify(result.artifact, null, 2) + "\n";
  const validation = JSON.stringify(result.validationRows, null, 2) + "\n";
  const sha = (value: string | Uint8Array) =>
    createHash("sha256").update(value).digest("hex");
  const receipt = {
    version: "nhl-contract-talent-fit-v1",
    cutoffYear,
    inputSha256: sha(bytes),
    artifactSha256: sha(artifact),
    validationSha256: sha(validation),
    validationRows: result.validationRows.length,
    qualifiedModels: result.artifact.models
      .filter(
        (model) =>
          model.validation.supported && model.validation.beatsBothBaselines,
      )
      .map((model) => ({ position: model.position, horizon: model.horizon })),
    productionWrites: 0,
    networkRequests: 0,
  };
  const output = resolve(values.output);
  await mkdir(output, { recursive: false });
  await writeFile(resolve(output, "forecast-artifact.json"), artifact, {
    flag: "wx",
  });
  await writeFile(resolve(output, "validation-rows.json"), validation, {
    flag: "wx",
  });
  await writeFile(
    resolve(output, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify({ output, ...receipt }));
}
