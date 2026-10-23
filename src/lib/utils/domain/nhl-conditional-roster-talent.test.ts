import assert from "node:assert/strict";
import { test } from "node:test";
import { rankConditionalNhlRosterTalent } from "./nhl-conditional-roster-talent";

function roster() {
  return (["F", "D", "G"] as const).flatMap((position, role) =>
    Array.from(
      { length: position === "F" ? 14 : position === "D" ? 8 : 2 },
      (_, i) => ({
        id: `${position}${i}`,
        nhlPlayerId: role * 100 + i + 1,
        playerName: `${position}${i}`,
        position,
        ratePer60: 1,
        status: "qualified" as const,
      }),
    ),
  );
}
void test("conditional team talent respects one shared regulation ice budget and a goalie split", () => {
  const input = [{ id: "team", name: "Team", abbr: "T", roster: roster() }];
  const copy = structuredClone(input);
  const team = rankConditionalNhlRosterTalent(input)[0]!;
  assert.ok(team.complete);
  assert.ok(Math.abs(team.modeledGar! - 492) < 1e-10); // 360 minutes * 82 / 60.
  assert.ok(Math.abs(team.groups[2]!.total - 82) < 1e-10);
  assert.deepEqual(
    team.groups[2]!.roster.map((p) => p.minutesPerTeamGame),
    [39, 21],
  );
  assert.deepEqual(input, copy);
});
void test("a missing slot stays missing without reallocating its ice time or dropping negative GAR", () => {
  const players = roster();
  const full = rankConditionalNhlRosterTalent([
    { id: "full", name: "Full", abbr: "F", roster: players },
  ])[0]!;
  const partial = rankConditionalNhlRosterTalent([
    {
      id: "partial",
      name: "Partial",
      abbr: "P",
      roster: players.filter((p) => p.id !== "D7"),
    },
  ])[0]!;
  assert.ok(!partial.complete);
  assert.ok(partial.modeledGar! < full.modeledGar!);
  const negative = rankConditionalNhlRosterTalent([
    {
      id: "negative",
      name: "Negative",
      abbr: "N",
      roster: players.map((p) => ({ ...p, ratePer60: -1 })),
    },
  ])[0]!;
  assert.ok(Math.abs(negative.modeledGar! + 492) < 1e-10);
});
