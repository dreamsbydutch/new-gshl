import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import {
  fitNhlGoalieUsage,
  parseNhlGoalieUsageArtifact,
} from "../../../../src/lib/utils/domain/nhl-goalie-usage";
import type { NhlGoalieUsageDataset } from "../../../../src/lib/types/nhl-goalie-usage";

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
    "Offline goalie role fit: --input VERIFIED_DRESSED_HISTORY_JSON --cutoff-year ENDING_YEAR --output NEW_DIRECTORY. Fits paired minutes conditional both dressed. No network, production writes, absence zeros or automatic promotion.",
  );
else {
  if (!values.input || !values.output || !values["cutoff-year"])
    throw Error(
      "Explicit input, ending-year cutoff and new output directory required",
    );
  const bytes = await readFile(resolve(values.input)),
    sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const source = JSON.parse(bytes.toString()) as {
    version: string;
    seasons: { year: number; games: number; dressedRows: number }[];
    observations: {
      year: number;
      nhlPlayerId: number;
      dressedGames: number;
      starts: number;
      minutes: number;
    }[];
    games: {
      year: number;
      gameId: number;
      teams: { dressed: { nhlPlayerId: number; minutes: number }[] }[];
    }[];
  };
  if (
    source.version !== "nhl-goalie-workload-source-v1" ||
    !Array.isArray(source.seasons)
  )
    throw Error("Verified goalie dressed source contract required");
  const cutoffYear = Number(values["cutoff-year"]);
  const usedGames = source.games.filter((g) => g.year <= cutoffYear);
  if (new Set(usedGames.map((g) => g.gameId)).size !== usedGames.length)
    throw Error("Duplicate source goalie games");
  for (const season of source.seasons.filter((s) => s.year <= cutoffYear)) {
    const games = usedGames.filter((g) => g.year === season.year);
    const dressedRows = games.reduce(
      (n, g) => n + g.teams.reduce((m, t) => m + t.dressed.length, 0),
      0,
    );
    if (
      games.length !== season.games ||
      dressedRows !== season.dressedRows ||
      games.some((g) => g.teams.length !== 2)
    )
      throw Error(`Incomplete goalie dressed source cohort ${season.year}`);
  }
  const profiles = new Map<number, NhlGoalieUsageDataset["profiles"][number]>();
  for (const o of source.observations) {
    let p = profiles.get(o.nhlPlayerId);
    if (!p) {
      p = { nhlPlayerId: o.nhlPlayerId, observations: [] };
      profiles.set(o.nhlPlayerId, p);
    }
    p.observations.push({
      year: o.year,
      dressedGames: o.dressedGames,
      starts: o.starts,
      minutes: o.minutes,
    });
  }
  const pairs = new Map<string, NhlGoalieUsageDataset["pairs"][number]>();
  let excludedNonPairTeamGames = 0;
  for (const g of source.games)
    for (const team of g.teams) {
      if (team.dressed.length !== 2) {
        excludedNonPairTeamGames++;
        continue;
      }
      const goalies = [...team.dressed].sort(
          (a, b) => a.nhlPlayerId - b.nhlPlayerId,
        ),
        a = goalies[0]!,
        b = goalies[1]!;
      const key = `${g.year}:${a.nhlPlayerId}:${b.nhlPlayerId}`;
      let p = pairs.get(key);
      if (!p) {
        p = {
          year: g.year,
          ids: [a.nhlPlayerId, b.nhlPlayerId],
          games: 0,
          minutes: [0, 0],
        };
        pairs.set(key, p);
      }
      p.games++;
      p.minutes[0] += a.minutes;
      p.minutes[1] += b.minutes;
    }
  const dataset: NhlGoalieUsageDataset = {
    seasons: source.seasons.map((s) => ({ year: s.year, complete: true })),
    profiles: [...profiles.values()],
    pairs: [...pairs.values()],
  };
  const fitted = fitNhlGoalieUsage(dataset, cutoffYear, sourceSha256);
  parseNhlGoalieUsageArtifact(fitted.artifact);
  const output = resolve(values.output);
  await mkdir(output);
  for (const [name, value] of [
    ["artifact.json", fitted.artifact],
    ["validation.json", fitted.validationRows],
    ["adaptive-validation.json", fitted.adaptiveValidationRows],
    ["adaptive-metrics.json", fitted.adaptiveValidation],
    ["dataset.json", dataset],
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
      profiles: profiles.size,
      excludedNonPairTeamGames,
      candidate: fitted.artifact.candidate,
      validation: fitted.artifact.validation,
      networkRequests: 0,
      productionWrites: 0,
    }),
  );
}
