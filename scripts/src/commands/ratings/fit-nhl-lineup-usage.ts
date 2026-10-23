import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import {
  fitNhlLineupUsage,
  parseNhlLineupUsageArtifact,
} from "../../../../src/lib/utils/domain/nhl-lineup-usage";
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
    "Offline NHL lineup workload: --input VERIFIED_COMPLETE_COHORT_JSON --cutoff-year ENDING_YEAR --output NEW_DIRECTORY. Predict next-calendar-season minutes per appearance for F/D, conditional on playing. Includes unrated positive-exposure seasons; absence is never zero. No network, production writes, games-availability factor, GAR changes or automatic artifact promotion.",
  );
else {
  if (!values.input || !values.output || !values["cutoff-year"])
    throw Error(
      "Explicit input, ending-year cutoff and new output directory required",
    );
  const bytes = await readFile(resolve(values.input)),
    sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const fitted = fitNhlLineupUsage(
    JSON.parse(bytes.toString()) as NhlTalentForecastDataset,
    Number(values["cutoff-year"]),
    sourceSha256,
  );
  parseNhlLineupUsageArtifact(fitted.artifact);
  const output = resolve(values.output);
  await mkdir(output);
  for (const [name, value] of [
    ["artifact.json", fitted.artifact],
    ["validation.json", fitted.validationRows],
  ] as const)
    await writeFile(
      resolve(output, name),
      JSON.stringify(value, null, 2) + "\n",
      { flag: "wx" },
    );
  console.log(
    JSON.stringify({
      output,
      sourceSha256,
      profiles: fitted.artifact.profiles.length,
      validation: fitted.artifact.references.map((r) => ({
        position: r.position,
        candidate: r.candidate,
        validation: r.validation,
      })),
      networkRequests: 0,
      productionWrites: 0,
    }),
  );
}
