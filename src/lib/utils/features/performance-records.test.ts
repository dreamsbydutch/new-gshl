import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPerformanceRecords,
  recordNumber,
  recordWindow,
} from "./performance-records";
import type { RecordObservation } from "../../types/performance-records";
const row = (
  id: string,
  G: unknown,
  extra: Record<string, unknown> = {},
  kind: "team" | "player" = "team",
): RecordObservation => ({
  id,
  entityId: id,
  kind,
  stats: { G, GP: 20, ...extra },
  label: id,
  matchupId: id,
});
void test("badges start on Saturday in Toronto for a Sunday-ending week", () => {
  const check = (date: string) =>
    recordWindow("2026-09-28", "2026-10-04", Date.parse(date));
  assert.equal(check("2026-09-28T18:00:00Z"), false);
  assert.equal(check("2026-10-03T03:59:59Z"), false);
  assert.equal(check("2026-10-03T04:00:00Z"), true);
  assert.equal(check("2026-10-06T12:00:00Z"), true);
  assert.equal(recordWindow(null, "2026-10-04", Date.now()), false);
  assert.equal(recordWindow("2026-10-04", "2026-09-28", Date.now()), false);
});
void test("new lows, ties and a lower historical result are distinct", () => {
  const current = row("current", 1);
  const history = [row("a", 2), row("b", 8)];
  assert.equal(
    buildPerformanceRecords([current], history, true)[0]?.tied,
    false,
  );
  const tied = buildPerformanceRecords(
    [current],
    [...history, row("c", 1), row("d", 1)],
    false,
  )[0]!;
  assert.equal(tied.tied, true);
  assert.equal(tied.ties, 2);
  assert.equal(tied.provisional, false);
  assert.deepEqual(
    buildPerformanceRecords([current], [...history, row("zero", 0)], false),
    [],
  );
});
void test("missing values and no participation cannot become record lows", () => {
  for (const value of [null, undefined, "", " ", "bad", false, Infinity])
    assert.equal(recordNumber(value), null);
  assert.equal(recordNumber("0"), 0);
  const history = [row("a", 2), row("b", 8), row("missing", null)];
  assert.equal(
    buildPerformanceRecords([row("x", 1)], history, false)[0]?.compared,
    2,
  );
  assert.deepEqual(
    buildPerformanceRecords([row("x", 0, { GP: 0 })], history, false),
    [],
  );
});
void test("players only receive positive highs after meaningful participation", () => {
  const history = [row("a", 1, {}, "player"), row("b", 4, {}, "player")];
  assert.equal(
    buildPerformanceRecords(
      [row("x", 5, { GP: 2 }, "player")],
      history,
      true,
    )[0]?.direction,
    "high",
  );
  assert.deepEqual(
    buildPerformanceRecords([row("x", 0, {}, "player")], history, false),
    [],
  );
  assert.deepEqual(
    buildPerformanceRecords([row("x", 5, { GP: 1 }, "player")], history, false),
    [],
  );
});
void test("goalie counts require starts and rate stats are excluded", () => {
  const history = [
    row("a", null, { SV: 10, GS: 3 }),
    row("b", null, { SV: 30, GS: 4 }),
  ];
  assert.deepEqual(
    buildPerformanceRecords(
      [row("x", null, { SV: 0, GS: 0, SVP: 1 })],
      history,
      false,
    ),
    [],
  );
  assert.equal(
    buildPerformanceRecords(
      [row("x", null, { SV: 0, GS: 3 })],
      history,
      false,
    )[0]?.stat,
    "SV",
  );
});
void test("a finalized performance never compares against itself", () => {
  const current = row("x", 1);
  const history = [row("a", 2), row("b", 8), current];
  const before = JSON.stringify(history);
  assert.equal(
    buildPerformanceRecords([current], history, false)[0]?.tied,
    false,
  );
  assert.equal(JSON.stringify(history), before);
});
