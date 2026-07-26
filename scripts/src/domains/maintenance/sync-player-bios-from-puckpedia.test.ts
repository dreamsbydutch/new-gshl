import assert from "node:assert/strict";
import test from "node:test";
import { buildPuckPediaQuery } from "./sync-player-bios-from-puckpedia";

const options = {
  apply: false,
  logToConsole: false,
  focusSeason: "163",
  statSeason: "162",
  pageSize: 100,
  maxPagesPerRole: 20,
  currentDate: new Date("2026-07-26T00:00:00Z"),
  headless: true,
  browserExecutablePath: "chrome",
  userDataDir: "profile",
  waitForManualClearanceMs: 300_000,
};

test("builds the skater state used by PuckPedia's own page loader", () => {
  const query = buildPuckPediaQuery("1", 2, options);

  assert.deepEqual(query, {
    bio_pos: ["lw", "c", "rw", "d"],
    bio_shot: ["left", "right"],
    sortBy: "p_id",
    sortDirection: "ASC",
    curPage: 2,
    pageSize: 100,
    focus_season: "163",
    player_role: "1",
    stat_season: "162",
  });
});

test("builds goalie state without retaining the skater shot filter", () => {
  const query = buildPuckPediaQuery("0", 3, options);

  assert.deepEqual(query.bio_pos, ["g"]);
  assert.deepEqual(query.bio_shot, []);
  assert.equal(query.player_role, "0");
  assert.equal(query.curPage, 3);
});
