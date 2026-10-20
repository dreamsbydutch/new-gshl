import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedRosterTeamIds,
  selectRosterScoringCohort,
} from "./active-roster-teams";
import { planDailyYahooRosters } from "./daily-roster";

const week = {
  id: "w",
  seasonId: "s",
  weekType: "RS",
  startDate: "2026-04-01",
  endDate: "2026-04-07",
};
const teams = ["d", "a", "c", "b"].map((id) => ({ id, seasonId: "s" }));
const matchup = {
  id: "m",
  seasonId: "s",
  weekId: "w",
  homeTeamId: "a",
  awayTeamId: "b",
};

test("postseason scoring excludes eliminated rosters without inferring clears or ownership drops", () => {
  const player = (yahooId: string) => ({
    yahooId,
    playerName: `Player ${yahooId}`,
    dailyPos: "C",
    nhlPos: ["C"],
  });
  for (const weekType of ["PO", "LT"]) {
    const selected = expectedRosterTeamIds({ ...week, weekType }, teams, [
      matchup,
    ]);
    const raw = [
      { teamId: "a", players: [player("1")] },
      { teamId: "b", players: [player("2")] },
      { teamId: "c", players: [player("3")] },
      { teamId: "d", players: [] },
    ];
    const existing = [
      {
        id: "old-eliminated",
        playerId: "p3",
        seasonId: "s",
        weekId: "w",
        date: "2026-04-01",
        gshlTeamId: "c",
      },
    ];
    const original = JSON.stringify({ raw, existing });
    const cohort = selectRosterScoringCohort(
      selected,
      teams.map((t) => t.id),
      raw,
      existing,
    );
    const plan = planDailyYahooRosters({
      seasonId: "s",
      weekId: "w",
      date: "2026-04-01",
      ...cohort,
      players: ["1", "2", "3"].map((n) => ({ id: `p${n}`, yahooId: n })),
      removeMissing: true,
    });
    assert.deepEqual(
      plan.creates.map((r) => r.gshlTeamId),
      ["a", "b"],
    );
    assert.deepEqual(plan.removals, []);
    assert.deepEqual(plan.conflicts, []);
    assert.equal(cohort.ownershipMaintenanceAllowed, false);
    assert.equal(JSON.stringify({ raw, existing }), original);
    // The importer can omit empty eliminated pages entirely; they are not ownership evidence.
    assert.deepEqual(
      selectRosterScoringCohort(
        selected,
        teams.map((t) => t.id),
        raw.slice(0, 2),
        existing,
      ),
      cohort,
    );
  }
});

test("full regular-season capture retains ownership maintenance; partial or invalid captures fail closed", () => {
  const raw = teams.map((t) => ({ teamId: t.id, players: [] }));
  const selected = expectedRosterTeamIds(week, teams, [matchup]);
  const cohort = selectRosterScoringCohort(
    selected,
    teams.map((t) => t.id),
    raw,
    [],
  );
  assert.equal(cohort.ownershipMaintenanceAllowed, true);
  assert.deepEqual(cohort.rosters, raw);
  assert.throws(
    () =>
      selectRosterScoringCohort(
        selected,
        teams.map((t) => t.id),
        raw.slice(1),
        [],
      ),
    /incomplete/,
  );
  assert.throws(
    () => selectRosterScoringCohort(["unknown"], ["a"], raw, []),
    /belong/,
  );
});

test("regular season requires all teams even if matchup coverage is partial", () => {
  assert.deepEqual(expectedRosterTeamIds(week, teams, [matchup]), [
    "a",
    "b",
    "c",
    "d",
  ]);
});
test("playoff, LT and explicit playoff flag require current participants without eliminated rosters", () => {
  for (const extra of [
    { weekType: "PO" },
    { weekType: "LT" },
    { isPlayoffs: true },
  ]) {
    assert.deepEqual(
      expectedRosterTeamIds({ ...week, ...extra }, teams, [
        matchup,
        {
          ...matchup,
          id: "prior",
          weekId: "previous",
          homeTeamId: "c",
          awayTeamId: "d",
        },
      ]),
      ["a", "b"],
    );
  }
});
test("missing current postseason calendar conservatively requires all teams", () => {
  assert.deepEqual(
    expectedRosterTeamIds({ ...week, weekType: "PO" }, teams, []),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(
    expectedRosterTeamIds({ ...week, weekType: "LT" }, teams, [
      { ...matchup, weekId: "other" },
    ]),
    ["a", "b", "c", "d"],
  );
});
test("invalid canonical references cannot silently exempt teams", () => {
  const postseason = { ...week, weekType: "PO" };
  for (const bad of [
    { ...matchup, homeTeamId: "missing" },
    { ...matchup, awayTeamId: "a" },
    { ...matchup, seasonId: "other" },
    { ...matchup, weekId: "" },
  ])
    assert.throws(() => expectedRosterTeamIds(postseason, teams, [bad]));
  assert.throws(
    () => expectedRosterTeamIds(postseason, [...teams, teams[0]!], [matchup]),
    /Unique/,
  );
  assert.throws(
    () =>
      expectedRosterTeamIds(
        postseason,
        [{ id: "a", seasonId: "other" }],
        [matchup],
      ),
    /same-season/,
  );
  assert.throws(
    () => expectedRosterTeamIds(postseason, teams, [matchup, matchup]),
    /Duplicate/,
  );
  assert.throws(
    () =>
      expectedRosterTeamIds({ ...postseason, _id: "different" }, teams, [
        matchup,
      ]),
    /Conflicting/,
  );
});
test("nonempty valid calendar is required and hydrated epoch dates are accepted", () => {
  for (const extra of [
    { startDate: "" },
    { endDate: null },
    { startDate: "2026-02-31" },
    { startDate: "2026-04-08" },
    { weekType: "unknown" },
  ])
    assert.throws(() =>
      expectedRosterTeamIds({ ...week, ...extra }, teams, []),
    );
  assert.throws(() => expectedRosterTeamIds(week, [], []), /Nonempty/);
  assert.deepEqual(
    expectedRosterTeamIds(
      {
        ...week,
        startDate: Date.parse(week.startDate),
        endDate: new Date(week.endDate),
      },
      teams,
      [],
    ),
    ["a", "b", "c", "d"],
  );
});
test("canonical IDs, input arrays and metadata remain unchanged", () => {
  const input = [
    { _id: "a", seasonId: "s" },
    { _id: "b", seasonId: "s" },
  ];
  const before = structuredClone(input);
  assert.deepEqual(
    expectedRosterTeamIds({ ...week, _id: "w", weekType: "PO" }, input, [
      matchup,
    ]),
    ["a", "b"],
  );
  assert.deepEqual(input, before);
  assert.deepEqual(
    teams.map((t) => t.id),
    ["d", "a", "c", "b"],
  );
});
