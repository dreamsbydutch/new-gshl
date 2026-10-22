import assert from "node:assert/strict";
import test from "node:test";
import { alignHistoricalShotTypes } from "./historical-shot-type-alignment";
function fixture() {
  const native = [
      {
        eventId: 10,
        sortOrder: 3,
        typeDescKey: "shot-on-goal",
        periodDescriptor: { number: 1, periodType: "REG" },
        timeInPeriod: "01:00",
        details: {
          eventOwnerTeamId: 1,
          shootingPlayerId: 100,
          goalieInNetId: 200,
          shotType: "backhand",
          xCoord: 60,
          yCoord: 5,
        },
      },
      {
        eventId: 11,
        sortOrder: 4,
        typeDescKey: "shot-on-goal",
        periodDescriptor: { number: 1, periodType: "REG" },
        timeInPeriod: "01:00",
        details: {
          eventOwnerTeamId: 1,
          shootingPlayerId: 100,
          goalieInNetId: 200,
          shotType: "wrist",
          xCoord: 70,
          yCoord: 7,
        },
      },
    ],
    primary = [
      {
        ordinal: 20,
        period: 1,
        second: 60,
        kind: "shot-on-goal",
        team: 1,
        shooter: 100,
        goalie: 200,
        shotType: "Backhand",
      },
      {
        ordinal: 22,
        period: 1,
        second: 60,
        kind: "shot-on-goal",
        team: 1,
        shooter: 100,
        goalie: 200,
        shotType: "Wrist",
      },
    ],
    provider = [
      {
        ordinal: 20,
        period: 1,
        second: 60,
        kind: "SHOT",
        shooter: 100,
        goalie: 200,
        home: true,
        shotType: "BACK",
      },
      {
        ordinal: 22,
        period: 1,
        second: 60,
        kind: "SHOT",
        shooter: 100,
        goalie: 200,
        home: true,
        shotType: "WRIST",
      },
    ];
  return { native, primary, provider };
}
test("three-source complete type bijection is unique and independent of all array orders", () => {
  const f = fixture(),
    before = JSON.stringify(f);
  for (const n of [f.native, [...f.native].reverse()])
    for (const p of [f.primary, [...f.primary].reverse()])
      for (const r of [f.provider, [...f.provider].reverse()]) {
        const result = alignHistoricalShotTypes(n, p, r, 1);
        assert.equal(result.status, "unique");
        assert.deepEqual(
          [...result.matches].sort((a, b) => a.ordinal - b.ordinal),
          [
            { ordinal: 20, eventId: 10 },
            { ordinal: 22, eventId: 11 },
          ],
        );
      }
  assert.equal(JSON.stringify(f), before);
});
test("identical types remain ambiguous without assigning IDs or pretending primary identity", () => {
  const f = fixture();
  f.native[1]!.details.shotType = "backhand";
  f.primary[1]!.shotType = "Backhand";
  f.provider[1]!.shotType = "BACK";
  const r = alignHistoricalShotTypes(f.native, f.primary, f.provider, 1);
  assert.equal(r.status, "ambiguous");
  assert.deepEqual(r.matches, []);
});
test("missing facts, mismatched types/clocks/roles, duplicate IDs and incomplete groups fail closed", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.provider[0]!.shotType = "WRIST";
    },
    (f: ReturnType<typeof fixture>) => {
      f.native[0]!.details.shotType = "unknown";
    },
    (f: ReturnType<typeof fixture>) => {
      f.native[0]!.details.goalieInNetId = 201;
    },
    (f: ReturnType<typeof fixture>) => {
      f.native[0]!.sortOrder = NaN;
    },
    (f: ReturnType<typeof fixture>) => {
      f.primary[0]!.second = 61;
    },
    (f: ReturnType<typeof fixture>) => {
      f.native[0]!.eventId = 11;
    },
    (f: ReturnType<typeof fixture>) => {
      f.provider.pop();
    },
    (f: ReturnType<typeof fixture>) => {
      f.provider[0]!.home = false;
    },
    (f: ReturnType<typeof fixture>) => {
      f.primary[0]!.shotType = "WRIST-ISH";
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(
      alignHistoricalShotTypes(f.native, f.primary, f.provider, 1).status,
      "unavailable",
    );
  }
});
test("no type reassignment or geometry editing can be hidden in a source identity result", () => {
  const f = fixture(),
    original = structuredClone(f);
  const r = alignHistoricalShotTypes(f.native, f.primary, f.provider, 1);
  assert.equal(r.status, "unique");
  assert.deepEqual(f, original);
  assert.deepEqual(
    r.matches.map(
      (m) => f.native.find((n) => n.eventId === m.eventId)!.details.shotType,
    ),
    ["backhand", "wrist"],
  );
});
