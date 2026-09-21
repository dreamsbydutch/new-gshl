import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateSchedule,
  pairKey,
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
      for (const pair of scheduleBalance(teams, [], games)) {
        assert.ok(Math.abs(pair.afterHome - pair.afterAway) <= 1);
        if (pair.conference) {
          assert.ok(pair.added >= Math.floor((weeks - 7) / 6));
          assert.ok(pair.added <= Math.ceil((weeks - 7) / 6));
        }
      }
    }
});

void test("season matchup tiers take priority over strongly uneven owner history", () => {
  // Make one seven-owner cycle much less played than every other conference pair.
  const history = teams.flatMap((a, i) =>
    teams.slice(i + 1).flatMap((b, offset) => {
      if (a.conferenceId !== b.conferenceId) return [];
      const distance = offset + 1;
      const games = distance === 1 || distance === 6 ? 0 : 100;
      return [{ a: a.ownerId, b: b.ownerId, games, aHome: games / 2 }];
    }),
  );
  for (const weeks of [23, 25, 27, 29, 31]) {
    const games = generateSchedule(teams, weeks, history, 42);
    const pairs = scheduleBalance(teams, history, games).filter(
      (p) => p.conference,
    );
    assert.ok(
      pairs.every((p) => p.added >= Math.floor((weeks - 7) / 6)),
      `Missing required matchup tier at ${weeks} weeks`,
    );
    assert.ok(
      pairs.every((p) => p.added <= Math.ceil((weeks - 7) / 6)),
      `Advanced to the next matchup tier too early at ${weeks} weeks`,
    );
  }
});

void test("publication validation rejects uneven tiers even when every opponent has two games", () => {
  const games = generateSchedule(teams, 23, [], 42);
  const counts = new Map<string, number>();
  for (const g of games) {
    const key = pairKey(g.home, g.away);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // Rewire two conference games in a week. Participation and conference totals
  // remain valid, but one opponent reaches four while others still have two.
  for (let i = 0; i < games.length; i++)
    for (let j = i + 1; j < games.length; j++) {
      const a = games[i]!;
      const b = games[j]!;
      if (a.week !== b.week) continue;
      const participants = [a.home, a.away, b.home, b.away].map(
        (id) => teams.find((t) => t.id === id)!,
      );
      if (new Set(participants.map((t) => t.conferenceId)).size !== 1) continue;
      if (
        counts.get(pairKey(a.home, a.away)) !== 3 ||
        counts.get(pairKey(b.home, b.away)) !== 3
      )
        continue;
      if (
        counts.get(pairKey(a.home, b.away)) !== 3 &&
        counts.get(pairKey(b.home, a.away)) !== 3
      )
        continue;
      const invalid = games.map((g, index) =>
        index === i
          ? { ...g, away: b.away }
          : index === j
            ? { ...g, away: a.away }
            : g,
      );
      assert.throws(
        () => validateSchedule(teams, 23, invalid),
        /Conference opponent counts/,
      );
      return;
    }
  assert.fail(
    "Expected to find a weekly matchup swap that violates tier balance",
  );
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
