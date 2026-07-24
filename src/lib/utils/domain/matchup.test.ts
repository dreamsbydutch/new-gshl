import assert from "node:assert/strict";
import test from "node:test";

import type { Matchup, MatchupType as MatchupTypeValue } from "@gshl-types";
import { MatchupType } from "./constants";
import { normalizePlayoffMatchupOutcome } from "./matchup";

const matchup = (gameType: MatchupTypeValue): Matchup => ({
  id: "matchup",
  seasonId: "season",
  weekId: "week",
  homeTeamId: "home",
  awayTeamId: "away",
  gameType,
  homeScore: 5,
  awayScore: 5,
  homeWin: false,
  awayWin: false,
  tie: true,
  isComplete: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

void test("awards tied playoff matchups to the home team", () => {
  const result = normalizePlayoffMatchupOutcome(
    matchup(MatchupType.SEMI_FINAL),
  );

  assert.equal(result.homeWin, true);
  assert.equal(result.awayWin, false);
  assert.equal(result.tie, false);
});

void test("preserves legacy regular-season ties", () => {
  const result = normalizePlayoffMatchupOutcome(
    matchup(MatchupType.CONFERENCE),
  );

  assert.equal(result.homeWin, false);
  assert.equal(result.awayWin, false);
  assert.equal(result.tie, true);
});

void test("does not declare a winner while a playoff matchup is in progress", () => {
  const inProgress = {
    ...matchup(MatchupType.FINAL),
    homeWin: null,
    awayWin: null,
    tie: null,
    isComplete: false,
  };
  const result = normalizePlayoffMatchupOutcome(inProgress);

  assert.equal(result.homeWin, null);
  assert.equal(result.awayWin, null);
  assert.equal(result.tie, null);
});
