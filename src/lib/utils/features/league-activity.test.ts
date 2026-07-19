import assert from "node:assert/strict";
import test from "node:test";

import { ContractStatus } from "@gshl-types";
import { buildLeagueActivity } from "./league-activity";

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

void test("builds a chronological feed from signings, adds, drops, and missed starts", () => {
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
