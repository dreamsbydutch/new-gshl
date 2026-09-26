import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { standardized } from "../../runtime/preseason-projection";
import type { WeeklyEvaluationHistory } from "../../domains/power/evaluate-matchup-weights";

if (process.argv.includes("--help")) {
  console.log(
    "Local-only transition evaluation. Run refine-preseason.ts first to generate preseason-features.json. Reads cached weekly history and writes transition-evaluation.json; no network or league writes.",
  );
} else {
  const root = resolve("../.local-data/power-objectives");
  const history = JSON.parse(
    await readFile(resolve(root, "weekly-history.json"), "utf8"),
  ) as WeeklyEvaluationHistory;
  const seasons = JSON.parse(
    await readFile(resolve(root, "preseason-features.json"), "utf8"),
  ) as {
    year: number;
    seasonId: string;
    teams: { teamId: string; rosterScore: number; ownerScore: number }[];
  }[];
  const durations = [2, 4, 6, 8];
  const results = seasons.map((season) => {
    const priorScores = standardized(
      season.teams.map(
        (team) => 0.5 * team.rosterScore + 0.5 * team.ownerScore,
      ),
    );
    const prior = new Map(
      season.teams.map((team, i) => [team.teamId, priorScores[i]!]),
    );
    const weeks = history.weeks
      .filter((week) => week.seasonId === season.seasonId)
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))
      .slice(0, 8);
    const state = new Map<string, number>();
    const metrics = durations.map((duration) => ({
      duration,
      games: 0,
      correct: 0,
      error: 0,
    }));
    weeks.forEach((week, index) => {
      const rows = history.teamWeeks.filter((row) => row.weekId === week.id);
      const elo = standardized(rows.map((row) => Number(row.powerEloPre))),
        talent = standardized(rows.map((row) => Number(row.powerTalent)));
      const scores = rows.map((row, i) => {
        const id = String(row.gshlTeamId);
        const form =
          0.5 * Number(row.powerStatScore) + 0.5 * (state.get(id) ?? 0);
        state.set(id, form);
        const observed =
          0.2 * elo[i]! +
          0.55 * form +
          0.15 * talent[i]! +
          0.1 * Number(row.powerGmScore);
        return durations.map((duration) => {
          const weight = Math.max(0, 1 - index / duration);
          const score = prior.get(id);
          if (score === undefined)
            throw new Error(`Missing preseason forecast for ${id}`);
          return weight * score + (1 - weight) * observed;
        });
      });
      if (!index || week.weekType !== "RS") return;
      for (const matchup of history.matchups.filter(
        (m) => m.weekId === week.id && m.isComplete === true,
      )) {
        const home = rows.findIndex((r) => r.gshlTeamId === matchup.homeTeamId),
          away = rows.findIndex((r) => r.gshlTeamId === matchup.awayTeamId);
        if (home < 0 || away < 0) continue;
        const actual =
          matchup.homeWin === true ? 1 : matchup.awayWin === true ? 0 : 0.5;
        metrics.forEach((metric, k) => {
          const difference = scores[home]![k]! - scores[away]![k]!;
          const probability = 1 / (1 + Math.exp(-difference));
          metric.games++;
          metric.error += (probability - actual) ** 2;
          metric.correct +=
            actual === 0.5 || difference === 0
              ? 0.5
              : Number(difference > 0 === (actual === 1));
        });
      }
    });
    return { year: season.year, metrics };
  });
  const summarize = (rows: typeof results) =>
    durations.map((duration, k) => {
      const games = rows.reduce((sum, r) => sum + r.metrics[k]!.games, 0);
      if (!games) throw new Error("No completed early-season matchups");
      return {
        duration,
        games,
        brier: rows.reduce((sum, r) => sum + r.metrics[k]!.error, 0) / games,
        accuracy:
          rows.reduce((sum, r) => sum + r.metrics[k]!.correct, 0) / games,
      };
    });
  const report = {
    training: summarize(results.filter((s) => s.year <= 2023)),
    evaluation: summarize(results.filter((s) => s.year >= 2024)),
    seasons: results,
  };
  await writeFile(
    resolve(root, "transition-evaluation.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      { training: report.training, evaluation: report.evaluation },
      null,
      2,
    ),
  );
}
