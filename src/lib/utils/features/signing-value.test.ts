import assert from "node:assert/strict";
import test from "node:test";
import type {
  DraftResultInput,
  DraftSigningContract,
} from "../../types/draft-history";
import {
  buildSigningValues,
  expectedSigningRating,
  openingSigningSalary,
} from "./signing-value";
import { buildDraftHistoryPicks } from "./draft-history";

const contract: DraftSigningContract = {
  id: "contract",
  playerId: "player",
  ownerId: "owner",
  salary: 4_000_000,
  start: "2023-10-01",
  end: "2025-07-01",
  signed: "2023-06-01",
};
const pick: DraftResultInput = {
  id: "pick",
  playerId: "player",
  teamId: "team",
  pick: 20,
  round: "S",
  isSigning: true,
};
const input = {
  picks: [pick],
  teams: [{ id: "team", ownerId: "owner" }],
  contracts: [contract],
  seasonStart: "2024-10-01",
  ratings: [{ playerId: "player", rating: 80 }],
};

void test("salary curve matches the historical fit and refuses unsupported prices", () => {
  assert.ok(
    Math.abs(expectedSigningRating(4_000_000)! - 70.00697140590668) < 1e-9,
  );
  assert.ok(
    expectedSigningRating(12_500_000)! > expectedSigningRating(1_000_000)!,
  );
  for (const salary of [null, NaN, Infinity, 0, -1, 999_999, 12_500_001])
    assert.equal(expectedSigningRating(salary), null);
});

void test("historical salary uses the owner's dated opening contract, not a later renewal", () => {
  const contracts = [
    { ...contract, id: "renewal", start: "2025-10-01", salary: 10_000_000 },
    { ...contract, id: "other-owner", ownerId: "other", salary: 8_000_000 },
    { ...contract, id: "expired", end: "2024-09-30", salary: 9_000_000 },
    {
      ...contract,
      id: "future-signing",
      signed: "2024-10-02",
      salary: 7_000_000,
    },
    contract,
  ];
  const before = structuredClone(contracts);
  assert.equal(
    openingSigningSalary(contracts, "player", "owner", input.seasonStart),
    4_000_000,
  );
  assert.deepEqual(contracts, before);
  assert.equal(
    openingSigningSalary(
      [contract, { ...contract, id: "conflict", salary: 5_000_000 }],
      "player",
      "owner",
      input.seasonStart,
    ),
    null,
  );
  assert.equal(openingSigningSalary([contract], "player", "owner", null), null);
  assert.equal(
    openingSigningSalary([contract], "missing", "owner", input.seasonStart),
    null,
  );
});

void test("team value averages rated unique signings, with competition ties and coverage", () => {
  const expected = expectedSigningRating(4_000_000)!;
  const fixture = {
    ...input,
    teams: [
      ...input.teams,
      { id: "second", ownerId: "owner" },
      { id: "third", ownerId: "owner" },
      { id: "ungraded", ownerId: null },
    ],
    picks: [
      pick,
      { ...pick, id: "duplicate" },
      { ...pick, id: "missing", playerId: "missing" },
      { ...pick, id: "second", teamId: "second" },
      { ...pick, id: "third", teamId: "third", playerId: "third" },
      { ...pick, id: "ungraded", teamId: "ungraded" },
      { ...pick, id: "draft", isSigning: false },
    ],
    contracts: [contract, { ...contract, id: "third", playerId: "third" }],
    ratings: [
      { playerId: "player", rating: expected + 10 },
      { playerId: "third", rating: expected - 5 },
    ],
  };
  const before = structuredClone(fixture);
  const result = buildSigningValues(fixture);
  assert.deepEqual(result.teams, [
    { teamId: "team", score: 10, rank: 1, rankedTeams: 3, graded: 1, total: 2 },
    {
      teamId: "second",
      score: 10,
      rank: 1,
      rankedTeams: 3,
      graded: 1,
      total: 1,
    },
    {
      teamId: "third",
      score: -5,
      rank: 3,
      rankedTeams: 3,
      graded: 1,
      total: 1,
    },
    {
      teamId: "ungraded",
      score: null,
      rank: null,
      rankedTeams: 3,
      graded: 0,
      total: 1,
    },
  ]);
  assert.equal(result.values.has("draft"), false);
  assert.deepEqual(fixture, before);
  const zero = buildSigningValues({
    ...input,
    ratings: [{ playerId: "player", rating: 0 }],
  }).values.get("pick");
  assert.equal(zero?.value, -expected);
  const missing = buildSigningValues({ ...input, ratings: [] }).values.get(
    "pick",
  );
  assert.equal(missing?.salary, 4_000_000);
  assert.equal(missing?.value, null);
  const multiple = buildSigningValues({
    ...input,
    picks: [pick, { ...pick, id: "second-player", playerId: "second-player" }],
    contracts: [contract, { ...contract, id: "second-contract", playerId: "second-player" }],
    ratings: [
      { playerId: "player", rating: expected + 10 },
      { playerId: "second-player", rating: expected + 30 },
    ],
  });
  assert.equal(multiple.teams[0]?.score, 20);
  assert.equal(multiple.teams[0]?.graded, 2);
});

void test("signing value fields cannot turn signings into graded draft picks", () => {
  const values = buildSigningValues(input).values;
  const result = buildDraftHistoryPicks({
    picks: [pick],
    teamIds: ["team"],
    totals: [{ playerId: "player", rating: 80, days: 180, position: "F" }],
    splits: [],
    players: [],
    signingValues: values,
  });
  assert.equal(result[0]?.salary, 4_000_000);
  assert.equal(result[0]?.signingValue, values.get("pick")?.value);
  assert.equal(result[0]?.expectedRating, null);
  assert.equal(result[0]?.surplus, null);
});
