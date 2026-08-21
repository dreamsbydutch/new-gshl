import assert from "node:assert/strict";
import test from "node:test";

import type {
  GSHLTeam,
  TeamHistoryMatchupSummary,
  TeamHistoryTeamSummary,
} from "@gshl-types";
import { buildOwnerOptions, parseIdValue } from "./team-history";

void test("preserves string IDs from history filter values", () => {
  assert.equal(parseIdValue("2025-26,j57abc123"), "j57abc123");
  assert.equal(parseIdValue("Jane Owner,k17owner456"), "k17owner456");
});

void test("returns undefined for an all-history filter value", () => {
  assert.equal(parseIdValue("All,"), undefined);
  assert.equal(parseIdValue(""), undefined);
});

void test("builds opponent options from historical owner teams", () => {
  const matchup: TeamHistoryMatchupSummary = {
    id: "matchup-1",
    seasonId: "season-old",
    weekId: "week-1",
    homeTeamId: "historical-owner-team",
    awayTeamId: "historical-opponent-team",
    gameType: "CC",
  };
  const teams: TeamHistoryTeamSummary[] = [
    {
      id: "historical-owner-team",
      name: "Owner Team",
      logoUrl: null,
      confAbbr: "SV",
      ownerId: "owner-1",
      ownerFirstName: "Current",
      ownerLastName: "Owner",
    },
    {
      id: "historical-opponent-team",
      name: "Opponent Team",
      logoUrl: null,
      confAbbr: "HH",
      ownerId: "owner-2",
      ownerFirstName: "Rival",
      ownerLastName: "Owner",
    },
  ];
  const currentTeam = {
    id: "current-owner-team",
    ownerId: "owner-1",
  } as GSHLTeam;

  assert.deepEqual(buildOwnerOptions([matchup], teams, currentTeam), [
    ["All", ""],
    ["Rival Owner", "owner-2"],
  ]);
});
