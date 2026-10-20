import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePageScrollProgress,
  getAppShellRouteContext,
} from "./app-shell";

void test("Records belongs to League navigation", () => {
  assert.deepEqual(getAppShellRouteContext("/records"), {
    title: "Records",
    activeNavId: "league",
  });
});

void test("calculates bounded page scroll progress", () => {
  assert.equal(calculatePageScrollProgress(0, 2000, 1000), 0);
  assert.equal(calculatePageScrollProgress(500, 2000, 1000), 50);
  assert.equal(calculatePageScrollProgress(1000, 2000, 1000), 100);
  assert.equal(calculatePageScrollProgress(1500, 2000, 1000), 100);
  assert.equal(calculatePageScrollProgress(-100, 2000, 1000), 0);
  assert.equal(calculatePageScrollProgress(0, 800, 1000), 0);
});

void test("maps primary routes to the correct persistent navigation item", () => {
  assert.equal(getAppShellRouteContext("/").activeNavId, "home");
  assert.equal(getAppShellRouteContext("/schedule").activeNavId, "league");
  assert.equal(getAppShellRouteContext("/standings").activeNavId, "league");
  assert.equal(
    getAppShellRouteContext("/lockerroom").activeNavId,
    "lockerroom",
  );
  assert.equal(getAppShellRouteContext("/leagueoffice").activeNavId, "players");
  assert.deepEqual(getAppShellRouteContext("/admin"), {
    title: "Admin",
    activeNavId: "more",
  });
});

void test("keeps detail routes connected to their parent destination", () => {
  assert.deepEqual(getAppShellRouteContext("/matchup/weekly-123"), {
    title: "Matchup",
    activeNavId: "league",
    backHref: "/schedule",
    backLabel: "Back to Schedule",
  });
  assert.deepEqual(getAppShellRouteContext("/headlines/edition-123"), {
    title: "League news",
    activeNavId: "league",
    backHref: "/headlines",
    backLabel: "Back to Press Box",
  });
});

void test("restores source-aware Matchup context in the shell back link", () => {
  assert.deepEqual(
    getAppShellRouteContext(
      "/matchup/weekly-123",
      "from=schedule&view=team&season=12&owner=owner-4&side=home",
    ),
    {
      title: "Matchup",
      activeNavId: "league",
      backHref: "/schedule?view=team&season=12&owner=owner-4",
      backLabel: "Back to Schedule",
    },
  );
  assert.equal(
    getAppShellRouteContext(
      "/matchup/weekly-123",
      "from=lockerroom&view=history&owner=owner-4&side=home",
    ).backHref,
    "/lockerroom?view=history&owner=owner-4",
  );
});

void test("gives draft child routes a deterministic way back to the board", () => {
  assert.deepEqual(getAppShellRouteContext("/draft/my-team"), {
    title: "Draft: My Team",
    activeNavId: "players",
    backHref: "/draft",
    backLabel: "Back to Draft Board",
  });
  assert.deepEqual(getAppShellRouteContext("/draft/teams"), {
    title: "Draft: Teams",
    activeNavId: "players",
    backHref: "/draft",
    backLabel: "Back to Draft Board",
  });
});

void test("uses segment boundaries and leaves fallback pages unselected", () => {
  assert.equal(getAppShellRouteContext("/draftboard").title, "Draft hub");
  assert.deepEqual(getAppShellRouteContext("/draftboardish"), {
    title: "GSHL",
    activeNavId: null,
  });
  assert.deepEqual(getAppShellRouteContext("/signin"), {
    title: "Sign in",
    activeNavId: null,
  });
});

void test("new destinations and legacy office views belong to the right category", () => {
  assert.equal(getAppShellRouteContext("/league").activeNavId, "league");
  assert.equal(getAppShellRouteContext("/players").activeNavId, "players");
  for (const view of ["ownerRankings", "confBattle"])
    assert.equal(
      getAppShellRouteContext("/leagueoffice", `view=${view}`).activeNavId,
      "league",
    );
  for (const view of ["freeAgents", "draft", "performances"])
    assert.equal(
      getAppShellRouteContext("/leagueoffice", `view=${view}`).activeNavId,
      "players",
    );
  assert.equal(
    getAppShellRouteContext("/matchup/1", "from=lockerroom&view=history")
      .activeNavId,
    "lockerroom",
  );
  assert.equal(getAppShellRouteContext("/nhl/matchup/1").activeNavId, "league");
  assert.equal(getAppShellRouteContext("/notifications").activeNavId, "more");
});
