import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import {
  fitConditionalNhlTalent,
  parseConditionalNhlTalentArtifact,
} from "../../../../src/lib/utils/domain/nhl-conditional-talent";
import type { NhlTalentForecastDataset } from "../../../../src/lib/types/nhl-contract-talent-forecast";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    "cutoff-year": { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Offline conditional NHL talent fit: --input VERIFIED_COMPLETE_COHORT_JSON --cutoff-year ENDING_YEAR --output NEW_DIRECTORY. Target GAR/60 when playing; absence is not zero ability. Chronological validation excludes unknown/absent targets. No network, database writes, deployment, or automatic artifact replacement.",
  );
else {
  if (!values.input || !values.output || !values["cutoff-year"])
    throw Error("Explicit input, cutoff and new output required");
  const bytes = await readFile(resolve(values.input));
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const fitted = fitConditionalNhlTalent(
    JSON.parse(bytes.toString()) as NhlTalentForecastDataset,
    Number(values["cutoff-year"]),
    sourceSha256,
  );
  parseConditionalNhlTalentArtifact(fitted.artifact);
  const output = resolve(values.output);
  await mkdir(output);
  for (const [file, value] of [
    ["artifact.json", fitted.artifact],
    ["validation.json", fitted.validationRows],
  ] as const)
    await writeFile(
      resolve(output, file),
      JSON.stringify(value, null, 2) + "\n",
      { flag: "wx" },
    );
  console.log(
    JSON.stringify({
      output,
      sourceSha256,
      profiles: fitted.artifact.profiles.length,
      validation: fitted.artifact.validation,
      networkRequests: 0,
      productionWrites: 0,
    }),
  );
}
