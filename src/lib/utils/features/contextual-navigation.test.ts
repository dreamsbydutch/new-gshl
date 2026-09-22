import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminNavigationHref,
  buildContextualNavigationHref,
  buildDraftTeamsNavigationHref,
  buildGlobalSeasonNavigationHref,
  buildLeagueOfficeNavigationHref,
  buildLockerRoomNavigationHref,
  buildMatchupNavigationHref,
  buildScheduleNavigationHref,
  buildStandingsNavigationHref,
  getLeagueOfficeNavigationViews,
  isGlobalSeasonUrlPath,
  isLockerRoomNavigationView,
  resolveContextualSelection,
  resolveLockerRoomOwnerId,
  resolveMatchupBackHref,
  resolveMatchupNavigationSide,
  toPersistedNavigationId,
} from "./contextual-navigation";

void test("explicit context wins before persisted context", () => {
  assert.deepEqual(
    resolveContextualSelection({
      explicitValue: "team",
      persistedValue: "week",
      validValues: ["week", "team"] as const,
      fallbackValue: "week",
    }),
    { value: "team", source: "url", urlWasInvalid: false },
  );
});

void test("missing values use persistence while invalid explicit values use defaults", () => {
  assert.deepEqual(
    resolveContextualSelection({
      explicitValue: null,
      persistedValue: "team",
      validValues: ["week", "team"] as const,
      fallbackValue: "week",
    }),
    { value: "team", source: "persisted", urlWasInvalid: false },
  );
  assert.deepEqual(
    resolveContextualSelection({
      explicitValue: "unknown",
      persistedValue: "team",
      validValues: ["week", "team"] as const,
      fallbackValue: "week",
    }),
    { value: "week", source: "default", urlWasInvalid: true },
  );
});

void test("missing route data clears stale persisted document IDs", () => {
  assert.equal(toPersistedNavigationId(null), "");
  assert.equal(
    toPersistedNavigationId("jd7abc123def456ghi789jkl012mno34"),
    "jd7abc123def456ghi789jkl012mno34",
  );
});

void test("route builders preserve unknown params and remove stale owned params", () => {
  assert.equal(
    buildScheduleNavigationHref(
      "?utm=league&view=team&owner=old&week=stale&view=duplicate",
      {
        view: "week",
        season: "season 12",
        week: "week/5",
      },
    ),
    "/schedule?utm=league&view=week&season=season+12&week=week%2F5",
  );
  assert.equal(
    buildScheduleNavigationHref("?debug=1&week=stale", {
      view: "team",
      season: "12",
      owner: "owner-4",
    }),
    "/schedule?debug=1&view=team&season=12&owner=owner-4",
  );
});

void test("each contextual route gets only its relevant state", () => {
  assert.equal(
    buildAdminNavigationHref("?season=old", { view: "tv" }),
    "/admin?view=tv",
  );
  assert.equal(
    buildStandingsNavigationHref("?week=old", {
      view: "power",
      season: "12",
    }),
    "/standings?view=power&season=12",
  );
  assert.equal(
    buildLockerRoomNavigationHref("?season=old", {
      view: "salary",
      season: "12",
      owner: "owner-2",
    }),
    "/lockerroom?view=salary&season=12&owner=owner-2",
  );
  assert.equal(
    buildLeagueOfficeNavigationHref("?owner=old", {
      view: "freeAgents",
      season: "12",
    }),
    "/leagueoffice?view=freeAgents&season=12",
  );
  assert.equal(
    buildDraftTeamsNavigationHref("?view=old", "owner-3"),
    "/draft/teams?owner=owner-3",
  );
});

void test("global season updates preserve route context and clear stale weeks", () => {
  assert.equal(
    buildGlobalSeasonNavigationHref(
      "/schedule",
      "?view=week&season=11&week=week-4&utm=league",
      "12",
    ),
    "/schedule?view=week&season=12&utm=league",
  );
  assert.equal(
    buildGlobalSeasonNavigationHref(
      "/lockerroom",
      "?view=history&owner=owner-2",
      "12",
    ),
    null,
  );
  assert.equal(
    buildGlobalSeasonNavigationHref("/rulebook", "?section=trades", "12"),
    null,
  );
});

void test("generic updates clean duplicate owned params without dropping unknown state", () => {
  assert.equal(
    buildContextualNavigationHref(
      "/schedule",
      "?view=week&view=team&experiment=a",
      { view: "team", owner: "owner-8" },
    ),
    "/schedule?experiment=a&view=team&owner=owner-8",
  );
});

