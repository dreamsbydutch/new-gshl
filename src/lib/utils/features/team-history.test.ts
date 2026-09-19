import assert from "node:assert/strict";
import test from "node:test";

import type {
  GSHLTeam,
  TeamHistoryMatchupSummary,
  TeamHistoryTeamSummary,
} from "@gshl-types";
import {
  buildOwnerOptions,
  parseIdValue,
  filterTeamHistorySeasons,
  calculateWinLossRecord,
} from "./team-history";

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

void test("local year selection combines records across selected seasons without mutating history", () => {
  const teams: TeamHistoryTeamSummary[] = [
    {
      id: "home",
      ownerId: "owner",
      name: "Home",
      logoUrl: null,
      confAbbr: null,
      ownerFirstName: null,
      ownerLastName: null,
    },
    {
      id: "away",
      ownerId: "opponent",
      name: "Away",
      logoUrl: null,
      confAbbr: null,
      ownerFirstName: null,
      ownerLastName: null,
    },
  ];
  const games: TeamHistoryMatchupSummary[] = [
    {
      id: "one",
      seasonId: "2024",
      weekId: "w1",
      homeTeamId: "home",
      awayTeamId: "away",
      gameType: "CC",
      homeWin: true,
      awayWin: false,
    },
    {
      id: "two",
      seasonId: "2025",
      weekId: "w2",
      homeTeamId: "home",
      awayTeamId: "away",
      gameType: "CC",
      homeWin: false,
      awayWin: true,
    },
    {
      id: "three",
      seasonId: "2026",
      weekId: "w3",
      homeTeamId: "home",
      awayTeamId: "away",
      gameType: "CC",
      tie: true,
    },
  ];
  const original = structuredClone(games);
  assert.deepEqual(
    calculateWinLossRecord(
      filterTeamHistorySeasons(games, ["2024"]),
      "owner",
      teams,
    ),
    [1, 0, 0],
  );
  assert.deepEqual(
    calculateWinLossRecord(
      filterTeamHistorySeasons(games, ["2024", "2026"]),
      "owner",
      teams,
    ),
    [1, 0, 1],
  );
  assert.deepEqual(
    calculateWinLossRecord(
      filterTeamHistorySeasons(games, ["2024", "2025", "2026"]),
      "owner",
      teams,
    ),
    [1, 1, 1],
  );
  assert.deepEqual(filterTeamHistorySeasons(games, []), []);
  assert.deepEqual(filterTeamHistorySeasons(games, ["unknown"]), []);
  assert.deepEqual(games, original);
});
