import assert from "node:assert/strict";
import test from "node:test";
import type { PerformanceRow } from "../../types/performances";
import {
  addCareerPerformances,
  careerLeaders,
  recordKind,
  recordDirection,
  recordRanks,
} from "./records";

void test("counting records rank highest first while GAA ranks lowest first", () => {
  assert.equal(recordDirection("GA"), "desc");
  assert.equal(recordDirection("G"), "desc");
  assert.equal(recordDirection("GAA"), "asc");
});

const row = (
  id: string,
  stats: PerformanceRow["stats"],
  playerId = id,
  franchiseId?: string,
): PerformanceRow => ({
  id,
  stats,
  playerId,
  franchiseId,
  teamIds: [id],
  season: "Season",
  period: "RS",
  weekId: null,
  name: "",
  team: "",
  position: "F",
});

void test("record destinations distinguish careers, full player seasons, and weeks", () => {
  assert.equal(recordKind("player", "season"), "playerTotal");
  assert.equal(recordKind("team", "career"), "teamCareer");
  assert.equal(recordKind("player", "week"), "playerWeek");
});

void test("career leaders retain contributors below each page's top 100 and do not mutate inputs", () => {
  const first = Array.from({ length: 101 }, (_, index) =>
    row(`p${index}`, { GP: 1, G: index === 100 ? 9 : 10 }),
  );
  const second = [row("new-season", { GP: 1, G: 9 }, "p100")];
  const before = structuredClone(first);
  const initial = addCareerPerformances(new Map(), first, "playerCareer");
  const aggregate = addCareerPerformances(initial, second, "playerCareer");
  const leaders = careerLeaders(aggregate, "playerCareer", "G", "desc");
  assert.equal(leaders[0]?.playerId, "p100");
  assert.equal(leaders[0]?.stats.G, 18);
  assert.equal(leaders.length, 100);
  assert.equal(initial.get("p100")?.row.stats.G, 9);
  assert.deepEqual(first, before);
});

void test("team careers follow franchise identity rather than season team IDs or people", () => {
  const rows = [
    row("team-old", { GP: 10, P: 30 }, "", "franchise"),
    row("team-new", { GP: 20, P: 40 }, "", "franchise"),
    row("another", { GP: 20, P: 65 }, "", "other-franchise"),
  ];
  const leaders = careerLeaders(
    addCareerPerformances(new Map(), rows, "teamCareer"),
    "teamCareer",
    "P",
    "desc",
  );
  assert.equal(leaders.length, 2);
  assert.equal(leaders[0]?.franchiseId, "franchise");
  assert.equal(leaders[0]?.stats.P, 70);
  assert.deepEqual(leaders[0]?.teamIds, ["team-old", "team-new"]);
});

void test("goalie career rates use weighted totals and apply game qualification after combining seasons", () => {
  const rows = [
    row(
      "a",
      { GP: 10, GA: 20, TOI: 600, SV: 180, SA: 200, GAA: 2, SVP: 0.9 },
      "goalie",
    ),
    row(
      "b",
      { GP: 20, GA: 60, TOI: 1200, SV: 540, SA: 600, GAA: 3, SVP: 0.9 },
      "goalie",
    ),
  ];
  const aggregates = addCareerPerformances(new Map(), rows, "playerCareer");
  const leaders = careerLeaders(aggregates, "playerCareer", "GAA", "asc", 25);
  assert.equal(leaders.length, 1);
  assert.equal(leaders[0]?.stats.GAA, 80 / 30);
  assert.equal(leaders[0]?.stats.SVP, 720 / 800);
  assert.equal(
    careerLeaders(aggregates, "playerCareer", "GAA", "asc", 31).length,
    0,
  );
});

void test("missing rate denominators cannot produce a partial career rate", () => {
  const aggregates = addCareerPerformances(
    new Map(),
    [
      row("a", { GP: 1, GA: 2, TOI: 60, SV: 28, SA: 30 }, "goalie"),
      row("b", { GP: 1, GA: 1, TOI: null, SV: 29, SA: null }, "goalie"),
    ],
    "playerCareer",
  );
  assert.equal(
    careerLeaders(aggregates, "playerCareer", "GAA", "asc").length,
    0,
  );
  assert.equal(
    careerLeaders(aggregates, "playerCareer", "SVP", "desc").length,
    0,
  );
});

void test("ties share their actual rank, including a zero score", () => {
  assert.deepEqual(
    recordRanks(
      [row("a", { G: 5 }), row("b", { G: 5 }), row("c", { G: 0 })],
      "G",
    ),
    [1, 1, 3],
  );
});
