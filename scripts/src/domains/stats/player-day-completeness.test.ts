import assert from "node:assert/strict";
import test from "node:test";
import {
  auditPlayerDayCompleteness,
  playerDayCalendarDate,
} from "./player-day-completeness";

function fixture() {
  const seasons = [
    {
      _id: "s",
      startDate: "2024-01-01",
      endDate: "2024-01-03",
      categories: ["G", "SV", "SVP", "GAA", "W", "SO"],
      rosterSpots: ["C", "D", "G", "BN", "IR"],
    },
  ];
  const teams = [
    { _id: "t1", seasonId: "s" },
    { _id: "t2", seasonId: "s", eliminated: true },
  ];
  const weeks = [
    { _id: "w", seasonId: "s", startDate: "2024-01-01", endDate: "2024-01-03" },
  ];
  const players = [{ _id: "p1" }, { _id: "p2" }];
  const rows = teams.flatMap((t, index) =>
    ["2024-01-01", "2024-01-02", "2024-01-03"].map((date) => ({
      _id: `${t._id}:${date}`,
      seasonId: "s",
      gshlTeamId: t._id,
      playerId: `p${index + 1}`,
      weekId: "w",
      date,
      posGroup: "F",
      GP: 0,
    })),
  );
  return { seasons, teams, weeks, players, rows, cutoff: "2024-01-03" };
}
test("without matchup evidence calendar covers every team, without treating small legal rosters as hard faults", () => {
  const input = fixture(),
    original = structuredClone(input);
  const result = auditPlayerDayCompleteness(input);
  assert.equal(result.hardFaults, 0);
  assert.equal(result.summaries[0]!.expectedTeamDates, 6);
  assert.equal(result.summaries[0]!.coveredTeamDates, 6);
  assert.equal(result.lowRosterTeamDates.length, 6);
  assert.equal(result.summaries[0]!.lowRosterReviewThreshold, 3);
  assert.deepEqual(input, original);
});

function playoffFixture() {
  const teams = ["a", "b", "c", "d"].map((_id) => ({ _id, seasonId: "s" }));
  const weeks = [1, 2, 3].map((n) => ({
    _id: `w${n}`,
    seasonId: "s",
    weekType: n === 1 ? "RS" : "PO",
    startDate: `2024-01-0${n}`,
    endDate: `2024-01-0${n}`,
  }));
  const matchups = [
    {
      _id: "q1",
      seasonId: "s",
      weekId: "w2",
      homeTeamId: "a",
      awayTeamId: "b",
      gameType: "QF",
    },
    {
      _id: "q2",
      seasonId: "s",
      weekId: "w2",
      homeTeamId: "c",
      awayTeamId: "d",
      gameType: "QF",
    },
    {
      _id: "f",
      seasonId: "s",
      weekId: "w3",
      homeTeamId: "a",
      awayTeamId: "c",
      gameType: "F",
    },
  ];
  const rows = teams.flatMap((t) =>
    [1, 2, 3]
      .filter((n) => n < 3 || ["a", "c"].includes(t._id))
      .map((n) => ({
        _id: `${t._id}${n}`,
        seasonId: "s",
        gshlTeamId: t._id,
        playerId: `p${t._id}`,
        weekId: `w${n}`,
        date: `2024-01-0${n}`,
        posGroup: "F",
        GP: 0,
      })),
  );
  return {
    seasons: [{ ...fixture().seasons[0]!, rosterSpots: ["C"] }],
    teams,
    weeks,
    matchups,
    rows,
    cutoff: "2024-01-03",
  };
}

test("finished playoff teams have no required roster dates after their last matchup", () => {
  const input = playoffFixture();
  const result = auditPlayerDayCompleteness(input);
  assert.equal(result.missingTeamDates.length, 0);
  assert.equal(result.rosterCountFlags.length, 0);
  assert.deepEqual(
    result.inactivePostseasonTeamDates.map((r) => [r.teamId, r.date]),
    [
      ["b", "2024-01-03"],
      ["d", "2024-01-03"],
    ],
  );
  assert.equal(result.summaries[0]!.expectedTeamDates, 10);
});

