import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  experimentNhlAbility,
  type AbilitySeasonSnapshot,
} from "../../domains/ranking/nhl-ability-experiment";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});

if (values.help) {
  console.log(
    "Offline v3 ability calibration experiment. --input <derived multi-season v3 snapshot.json> --output <NEW directory>. Uses fixed chronological evaluation seasons and prior grid; compares stored ability, observed rates, three-year history, component priors and zero. Reports matched cohorts and uncertainty. Model-derived future rate is not causal truth. No API/database access, rating adoption or production writes.",
  );
} else {
  if (!values.input || !values.output)
    throw new Error("--input and --output required");
  const sourceText = await readFile(resolve(values.input), "utf8");
  const source = JSON.parse(sourceText) as AbilitySeasonSnapshot;
  const analysis = experimentNhlAbility(source);
  const output = resolve(values.output);
  await mkdir(output);
  await writeFile(
    resolve(output, "analysis.json"),
    JSON.stringify(
      {
        sourceSha256: createHash("sha256").update(sourceText).digest("hex"),
        ...analysis,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify({ output, metrics: analysis.overall }));
}
