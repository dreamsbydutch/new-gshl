import assert from "node:assert/strict";
import test from "node:test";
import { buildDraftRosterOutcomes } from "./draft-roster-outcomes";

const pick = {
  id: "pick",
  playerId: "p",
  teamId: "team",
  pick: 1,
  round: 1,
  isSigning: false,
};
const row = (date: string, playerId = "p", teamId = "team") => ({
  date,
  playerId,
  teamId,
});
const base = {
  picks: [pick],
  start: "2024-10-01",
  end: "2024-10-04",
  today: "2025-01-01",
  days: [
    row("2024-10-01"),
    row("2024-10-02"),
    row("2024-10-03", "other"),
    row("2024-10-04"),
  ],
  contracts: [],
};
const outcome = (input: Parameters<typeof buildDraftRosterOutcomes>[0]) =>
  buildDraftRosterOutcomes(input).get("pick");

void test("full regular-season retention does not require postseason snapshots", () => {
  const input = {
    ...base,
    end: "2024-10-10",
    regularSeasonEnd: "2024-10-04",
    days: [1, 2, 3, 4].map((day) => row(`2024-10-0${day}`)),
  };
  assert.deepEqual(outcome(input), {
    label: "Full season",
    date: "2024-10-04",
  });
  assert.deepEqual(
    outcome({ ...input, days: [...input.days, row("2024-10-05", "other")] }),
    outcome(input),
  );
  assert.deepEqual(outcome({ ...input, today: "2024-10-03" }), {
    label: "Still rostered",
    date: "2024-10-03",
  });
  assert.equal(
    outcome({ ...input, days: [row("2024-10-01"), row("2024-10-04")] })?.label,
    "Roster history incomplete",
  );
  assert.deepEqual(outcome({ ...input, days: base.days }), {
    label: "Dropped",
    date: "2024-10-03",
  });
});

void test("drop is first absence after opening stint, even after a later return", () => {
  assert.deepEqual(outcome(base), { label: "Dropped", date: "2024-10-03" });
  assert.deepEqual(
    outcome({ ...base, days: [...base.days].reverse() }),
    outcome(base),
  );
});

void test("missing or other-team snapshots do not prove a drop", () => {
  assert.equal(
    outcome({ ...base, days: [] })?.label,
    "Roster history unavailable",
  );
  assert.equal(
    outcome({
      ...base,
      days: [row("2024-10-01"), row("2024-10-02", "other", "elsewhere")],
    })?.label,
    "Roster history incomplete",
  );
  assert.equal(
    outcome({ ...base, days: [row("2024-10-01", "other")] })?.label,
    "Not on opening roster",
  );
});

void test("dated contract exit identifies buyout, trade, retirement and expiry", () => {
  for (const [status, label] of [
    ["Buyout", "Bought out"],
    ["Trade", "Traded"],
    ["Retired", "Retired"],
    ["UFA", "Contract expired"],
  ]) {
    assert.deepEqual(
      outcome({
        ...base,
        contracts: [
          {
            playerId: "p",
            start: "2024-09-01",
            end: "2024-10-02",
            status: status!,
          },
        ],
      }),
      { label, date: "2024-10-03" },
    );
  }
});

void test("a later buyout or another player's contract cannot relabel an earlier drop", () => {
  for (const contract of [
    { playerId: "p", start: "2024-09-01", end: "2025-04-01", status: "Buyout" },
    {
      playerId: "other",
      start: "2024-09-01",
      end: "2024-10-02",
      status: "Trade",
    },
  ])
    assert.equal(outcome({ ...base, contracts: [contract] })?.label, "Dropped");
});

void test("contract evidence remains visible when daily archives are missing", () => {
  assert.deepEqual(
    outcome({
      ...base,
      days: [],
      contracts: [
        {
          playerId: "p",
          start: "2024-09-01",
          end: "2024-10-02",
          status: "Buyout",
        },
      ],
    }),
    { label: "Bought out (contract record)", date: "2024-10-02" },
  );
});

void test("completed, in-progress and future seasons have distinct outcomes", () => {
  const days = [1, 2, 3, 4].map((day) => row(`2024-10-0${day}`));
  assert.equal(outcome({ ...base, days })?.label, "Full season");
  assert.deepEqual(outcome({ ...base, days, today: "2024-10-03" }), {
    label: "Still rostered",
    date: "2024-10-03",
  });
  assert.deepEqual(
    outcome({ ...base, days: days.slice(0, 2), today: "2024-10-03" }),
    { label: "Still rostered", date: "2024-10-02" },
  );
  assert.equal(
    outcome({ ...base, days: [], today: "2024-09-30" })?.label,
    "Season not started",
  );
});