void test("League Office navigation offers only active member destinations", () => {
  assert.deepEqual(getLeagueOfficeNavigationViews(), [
    "draft",
    "freeAgents",
    "rules",
    "confBattle",
    "ownerRankings",
    "performances",
  ]);
  for (const view of getLeagueOfficeNavigationViews()) {
    assert.equal(
      buildLeagueOfficeNavigationHref("?utm=league&owner=old&week=stale", {
        view,
        season: "12",
      }),
      "/leagueoffice?utm=league&view=" + view + "&season=12",
    );
  }
});

void test("obsolete URL and persisted League Office views fall back to Draft Classes", () => {
  for (const legacyView of [
    "tradeBlock",
    "imageUpload",
    "draftPicks",
    "contracts",
    "users",
    "jobs",
    "newsroom",
    "images",
    "tv",
  ]) {
    for (const explicitValue of [legacyView, null]) {
      const selection = resolveContextualSelection({
        explicitValue,
        persistedValue: explicitValue === null ? legacyView : "freeAgents",
        validValues: getLeagueOfficeNavigationViews(),
        fallbackValue: "draft",
      });
      assert.deepEqual(selection, {
        value: "draft",
        source: "default",
        urlWasInvalid: explicitValue !== null,
      });
      assert.equal(
        buildLeagueOfficeNavigationHref(
          "?view=" + legacyView + "&owner=old&utm=league",
          { view: selection.value, season: "12" },
        ),
        "/leagueoffice?utm=league&view=draft&season=12",
      );
    }
  }
});

void test("matchup links carry an allowlisted source context and selected side", () => {
  assert.equal(
    buildMatchupNavigationHref("matchup/5", {
      from: "schedule",
      view: "team",
      season: "12",
      owner: "owner-2",
      side: "home",
    }),
    "/matchup/matchup%2F5?view=team&season=12&owner=owner-2&from=schedule&side=home",
  );
});

void test("matchup back links restore schedule and Locker Room context", () => {
  assert.equal(
    resolveMatchupBackHref(
      "?from=schedule&view=week&season=12&week=week-6&side=away",
    ),
    "/schedule?view=week&season=12&week=week-6",
  );
  assert.equal(
    resolveMatchupBackHref(
      "?from=lockerroom&view=history&season=12&owner=owner-2&side=home",
    ),
    "/lockerroom?view=history&season=12&owner=owner-2",
  );
  assert.equal(resolveMatchupBackHref("?from=headlines"), "/headlines");
});

void test("invalid matchup sources cannot become redirect targets", () => {
  assert.equal(
    resolveMatchupBackHref("?from=https://example.com&view=team", {
      season: "12",
      week: "week-3",
    }),
    "/schedule?view=week&season=12&week=week-3",
  );
  assert.equal(resolveMatchupNavigationSide("?side=invalid", "home"), "home");
  assert.equal(resolveMatchupNavigationSide("?side=away", "home"), "away");
});

void test("only Schedule and Standings share historical season selection", () => {
  for (const route of ["/schedule", "/standings"])
    assert.equal(isGlobalSeasonUrlPath(route), true);
  for (const route of [
    "/",
    "/lockerroom",
    "/leagueoffice",
    "/leagueoffice/mock-draft",
    "/matchup/game-1",
    "/draft/my-team",
  ]) {
    assert.equal(isGlobalSeasonUrlPath(route), false);
    assert.equal(
      buildGlobalSeasonNavigationHref(route, "?season=old", "new"),
      null,
    );
  }
});

void test("trade block links retain the active My Team destination", () => {
  assert.equal(isLockerRoomNavigationView("tradeBlock"), true);
  assert.equal(
    buildLockerRoomNavigationHref("", { view: "tradeBlock", owner: "owner-a" }),
    "/lockerroom?view=tradeBlock&owner=owner-a",
  );
});

void test("My Team defaults to the signed-in owner rather than the stored or first team", () => {
  const owners = ["first-owner", "my-owner", "other-owner"];
  assert.equal(
    resolveLockerRoomOwnerId(null, "my-owner", "first-owner", owners),
    "my-owner",
  );
  assert.equal(
    resolveLockerRoomOwnerId(null, "my-owner", "other-owner", owners),
    "my-owner",
  );
  assert.equal(
    resolveLockerRoomOwnerId("other-owner", "my-owner", "first-owner", owners),
    "other-owner",
  );
  assert.equal(
    resolveLockerRoomOwnerId("invalid", "my-owner", "first-owner", owners),
    "my-owner",
  );
  assert.equal(
    resolveLockerRoomOwnerId(null, null, "other-owner", owners),
    "other-owner",
  );
  assert.equal(
    resolveLockerRoomOwnerId(null, "unlinked", null, owners),
    "first-owner",
  );
  assert.equal(
    resolveLockerRoomOwnerId(null, "my-owner", "old-owner", []),
    null,
  );
});
