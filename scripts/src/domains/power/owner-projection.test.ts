import assert from "node:assert/strict";
import test from "node:test";
import {
  projectOwners,
  type OwnerProjectionInput,
} from "../../runtime/owner-projection";

function fixture(): OwnerProjectionInput {
  return {
    season: { id: "current", year: 2027 },
    seasons: [2022, 2023, 2024, 2025, 2026, 2027, 2028].map((year) => ({
      id: String(year),
      year,
    })),
    teams: [
      { id: "new-team", franchiseId: "new-franchise" },
      { id: "rookie", ownerId: "rookie" },
    ],
    historicalTeams: [{ id: "old-team", franchiseId: "old-franchise" }],
    franchises: [
      { id: "new-franchise", ownerId: "owner" },
      { id: "old-franchise", ownerId: "owner" },
    ],
    teamSeasons: [
      {
        seasonId: "2026",
        gshlTeamId: "old-team",
        seasonType: "RS",
        teamW: 18,
        teamL: 2,
      },
    ],
  };
}

void test("owner history follows the person across franchises, with neutral new owners", () => {
  const input = fixture(),
    before = structuredClone(input);
  const result = projectOwners(input);
  assert.equal(result.get("new-team")!.winRate, 0.7);
  assert.equal(result.get("new-team")!.weightedGames, 20);
  assert.equal(result.get("rookie")!.score, 0);
  assert.deepEqual(input, before);
  input.teams[0]!.ownerId = "new-owner";
  assert.equal(projectOwners(input).get("new-team")!.score, 0);
});

void test("current, future, old, playoff and malformed records cannot leak into owner projection", () => {
  const input = fixture(),
    expected = projectOwners(input);
  for (const seasonId of ["2022", "2027", "2028", "missing"]) {
    input.teamSeasons.push({ ...input.teamSeasons[0], seasonId, teamW: 99 });
  }
  input.teamSeasons.push({
    ...input.teamSeasons[0],
    seasonType: "PO",
    teamW: 99,
  });
  input.teamSeasons.push({ ...input.teamSeasons[0], teamW: -1 });
  input.teamSeasons.push({ ...input.teamSeasons[0], teamW: "invalid" });
  assert.deepEqual(projectOwners(input), expected);
});

void test("older seasons decay, ties count half, and small samples shrink toward average", () => {
  const input = fixture();
  input.teamSeasons = [
    { ...input.teamSeasons[0], seasonId: "2024", teamW: 8, teamL: 0, teamT: 2 },
  ];
  const result = projectOwners(input).get("new-team")!;
  assert.equal(result.weightedGames, 5);
  assert.equal(result.winRate, 14.5 / 25);
  assert.ok(result.winRate < 0.9);
});