test("losers tournament and consolation participants still require their dated rosters", () => {
  const input = playoffFixture();
  input.matchups.push({
    _id: "lt",
    seasonId: "s",
    weekId: "w3",
    homeTeamId: "b",
    awayTeamId: "d",
    gameType: "LT",
  });
  const result = auditPlayerDayCompleteness(input);
  assert.deepEqual(
    result.missingTeamDates.map((r) => r.teamId),
    ["b", "d"],
  );
  assert.equal(result.inactivePostseasonTeamDates.length, 0);
});

test("a later-round participant's bye does not hide a missing roster", () => {
  const input = playoffFixture();
  input.teams.push({ _id: "bye", seasonId: "s" });
  input.matchups[2]!.awayTeamId = "bye";
  const result = auditPlayerDayCompleteness(input);
  assert(
    result.missingTeamDates.some(
      (r) => r.teamId === "bye" && r.date === "2024-01-02",
    ),
  );
  assert(!result.inactivePostseasonTeamDates.some((r) => r.teamId === "bye"));
});

test("an entirely missing postseason schedule stays uncertain instead of excluding every team", () => {
  const input = playoffFixture();
  input.matchups = input.matchups.filter((m) => m.weekId !== "w3");
  const result = auditPlayerDayCompleteness(input);
  assert.equal(result.missingTeamDates.length, 2);
  assert(
    result.calendarIssues.some(
      (i) => i.kind === "postseason-week-without-matchups",
    ),
  );
});
test("detects missing team dates independently of scheduled matchups and counts distinct rostered people", () => {
  const input = fixture();
  input.rows = input.rows.filter(
    (r) => r.gshlTeamId !== "t2" || r.date !== "2024-01-02",
  );
  const report = auditPlayerDayCompleteness(input);
  assert.deepEqual(report.missingTeamDates, [
    { seasonId: "s", teamId: "t2", date: "2024-01-02", weekIds: ["w"] },
  ]);
  assert.equal(report.summaries[0]!.coveredTeamDates, 5);
});
test("same player on two teams on the same day is a duplicate even when row IDs and teams differ", () => {
  const input = fixture();
  input.rows.push({
    ...input.rows[0]!,
    _id: "trade-duplicate",
    gshlTeamId: "t2",
  });
  const report = auditPlayerDayCompleteness(input);
  assert.equal(report.duplicates.length, 1);
  assert.deepEqual(report.duplicates[0]!.teamIds, ["t1", "t2"]);
  assert.equal(report.duplicates[0]!.playerId, "p1");
});
test("invalid references do not count as valid coverage; canonical player inventory cannot be guessed from names or legacy IDs", () => {
  const input = fixture();
  input.rows[0]!.playerId = "legacy-person";
  input.rows[1]!.weekId = "missing-week";
  input.rows[2]!.gshlTeamId = "missing-team";
  const report = auditPlayerDayCompleteness(input);
  assert.ok(report.invalidReferences.some((i) => i.kind === "row-player"));
  assert.ok(report.invalidReferences.some((i) => i.kind === "row-week-season"));
  assert.ok(report.invalidReferences.some((i) => i.kind === "row-team-season"));
  assert.equal(
    report.missingTeamDates.filter((i) => i.teamId === "t1").length,
    3,
  );
});
test("future days are outside the audit and off-season dates are never fabricated as expected team dates", () => {
  const input = fixture();
  input.cutoff = "2024-01-02";
  const report = auditPlayerDayCompleteness(input);
  assert.equal(report.summaries[0]!.expectedTeamDates, 4);
  assert.equal(report.excludedFutureRows, 2);
  assert.equal(report.hardFaults, 0);
});
test("invalid dates, noncanonical row timestamps, unknown GP values, and out-of-week days are visible faults", () => {
  for (const date of ["2024-02-30", "2024-01-01T00:00:00Z", "2024-01-04"]) {
    const input = fixture();
    input.rows[0]!.date = date;
    input.cutoff = "2024-03-01";
    assert.ok(auditPlayerDayCompleteness(input).invalidReferences.length > 0);
  }
  assert.equal(playerDayCalendarDate("2025-02-31"), null);
  assert.equal(playerDayCalendarDate("2024-01-01T00:00:00"), null);
  assert.equal(
    playerDayCalendarDate(Date.parse("2024-01-01T00:00:00Z")),
    "2024-01-01",
  );
  assert.throws(
    () => auditPlayerDayCompleteness({ ...fixture(), cutoff: "2025-02-31" }),
    /cutoff/,
  );
});
test("overlapping weeks are counted once per team date and internal gaps remain distinct from missing roster days", () => {
  const input = fixture();
  input.weeks.push({
    _id: "overlap",
    seasonId: "s",
    startDate: "2024-01-02",
    endDate: "2024-01-03",
  });
  const overlap = auditPlayerDayCompleteness(input);
  assert.equal(
    overlap.calendarIssues.filter((i) => i.kind === "overlapping-weeks").length,
    2,
  );
  assert.equal(overlap.summaries[0]!.expectedTeamDates, 6);
  input.weeks = [
    { ...input.weeks[0]!, endDate: "2024-01-01" },
    { ...input.weeks[1]!, startDate: "2024-01-03" },
  ];
  const gaps = auditPlayerDayCompleteness(input);
  assert.ok(
    gaps.calendarIssues.some(
      (i) => i.kind === "internal-calendar-gap" && i.date === "2024-01-02",
    ),
  );
});
test("known week dates override inconsistent historic season boundaries without dropping real first-week rows", () => {
  const input = fixture();
  input.seasons[0]!.startDate = "2024-01-02";
  const report = auditPlayerDayCompleteness(input);
  assert.equal(report.summaries[0]!.expectedTeamDates, 6);
  assert.equal(report.invalidReferences.length, 0);
  assert.equal(report.hardFaults, 0);
  assert.ok(
    report.calendarIssues.some(
      (i) => i.kind === "season-week-boundary-disagreement",
    ),
  );
});
test("historic reference placeholders with no teams need no fantasy calendar, while active teams without weeks are unverified", () => {
  const input = fixture();
  input.weeks = [];
  input.rows = [];
  assert.ok(
    auditPlayerDayCompleteness(input).calendarIssues.some(
      (i) => i.kind === "missing-season-calendar",
    ),
  );
  input.teams = [];
  assert.equal(auditPlayerDayCompleteness(input).calendarIssues.length, 0);
});
test("unknown and zero GP do not falsely create played-game field holes", () => {
  const input = fixture();
  const rows = input.rows.map((row) => ({
    ...row,
    GP: row.gshlTeamId === "t1" ? null : 0,
    opp: "TOR",
    score: "W,2-1",
  }));
  const report = auditPlayerDayCompleteness({ ...input, rows });
  assert.equal(report.statHoles.length, 0);
  assert.equal(report.unknownGameStatusRows, 3);
  assert.equal(report.noGameRows, 3);
  assert.equal(report.hardFaults, 0);
});
test("active category holes are faults; historical inactive P nulls and unused goalie stats on skaters are legitimate", () => {
  const input = fixture();
  const rows = input.rows.map((row) => ({
    ...row,
    GP: 1,
    G: 0,
    P: null,
    SV: null,
  }));
  const report = auditPlayerDayCompleteness({ ...input, rows });
  assert.equal(report.statHoles.length, 0);
  assert.equal(report.hiddenInactiveFields.P, 6);
  assert.equal(report.supportFieldHoles.length, 6);
  rows[0]!.G = NaN;
  assert.equal(
    auditPlayerDayCompleteness({ ...input, rows }).invalidStats.length,
    1,
  );
  const missingRows = rows.map((r) => ({ ...r, G: null }));
  assert.equal(
    auditPlayerDayCompleteness({ ...input, rows: missingRows }).statHoles
      .length,
    6,
  );
});
test("zero-shot goalie save percentage remains unknown, and fantasy GS is never required as native starts", () => {
  const input = fixture();
  const rows = input.rows.map((row) => ({
    ...row,
    GP: 1,
    posGroup: "G",
    W: 0,
    GAA: 0,
    SV: 0,
    SA: 0,
    SVP: null,
    SO: 0,
    GA: 0,
    TOI: 0.13,
  }));
  const report = auditPlayerDayCompleteness({ ...input, rows });
  assert.equal(report.statHoles.length, 0);
  assert.equal(report.supportFieldHoles.length, 0);
  rows[0]!.SA = 1;
  assert.deepEqual(
    auditPlayerDayCompleteness({ ...input, rows }).statHoles[0]!.fields,
    ["SVP"],
  );
});
test("missing player inventory and unknown category policy are explicit audit limitations", () => {
  const input = fixture();
  const report = auditPlayerDayCompleteness({
    seasons: input.seasons.map(({ categories: _ignored, ...s }) => s),
    teams: input.teams,
    weeks: input.weeks,
    rows: input.rows,
    cutoff: input.cutoff,
  });
  assert.equal(report.playerReferenceCheck, "not-supplied");
  assert.deepEqual(report.categoryPolicyUnknownSeasons, ["s"]);
  assert.ok(
    report.limitations.some((s) => s.includes("not independently checked")),
  );
});
test("supports single-pass row streams without mutating inventory or requiring a framework", () => {
  const input = fixture();
  let iterations = 0;
  function* rows() {
    iterations++;
    yield* input.rows;
  }
  const report = auditPlayerDayCompleteness({ ...input, rows: rows() });
  assert.equal(iterations, 1);
  assert.equal(report.eligibleRows, 6);
});

