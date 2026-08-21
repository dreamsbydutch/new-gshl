import assert from "node:assert/strict";
import test from "node:test";

import {
  HOME_LEAGUE_ACTIVITY_PREVIEW_LIMIT,
  HOME_MOCK_DRAFT_PREVIEW_LIMIT,
  HOME_POWER_RANKINGS_LIMIT,
  HOME_UFA_PREVIEW_LIMIT,
  selectHomeLeagueActivity,
  selectHomeMockDraftPreview,
  selectHomePowerRankingPreview,
  selectHomeUfaPreview,
} from "./home-dashboard";

void test("home activity starts compact and can expose the complete query inventory", () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    id: `event-${index + 1}`,
  }));

  const preview = selectHomeLeagueActivity(entries, false);
  const expanded = selectHomeLeagueActivity(entries, true);

  assert.equal(preview.length, HOME_LEAGUE_ACTIVITY_PREVIEW_LIMIT);
  assert.deepEqual(
    preview,
    entries.slice(0, HOME_LEAGUE_ACTIVITY_PREVIEW_LIMIT),
  );
  assert.deepEqual(expanded, entries);
  assert.notEqual(expanded, entries);
});

void test("home power rankings keep the leading eight entries in order", () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    id: `team-${index + 1}`,
  }));

  const preview = selectHomePowerRankingPreview(entries);

  assert.equal(preview.length, HOME_POWER_RANKINGS_LIMIT);
  assert.deepEqual(
    preview.map((entry) => entry.id),
    entries.slice(0, HOME_POWER_RANKINGS_LIMIT).map((entry) => entry.id),
  );
  assert.notEqual(preview, entries);
  assert.equal(entries.length, 12);
});

void test("home power rankings retain every entry when the league is smaller", () => {
  const entries = [{ id: "team-1" }, { id: "team-2" }];

  assert.deepEqual(selectHomePowerRankingPreview(entries), entries);
  assert.notEqual(selectHomePowerRankingPreview(entries), entries);
});

void test("home UFA preview keeps five players without mutating the full pool", () => {
  const players = Array.from({ length: 15 }, (_, index) => ({
    id: `player-${index + 1}`,
  }));

  const preview = selectHomeUfaPreview(players);

  assert.equal(preview.length, HOME_UFA_PREVIEW_LIMIT);
  assert.deepEqual(preview, players.slice(0, HOME_UFA_PREVIEW_LIMIT));
  assert.equal(players.length, 15);
});

void test("home mock draft preview keeps four first-round picks in order", () => {
  const projections = [
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `round-one-${index + 1}`,
      pick: { round: "1" },
    })),
    { id: "round-two-1", pick: { round: "2" } },
  ];

  const preview = selectHomeMockDraftPreview(projections);

  assert.equal(preview.length, HOME_MOCK_DRAFT_PREVIEW_LIMIT);
  assert.deepEqual(
    preview.map((projection) => projection.id),
    projections
      .slice(0, HOME_MOCK_DRAFT_PREVIEW_LIMIT)
      .map((projection) => projection.id),
  );
  assert.equal(projections.length, 7);
});
