import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  NHL_PERFORMANCE_CONFIG,
  rankNhlPerformance,
  type PerformanceInput,
} from "../../runtime/nhl-performance-rating";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    season: { type: "string" },
    "season-games": { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Preview performance-led NHL ratings from a saved production ratings export. --input <JSON with rows> --season 2024-25 --season-games 82 --output <NEW directory>. Season games must be the common actual team schedule length; do not use a league-wide length for unequal schedules. No API or database access, no source metrics stored, no production writes.",
  );
else {
  if (
    !values.input ||
    !values.output ||
    !values.season ||
    !values["season-games"]
  )
    throw new Error("Missing input, output, season or actual season-games");
  type Row = {
    season: string;
    nhlPlayerId: number;
    name: string;
    team: string;
    position: PerformanceInput["position"];
    status: PerformanceInput["status"];
    games: number;
    minutes: number;
    abilityPer60: number | null;
    seasonValue: number | null;
    positionRank: number | null;
  };
  const input = JSON.parse(await readFile(resolve(values.input), "utf8")) as {
    rows: Row[];
  };
  const players = input.rows.filter((p) => p.season === values.season);
  if (!players.length) throw new Error("No players for requested season");
  const result = rankNhlPerformance(
    players.map((p) => ({
      ...p,
      playerId: p.nhlPlayerId,
      teamSeasonGames: Number(values["season-games"]),
    })),
  );
  const byId = new Map(result.map((p) => [p.playerId, p]));
  const rows = players
    .map((p) => ({
      name: p.name,
      team: p.team,
      games: p.games,
      minutes: p.minutes,
      seasonValue: p.seasonValue,
      totalValueRank: p.positionRank,
      ...byId.get(p.nhlPlayerId)!,
    }))
    .sort(
      (a, b) =>
        a.position.localeCompare(b.position) ||
        (a.performanceRank ?? Infinity) - (b.performanceRank ?? Infinity),
    );
  const output = resolve(values.output);
  await mkdir(output);
  await writeFile(
    resolve(output, "ratings.json"),
    JSON.stringify(
      {
        season: values.season,
        seasonGames: Number(values["season-games"]),
        config: NHL_PERFORMANCE_CONFIG,
        preview: true,
        rows,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  const columns = [
    "name",
    "team",
    "position",
    "games",
    "status",
    "seasonValue",
    "totalValueRank",
    "performancePerGame",
    "sampleWeight",
    "performanceWeight",
    "overallWeight",
    "availability",
    "performancePercentile",
    "performanceScore",
    "volumeScore",
    "performanceRating",
    "performanceRank",
  ] as const;
  const cell = (v: unknown) =>
    '"' + String(v ?? "").replaceAll('"', '""') + '"';
  await writeFile(
    resolve(output, "ratings.csv"),
    "\ufeff" +
      columns.map(cell).join(",") +
      "\r\n" +
      rows.map((r) => columns.map((k) => cell(r[k])).join(",")).join("\r\n") +
      "\r\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify({ output, players: rows.length, preview: true }));
}
