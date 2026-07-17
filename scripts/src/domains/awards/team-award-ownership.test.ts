import assert from "node:assert/strict";
import test from "node:test";
import { mapTeamAwardPodiumToOwners } from "./team-award-ownership";

void test("maps team award winners and nominees to owner IDs", () => {
  const result = mapTeamAwardPodiumToOwners(
    { winnerId: "team-a", nomineeIds: ["team-b", "team-c"] },
    new Map([
      ["team-a", "owner-a"],
      ["team-b", "owner-b"],
      ["team-c", "owner-c"],
    ]),
  );

  assert.deepEqual(result, {
    ownerId: "owner-a",
    nomineeIds: ["owner-b", "owner-c"],
  });
});

void test("deduplicates nominees when an owner has multiple team records", () => {
  const result = mapTeamAwardPodiumToOwners(
    { winnerId: "team-a", nomineeIds: ["team-b-old", "team-b-new"] },
    new Map([
      ["team-a", "owner-a"],
      ["team-b-old", "owner-b"],
      ["team-b-new", "owner-b"],
    ]),
  );

  assert.deepEqual(result?.nomineeIds, ["owner-b"]);
});