function countFixture(rosterSpots: string[], counts: number[]) {
  const input = fixture();
  input.seasons[0]!.rosterSpots = rosterSpots;
  input.teams = [input.teams[0]!];
  input.players = Array.from({ length: Math.max(...counts) }, (_, i) => ({
    _id: `p${i}`,
  }));
  input.rows = counts.flatMap((count, index) =>
    Array.from({ length: count }, (_, p) => ({
      _id: `r${index}-${p}`,
      seasonId: "s",
      gshlTeamId: "t1",
      playerId: `p${p}`,
      weekId: "w",
      date: `2024-01-0${index + 1}`,
      posGroup: "F",
      GP: 0,
    })),
  );
  return input;
}
const currentSpots = [
  "C",
  "LW",
  "RW",
  "C",
  "LW",
  "RW",
  "D",
  "D",
  "D",
  "G",
  "Util",
  "IRPlus",
  "IR",
  "BN",
  "BN",
  "BN",
  "BN",
];
test("current capacity is 15 regular, 11 starting and 17 maximum; reserve slots are optional", () => {
  const report = auditPlayerDayCompleteness(
    countFixture(currentSpots, [15, 15, 15]),
  );
  assert.equal(report.summaries[0]!.expectedRegularCapacity, 15);
  assert.equal(report.summaries[0]!.startingCapacity, 11);
  assert.equal(report.summaries[0]!.maximumCapacity, 17);
  assert.equal(report.rosterCountFlags.length, 0);
  assert.equal(report.hardFaults, 0);
});
test("historical regular thresholds follow season configuration including bench rather than a fixed modern count", () => {
  const old = [
    "C",
    "LW",
    "RW",
    "C",
    "LW",
    "RW",
    "C",
    "LW",
    "RW",
    "D",
    "D",
    "D",
    "D",
    "D",
    "D",
    "G",
    "G",
    "IR",
    "IR",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
  ];
  const later = [
    "C",
    "LW",
    "RW",
    "C",
    "LW",
    "RW",
    "D",
    "D",
    "D",
    "D",
    "G",
    "Util",
    "Util",
    "IR",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
  ];
  const oldReport = auditPlayerDayCompleteness(countFixture(old, [21, 23, 23]));
  assert.equal(oldReport.summaries[0]!.expectedRegularCapacity, 23);
  assert.equal(oldReport.rosterCountFlags[0]!.countShortfall, 2);
  assert.equal(
    oldReport.rosterCountFlags[0]!.reviewSeverity,
    "below-regular-capacity",
  );
  assert.equal(
    auditPlayerDayCompleteness(countFixture(later, [18, 18, 18])).summaries[0]!
      .expectedRegularCapacity,
    18,
  );
});
test("below-starting counts receive stronger review and absent team dates remain hard faults", () => {
  const report = auditPlayerDayCompleteness(
    countFixture(currentSpots, [12, 10, 0]),
  );
  assert.equal(
    report.rosterCountFlags[0]!.reviewSeverity,
    "below-regular-capacity",
  );
  assert.equal(
    report.rosterCountFlags[1]!.reviewSeverity,
    "below-starting-capacity",
  );
  assert.equal(report.rosterCountFlags[2]!.reviewSeverity, "missing-team-date");
  assert.equal(report.hardFaults, 1);
});
test("neighboring count drops identify review candidates without claiming transactions or reserve changes are wrong", () => {
  const report = auditPlayerDayCompleteness(
    countFixture([...currentSpots, "IR", "IR", "IR"], [20, 15, 20]),
  );
  assert.equal(report.rosterCountFlags.length, 1);
  const flag = report.rosterCountFlags[0]!;
  assert.equal(flag.date, "2024-01-02");
  assert.equal(flag.reviewSeverity, "nearby-count-drop");
  assert.equal(flag.countShortfall, 0);
  assert.equal(flag.nearbyCountDrop, 5);
  assert.equal(flag.previousDateCount, 20);
  assert.equal(flag.nextDateCount, 20);
  assert.ok(
    flag.reasons.some((r) => r.includes("transactions or reserve changes")),
  );
  assert.equal(report.hardFaults, 0);
});

