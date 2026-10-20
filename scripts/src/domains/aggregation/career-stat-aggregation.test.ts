import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseRecord } from "../../integrations/data/records";
import { buildCareerStatLines, careerStatKey } from "./career-stat-aggregation";

const row = (seasonId: string, extra: DatabaseRecord = {}): DatabaseRecord => ({
  seasonId,
  playerId: "player",
  gshlTeamId: "team",
  seasonType: "RS",
  posGroup: "F",
  nhlPos: ["LW"],
  nhlTeam: ["TOR"],
  days: "10",
  GP: "3",
  GS: "1",
  ...extra,
});

test("careers preserve observed historical category masks and bench GP separately from GS", () => {
  const periods = [
    row("old", { G: "2", A: "3", P: "", PM: "-2", PIM: "4", SV: "", SO: "" }),
    row("new", { G: "1", A: "2", P: "3", PM: "", PIM: null, GP: "5", GS: "2" }),
  ];
  const result = buildCareerStatLines({
    seasonSplits: periods,
    seasonTotals: periods,
  });
  for (const r of [...result.careerSplits, ...result.careerTotals]) {
    assert.equal(r.G, "3");
    assert.equal(r.A, "5");
    assert.equal(r.P, "3");
    assert.equal(r.PM, "-2");
    assert.equal(r.PIM, "4");
    assert.equal(r.GP, "8");
    assert.equal(r.GS, "3");
    assert.equal(r.SV, "");
    assert.equal(r.SO, "");
    assert.equal(r.HIT, "");
  }
});

test("never derive inactive P from G+A or carry ratings/storage/financial metadata", () => {
  const source = row("s", {
    G: "2",
    A: "3",
    P: null,
    Rating: 99,
    averageRating: 11,
    ratingVersion: "gshl-category-impact-v3",
    ratingAppearances: 9,
    _id: "source-id",
    legacyId: "legacy",
    salary: 40,
    createdAt: 1,
  });
  const before = structuredClone(source);
  const output = buildCareerStatLines({
    seasonSplits: [source],
    seasonTotals: [source],
  });
  for (const r of [...output.careerSplits, ...output.careerTotals]) {
    assert.equal(r.P, "");
    for (const key of [
      "Rating",
      "averageRating",
      "ratingVersion",
      "ratingAppearances",
      "_id",
      "legacyId",
      "salary",
      "createdAt",
      "seasonId",
    ])
      assert.equal(Object.hasOwn(r, key), false, key);
  }
  assert.deepEqual(source, before);
});

test("fresh season is a full population replacement, including vanished or traded keys", () => {
  const stored = [
    row("prior", { G: "2" }),
    row("current", { G: "99" }),
    row("current", { playerId: "vanished", G: "7" }),
  ];
  const fresh = [row("current", { gshlTeamId: "new-team", G: "3" })];
  const before = structuredClone({ stored, fresh });
  const r = buildCareerStatLines({
    seasonSplits: stored,
    seasonTotals: stored,
    currentSeason: { seasonId: "current", splits: fresh, totals: fresh },
  });
  assert.equal(r.careerSplits.length, 2);
  assert.equal(r.careerTotals.length, 1);
  assert.equal(r.careerTotals[0]?.G, "5");
  assert.equal(r.careerTotals[0]?.GP, "6");
  assert.deepEqual(r.careerTotals[0]?.gshlTeamIds, ["team", "new-team"]);
  assert.deepEqual({ stored, fresh }, before);
  assert.equal(
    buildCareerStatLines({
      seasonSplits: stored,
      seasonTotals: stored,
      currentSeason: { seasonId: "current", splits: [], totals: [] },
    }).careerTotals[0]?.G,
    "2",
  );
});

test("goalie workload pools rates, retains historical SV/SO, and allows official accounting anomalies", () => {
  const periods = [
    row("a", {
      posGroup: "G",
      nhlPos: ["G"],
      GA: "2",
      TOI: "60",
      SV: "20",
      SA: "23",
      SO: "1",
      W: "1",
      G: "9",
      GAA: "2",
      SVP: "0.86957",
    }),
    row("b", {
      posGroup: "G",
      nhlPos: ["G"],
      GA: "1",
      TOI: "30",
      SV: "30",
      SA: "30",
      SO: "",
      W: "0",
      GAA: "2",
      SVP: "1",
    }),
  ];
  const r = buildCareerStatLines({
    seasonSplits: periods,
    seasonTotals: periods,
  }).careerTotals[0]!;
  assert.equal(r.TOI, "90.00");
  assert.equal(r.GA, "3");
  assert.equal(r.GAA, "2.00000");
  assert.equal(r.SV, "50");
  assert.equal(r.SA, "53");
  assert.equal(r.SVP, "0.94340");
  assert.equal(r.SO, "1");
  assert.equal(r.W, "1");
  assert.equal(r.G, "");
});

