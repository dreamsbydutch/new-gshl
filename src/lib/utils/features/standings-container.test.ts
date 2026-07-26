import assert from "node:assert/strict";
import test from "node:test";
import type { GSHLTeam, Matchup, Week } from "@gshl-types";
import { buildStandingsTeamGames } from "./standings-container";

const timestamp = new Date("2026-01-01T00:00:00.000Z");

function createTeam(id: string, name: string): GSHLTeam {
  return {
    id,
    seasonId: "season-1",
    franchiseId: `franchise-${id}`,
    name,
    abbr: name.slice(0, 3).toUpperCase(),
    logoUrl: null,
    isActive: true,
    yahooId: null,
    confId: null,
    confName: null,
    confAbbr: null,
    confLogoUrl: null,
    ownerId: null,
    ownerFirstName: null,
    ownerLastName: null,
    ownerNickname: null,
    ownerEmail: null,
    ownerOwing: null,
    ownerIsActive: true,
  };
}

function createWeek(id: string, weekNum: number): Week {
  return {
    id,
    seasonId: "season-1",
    weekNum,
    weekType: "RS",
    gameDays: 7,
    startDate: `2026-01-${String(weekNum).padStart(2, "0")}`,
    endDate: `2026-01-${String(weekNum + 1).padStart(2, "0")}`,
    isActive: false,
    isPlayoffs: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createMatchup(
  id: string,
  weekId: string,
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number | null,
  awayScore: number | null,
): Matchup {
  const isComplete = homeScore != null && awayScore != null;
  return {
    id,
    seasonId: "season-1",
    weekId,
    homeTeamId,
    awayTeamId,
    gameType: "NC",
    homeScore,
    awayScore,
    isComplete,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

void test("buildStandingsTeamGames returns the two latest finals and two next games", () => {
  const teams = [
    createTeam("team-a", "Aurora"),
    createTeam("team-b", "Bears"),
    createTeam("team-c", "Comets"),
  ];
  const weeks = [1, 2, 3, 4, 5].map((weekNum) =>
    createWeek(`week-${weekNum}`, weekNum),
  );
  const matchups = [
    createMatchup("game-1", "week-1", "team-a", "team-b", 7, 4),
    createMatchup("game-2", "week-2", "team-c", "team-a", 8, 6),
    createMatchup("game-3", "week-3", "team-a", "team-c", 9, 9),
    createMatchup("game-4", "week-4", "team-b", "team-a", null, null),
    createMatchup("game-5", "week-5", "team-a", "team-c", null, null),
  ];

  const result = buildStandingsTeamGames("team-a", matchups, weeks, teams);

  assert.deepEqual(
    result.previousGames.map((game) => [
      game.weekLabel,
      game.opponentName,
      game.resultLabel,
      game.resultTone,
    ]),
    [
      ["W3", "Comets", "T 9-9", "tie"],
      ["W2", "Comets", "L 6-8", "loss"],
    ],
  );
  assert.deepEqual(
    result.upcomingGames.map((game) => [
      game.weekLabel,
      game.opponentName,
      game.resultLabel,
    ]),
    [
      ["W4", "Bears", "@"],
      ["W5", "Comets", "vs"],
    ],
  );
});