test("count-drop review requires more than four players while undersized-roster flags remain independent", () => {
  for (const peak of [17, 19]) {
    const result = auditPlayerDayCompleteness(
      countFixture([...currentSpots, "IR", "IR", "IR"], [peak, 15, peak]),
    );
    assert.equal(result.rosterCountFlags.length, 0);
  }
  const result = auditPlayerDayCompleteness(
    countFixture([...currentSpots, "IR"], [17, 13, 17]),
  );
  assert.equal(result.rosterCountFlags.length, 1);
  assert.equal(
    result.rosterCountFlags[0]!.reviewSeverity,
    "below-regular-capacity",
  );
  assert(
    !result.rosterCountFlags[0]!.reasons.some((r) =>
      r.includes("three calendar days"),
    ),
  );
});

test("undersized review ignores a one-player shortage and includes a two-player shortage for each season's capacity", () => {
  assert.equal(
    auditPlayerDayCompleteness(countFixture(currentSpots, [14, 15, 15]))
      .rosterCountFlags.length,
    0,
  );
  const twoShort = auditPlayerDayCompleteness(
    countFixture(currentSpots, [13, 15, 15]),
  );
  assert.equal(twoShort.lowRosterTeamDates.length, 1);
  assert.equal(twoShort.lowRosterTeamDates[0]!.countShortfall, 2);
  assert.equal(
    auditPlayerDayCompleteness(countFixture(["C", "D"], [1, 2, 2]))
      .rosterCountFlags.length,
    0,
  );
});