test("rates use final two-decimal parent workload and zero/unknown denominator stays blank", () => {
  const g = row("s", {
    posGroup: "G",
    GP: "0",
    GS: "0",
    days: "2",
    GA: "0",
    SV: "0",
    SA: "0",
    TOI: "0",
  });
  let r = buildCareerStatLines({ seasonSplits: [g], seasonTotals: [g] })
    .careerTotals[0]!;
  assert.equal(r.GP, "0");
  assert.equal(r.GS, "0");
  assert.equal(r.days, "2");
  assert.equal(r.GAA, "");
  assert.equal(r.SVP, "");
  r = buildCareerStatLines({
    seasonSplits: [],
    seasonTotals: [{ ...g, GA: 1, TOI: 10.126 }],
  }).careerTotals[0]!;
  assert.equal(r.TOI, "10.13");
  assert.equal(r.GAA, ((1 / 10.13) * 60).toFixed(5));
});

test("trade splits retain exact season team IDs while total stats come exclusively from PT", () => {
  const splits = [
    row("a", { gshlTeamId: "season-team-a", G: 2 }),
    row("a", { gshlTeamId: "season-team-b", G: 3 }),
  ];
  const totals = [
    row("a", {
      gshlTeamId: undefined,
      gshlTeamIds: ["season-team-a", "season-team-b"],
      G: 4,
      GP: 4,
      GS: 2,
    }),
  ];
  const r = buildCareerStatLines({
    seasonSplits: splits,
    seasonTotals: totals,
  });
  assert.equal(r.careerSplits.length, 2);
  assert.equal(r.careerTotals[0]?.G, "4");
  assert.deepEqual(r.careerTotals[0]?.gshlTeamIds, [
    "season-team-a",
    "season-team-b",
  ]);
});

test("LT merges into PO, metadata unions accept stored arrays and legacy CSV", () => {
  const rows = [
    row("a", { seasonType: "LT", nhlPos: '["LW","C"]', nhlTeam: "TOR,BUF" }),
    row("b", {
      seasonType: "PO",
      nhlPos: ["C", "RW"],
      nhlTeam: ["BUF", "DET"],
    }),
  ];
  const r = buildCareerStatLines({ seasonSplits: rows, seasonTotals: rows });
  assert.equal(r.careerSplits.length, 1);
  assert.equal(r.careerTotals[0]?.seasonType, "PO");
  assert.deepEqual(r.careerTotals[0]?.nhlPos, ["LW", "C", "RW"]);
  assert.deepEqual(r.careerTotals[0]?.nhlTeam, ["TOR", "BUF", "DET"]);
  assert.equal(careerStatKey(rows[0]!, true), careerStatKey(rows[1]!, true));
});

test("reject ambiguous/duplicate parents, invalid counts, roles or fresh season boundaries", () => {
  const call = (rows: DatabaseRecord[]) =>
    buildCareerStatLines({ seasonSplits: rows, seasonTotals: [] });
  assert.throws(() => call([row("a"), row("a")]), /Duplicate/);
  assert.throws(
    () =>
      call([row("a", { seasonType: "LT" }), row("a", { seasonType: "PO" })]),
    /Duplicate/,
  );
  assert.throws(() => call([row("a", { playerId: "" })]), /canonical/);
  assert.throws(() => call([row("a", { GP: "bad" })]), /Invalid/);
  assert.throws(() => call([row("a", { GS: -1 })]), /Invalid/);
  assert.throws(() => call([row("a", { GP: 1.5 })]), /Invalid/);
  assert.throws(() => call([row("a"), row("b", { posGroup: "G" })]), /role/);
  assert.throws(
    () =>
      buildCareerStatLines({
        seasonSplits: [],
        seasonTotals: [],
        currentSeason: { seasonId: "a", splits: [row("b")], totals: [] },
      }),
    /another season/,
  );
});
