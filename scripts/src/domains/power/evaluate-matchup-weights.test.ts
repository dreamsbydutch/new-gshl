import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMatchupWeights,
  type WeeklyEvaluationHistory,
} from "./evaluate-matchup-weights";
import { evaluateFormModels } from "./evaluate-form-models";

void test("matchup evaluation uses entering fields, excludes playoffs, and scores actual outcomes", () => {
  const seasons = [
    { id: "training", year: 2023 },
    { id: "evaluation", year: 2024 },
  ];
  const history: WeeklyEvaluationHistory = {
    weeks: [],
    teamWeeks: [],
    matchups: [],
  };
  for (const season of seasons) {
    history.weeks.push(
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `${season.id}-${i}`,
        seasonId: season.id,
        startDate: `2024-01-${String(i + 1).padStart(2, "0")}`,
        weekType: i === 5 ? "PO" : "RS",
      })),
    );
    for (const week of history.weeks.filter(
      (row) => row.seasonId === season.id,
    )) {
      history.teamWeeks.push(
        ...["a", "b"].map((team) => ({
          weekId: week.id,
          gshlTeamId: team,
          powerEloPre: team === "a" ? 1600 : 1400,
          powerStatEwma: 0,
          powerStatScore: 0,
          powerTalent: 50,
          powerGmScore: 0,
        })),
      );
      history.matchups.push({
        weekId: week.id,
        homeTeamId: "a",
        awayTeamId: "b",
        isComplete: true,
        homeWin: season.id === "training",
        awayWin: season.id !== "training",
      });
    }
  }
  const before = evaluateMatchupWeights(seasons, history);
  const formBefore = evaluateFormModels(seasons, history);
  assert.equal(before.training[0]!.games, 1);
  assert.equal(before.training[0]!.accuracy, 1);
  assert.equal(before.evaluation[0]!.games, 1);
  assert.equal(before.evaluation[0]!.accuracy, 0);
  history.teamWeeks.forEach((row) => {
    row.G = 999;
    row.powerEloPost = 9999;
  });
  assert.deepEqual(evaluateMatchupWeights(seasons, history), before);
  // Alter the rated week's real stats, including a forfeit. Only a future
  // entering snapshot may change; playoffs are outside this evaluation.
  history.teamWeeks
    .filter((row) => String(row.weekId).endsWith("-4"))
    .forEach((row) => {
      row.GP = 30;
      row.W = row.gshlTeamId === "a" ? "" : 4;
      row.GAA = row.gshlTeamId === "a" ? "" : 2;
      row.SVP = row.gshlTeamId === "a" ? "" : 0.95;
    });
  assert.deepEqual(evaluateFormModels(seasons, history), formBefore);
});
