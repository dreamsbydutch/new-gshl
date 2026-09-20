import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LEAGUE_OFFICE_VIEW,
  resolveLeagueOfficeView,
} from "./league-office-navigation";

void test("uses Draft Classes for empty and obsolete League Office views", () => {
  for (const view of [
    undefined,
    null,
    "",
    "home",
    "mockDraft",
    "tradeBlock",
    "draftPicks",
    "contracts",
    "users",
    "jobs",
    "newsroom",
    "images",
    "imageUpload",
    "tv",
  ]) {
    assert.equal(resolveLeagueOfficeView(view), "draft", String(view));
  }
  assert.equal(DEFAULT_LEAGUE_OFFICE_VIEW, "draft");
});

void test("preserves all active member views", () => {
  for (const view of [
    "draft",
    "freeAgents",
    "rules",
    "confBattle",
    "ownerRankings",
  ]) {
    assert.equal(resolveLeagueOfficeView(view), view);
  }
});
