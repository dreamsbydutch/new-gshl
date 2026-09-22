import assert from "node:assert/strict";
import test from "node:test";
import { buildDraftHistoryPicks, draftNumber } from "./draft-history";
import { expectedDraftRating } from "./draft-slot-curve";
import type {
  DraftPerformance,
  DraftResultInput,
} from "../../types/draft-history";

const picks: DraftResultInput[] = [
  {
    id: "1",
    playerId: "a",
    teamId: "ours",
    pick: 1,
    round: 1,
    isSigning: false,
  },
  {
    id: "2",
    playerId: "b",
    teamId: "other",
    pick: 2,
    round: 1,
    isSigning: false,
  },
  {
    id: "3",
    playerId: "c",
    teamId: "ours",
    pick: 3,
    round: 2,
    isSigning: false,
  },
  {
    id: "4",
    playerId: "d",
    teamId: "ours",
    pick: 4,
    round: 2,
    isSigning: false,
  },
  {
    id: "5",
    playerId: "e",
    teamId: "ours",
    pick: 5,
    round: "S",
    isSigning: true,
  },
];
const totals: DraftPerformance[] = [
  { playerId: "a", rating: 60, days: 100, position: "F" },
  { playerId: "b", rating: 100, days: 100, position: "G" },
  { playerId: "c", rating: 90, days: 100, position: "D" },
  { playerId: "e", rating: 125, days: 100, position: "F" },
];
const input = { picks, totals, splits: [], players: [], teamIds: ["ours"] };

void test("slot value uses the league draft pool and excludes signings", () => {
  const result = buildDraftHistoryPicks(input);
  assert.deepEqual(
    result.map((pick) => pick.id),
    ["1", "3", "4", "5"],
  );
  assert.equal(result[0]?.expectedRating, expectedDraftRating(1, 4));
  assert.equal(result[0]?.surplus, 60 - expectedDraftRating(1, 4)!);
  assert.equal(result[1]?.expectedRating, expectedDraftRating(3, 4));
  assert.ok((result[1]?.surplus ?? 0) > 0);
  assert.equal(result[3]?.surplus, null);
});

void test("team production and roster days stay separate from overall success", () => {
  const result = buildDraftHistoryPicks({
    ...input,
    seasonDays: 200,
    splits: [
      { playerId: "c", teamId: "other", rating: 90, days: 80, position: "D" },
      { playerId: "c", teamId: "ours", rating: 20, days: 20, position: "D" },
    ],
  });
  assert.equal(result[1]?.teamRating, 20);
  assert.equal(result[1]?.overallRating, 90);
  assert.equal(result[1]?.days, 20);
  assert.equal(result[1]?.usageDays, 100);
  assert.equal(result[1]?.teamDaysPercent, 10);
  assert.equal(result[1]?.usagePercent, 50);
  assert.equal(result[2]?.surplus, null);
  assert.equal(result[2]?.days, null);
  assert.equal(result[2]?.teamDaysPercent, null);
  assert.equal(result[2]?.usagePercent, null);
  assert.equal(buildDraftHistoryPicks(input)[0]?.usagePercent, null);
});

void test("missing ratings stay ungraded; sparse seasons use historical expectations and zero is real", () => {
  assert.equal(draftNumber(null), null);
  assert.equal(draftNumber(""), null);
  assert.equal(draftNumber("0"), 0);
  assert.equal(draftNumber("bad"), null);
  assert.ok(
    buildDraftHistoryPicks({ ...input, totals: [] }).every(
      (pick) => pick.surplus === null,
    ),
  );
  const sparse = buildDraftHistoryPicks({
    ...input,
    totals: totals.slice(0, 1),
  });
  assert.equal(sparse[0]?.surplus, 60 - expectedDraftRating(1, 4)!);
  assert.equal(sparse[1]?.surplus, null);
  const result = buildDraftHistoryPicks({
    ...input,
    totals: totals.map((row) =>
      row.playerId === "a" ? { ...row, rating: 0 } : row,
    ),
  });
  assert.equal(result[0]?.overallRating, 0);
  assert.equal(result[0]?.surplus, -expectedDraftRating(1, 4)!);
});

void test("inputs are not sorted or mutated and unselected slots remain visible", () => {
  const copy = structuredClone(input);
  const unselected = {
    id: "6",
    teamId: "ours",
    pick: 6,
    round: 3,
    isSigning: false,
  };
  const result = buildDraftHistoryPicks({
    ...input,
    picks: [...picks, unselected],
  });
  assert.equal(result.find((pick) => pick.id === "6")?.name, "Unselected pick");
  assert.equal(result.find((pick) => pick.id === "6")?.surplus, null);
  assert.deepEqual(input, copy);
});
