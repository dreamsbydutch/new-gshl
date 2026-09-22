import assert from "node:assert/strict";
import test from "node:test";
import type {
  PerformanceFilters,
  PerformanceRow,
} from "../../types/performances";
import {
  PERFORMANCE_KINDS,
  performanceDirection,
  performanceColumns,
  performanceNumber,
  performanceStats,
  qualifiesForPerformance,
  topPerformances,
} from "./performances";

const filters: PerformanceFilters = {
  kind: "playerDay",
  seasonIds: ["season"],
  stat: "Rating",
  direction: "desc",
  position: "all",
  seasonType: "",
  startDate: "",
  endDate: "",
};
const row = (id: string, value: number | null): PerformanceRow => ({
  id,
  season: "Season",
  stats: { Rating: value },
  playerId: null,
  teamIds: [],
  weekId: null,
  period: "",
  position: "",
  name: "",
  team: "",
});

void test("team columns prioritize activity stats and keep the ranking stat visible in every group", () => {
  const all = performanceColumns("teamSeason", "all", "Rating");
  assert.deepEqual(all.slice(0, 4), ["Rating", "ADD", "MS", "BS"]);
  assert.deepEqual([...all].sort(), [...performanceStats("teamSeason")].sort());
  const activity = performanceColumns("teamSeason", "activity", "G");
  assert.deepEqual(activity.slice(0, 4), ["G", "ADD", "MS", "BS"]);
  assert.ok(activity.includes("playersUsed"));
  assert.ok(!activity.includes("GAA"));
  assert.ok(
    !performanceColumns("playerNhl", "activity", "seasonRating").includes(
      "ADD",
    ),
  );
});

void test("every requested table exposes its stored rating and stats", () => {
  assert.equal(PERFORMANCE_KINDS.length, 8);
  for (const kind of PERFORMANCE_KINDS) {
    assert.ok(
      performanceStats(kind.value).includes(
        kind.value === "playerNhl" ? "seasonRating" : "Rating",
      ),
    );
    assert.ok(performanceStats(kind.value).includes("GAA"));
  }
  assert.ok(performanceStats("teamSeason").includes("teamW"));
  assert.ok(performanceStats("teamWeek").includes("powerRating"));
});

void test("numeric legacy values preserve zero and negatives without treating blanks as zero", () => {
  for (const value of [null, undefined, "", " ", "-", "NaN", Infinity])
    assert.equal(performanceNumber(value), null);
  assert.equal(performanceNumber("0"), 0);
  assert.equal(performanceNumber("-2.5"), -2.5);
  assert.equal(performanceNumber("21:30"), 21.5);
});

void test("top 100 includes leaders from later batches and leaves input immutable", () => {
  const early = Array.from({ length: 500 }, (_, index) =>
    row(`a${index}`, index),
  );
  const later = Array.from({ length: 500 }, (_, index) =>
    row(`b${index}`, index + 500),
  );
  const before = structuredClone(early);
  const merged = topPerformances(
    [
      ...topPerformances(early, "Rating", "desc"),
      ...topPerformances(later, "Rating", "desc"),
    ],
    "Rating",
    "desc",
  );
  assert.deepEqual(
    merged,
    topPerformances([...early, ...later], "Rating", "desc"),
  );
  assert.equal(merged.length, 100);
  assert.equal(merged[0]?.stats.Rating, 999);
  assert.equal(merged[99]?.stats.Rating, 900);
  assert.deepEqual(early, before);
});

void test("ascending sorting excludes missing values and gives ties deterministic order", () => {
  assert.deepEqual(
    topPerformances(
      [row("z", 0), row("a", 0), row("missing", null), row("negative", -1)],
      "Rating",
      "asc",
    ).map((item) => item.id),
    ["negative", "a", "z"],
  );
  assert.equal(performanceDirection("GAA"), "asc");
  assert.equal(performanceDirection("SVP"), "desc");
});

void test("position, season type, and games-played qualification precede ranking", () => {
  const skater = {
    posGroup: "F",
    GP: 1,
    Rating: "4",
    GAA: 0,
    seasonType: "RS",
  };
  assert.ok(qualifiesForPerformance(skater, filters));
  assert.equal(
    qualifiesForPerformance(skater, { ...filters, stat: "GAA" }),
    false,
  );
  assert.equal(
    qualifiesForPerformance(skater, { ...filters, position: "goalie" }),
    false,
  );
  assert.equal(
    qualifiesForPerformance(skater, { ...filters, seasonType: "PO" }),
    false,
  );
  assert.equal(qualifiesForPerformance({ ...skater, GP: 0 }, filters), false);
  assert.ok(
    qualifiesForPerformance(
      { ...skater, GP: 0, IR: 1 },
      { ...filters, stat: "IR" },
    ),
  );
  assert.equal(
    qualifiesForPerformance({ ...skater, Rating: "" }, filters),
    false,
  );
  assert.ok(
    qualifiesForPerformance(
      { ...skater, posGroup: "G" },
      { ...filters, stat: "GAA" },
    ),
  );
});
