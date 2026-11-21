import assert from "node:assert/strict";
import test from "node:test";
import { selectStatsPage } from "./stats-browser";
import type { StatsFilters, StatsRow } from "../../types/stats-browser";

const filters: StatsFilters = {
  seasonId: "season",
  seasonType: "RS",
  position: "skater",
  stat: "P",
  direction: "desc",
  page: 0,
};
const row = (index: number): StatsRow => ({
  id: String(index),
  playerId: String(index),
  name: `Player ${index}`,
  positions: index === 180 ? ["LW", "C"] : ["D"],
  nhlTeams: [],
  teams: [
    { id: index === 180 ? "target" : "other", name: "Team", ownerId: "owner" },
  ],
  stats: { GP: 10, P: 200 - index },
});

void test("filters the full population before pagination, including players outside the top 100", () => {
  const rows = Array.from({ length: 200 }, (_, index) => row(index));
  const before = structuredClone(rows);
  const result = selectStatsPage(rows, {
    ...filters,
    teamId: "target",
    position: "C",
  });
  assert.deepEqual(
    result.rows.map((item) => item.id),
    ["180"],
  );
  assert.equal(result.total, 1);
  assert.deepEqual(rows, before);
});

void test("pages remain bounded and goalie rate sorting retains zero and places missing values last", () => {
  const rows = [0, 1, 2].map((index) => ({
    ...row(index),
    positions: ["G"],
    stats: { GP: 1, GAA: [2, null, 0][index] ?? null },
  }));
  const result = selectStatsPage(rows, {
    ...filters,
    position: "goalie",
    stat: "GAA",
    direction: "asc",
    page: 100,
  });
  assert.deepEqual(
    result.rows.map((item) => item.id),
    ["2", "0", "1"],
  );
  assert.equal(result.page, 0);
  assert.equal(selectStatsPage(rows, filters).total, 0);
});
