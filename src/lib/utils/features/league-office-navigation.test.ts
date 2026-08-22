import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LEAGUE_OFFICE_VIEW,
  resolveLeagueOfficeView,
} from "./league-office-navigation";

void test("uses Draft Classes for empty and legacy League Office defaults", () => {
  assert.equal(resolveLeagueOfficeView(undefined, "owner"), "draft");
  assert.equal(resolveLeagueOfficeView("home", "owner"), "draft");
  assert.equal(resolveLeagueOfficeView("mockDraft", "owner"), "draft");
  assert.equal(DEFAULT_LEAGUE_OFFICE_VIEW, "draft");
});

void test("preserves member views and role-valid commissioner views", () => {
  assert.equal(resolveLeagueOfficeView("freeAgents", "owner"), "freeAgents");
  assert.equal(resolveLeagueOfficeView("tradeBlock", "owner"), "tradeBlock");
  assert.equal(resolveLeagueOfficeView("rules", "viewer"), "rules");
  assert.equal(resolveLeagueOfficeView("jobs", "commissioner"), "jobs");
});

void test("does not reopen commissioner panels for non-commissioners", () => {
  assert.equal(resolveLeagueOfficeView("users", "owner"), "draft");
  assert.equal(resolveLeagueOfficeView("contracts", undefined), "draft");
});
