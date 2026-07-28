import assert from "node:assert/strict";
import test from "node:test";
import type { LineupCandidate, RosterPosition } from "@gshl-types";
import { generateLineupAssignments } from "./draft-admin";

function candidate(
  id: string,
  overallRating: number,
  nhlPos: RosterPosition[],
  lineupPos: RosterPosition | null,
): LineupCandidate {
  return {
    id,
    overallRating,
    nhlPos,
    lineupPos,
  };
}

void test("regenerates the whole lineup after a stronger player is drafted", () => {
  const assignments = generateLineupAssignments([
    candidate("drafted-center", 95, ["C"], "BN"),
    candidate("starting-center", 90, ["C"], "C"),
    candidate("displaced-center", 80, ["C"], "C"),
    candidate("injured-center", 99, ["C"], "IR"),
  ]);
  const lineupByPlayerId = new Map(
    assignments.map((assignment) => [
      assignment.playerId,
      assignment.lineupPos,
    ]),
  );

  assert.equal(lineupByPlayerId.get("drafted-center"), "C");
  assert.equal(lineupByPlayerId.get("starting-center"), "C");
  assert.equal(lineupByPlayerId.get("displaced-center"), "Util");
  assert.equal(lineupByPlayerId.get("injured-center"), "IR");
});

void test("optimizes multi-position players across the tiered lineup", () => {
  const assignments = generateLineupAssignments([
    candidate("dual-star", 100, ["LW", "C"], null),
    candidate("left-wing", 99, ["LW"], null),
    candidate("center", 10, ["C"], null),
  ]);
  const lineupByPlayerId = new Map(
    assignments.map((assignment) => [
      assignment.playerId,
      assignment.lineupPos,
    ]),
  );

  assert.equal(lineupByPlayerId.get("dual-star"), "C");
  assert.equal(lineupByPlayerId.get("left-wing"), "LW");
  assert.equal(lineupByPlayerId.get("center"), "C");
});
