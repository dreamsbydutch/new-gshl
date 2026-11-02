import assert from "node:assert/strict";
import test from "node:test";

import { ContractStatus } from "../domain/constants";
import { buildLeagueActivity } from "./league-activity";
import type { LeagueTradeSummary } from "../../types/trades";

const players = [
  { id: "p1", fullName: "Player One" },
  { id: "p2", fullName: "Player Two" },
  { id: "p3", fullName: "Player Three" },
  { id: "p4", fullName: "Player Four" },
  { id: "p5", fullName: "Player Five" },
];
const franchises = [
  {
    id: "f1",
    ownerId: "o1",
    name: "Toronto Testers",
    abbr: "TOR",
    logoUrl: "",
  },
  {
    id: "f2",
    ownerId: "o2",
    name: "Missing Scrape",
    abbr: "MIS",
    logoUrl: "",
  },
];
const teams = [
  { id: "t1", seasonId: "s1", franchiseId: "f1" },
  { id: "t2", seasonId: "s1", franchiseId: "f2" },
];

void test("recorded trade packages show players and picks without spending weekly adds or creating drop notices", () => {
  const trade: LeagueTradeSummary = {
    id: "deal",
    date: "2026-01-02",
    teamA: { id: "t1", name: "Toronto Testers", logoUrl: null },
    teamB: { id: "t2", name: "Missing Scrape", logoUrl: null },
    players: [
      {
        playerId: "p1",
        playerName: "Player One",
        fromTeamId: "t1",
        toTeamId: "t2",
      },
    ],
    picks: [
      {
        pickId: "pick",
        label: "2027 · Round 1, pick 2",
        fromTeamId: "t2",
        toTeamId: "t1",
      },
    ],
    notes: "Confirmed",
  };
  const result = buildLeagueActivity({
    players,
    teams,
    franchises,
    contracts: [],
    trades: [trade, { ...trade, id: "another", players: [], picks: [] }],
    perTypeLimit: true,
    playerDays: [
      {
        id: "before",
        playerId: "p1",
        gshlTeamId: "t1",
        date: "2026-01-01",
        ADD: "",
        MS: "",
      },
      {
        id: "stay",
        playerId: "p2",
        gshlTeamId: "t1",
        date: "2026-01-01",
        ADD: "",
        MS: "",
      },
      {
        id: "after",
        playerId: "p1",
        gshlTeamId: "t2",
        date: "2026-01-02",
        ADD: "1",
        MS: "",
      },
      {
        id: "stay-after",
        playerId: "p2",
        gshlTeamId: "t1",
        date: "2026-01-02",
        ADD: "",
        MS: "",
      },
    ],
  });
  assert.equal(
    result.filter((event) => event.type === "trade").length,
    2,
    "separate same-day deals must not collapse",
  );
  assert.equal(
    result.some((event) => event.type === "add" || event.type === "drop"),
    false,
  );
  assert.equal(
    result.find((event) => event.id === "trade:deal")?.trade?.picks[0]?.label,
    "2027 · Round 1, pick 2",
  );
});

void test("weekly add totals use the full league week before limiting and reset for each team and week", () => {
  const base = { ADD: "1", MS: "", gshlTeamId: "t1" };
  const first = { ...base, id: "a", playerId: "p1", date: "2026-01-01" };
  const input = {
    players,
    teams,
    franchises,
    contracts: [],
    weeks: [
      { id: "w1", startDate: "2026-01-01", endDate: "2026-01-07" },
      { id: "w2", startDate: "2026-01-08", endDate: "2026-01-21" },
    ],
    playerDays: [
      first,
      { ...first, id: "duplicate" },
      { ...base, id: "b", playerId: "p2", date: "2026-01-07" },
      {
        ...base,
        id: "c",
        playerId: "p3",
        date: "2026-01-07",
        gshlTeamId: "t2",
      },
      { ...base, id: "d", playerId: "p4", date: "2026-01-08" },
      { ...base, id: "e", playerId: "p5", date: "2026-01-20" },
    ],
    perTypeLimit: true,
    limit: 3,
  };
  const before = structuredClone(input);
  const result = buildLeagueActivity(input).filter(
    (event) => event.type === "add",
  );
  assert.deepEqual(input, before);
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((event) => [event.playerId, event.weeklyAddCount]),
    [
      ["p5", 2],
      ["p4", 2],
      ["p3", 1],
    ],
  );
  const all = buildLeagueActivity({ ...input, limit: 20 }).filter(
    (event) => event.type === "add",
  );
  assert.equal(all.find((event) => event.playerId === "p1")?.weeklyAddCount, 2);
  assert.equal(all.find((event) => event.playerId === "p2")?.weeklyAddCount, 2);
});

