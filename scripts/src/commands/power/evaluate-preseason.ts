import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  buildPreseasonProjections,
  standardized,
  seasonCategories,
} from "../../runtime/preseason-projection";
import type { DatabaseRecord as Row } from "../../integrations/data/records";

type Source = {
  seasonRows: Row[];
  draftPickRows: Row[];
  playerNhlRows: Row[];
  teamSeasonRows: Row[];
};
function correlation(a: number[], b: number[]): number {
  const x = standardized(a),
    y = standardized(b);
  return (
    x.reduce((sum, value, index) => sum + value * y[index]!, 0) /
    Math.max(1, x.length)
  );
}
const { values } = parseArgs({
  options: {
    source: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Local-only preseason comparison. --source <cached draft research JSON> --output <report JSON>. No network or writes to league data.",
  );
} else {
  const source = JSON.parse(
    await readFile(
      resolve(
        values.source ?? "../.local-data/draft-slot-research/source.json",
      ),
      "utf8",
    ),
  ) as Source;
  const results = [];
  for (const season of [...source.seasonRows].sort(
    (a, b) => Number(a.year) - Number(b.year),
  )) {
    if (Number(season.year) < 2017) continue;
    const actual = source.teamSeasonRows.filter(
      (row) =>
        row.seasonId === season.id &&
        row.seasonType === "RS" &&
        Number(row.GP) > 0,
    );
    const picks = source.draftPickRows.filter(
      (row) => row.seasonId === season.id && row.playerId && row.gshlTeamId,
    );
    if (actual.length < 6 || !picks.length) continue;
    const teams = actual.map((row) => ({ id: row.gshlTeamId }));
    const projected = buildPreseasonProjections({
      season,
      seasons: source.seasonRows,
      teams,
      rosters: picks,
      playerNhlRows: source.playerNhlRows,
    });
    const previous = source.seasonRows
      .filter((row) => Number(row.year) < Number(season.year))
      .sort((a, b) => Number(b.year) - Number(a.year));
    const talent = new Map<string, number>();
    for (const prior of previous)
      for (const row of source.playerNhlRows.filter(
        (row) => row.seasonId === prior.id,
      )) {
        const id = String(row.playerId);
        const rating = Number(row.overallRating ?? row.seasonRating);
        if (!talent.has(id) && Number.isFinite(rating) && rating > 0)
          talent.set(id, rating);
      }
    const baseline = teams.map((team) => {
      const ratings = [
        ...new Set(
          picks
            .filter((pick) => pick.gshlTeamId === team.id)
            .map((pick) => String(pick.playerId)),
        ),
      ]
        .map((id) => talent.get(id) ?? 0)
        .filter((rating) => rating > 0)
        .sort((a, b) => b - a);
      const weights = ratings.map((_, index) =>
        index < 9 ? 1 : index < 14 ? 0.8 : index < 18 ? 0.6 : 0.35,
      );
      return (
        ratings.reduce(
          (sum, rating, index) => sum + rating * weights[index]!,
          0,
        ) / (weights.reduce((sum, weight) => sum + weight, 0) || 1)
      );
    });
    const truth = actual.map(() => 0);
    for (const category of seasonCategories(season)) {
      const scores = standardized(
        actual.map((row) => Number(row[category]) || 0),
      );
      scores.forEach((score, index) => {
        truth[index]! += score * (category === "GAA" ? -1 : 1);
      });
    }
    const newScores = teams.map(
      (team) => projected.find((row) => row.teamId === team.id)!.score,
    );
    const wins = actual.map(
      (row) => Number(row.teamW) + 0.5 * Number(row.teamT),
    );
    results.push({
      year: season.year,
      teams: teams.length,
      minDraftRoster: Math.min(...projected.map((team) => team.rosterSize)),
      unknown: projected.reduce((sum, team) => sum + team.unprovenPlayers, 0),
      categoryCorrelation: {
        baseline: correlation(baseline, truth),
        projection: correlation(newScores, truth),
      },
      winCorrelation: {
        baseline: correlation(baseline, wins),
        projection: correlation(newScores, wins),
      },
    });
  }
  const output = resolve(
    values.output ?? "../.local-data/preseason/evaluation.json",
  );
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
