import { standardized } from "../../runtime/preseason-projection";
import type { DatabaseRecord as Row } from "../../integrations/data/records";

export type WeeklyEvaluationHistory = {
  weeks: Row[];
  teamWeeks: Row[];
  matchups: Row[];
};

/** Weight ablation using stored ENTERING-week inputs, never same-week results. */
export function evaluateMatchupWeights(
  seasons: Row[],
  history: WeeklyEvaluationHistory,
) {
  const candidates = [
    { name: "existing", weights: [0.2, 0.3, 0.25, 0.15, 0.1] },
    { name: "form", weights: [0.2, 0.4, 0.25, 0.15, 0] },
    { name: "roster", weights: [0.2, 0.3, 0.25, 0.25, 0] },
    { name: "balanced", weights: [0.25, 0.35, 0.25, 0.15, 0] },
    { name: "recent", weights: [0.2, 0.3, 0.35, 0.15, 0] },
  ];
  const fields = [
    "powerEloPre",
    "powerStatEwma",
    "powerStatScore",
    "powerTalent",
    "powerGmScore",
  ];
  const results = seasons
    .filter((row) => Number(row.year) >= 2019 && Number(row.year) <= 2026)
    .map((season) => {
      const weeks = history.weeks
        .filter((row) => row.seasonId === season.id)
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
      const metrics = candidates.map((candidate) => ({
        name: candidate.name,
        games: 0,
        correct: 0,
        squaredError: 0,
      }));
      let skippedWeeks = 0;
      for (const week of weeks
        .slice(4)
        .filter((row) => row.weekType === "RS")) {
        const rows = history.teamWeeks.filter((row) => row.weekId === week.id);
        if (
          !rows.length ||
          rows.some((row) =>
            fields.some(
              (field) =>
                row[field] == null || !Number.isFinite(Number(row[field])),
            ),
          )
        ) {
          skippedWeeks++;
          continue;
        }
        const elo = standardized(rows.map((row) => Number(row.powerEloPre)));
        const talent = standardized(rows.map((row) => Number(row.powerTalent)));
        const scores = rows.map((row, index) =>
          candidates.map(
            ({ weights }) =>
              weights[0]! * elo[index]! +
              weights[1]! * Number(row.powerStatEwma) +
              weights[2]! * Number(row.powerStatScore) +
              weights[3]! * talent[index]! +
              weights[4]! * Number(row.powerGmScore),
          ),
        );
        for (const matchup of history.matchups.filter(
          (row) => row.weekId === week.id && row.isComplete === true,
        )) {
          const home = rows.findIndex(
            (row) => row.gshlTeamId === matchup.homeTeamId,
          );
          const away = rows.findIndex(
            (row) => row.gshlTeamId === matchup.awayTeamId,
          );
          if (home < 0 || away < 0) continue;
          const actual =
            matchup.homeWin === true ? 1 : matchup.awayWin === true ? 0 : 0.5;
          metrics.forEach((metric, index) => {
            const delta = scores[home]![index]! - scores[away]![index]!;
            // Fixed logistic scale is a comparison diagnostic, not a calibrated forecast.
            const probability = 1 / (1 + Math.exp(-delta));
            metric.games++;
            metric.correct +=
              actual === 0.5 || delta === 0
                ? 0.5
                : Number(delta > 0 === (actual === 1));
            metric.squaredError += (probability - actual) ** 2;
          });
        }
      }
      return { year: Number(season.year), skippedWeeks, metrics };
    });
  const summarize = (rows: typeof results) =>
    candidates.map((candidate, index) => {
      const totals = rows.reduce(
        (sum, row) => ({
          games: sum.games + row.metrics[index]!.games,
          correct: sum.correct + row.metrics[index]!.correct,
          squaredError: sum.squaredError + row.metrics[index]!.squaredError,
        }),
        { games: 0, correct: 0, squaredError: 0 },
      );
      if (!totals.games)
        throw new Error(
          "No completed matchups with valid entering-week inputs",
        );
      return {
        name: candidate.name,
        games: totals.games,
        accuracy: totals.correct / totals.games,
        brier: totals.squaredError / totals.games,
      };
    });
  return {
    candidates,
    training: summarize(results.filter((row) => row.year <= 2023)),
    evaluation: summarize(results.filter((row) => row.year >= 2024)),
    seasons: results,
  };
}
