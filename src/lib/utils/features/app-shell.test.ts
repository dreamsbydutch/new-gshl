import assert from "node:assert/strict";
import test from "node:test";
import { getAppShellRouteContext } from "./app-shell";

void test("maps primary routes to the correct persistent navigation item", () => {
  assert.equal(getAppShellRouteContext("/").activeNavId, "home");
  assert.equal(getAppShellRouteContext("/schedule").activeNavId, "schedule");
  assert.equal(getAppShellRouteContext("/standings").activeNavId, "standings");
  assert.equal(
    getAppShellRouteContext("/lockerroom").activeNavId,
    "lockerroom",
  );
  assert.equal(getAppShellRouteContext("/leagueoffice").activeNavId, "more");
});

void test("keeps detail routes connected to their parent destination", () => {
  assert.deepEqual(getAppShellRouteContext("/matchup/weekly-123"), {
    title: "Matchup",
    activeNavId: "schedule",
    backHref: "/schedule",
    backLabel: "Back to Schedule",
  });
  assert.deepEqual(getAppShellRouteContext("/headlines/edition-123"), {
    title: "Press Box",
    activeNavId: "more",
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
      activeNavId: "schedule",
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
    activeNavId: "more",
    backHref: "/draft",
    backLabel: "Back to Draft Board",
  });
  assert.deepEqual(getAppShellRouteContext("/draft/teams"), {
    title: "Draft: Teams",
    activeNavId: "more",
    backHref: "/draft",
    backLabel: "Back to Draft Board",
  });
});

void test("uses segment boundaries and leaves fallback pages unselected", () => {
  assert.equal(getAppShellRouteContext("/draftboard").title, "Draft Hub");
  assert.deepEqual(getAppShellRouteContext("/draftboardish"), {
    title: "GSHL",
    activeNavId: null,
  });
  assert.deepEqual(getAppShellRouteContext("/signin"), {
    title: "Sign in",
    activeNavId: null,
  });
});
