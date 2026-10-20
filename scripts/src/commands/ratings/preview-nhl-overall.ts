import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  NHL_REPLACEMENT_DEPTH_PRESETS,
  rankNhlReplacementPreview,
} from "../../runtime/nhl-overall-rating";
import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    teams: { type: "string" },
    help: { type: "boolean" },
  },
});

if (values.help) {
  console.log(
    "Offline overall NHL replacement-value preview. --input <complete passing v3 ratings.json> --teams <official NHL team count in this season> --output <NEW directory>. Estimates contribution above a same-position replacement cohort selected by ice-time depth. Includes fixed depth sensitivity, not confidence intervals. Season contribution only, not predictive ability or validated WAR. No API/database access or production writes.",
  );
} else {
  if (!values.input || !values.output || !values.teams)
    throw new Error("--input, --output and --teams required");
  const numberOfTeams = Number(values.teams);
  if (!Number.isInteger(numberOfTeams) || numberOfTeams <= 0)
    throw new Error("Positive official NHL team count required");
  const sourceText = await readFile(resolve(values.input), "utf8");
  const source = JSON.parse(sourceText) as {
    version: string;
    season: number;
    gameType: number;
    officialTeamCount?: number;
    completeSourceScope: boolean;
    config: { revision: string };
    qualityGate: { passes: boolean };
    model: { coefficients: Record<string, number>; converged: boolean };
    ratings: GameSeasonRating[];
  };
  if (
    source.version !== "nhl-season-value-v3" ||
    !Number.isInteger(source.season) ||
    Math.floor(source.season / 10000) + 1 !== source.season % 10000 ||
    ![2, 3].includes(source.gameType) ||
    source.completeSourceScope !== true ||
    source.qualityGate?.passes !== true ||
    source.model?.converged !== true ||
    typeof source.config?.revision !== "string" ||
    !source.config.revision.trim() ||
    !Array.isArray(source.ratings) ||
    !source.ratings.length
  )
    throw new Error(
      "Overall preview requires a complete, passing fitted v3 season",
    );
  if (
    source.officialTeamCount !== undefined &&
    source.officialTeamCount !== numberOfTeams
  )
    throw new Error(
      "Replacement depth team count differs from the official source schedule",
    );
  const preview = rankNhlReplacementPreview({ ...source, numberOfTeams });
  const sensitivity = [
    {
      label: "narrower-regular-depth",
      depth: NHL_REPLACEMENT_DEPTH_PRESETS.narrow,
    },
    {
      label: "wider-regular-depth",
      depth: NHL_REPLACEMENT_DEPTH_PRESETS.wide,
    },
  ].map(({ label, depth }) => ({
    label,
    ...rankNhlReplacementPreview({ ...source, numberOfTeams, depth }),
  }));
  const output = resolve(values.output);
  await mkdir(output);
  await writeFile(
    resolve(output, "overall.json"),
    JSON.stringify(
      {
        ...preview,
        sensitivity,
        season: source.season,
        gameType: source.gameType,
        sourceRevision: source.config.revision,
        sourceSha256: createHash("sha256").update(sourceText).digest("hex"),
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  const columns = [
    "playerId",
    "name",
    "position",
    "status",
    "qualification",
    "overallValue",
    "overallRank",
  ] as const;
  await writeFile(
    resolve(output, "overall.csv"),
    [
      columns.join(","),
      ...preview.ratings.map((p) =>
        columns
          .map((key) => `"${String(p[key] ?? "").replaceAll('"', '""')}"`)
          .join(","),
      ),
    ].join("\n") + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      season: source.season,
      players: preview.ratings.length,
      ranked: preview.ratings.filter((p) => p.overallRank !== null).length,
      output,
    }),
  );
}
