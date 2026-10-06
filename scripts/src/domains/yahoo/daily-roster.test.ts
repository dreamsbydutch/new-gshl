import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDailyYahooRoster,
  planDailyYahooRosters,
  type YahooRosterPlayer,
} from "./daily-roster";

const player: YahooRosterPlayer = {
  yahooId: "101",
  playerName: "Test Skater",
  dailyPos: "BN",
  nhlPos: ["C", "LW"],
};
const scope = { seasonId: "season", weekId: "week", date: "2026-10-10" };
const row = (id: string, slot: string, eligibility: string) =>
  `<tr><td>${slot}</td><td><div class="ysf-player-name"><a data-ys-playerid="${id}" href="/nhl/players/${id}">Test Player</a></div><span>TOR - ${eligibility}</span></td><td>99</td></tr>`;
const html = (skaters: string, goalies = row("102", "G", "G")) =>
  `<table id="statTable0"><tbody>${skaters}</tbody></table><table id="statTable1"><tbody>${goalies}</tbody></table>`;
const input = () => ({
  ...scope,
  players: [{ id: "player", yahooId: "101" }],
  existing: [],
  rosters: [{ teamId: "team", players: [player] }],
});

test("reads eligibility and bench/IR slots, ignoring Yahoo statistics and empty slots", () => {
  const result = parseDailyYahooRoster(
    html(
      row("101", "BN", "C,LW") +
        row("103", "IR+", "RW") +
        "<tr><td>C</td><td>Empty</td></tr>",
    ),
  );
  assert.deepEqual(
    result.map(({ yahooId, dailyPos, nhlPos }) => ({
      yahooId,
      dailyPos,
      nhlPos,
    })),
    [
      { yahooId: "101", dailyPos: "BN", nhlPos: ["C", "LW"] },
      { yahooId: "103", dailyPos: "IR+", nhlPos: ["RW"] },
      { yahooId: "102", dailyPos: "G", nhlPos: ["G"] },
    ],
  );
  assert.equal("G" in result[0]!, false);
});

test("reads selected lineup dropdown rather than all offered positions", () => {
  assert.equal(
    parseDailyYahooRoster(
      html(
        row(
          "101",
          "<select><option>C</option><option selected>BN</option></select>",
          "C,LW",
        ),
      ),
    )[0]?.dailyPos,
    "BN",
  );
});

test("Yahoo's named (Empty) goalie slot is not a player; real players still require IDs", () => {
  const emptyGoalie =
    '<tr class="First"><td>G</td><td><div class="ysf-player-name Nowrap Relative Lh-xs">(Empty)</div></td></tr>';
  const result = parseDailyYahooRoster(html(row("101", "C", "C"), emptyGoalie));
  assert.equal(result.length, 1);
  assert.equal(result[0]?.yahooId, "101");
  assert.throws(
    () =>
      parseDailyYahooRoster(
        html(
          row("101", "C", "C"),
          emptyGoalie.replace("(Empty)", "Real Goalie"),
        ),
      ),
    /missing a stable player ID/,
  );
  assert.throws(
    () => parseDailyYahooRoster(html(emptyGoalie, emptyGoalie)),
    /empty roster/,
  );
});

test("verifies the returned league, team and selected date before accepting a capture", () => {
  const expected = { leagueId: "44541", teamId: "1", date: scope.date };
  const capture = (date: string, team = "1") =>
    `<link rel="canonical" href="https://hockey.fantasysports.yahoo.com/hockey/44541/${team}?date=${date}"><select name="date"><option selected value="/hockey/44541/${team}/team?date=${date}">Date</option></select>${html(row("101", "C", "C"))}`;
  assert.equal(parseDailyYahooRoster(capture(scope.date), expected).length, 2);
  assert.throws(
    () => parseDailyYahooRoster(capture("2026-10-11"), expected),
    /does not confirm/,
  );
  assert.throws(
    () => parseDailyYahooRoster(capture(scope.date, "2"), expected),
    /does not confirm/,
  );
  assert.throws(
    () => parseDailyYahooRoster(html(row("101", "C", "C")), expected),
    /does not confirm/,
  );
});

test("refuses login, partial, empty, malformed and duplicate roster pages", () => {
  for (const markup of [
    "Sign in to Yahoo",
    '<table id="statTable0"></table>',
    html("", ""),
    html(row("101", "?", "C")),
    html(row("101", "C", "")),
    html(row("101", "C", "C") + row("101", "BN", "C")),
  ]) {
    assert.throws(() => parseDailyYahooRoster(markup));
  }
});

