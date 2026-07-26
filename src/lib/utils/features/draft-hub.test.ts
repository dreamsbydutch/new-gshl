import assert from "node:assert/strict";
import test from "node:test";
import type { DraftPick, Season } from "@gshl-types";
import {
  canSubmitDraftPick,
  resolveDraftClockState,
  resolveDraftHubSeason,
  serializeDraftHubPick,
} from "./draft-hub";

const start = "2026-09-01T23:00:00.000Z";

function pick(
  id: string,
  overall: number,
  playerId: string | null = null,
  fields: Partial<DraftPick> = {},
): DraftPick {
  return {
    id,
    seasonId: "season",
    gshlTeamId: `team-${id}`,
    round: "1",
    pick: String(overall),
    playerId,
    isTraded: false,
    isSigning: false,
    createdAt: new Date(start),
    updatedAt: new Date(start),
    ...fields,
  };
}

function season(
  id: string,
  startDate: string,
  endDate: string,
  draftStartAt: string | null,
): Season {
  return {
    id,
    year: Number(endDate.slice(0, 4)),
    name: id,
    categories: [],
    rosterSpots: [],
    startDate,
    endDate,
    isActive: false,
    usesLegacyTies: false,
    signingEndDate: startDate,
    draftStartAt,
    createdAt: new Date(startDate),
    updatedAt: new Date(startDate),
  };
}

void test("selects only the real current or upcoming draft season", () => {
  const previousSeason = season(
    "previous",
    "2025-10-01",
    "2026-06-01",
    "2025-09-15T23:00:00.000Z",
  );
  const upcomingSeason = season(
    "upcoming",
    "2026-10-01",
    "2027-06-01",
    "2026-09-15T23:00:00.000Z",
  );

  assert.equal(
    resolveDraftHubSeason(
      [previousSeason, upcomingSeason],
      new Date("2026-07-26T12:00:00.000Z"),
    )?.id,
    "upcoming",
  );
  assert.equal(
    resolveDraftHubSeason(
      [upcomingSeason],
      new Date("2026-11-01T12:00:00.000Z"),
    )?.id,
    "upcoming",
  );
});

void test("does not fall back to a previous season's completed draft", () => {
  const previousSeason = season(
    "previous",
    "2025-10-01",
    "2026-06-01",
    "2025-09-15T23:00:00.000Z",
  );

  assert.equal(
    resolveDraftHubSeason(
      [previousSeason],
      new Date("2026-07-26T12:00:00.000Z"),
    ),
    undefined,
  );
});

void test("serializes draft pick dates for Convex responses", () => {
  const serialized = serializeDraftHubPick(pick("1", 1));

  assert.equal(serialized.createdAt, Date.parse(start));
  assert.equal(serialized.updatedAt, Date.parse(start));
  assert.equal(typeof serialized.createdAt, "number");
  assert.equal(typeof serialized.updatedAt, "number");
});

void test("selects the first unfilled pick and skips completed picks", () => {
  const state = resolveDraftClockState(
    [pick("3", 3), pick("1", 1, "player-1"), pick("2", 2, "player-2")],
    start,
    new Date("2026-09-01T23:02:00.000Z"),
  );
  assert.equal(state.activePick?.id, "3");
  assert.equal(state.completedCount, 2);
  assert.deepEqual(
    state.recentPicks.map((draftPick) => draftPick.id),
    ["2", "1"],
  );
});

void test("uses the season start for the first clock and expires after four minutes", () => {
  const upcoming = resolveDraftClockState(
    [pick("1", 1)],
    start,
    new Date("2026-09-01T22:59:59.000Z"),
  );
  const live = resolveDraftClockState(
    [pick("1", 1)],
    start,
    new Date("2026-09-01T23:03:59.000Z"),
  );
  const expired = resolveDraftClockState(
    [pick("1", 1)],
    start,
    new Date("2026-09-01T23:04:00.000Z"),
  );
  assert.equal(upcoming.status, "upcoming");
  assert.equal(live.status, "on_clock");
  assert.equal(expired.status, "commissioner_required");
});

void test("returns only the next five open picks", () => {
  const state = resolveDraftClockState(
    Array.from({ length: 8 }, (_, index) => pick(String(index + 1), index + 1)),
    start,
    new Date("2026-09-01T23:01:00.000Z"),
  );
  assert.deepEqual(
    state.upcomingPicks.map((draftPick) => draftPick.id),
    ["2", "3", "4", "5", "6"],
  );
});

void test("falls back to the latest completed timestamp for legacy picks", () => {
  const state = resolveDraftClockState(
    [
      pick("1", 1, "player-1", {
        updatedAt: new Date("2026-09-01T23:01:00.000Z"),
      }),
      pick("2", 2),
    ],
    start,
    new Date("2026-09-01T23:02:00.000Z"),
  );
  assert.equal(state.clockStartedAt, Date.parse("2026-09-01T23:01:00.000Z"));
  assert.equal(state.clockExpiresAt, Date.parse("2026-09-01T23:05:00.000Z"));
});

void test("marks the draft complete when every pick has a player", () => {
  const state = resolveDraftClockState(
    [pick("1", 1, "player-1"), pick("2", 2, "player-2")],
    start,
  );
  assert.equal(state.status, "complete");
  assert.equal(state.remainingCount, 0);
});

void test("allows only the active owner before expiry and commissioner after expiry", () => {
  assert.equal(
    canSubmitDraftPick({
      role: "owner",
      userOwnerId: "owner-1",
      activeTeamOwnerId: "owner-1",
      status: "on_clock",
    }),
    true,
  );
  assert.equal(
    canSubmitDraftPick({
      role: "owner",
      userOwnerId: "owner-1",
      activeTeamOwnerId: "owner-1",
      status: "commissioner_required",
    }),
    false,
  );
  assert.equal(
    canSubmitDraftPick({
      role: "owner",
      userOwnerId: "owner-2",
      activeTeamOwnerId: "owner-1",
      status: "on_clock",
    }),
    false,
  );
  assert.equal(
    canSubmitDraftPick({
      role: "viewer",
      userOwnerId: null,
      activeTeamOwnerId: "owner-1",
      status: "on_clock",
    }),
    false,
  );
  assert.equal(
    canSubmitDraftPick({
      role: "commissioner",
      status: "commissioner_required",
    }),
    true,
  );
});
