import assert from "node:assert/strict";
import test from "node:test";
import { getSectionNavigation } from "./section-navigation";

void test("league links carry the selected season without carrying unrelated owner or view state", () => {
  const items = getSectionNavigation(
    "league",
    "/schedule",
    "view=team&owner=owner-1&season=season-2",
    "season-1",
  );
  assert.equal(
    items.find((item) => item.label === "Schedule")?.href,
    "/schedule?view=week&season=season-2",
  );
  assert.equal(
    items.find((item) => item.label === "Standings")?.href,
    "/standings?view=overall&season=season-2",
  );
  assert.deepEqual(
    items.filter((item) => item.active).map((item) => item.label),
    ["Schedule"],
  );
});

void test("Records has its own League destination", () => {
  assert.equal(
    getSectionNavigation("league", "/records", "").find((item) => item.active)
      ?.label,
    "Records",
  );
});

void test("news details and NHL matchups keep their league section selected", () => {
  assert.equal(
    getSectionNavigation("league", "/headlines/issue-1", "").find(
      (item) => item.active,
    )?.label,
    "News",
  );
  assert.equal(
    getSectionNavigation("league", "/nhl/matchup/123", "").find(
      (item) => item.active,
    )?.label,
    "Schedule",
  );
});

void test("legacy player tools have one clear owning section", () => {
  for (const [path, search, label] of [
    ["/players", "", "Research"],
    ["/leagueoffice", "view=freeAgents", "Free agency"],
    ["/leagueoffice", "view=draft", "Draft classes"],
    ["/leagueoffice/mock-draft", "", "Draft classes"],
    ["/draft/teams", "owner=1", "Draft hub"],
  ]) {
    assert.deepEqual(
      getSectionNavigation("players", path!, search!)
        .filter((item) => item.active)
        .map((item) => item.label),
      [label],
    );
  }
});