void test("separate limits keep older trades and drops visible alongside newer adds", () => {
  const result = buildLeagueActivity({
    players,
    teams,
    franchises,
    perTypeLimit: true,
    limit: 1,
    trades: [
      {
        id: "deal",
        date: "2026-01-01",
        teamA: { id: "t1", name: "Toronto Testers", logoUrl: null },
        teamB: { id: "t2", name: "Missing Scrape", logoUrl: null },
        players: [],
        picks: [
          {
            pickId: "pick",
            label: "2027 · Round 1",
            fromTeamId: "t1",
            toTeamId: "t2",
          },
        ],
        notes: "",
      },
    ],
    contracts: [
      {
        id: "trade",
        playerId: "p4",
        ownerId: "o2",
        seasonId: "s1",
        signingDate: "2026-01-01",
        signingStatus: ContractStatus.TRADE,
        contractLength: 1,
        contractSalary: 1000000,
      },
    ],
    playerDays: [
      {
        id: "a",
        playerId: "p1",
        gshlTeamId: "t1",
        date: "2026-01-01",
        ADD: "",
        MS: "",
      },
      {
        id: "b",
        playerId: "p2",
        gshlTeamId: "t1",
        date: "2026-01-02",
        ADD: "1",
        MS: "",
      },
      {
        id: "c",
        playerId: "p3",
        gshlTeamId: "t1",
        date: "2026-01-02",
        ADD: "1",
        MS: "1",
      },
    ],
  });
  assert.deepEqual(
    result.map((event) => event.type),
    ["add", "drop", "trade"],
  );
  assert.equal(
    result.find((event) => event.type === "trade")?.trade?.id,
    "deal",
  );
  assert.equal(
    result.find((event) => event.type === "add")?.weeklyAddCount,
    null,
  );
});

void test("trade branding comes from the contract season's team rather than a later rebrand", () => {
  const result = buildLeagueActivity({
    players,
    teams,
    franchises: [
      ...franchises,
      { ...franchises[0]!, id: "later-brand", name: "Later Brand" },
    ],
    playerDays: [],
    contracts: [
      {
        id: "trade",
        playerId: "p1",
        ownerId: "o1",
        seasonId: "s1",
        signingDate: "2026-01-01",
        signingStatus: ContractStatus.TRADE,
        contractLength: 1,
        contractSalary: 1000000,
      },
    ],
  });
  assert.equal(result[0]?.teamId, "t1");
  assert.equal(result[0]?.teamName, "Toronto Testers");
});

void test("builds a chronological feed from signings, trades, adds, drops, and missed starts", () => {
  const activity = buildLeagueActivity({
    players,
    franchises,
    teams,
    contracts: [
      {
        id: "c1",
        playerId: "p5",
        ownerId: "o1",
        seasonId: "s1",
        signingDate: "2026-01-02",
        signingStatus: ContractStatus.UFA,
        contractLength: 2,
        contractSalary: 2_000_000,
      },
      {
        id: "c2",
        playerId: "p1",
        ownerId: "o2",
        seasonId: "s1",
        signingDate: "2026-01-02",
        signingStatus: ContractStatus.TRADE,
        contractLength: 1,
        contractSalary: 1_500_000,
      },
    ],
    playerDays: [
      {
        id: "d1",
        playerId: "p1",
        gshlTeamId: "t1",
        date: "2026-01-01",
        ADD: "",
        MS: "",
      },
      {
        id: "d2",
        playerId: "p2",
        gshlTeamId: "t1",
        date: "2026-01-01",
        ADD: "",
        MS: "",
      },
      {
        id: "d3",
        playerId: "p3",
        gshlTeamId: "t1",
        date: "2026-01-01",
        ADD: "",
        MS: "",
      },
      {
        id: "d4",
        playerId: "p1",
        gshlTeamId: "t1",
        date: "2026-01-02",
        ADD: "",
        MS: "",
      },
      {
        id: "d5",
        playerId: "p3",
        gshlTeamId: "t1",
        date: "2026-01-02",
        ADD: "",
        MS: "1",
      },
      {
        id: "d6",
        playerId: "p4",
        gshlTeamId: "t1",
        date: "2026-01-02",
        ADD: "1",
        MS: "",
      },
    ],
  });

  assert.deepEqual(
    activity.map((event) => [event.type, event.playerId]),
    [
      ["signing", "p5"],
      ["trade", "p1"],
      ["add", "p4"],
      ["drop", "p2"],
      ["missed_start", "p3"],
    ],
  );
});

void test("does not infer drops when today's team snapshot is missing", () => {
  const activity = buildLeagueActivity({
    players,
    franchises,
    teams,
    contracts: [],
    playerDays: [
      {
        id: "d1",
        playerId: "p1",
        gshlTeamId: "t1",
        date: "2026-01-01",
        ADD: "",
        MS: "",
      },
      {
        id: "d2",
        playerId: "p2",
        gshlTeamId: "t2",
        date: "2026-01-01",
        ADD: "",
        MS: "",
      },
      {
        id: "d3",
        playerId: "p1",
        gshlTeamId: "t1",
        date: "2026-01-02",
        ADD: "",
        MS: "",
      },
    ],
  });

  assert.equal(
    activity.some((event) => event.type === "drop" && event.playerId === "p2"),
    false,
  );
});
