import assert from "node:assert/strict";
import test from "node:test";
import { buildLockerRoomTeamOptions } from "./locker-room-header";

const seasons = [
  { id: "z-old", year: 2020 },
  { id: "a-last", year: 2023 },
  { id: "current", year: 2026 },
  { id: "future", year: 2027 },
];
function team(
  id: string,
  ownerId: string | null,
  seasonId: string,
  active: boolean,
  name = id,
) {
  return {
    id,
    ownerId,
    seasonId,
    ownerIsActive: active,
    isActive: active,
    name,
  };
}

void test("active owners precede inactive owners with one representative per owner", () => {
  const rows = [
    team("former-old", "former", "z-old", false),
    team("z", "active-z", "current", true),
    team("former-last", "former", "a-last", false),
    team("a", "active-a", "current", true),
    team("unowned", null, "current", false),
  ];
  const before = structuredClone(rows);
  const result = buildLockerRoomTeamOptions(rows, seasons, "current");
  assert.deepEqual(
    result.activeTeams.map((row) => row.id),
    ["a", "z"],
  );
  assert.deepEqual(
    result.inactiveTeams.map((row) => row.id),
    ["former-last"],
  );
  assert.deepEqual(
    result.teamOptions.map((row) => row.ownerId),
    ["active-a", "active-z", "former"],
  );
  assert.deepEqual(rows, before);
});

void test("current active teams take precedence over future and older team rows", () => {
  const rows = [
    team("next", "owner", "future", true),
    team("now", "owner", "current", true),
    team("old", "owner", "a-last", true),
  ];
  assert.equal(
    buildLockerRoomTeamOptions(rows, seasons, "current").teamOptions[0]?.id,
    "now",
  );
});

void test("inactive owners use their newest season even across different franchises", () => {
  const rows = [
    team("z-old-franchise", "former", "z-old", false),
    team("a-new-franchise", "former", "a-last", false),
  ];
  assert.equal(
    buildLockerRoomTeamOptions(rows, seasons, "current").inactiveTeams[0]?.id,
    "a-new-franchise",
  );
});

void test("owner activity, not a historical franchise flag, determines the inactive group", () => {
  const row = { ...team("latest", "owner", "a-last", true), isActive: false };
  assert.equal(
    buildLockerRoomTeamOptions([row], seasons, "current").activeTeams.length,
    1,
  );
  assert.deepEqual(
    buildLockerRoomTeamOptions([], seasons, "current").teamOptions,
    [],
  );
});
