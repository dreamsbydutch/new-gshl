import assert from "node:assert/strict";
import test from "node:test";
import {
  computePlayerDayLineupFlags,
  computePlayerDayMissedGameValue,
  isLineupAccountingFinalized,
  applyPlayerDayDerivedColumns,
} from "./player-day-flags";
import { getLineupBuilder } from "../lineup/lineup-builder";

void test("accounting waits for a complete final slate, including late and unknown games", () => {
  const finished = { gameId: "early", gameState: "OFF" };
  const late = { gameId: "late", gameState: "LIVE" };
  assert.equal(
    isLineupAccountingFinalized(2, [finished, finished, late, late]),
    false,
  );
  assert.equal(
    isLineupAccountingFinalized(2, [finished, { ...late, gameState: "FINAL" }]),
    true,
  );
  assert.equal(isLineupAccountingFinalized(2, [finished]), false);
  assert.equal(isLineupAccountingFinalized(undefined, []), false);
  assert.equal(isLineupAccountingFinalized(0, []), true);
  assert.equal(isLineupAccountingFinalized(1, [{ gameId: "unknown" }]), false);
  for (const gameScheduleState of ["PPD", "CNCL"]) {
    assert.equal(
      isLineupAccountingFinalized(2, [
        finished,
        { ...late, gameScheduleState },
      ]),
      true,
    );
  }
});

void test("pending accounting clears all counters despite stale hindsight or missed-game flags", () => {
  const rows = [
    {
      playerId: "starter",
      seasonId: "s",
      gshlTeamId: "t",
      date: "2026-10-25",
      GP: "1",
      dailyPos: "RW",
      fullPos: "RW",
      bestPos: "BN",
      lineupAccountingFinalized: false,
      MS: "1",
      BS: "1",
      MG: "1",
    },
    {
      playerId: "bench",
      seasonId: "s",
      gshlTeamId: "t",
      date: "2026-10-25",
      GP: "1",
      dailyPos: "BN",
      fullPos: "RW",
      bestPos: "RW",
      lineupAccountingFinalized: false,
      MS: "1",
      BS: "1",
      MG: "1",
    },
  ];
  applyPlayerDayDerivedColumns(rows, rows);
  for (const row of rows)
    assert.deepEqual([row.MS, row.BS, row.MG], ["", "", ""]);
  assert.equal(
    computePlayerDayMissedGameValue({ lineupAccountingFinalized: false }, true),
    "",
  );
});

void test("a played starter excluded from the best lineup is a bad start", () => {
  assert.deepEqual(
    computePlayerDayLineupFlags({
      GP: "1",
      posGroup: "F",
      dailyPos: "RW",
      fullPos: "RW",
      bestPos: "BN",
    }),
    { MS: "", BS: "1" },
  );
});

void test("a bench upgrade is not itself a bad start", () => {
  assert.deepEqual(
    computePlayerDayLineupFlags({
      GP: "1",
      posGroup: "F",
      dailyPos: "BN",
      fullPos: "BN",
      bestPos: "RW",
    }),
    { MS: "", BS: "" },
  );
});

void test("goalies cannot miss a skater start but can be a bad played start", () => {
  assert.deepEqual(
    computePlayerDayLineupFlags({
      GP: "1",
      posGroup: "G",
      dailyPos: "G",
      fullPos: "G",
      bestPos: "BN",
    }),
    { MS: "", BS: "1" },
  );
});

void test("aggregation preserves the actual optimizer's bad-start decisions", async () => {
  const builder = await getLineupBuilder();
  const slots = builder.buildLineupStructureFromRosterSpots?.([
    "RW",
    "RW",
    "BN",
  ]);
  const rows = builder.optimizeLineup(
    [
      {
        playerId: "bad",
        nhlPos: ["RW"],
        posGroup: "F",
        GP: "1",
        dailyPos: "RW",
        Rating: 10,
      },
      {
        playerId: "good",
        nhlPos: ["RW"],
        posGroup: "F",
        GP: "1",
        dailyPos: "RW",
        Rating: 20,
      },
      {
        playerId: "upgrade",
        nhlPos: ["RW"],
        posGroup: "F",
        GP: "1",
        dailyPos: "BN",
        Rating: 30,
      },
    ],
    slots,
  );
  for (const row of rows) {
    const flags = computePlayerDayLineupFlags(row);
    assert.equal(flags.BS, String(row.BS ?? ""), String(row.playerId));
    assert.equal(flags.MS, String(row.MS ?? ""), String(row.playerId));
  }
});

void test("missed games require a finished NHL team game and no appearance, across fantasy slots", () => {
  for (const dailyPos of ["C", "BN", "IR", "IR+", "G"]) {
    assert.equal(
      computePlayerDayMissedGameValue({ GP: "", dailyPos }, true),
      "1",
    );
    assert.equal(
      computePlayerDayMissedGameValue({ GP: "", dailyPos }, false),
      "",
    );
    assert.equal(
      computePlayerDayMissedGameValue({ GP: 1, dailyPos }, true),
      "",
    );
  }
});
