import assert from "node:assert/strict";
import test from "node:test";
import { getLineupBuilder } from "../lineup/lineup-builder";
import { refreshPlayerDayLineupContext } from "./player-day-lineup-context";

void test("daily bad starts require a played alternative, including zero-rated skaters and negative-rated goalies", async () => {
  const builder = await getLineupBuilder();
  for (const [position, posGroup, rating] of [
    ["C", "F", 0],
    ["G", "G", -7.94307],
  ] as const) {
    const source = [
      {
        seasonId: "s",
        gshlTeamId: "t",
        date: "2026-10-20",
        playerId: "z-starter",
        nhlPos: [position],
        posGroup,
        GP: "1",
        GS: "1",
        dailyPos: position,
        Rating: rating,
      },
      {
        seasonId: "s",
        gshlTeamId: "t",
        date: "2026-10-20",
        playerId: "a-inactive",
        nhlPos: [position],
        posGroup,
        GP: "",
        GS: "",
        dailyPos: "BN",
        Rating: 0,
      },
    ];
    const result = refreshPlayerDayLineupContext(
      source,
      builder.optimizeLineup,
      builder.buildLineupStructureFromRosterSpots?.([position, "BN"]),
    );
    assert.equal(
      result[0]!.BS,
      "",
      `${position}: no played alternative means no bad start`,
    );
    assert.equal(result[0]!.bestPos, position);
    assert.equal(result[1]!.bestPos, "BN");
    assert.equal(result[0]!.GS, "1");
  }
});

void test("equal-rated played alternatives preserve the actual starter rather than inventing a bad start", async () => {
  const builder = await getLineupBuilder();
  const source = [
    {
      seasonId: "s",
      gshlTeamId: "t",
      date: "2026-10-20",
      playerId: "z-starter",
      nhlPos: ["C"],
      posGroup: "F",
      GP: "1",
      GS: "1",
      dailyPos: "C",
      Rating: 10,
    },
    {
      seasonId: "s",
      gshlTeamId: "t",
      date: "2026-10-20",
      playerId: "a-bench",
      nhlPos: ["C"],
      posGroup: "F",
      GP: "1",
      GS: "",
      dailyPos: "BN",
      Rating: 10,
    },
  ];
  const result = refreshPlayerDayLineupContext(
    source,
    builder.optimizeLineup,
    builder.buildLineupStructureFromRosterSpots?.(["C", "BN"]),
  );
  assert.equal(result[0]!.BS, "");
  assert.equal(result[0]!.bestPos, "C");
  assert.equal(result[1]!.bestPos, "BN");

  // Exercise the custom-slot search too: the same position has different eligibility.
  const custom = refreshPlayerDayLineupContext(
    [...source, { ...source[0]!, playerId: "z-second-starter" }],
    builder.optimizeLineup,
    [
      { position: "C", eligiblePositions: ["C"] },
      { position: "C", eligiblePositions: ["C", "LW"] },
    ],
  );
  assert(custom.every((row) => row.BS === ""));
  assert.equal(custom[0]!.bestPos, "C");
  assert.equal(custom[2]!.bestPos, "C");
  assert.equal(custom[1]!.bestPos, "BN");
});

void test("live days retain stats and recorded slots without running hindsight optimization", () => {
  const source = [
    {
      seasonId: "s",
      gshlTeamId: "t",
      playerId: "p",
      date: "2026-10-25",
      GP: "1",
      G: "2",
      dailyPos: "RW",
      bestPos: "BN",
      fullPos: "RW",
      lineupAccountingFinalized: false,
    },
  ];
  const result = refreshPlayerDayLineupContext(source, () => {
    throw Error("Live optimization should be deferred");
  });
  assert.equal(result[0]!.G, "2");
  assert.equal(result[0]!.dailyPos, "RW");
  assert.equal(result[0]!.MS, "");
  assert.equal(result[0]!.BS, "");
});

void test("fresh ratings replace stale hindsight positions without changing the manager's lineup", async () => {
  const builder = await getLineupBuilder();
  const identity = {
    seasonId: "season",
    gshlTeamId: "team",
    date: "2026-10-24",
    nhlPos: ["RW"],
    posGroup: "F",
    GP: "1",
  };
  const source = [
    {
      ...identity,
      playerId: "starter",
      dailyPos: "RW",
      GS: "1",
      fullPos: "RW",
      bestPos: "RW",
      Rating: 10,
    },
    {
      ...identity,
      playerId: "bench",
      dailyPos: "BN",
      GS: "",
      fullPos: "BN",
      bestPos: "BN",
      Rating: 90,
    },
  ];
  const before = structuredClone(source);
  const result = refreshPlayerDayLineupContext(
    source,
    builder.optimizeLineup,
    builder.buildLineupStructureFromRosterSpots?.(["RW", "BN"]),
  );
  assert.deepEqual(source, before);
  assert.equal(result[0]!.BS, "1");
  assert.equal(result[1]!.BS, "");
  assert.equal(result[0]!.bestPos, "BN");
  assert.equal(result[1]!.bestPos, "RW");
  assert.deepEqual(
    result.map((r) => [r.dailyPos, r.GS]),
    source.map((r) => [r.dailyPos, r.GS]),
  );
});

void test("missed starts respect the supplied historical roster slots", async () => {
  const builder = await getLineupBuilder();
  const identity = {
    seasonId: "old-season",
    gshlTeamId: "team",
    date: "2015-01-01",
    nhlPos: ["D"],
    posGroup: "D",
    GP: "1",
  };
  const source = [
    { ...identity, playerId: "started", dailyPos: "D", GS: "1", Rating: 20 },
    { ...identity, playerId: "benched", dailyPos: "BN", GS: "", Rating: 10 },
  ];
  const one = refreshPlayerDayLineupContext(
    source,
    builder.optimizeLineup,
    builder.buildLineupStructureFromRosterSpots?.(["D", "BN"]),
  );
  const two = refreshPlayerDayLineupContext(
    source,
    builder.optimizeLineup,
    builder.buildLineupStructureFromRosterSpots?.(["D", "D", "BN"]),
  );
  assert.equal(one[1]!.MS, "");
  assert.equal(two[1]!.MS, "1");
});
