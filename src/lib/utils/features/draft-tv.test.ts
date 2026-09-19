import assert from "node:assert/strict";
import { test } from "node:test";
import type { DraftPick, GSHLTeam } from "@gshl-types";
import {
  buildDraftTvPicks,
  formatDraftPickLabel,
  groupRemainingDraftPicksByFranchise,
} from "./draft-tv";
import { resolveDraftClockState } from "./draft-hub";

const start = new Date("2026-09-19T23:00:00Z");
const team: GSHLTeam = {
  id: "draft-season-team",
  seasonId: "draft-season",
  franchiseId: "franchise",
  ownerId: "owner",
  name: "Butabi Brothers",
  abbr: "BUT",
  logoUrl: null,
  isActive: true,
  yahooId: null,
  confId: null,
  confName: null,
  confAbbr: null,
  confLogoUrl: null,
  ownerFirstName: null,
  ownerLastName: null,
  ownerNickname: null,
  ownerEmail: "private@example.test",
  ownerOwing: 50,
  ownerIsActive: true,
};
const pick: DraftPick = {
  id: "pick",
  seasonId: "draft-season",
  gshlTeamId: team.id,
  originalTeamId: "unknown",
  round: "1",
  pick: "1",
  playerId: null,
  isTraded: true,
  isSigning: false,
  createdAt: start,
  updatedAt: start,
  onClockStartedAt: start.toISOString(),
  onClockExpiresAt: new Date(start.getTime() + 240000).toISOString(),
};

void test("public TV picks retain franchise identity without private owner fields", () => {
  const views = buildDraftTvPicks([pick], [team], []);
  assert.deepEqual(views[0]?.team, {
    id: team.id,
    franchiseId: team.franchiseId,
    ownerId: team.ownerId,
    name: team.name,
    abbr: team.abbr,
    logoUrl: null,
  });
  assert.equal(views[0]?.originalTeam, null);
  assert.equal(views[0]?.player, null);
  assert.equal(views[0]?.pick.onClockExpiresAt, start.getTime() + 240000);
  assert.equal(pick.createdAt, start);
});

void test("public TV follows the same first-pick and persisted clock rules as the hub", () => {
  const before = resolveDraftClockState(
    [pick],
    start,
    new Date(start.getTime() - 1000),
  );
  assert.equal(before.status, "upcoming");
  assert.equal(before.activePick?.gshlTeamId, team.id);
  const live = resolveDraftClockState(
    [pick],
    start,
    new Date(start.getTime() + 1000),
  );
  assert.equal(live.status, "on_clock");
  assert.equal(live.clockExpiresAt, start.getTime() + 240000);
  assert.equal(
    resolveDraftClockState([pick], start, new Date(start.getTime() + 240001))
      .status,
    "commissioner_required",
  );
});

void test("remaining picks follow the receiving franchise, sort numerically, and disappear on selection", () => {
  const next = { ...pick, id: "next", round: "5", pick: "76" };
  const signing = { ...pick, id: "signing", isSigning: true };
  const selected = { ...pick, id: "selected", playerId: "player" };
  const entries = [next, signing, selected, pick];
  const grouped = groupRemainingDraftPicksByFranchise(entries, [team]);
  assert.deepEqual(
    grouped.get(team.franchiseId)?.map((entry) => entry.id),
    ["pick", "next"],
  );
  assert.equal(grouped.has("unknown"), false);
  assert.equal(formatDraftPickLabel(next), "05-76");
  assert.equal(formatDraftPickLabel({ round: "1", pick: "12" }), "01-12");
  assert.equal(formatDraftPickLabel({ round: "12", pick: "168" }), "12-168");
  const after = groupRemainingDraftPicksByFranchise(
    entries.map((entry) =>
      entry.id === pick.id ? { ...entry, playerId: "new-selection" } : entry,
    ),
    [team],
  );
  assert.deepEqual(
    after.get(team.franchiseId)?.map((entry) => entry.id),
    ["next"],
  );
  assert.equal(pick.playerId, null);
});
