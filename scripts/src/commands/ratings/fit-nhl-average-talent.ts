import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import type { NhlTalentForecastDataset } from "../../../../src/lib/types/nhl-contract-talent-forecast";
import { fitAverageNhlTalent } from "../../../../src/lib/utils/domain/nhl-average-talent";

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
    "Offline above-average NHL talent: --input VERIFIED_COMPLETE_COHORT_JSON --cutoff-year ENDING_YEAR --output NEW_DIRECTORY. Centers rated observations by each season/position exposure-weighted GAR mean, preserving offense and defense. Fits conditional playing ability with historical-origin validation. Standard opportunity uses latest three completed seasons: league-wide highest-minute players, with cohort sizes of 12F/6D/1G multiplied by verified NHL club count. Standard season output is not availability or personal deployment. Historical GAR remains unchanged. No network, production writes or automatic promotion.",
  );
else {
  if (!values.input || !values.output || !values["cutoff-year"])
    throw Error("Explicit input, cutoff and new output directory required");
  const bytes = await readFile(resolve(values.input));
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const result = fitAverageNhlTalent(
    JSON.parse(bytes.toString()) as NhlTalentForecastDataset,
    Number(values["cutoff-year"]),
    sourceSha256,
  );
  const output = resolve(values.output);
  await mkdir(output);
  for (const [name, value] of [
    ["artifact.json", result.artifact],
    ["validation.json", result.validationRows],
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
      profiles: result.artifact.profiles.length,
      standardWorkloads: result.artifact.standardWorkloads,
      validation: result.artifact.validation,
      networkRequests: 0,
      productionWrites: 0,
    }),
  );
}