test("creates metadata only and is idempotent after applying the plan", () => {
  const plan = planDailyYahooRosters(input());
  assert.equal(plan.creates.length, 1);
  assert.equal("GP" in plan.creates[0]!, false);
  const next = planDailyYahooRosters({
    ...input(),
    existing: [{ id: "day", ...plan.creates[0]! }],
  });
  assert.deepEqual(next, {
    removals: [],
    creates: [],
    updates: [],
    identityUpdates: [],
    conflicts: [],
    unchanged: 1,
    rosterDays: plan.rosterDays,
  });
});

test("backed-up removal mode plans exact superseded IDs and converges without keeping extra days", () => {
  const desired = planDailyYahooRosters(input()).creates[0]!;
  const extra = { ...desired, id: "superseded", playerId: "dropped" };
  const source = { ...input(), existing: [extra] };
  assert.equal(planDailyYahooRosters(source).conflicts.length, 1);
  assert.deepEqual(planDailyYahooRosters(source).removals, []);
  const plan = planDailyYahooRosters({ ...source, removeMissing: true });
  assert.deepEqual(plan.removals, [extra]);
  assert.equal(plan.creates.length, 1);
  assert.deepEqual(plan.conflicts, []);
  const after = planDailyYahooRosters({
    ...source,
    removeMissing: true,
    existing: [{ ...plan.creates[0]!, id: "new-day" }],
  });
  assert.equal(after.unchanged, 1);
  assert.deepEqual(after.removals, []);
  assert.deepEqual(after.creates, []);
  assert.ok(
    planDailyYahooRosters({ ...source, players: [], removeMissing: true })
      .conflicts.length,
  );
});

test("updates transfer and lineup by document ID without touching stored statistics", () => {
  const previous = {
    id: "day",
    ...scope,
    playerId: "player",
    gshlTeamId: "old-team",
    dailyPos: "C",
    nhlPos: ["C"],
    G: "2",
  };
  const plan = planDailyYahooRosters({ ...input(), existing: [previous] });
  assert.equal(plan.creates.length, 0);
  assert.equal(plan.updates[0]?.id, "day");
  assert.equal(plan.updates[0]?.data.gshlTeamId, "team");
  assert.equal(plan.updates[0]?.data.dailyPos, "BN");
  assert.equal("G" in plan.updates[0]!.data, false);
  assert.equal(previous.G, "2");
  assert.deepEqual(previous.nhlPos, ["C"]);
});

test("blocks unknown or ambiguous Yahoo IDs rather than guessing by name", () => {
  for (const players of [
    [],
    [
      { id: "one", yahooId: "101" },
      { id: "two", yahooId: "101" },
    ],
  ]) {
    const plan = planDailyYahooRosters({ ...input(), players });
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.creates.length, 0);
  }
});

test("blocks a player on multiple teams and duplicate stored days", () => {
  assert.equal(
    planDailyYahooRosters({
      ...input(),
      rosters: [...input().rosters, { teamId: "other", players: [player] }],
    }).conflicts.length,
    1,
  );
  const data = planDailyYahooRosters(input()).creates[0]!;
  assert.equal(
    planDailyYahooRosters({
      ...input(),
      existing: [
        { id: "a", ...data },
        { id: "b", ...data },
      ],
    }).conflicts.length,
    1,
  );
});

test("fills a missing Yahoo ID only from one exact full-name match", () => {
  const source = {
    ...input(),
    players: [{ id: "player", fullName: "Test Skater" }],
  };
  const plan = planDailyYahooRosters(source);
  assert.deepEqual(plan.identityUpdates, [
    { id: "player", yahooId: "101", fullName: "Test Skater" },
  ]);
  assert.equal(plan.conflicts.length, 0);
  const repeated = planDailyYahooRosters({
    ...source,
    players: [{ id: "player", fullName: "Test Skater", yahooId: "101" }],
    existing: [{ id: "day", ...plan.creates[0]! }],
  });
  assert.equal(repeated.identityUpdates.length, 0);
  assert.equal(repeated.unchanged, 1);
  for (const players of [
    [{ id: "player", fullName: "Test Skater", yahooId: "999" }],
    [
      { id: "player", fullName: "Test Skater" },
      { id: "other", fullName: "Test Skater" },
    ],
    [{ id: "player", fullName: "Test Skater Junior" }],
  ]) {
    const rejected = planDailyYahooRosters({ ...input(), players });
    assert.equal(rejected.identityUpdates.length, 0);
    assert.equal(rejected.conflicts.length, 1);
  }
});

test("reports missing existing days without deleting or silently retaining a stale roster", () => {
  const data = planDailyYahooRosters(input()).creates[0]!;
  const plan = planDailyYahooRosters({
    ...input(),
    existing: [{ id: "missing", ...data, playerId: "other" }],
  });
  assert.match(plan.conflicts[0]!, /absent from Yahoo/);
});
