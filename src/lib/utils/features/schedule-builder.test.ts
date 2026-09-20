import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateSchedule,
  scheduleBalance,
  validateSchedule,
} from "./schedule-builder";
import type { BuilderTeam } from "../../types/schedule-builder";

const teams: BuilderTeam[] = Array.from({ length: 14 }, (_, i) => ({
  id: `team${i}`,
  ownerId: `owner${i}`,
  conferenceId: i < 7 ? "A" : "B",
  name: `Team ${i}`,
}));

void test("valid full schedules across season lengths and random seeds", () => {
  for (const weeks of [19, 21, 23, 25, 31, 49])
    for (const seed of [1, 42, 876]) {
      const games = generateSchedule(teams, weeks, [], seed);
      validateSchedule(teams, weeks, games);
      for (let week = 1; week <= weeks; week++) {
        const round = games.filter((g) => g.week === week);
        assert.equal(round.length, 7);
        assert.equal(new Set(round.flatMap((g) => [g.home, g.away])).size, 14);
      }
      for (const pair of scheduleBalance(teams, [], games))
        assert.ok(Math.abs(pair.afterHome - pair.afterAway) <= 1);
    }
});

void test("owner history determines venues even with new season team IDs", () => {
  const history = [{ a: "owner0", b: "owner1", games: 10, aHome: 9 }];
  const games = generateSchedule(teams, 21, history, 42);
  const pair = scheduleBalance(teams, history, games).find(
    (p) => p.a === "Team 0" && p.b === "Team 1",
  )!;
  assert.equal(pair.afterHome, 9);
  assert.equal(pair.afterAway, 1 + pair.added);
  assert.deepEqual(games, generateSchedule(teams, 21, history, 42));
});

void test("extra games avoid a historically overplayed conference pair", () => {
  const history = [{ a: "owner0", b: "owner1", games: 100, aHome: 50 }];
  const games = generateSchedule(teams, 21, history, 1);
  assert.equal(
    scheduleBalance(teams, history, games).find(
      (p) => p.a === "Team 0" && p.b === "Team 1",
    )!.added,
    2,
  );
});

void test("reject impossible settings and invalid published schedules", () => {
  for (const weeks of [18, 20, 22, 21.5, NaN, 53])
    assert.throws(() => generateSchedule(teams, weeks, [], 1));
  assert.throws(() => generateSchedule(teams.slice(1), 21, [], 1));
  assert.throws(() =>
    generateSchedule(
      teams.map((t) => ({ ...t, ownerId: "same" })),
      21,
      [],
      1,
    ),
  );
  const games = generateSchedule(teams, 21, [], 1);
  assert.throws(() => validateSchedule(teams, 21, games.slice(1)));
  assert.throws(() =>
    validateSchedule(
      teams,
      21,
      games.map((g, i) => (i === 0 ? { ...g, home: g.away } : g)),
    ),
  );
  assert.throws(() =>
    validateSchedule(
      teams,
      21,
      games.map((g, i) => (i === 0 ? { ...g, home: "outsider" } : g)),
    ),
  );
});
