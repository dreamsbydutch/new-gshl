import {
  seasonCategories,
  standardized,
} from "../../runtime/preseason-projection";
import { weeklyCategoryStrength } from "../../runtime/power-category-strength";
import type { DatabaseRecord as Row } from "../../integrations/data/records";
import type { WeeklyEvaluationHistory } from "./evaluate-matchup-weights";

/** Reconstruct form chronologically; hold stored entering Elo/talent/GM inputs fixed. */
export function evaluateFormModels(
  seasons: Row[],
  history: WeeklyEvaluationHistory,
) {
  const candidates = [false, true].flatMap((forfeits) =>
    [0.2, 0.35, 0.5, 0.72].flatMap((alpha) =>
      [0, 0.1, 0.25].map((current) => ({ forfeits, alpha, current })),
    ),
  );
  const results = seasons
    .filter(
      (season) => Number(season.year) >= 2019 && Number(season.year) <= 2026,
    )
    .map((season) => {
      const weeks = history.weeks
        .filter((week) => week.seasonId === season.id)
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
      const state = candidates.map(() => new Map<string, number>());
      const metrics = candidates.map(() => ({
        games: 0,
        correct: 0,
        squaredError: 0,
      }));
      let correction = new Map<string, number>();
      let baselineMaxError = 0;
      let skippedWeeks = 0;
      for (const [weekIndex, week] of weeks.entries()) {
        const rows = history.teamWeeks.filter((row) => row.weekId === week.id);
        if (
          !rows.length ||
          rows.some((row) =>
            [
              "powerEloPre",
              "powerTalent",
              "powerGmScore",
              "powerStatScore",
              "powerStatEwma",
            ].some(
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
        const scores = rows.map((row, i) =>
          candidates.map((config, k) => {
            const performance =
              Number(row.powerStatScore) +
              (config.forfeits
                ? (correction.get(String(row.gshlTeamId)) ?? 0)
                : 0);
            const form =
              config.alpha * performance +
              (1 - config.alpha) * (state[k]!.get(String(row.gshlTeamId)) ?? 0);
            state[k]!.set(String(row.gshlTeamId), form);
            if (!config.forfeits && config.alpha === 0.72)
              baselineMaxError = Math.max(
                baselineMaxError,
                Math.abs(form - Number(row.powerStatEwma)),
              );
            return (
              0.2 * elo[i]! +
              0.15 * talent[i]! +
              0.1 * Number(row.powerGmScore) +
              config.current * performance +
              (0.55 - config.current) * form
            );
          }),
        );
        // These raw results only enter the NEXT week's form correction.
        const byTeam = new Map(
          rows.map((row) => [String(row.gshlTeamId), row]),
        );
        const ids = [...byTeam.keys()];
        const categories = seasonCategories(season);
        const legacy = weeklyCategoryStrength(byTeam, ids, categories, false);
        const corrected = weeklyCategoryStrength(byTeam, ids, categories);
        correction = new Map(
          ids.map((id) => [id, 0.5 * (corrected.get(id)! - legacy.get(id)!)]),
        );
        if (weekIndex < 4 || week.weekType !== "RS") continue;
        for (const matchup of history.matchups.filter(
          (row) => row.weekId === week.id && row.isComplete === true,
        )) {
          const home = rows.findIndex(
              (row) => row.gshlTeamId === matchup.homeTeamId,
            ),
            away = rows.findIndex(
              (row) => row.gshlTeamId === matchup.awayTeamId,
            );
          if (home < 0 || away < 0) continue;
          if (
            matchup.homeWin !== true &&
            matchup.awayWin !== true &&
            matchup.tie !== true
          )
            throw new Error(
              `Completed matchup lacks outcome: ${String(matchup.id)}`,
            );
          const actual =
            matchup.homeWin === true ? 1 : matchup.awayWin === true ? 0 : 0.5;
          metrics.forEach((metric, k) => {
            const difference = scores[home]![k]! - scores[away]![k]!;
            const probability = 1 / (1 + Math.exp(-difference));
            metric.games++;
            metric.correct +=
              actual === 0.5 || difference === 0
                ? 0.5
                : Number(difference > 0 === (actual === 1));
            metric.squaredError += (probability - actual) ** 2;
          });
        }
      }
      return {
        year: Number(season.year),
        metrics,
        baselineMaxError,
        skippedWeeks,
      };
    });
  const summarize = (rows: typeof results) =>
    candidates.map((config, index) => {
      const sum = rows.reduce(
        (sum, row) => ({
          games: sum.games + row.metrics[index]!.games,
          correct: sum.correct + row.metrics[index]!.correct,
          squaredError: sum.squaredError + row.metrics[index]!.squaredError,
        }),
        { games: 0, correct: 0, squaredError: 0 },
      );
      if (!sum.games) throw new Error("No matchups in evaluation partition");
      return {
        ...config,
        index,
        games: sum.games,
        accuracy: sum.correct / sum.games,
        brier: sum.squaredError / sum.games,
      };
    });
  const training = summarize(results.filter((row) => row.year <= 2023));
  const evaluation = summarize(results.filter((row) => row.year >= 2024));
  const selected = [...training].sort((a, b) => a.brier - b.brier)[0]!;
  const walkForward = results
    .filter((row) => row.year >= 2021)
    .flatMap((row) => {
      const preceding = results.filter((previous) => previous.year < row.year);
      if (preceding.length < 2) return [];
      const selection = summarize(preceding).sort(
        (a, b) => a.brier - b.brier,
      )[0]!;
      return [
        {
          year: row.year,
          selected: candidates[selection.index],
          metrics: summarize([row])[selection.index],
        },
      ];
    });
  return {
    training,
    evaluation,
    selected,
    selectedEvaluation: evaluation[selected.index],
    walkForward,
    seasons: results,
  };
}
