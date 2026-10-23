import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import type { RetainedBoundaryFixture } from "./boundary-shift-fixtures";
import { reconcileBoundaryShiftReports } from "./boundary-shift-reconciliation";

const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const compressed = readFileSync(
  new URL(
    "./fixtures/reviewed-2008-late-horn-reports.json.gz",
    import.meta.url,
  ),
);
assert.equal(
  hash(compressed),
  "6512f71fd232813413495df22a97a60b3617b617e0edcac8bacb09b097ed5ed8",
);
type Fixture = RetainedBoundaryFixture & {
  sourceHashes: {
    effectivePbp: string;
    rawPbp: string;
    box: string;
    homeReport: string;
    awayReport: string;
  };
};
const saved: { version: string; records: Fixture[] } = JSON.parse(
  gunzipSync(compressed).toString(),
);
assert.equal(saved.version, "retained-2008-late-horn-fixtures-v1");
assert.deepEqual(
  saved.records.map((f) => f.pbp.id),
  [2008020115, 2008020148, 2008020868],
);
const expected = [
  {
    id: 2008020115,
    home: false,
    opposite: 422,
    goalieWitnesses: 49,
    playerId: 8457063,
  },
  {
    id: 2008020148,
    home: true,
    opposite: 333,
    goalieWitnesses: 27,
    playerId: 8469544,
  },
  {
    id: 2008020868,
    home: true,
    opposite: 378,
    goalieWitnesses: 31,
    playerId: 8471702,
  },
];
for (const scope of expected) {
  const f = saved.records.find((f) => f.pbp.id === scope.id)!;
  test(`${scope.id} conserves every native workload and period/strength total without changing inputs or opposite side`, () => {
    assert.equal(hash(JSON.stringify(f.pbp)), f.sourceHashes.effectivePbp);
    assert.equal(hash(JSON.stringify(f.box)), f.sourceHashes.box);
    assert.equal(hash(f.reports.home), f.sourceHashes.homeReport);
    assert.equal(hash(f.reports.away), f.sourceHashes.awayReport);
    const before = JSON.stringify(f);
    const result = reconcileBoundaryShiftReports(
      f.pbp,
      f.box,
      f.reports,
      f.apiShifts,
    );
    assert.equal(result.shiftRecovery.players.length, 19);
    assert.equal(result.shiftRecovery.corrections.length, 5);
    assert.equal(result.shiftRecovery.goalieWitnesses, scope.goalieWitnesses);
    assert.equal(
      result.shiftRecovery.unchangedOppositeSideIntervals,
      scope.opposite,
    );
    for (const player of result.shiftRecovery.players) {
      assert.equal(player.intervalSeconds, player.nativeSeconds);
      for (const period of player.periods)
        assert.equal(period.intervalSeconds, period.officialSeconds);
    }
    assert.equal(JSON.stringify(f), before);
  });
  test(`${scope.id} rejects altered report, native workload and an available API alternative`, () => {
    const side = scope.home ? "home" : "away";
    const badReports = {
      ...f.reports,
      [side]: f.reports[side].replace(/43:43|43:25|43:45/, "43:46"),
    };
    assert.notEqual(badReports[side], f.reports[side]);
    assert.throws(
      () => reconcileBoundaryShiftReports(f.pbp, f.box, badReports, []),
      /source|report/i,
    );
    const box = structuredClone(f.box);
    const person = Object.values(
      box.playerByGameStats[scope.home ? "homeTeam" : "awayTeam"]!,
    )
      .flat()
      .find((p) => p.playerId === scope.playerId)!;
    person.toi = "00:01";
    assert.throws(
      () => reconcileBoundaryShiftReports(f.pbp, box, f.reports, []),
      /native|TOI|appearance/i,
    );
    assert.throws(
      () =>
        reconcileBoundaryShiftReports(f.pbp, f.box, f.reports, [
          { gameId: scope.id },
        ]),
      /API|empty/i,
    );
  });
}
test("late horns preserve exact period suffixes and prefixes; zero-length markers add no exposure", () => {
  const corrections = (gameId: number, playerId: number) => {
    const f = saved.records.find((f) => f.pbp.id === gameId)!;
    return reconcileBoundaryShiftReports(
      f.pbp,
      f.box,
      f.reports,
      [],
    ).shiftRecovery.corrections.find((c) => c.playerId === playerId)!
      .replacements;
  };
  for (const id of [8466149, 8446485, 8470047])
    assert.deepEqual(corrections(2008020115, id), [
      { period: 1, start: 1200, end: 1200 },
    ]);
  for (const id of [8457063, 8467856])
    assert.deepEqual(corrections(2008020115, id), [
      { period: 1, start: 1200, end: 1200 },
      { period: 2, start: 0, end: 56 },
    ]);
  assert.deepEqual(corrections(2008020148, 8469544), [
    { period: 1, start: 1162, end: 1200 },
  ]);
  for (const id of [8471702, 8458172])
    assert.deepEqual(corrections(2008020868, id), [
      { period: 2, start: 1198, end: 1200 },
    ]);
  for (const id of [8459024, 8468505])
    assert.deepEqual(corrections(2008020868, id), [
      { period: 2, start: 1179, end: 1200 },
      { period: 3, start: 0, end: 37 },
    ]);
  assert.deepEqual(corrections(2008020868, 8467371), [
    { period: 2, start: 1200, end: 1200 },
    { period: 3, start: 0, end: 37 },
  ]);
});
