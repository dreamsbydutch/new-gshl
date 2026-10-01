import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  buildNhlRatingInput,
  type NhlRatingSource,
} from "../../domains/nhl/season-rating-input";
import { fetchNhlRatingSource } from "../../integrations/nhl/season-rating-source";
import {
  NHL_SEASON_RATING_CONFIG,
  rankNhlSeason,
  validateNhlRatingInput,
} from "../../runtime/nhl-season-rating";

const { values } = parseArgs({
  options: {
    season: { type: "string" },
    "game-type": { type: "string", default: "2" },
    profile: { type: "string", default: "core" },
    input: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});

if (values.help) {
  console.log(`Independent NHL season rating preview; public NHL reads and local output only.
  --season 20242025       NHL start/end year, required even for replay
  --game-type 2|3         Regular season (2, default) or playoffs (3)
  --profile core|edge     Core (default), or EDGE shot-location enhancement
  --input <source.json>  Replay a saved source snapshot without network access
  --output <directory>   Optional local source.json, ratings.json and ratings.csv
No Convex access, remote writes, GSHL ratings or salary changes.`);
} else {
  const season = Number(values.season);
  const gameType = Number(values["game-type"]);
  const profile = values.profile;
  if (gameType !== 2 && gameType !== 3)
    throw new Error("--game-type must be 2 or 3");
  if (profile !== "core" && profile !== "edge")
    throw new Error("--profile must be core or edge");
  validateNhlRatingInput({ season, gameType, profile, players: [] });
  console.log(
    JSON.stringify({
      mode: "local-preview",
      source: values.input ? "snapshot" : "public NHL API",
      season,
      gameType,
      profile,
    }),
  );
  const source = values.input
    ? (JSON.parse(
        await readFile(resolve(values.input), "utf8"),
      ) as NhlRatingSource)
    : await fetchNhlRatingSource(season, gameType, profile, console.log);
  if (
    source.season !== season ||
    source.gameType !== gameType ||
    source.profile !== profile
  )
    throw new Error(
      "Snapshot season/game type/profile differs from requested target",
    );
  const input = buildNhlRatingInput(source);
  const ratings = rankNhlSeason(input);
  const report = {
    version: NHL_SEASON_RATING_CONFIG.version,
    season,
    gameType,
    profile,
    fetchedAt: source.fetchedAt,
    config: NHL_SEASON_RATING_CONFIG,
    warnings: source.warnings,
    ratings,
  };
  if (values.output) {
    const directory = resolve(values.output);
    await mkdir(directory, { recursive: true });
    // Exclusive writes protect earlier review snapshots; use a new directory for each run.
    await writeFile(
      resolve(directory, "source.json"),
      JSON.stringify(source, null, 2) + "\n",
      { flag: "wx" },
    );
    await writeFile(
      resolve(directory, "ratings.json"),
      JSON.stringify(report, null, 2) + "\n",
      { flag: "wx" },
    );
    const columns = [
      "playerId",
      "name",
      "team",
      "position",
      "status",
      "games",
      "minutes",
      "rank",
      "seasonRating",
      "impactPer60",
      "seasonValue",
    ] as const;
    const csv = [
      columns.join(","),
      ...ratings.map((row) =>
        columns
          .map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`)
          .join(","),
      ),
    ].join("\n");
    await writeFile(resolve(directory, "ratings.csv"), csv + "\n", {
      flag: "wx",
    });
    console.log(`Saved NHL source and ratings to ${directory}`);
  }
  console.log(
    JSON.stringify(
      {
        counts: {
          total: ratings.length,
          rated: ratings.filter((p) => p.status === "rated").length,
          provisional: ratings.filter((p) => p.status === "provisional").length,
          incomplete: ratings.filter((p) => p.status === "incomplete").length,
        },
        top: ["F", "D", "G"].flatMap((position) =>
          ratings
            .filter((p) => p.position === position && p.status === "rated")
            .slice(0, 10)
            .map(
              ({
                name,
                position,
                rank,
                seasonRating,
                impactPer60,
                seasonValue,
              }) => ({
                name,
                position,
                rank,
                seasonRating,
                impactPer60,
                seasonValue,
              }),
            ),
        ),
      },
      null,
      2,
    ),
  );
}
