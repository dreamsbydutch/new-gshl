import assert from "node:assert/strict";
import test from "node:test";
import { buildUpdatedPlayerDayRow } from "./daily-player-stats-sync";
import { PositionGroup, RosterPosition } from "../../types/enums";

const day: Parameters<typeof buildUpdatedPlayerDayRow>[0] = {
  id: "day",
  seasonId: "season",
  weekId: "week",
  playerId: "player",
  gshlTeamId: "team",
  date: "2026-10-10",
  nhlPos: [RosterPosition.C, RosterPosition.LW],
  posGroup: PositionGroup.F,
  dailyPos: RosterPosition.BN,
  bestPos: RosterPosition.C,
  fullPos: RosterPosition.C,
  nhlTeam: "TOR",
  opp: "",
  score: "",
  GP: "",
  MG: "",
  IR: "",
  IRplus: "",
  GS: "",
  G: "",
  A: "",
  P: "",
  PM: "",
  PIM: "",
  PPP: "",
  SOG: "",
  HIT: "",
  BLK: "",
  W: "",
  GA: "",
  GAA: "",
  SV: "",
  SA: "",
  SVP: "",
  SO: "",
  TOI: "",
  Rating: "",
  ADD: "",
  MS: "",
  BS: "",
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
const boxscore: Parameters<typeof buildUpdatedPlayerDayRow>[1] = {
  playerId: "player",
  date: day.date,
  gameId: "game",
  season: "20262027",
  gameType: "2",
  nhlPlayerId: "123",
  fullName: "Test Player",
  nhlTeam: "TOR",
  nhlTeamId: "10",
  opponentAbbr: "MTL",
  opp: "MTL",
  score: "",
  positionCode: "C",
  posGroup: "F",
  GP: "1",
  G: "2",
  A: "1",
  P: "3",
  PM: "",
  PIM: "",
  PPP: "",
  SOG: "",
  HIT: "",
  BLK: "",
  W: "",
  GA: "",
  GAA: "",
  SV: "",
  SA: "",
  SVP: "",
  SO: "",
  TOI: "",
};

test("NHL statistics preserve Yahoo eligibility, team ownership, and bench slot", () => {
  const existing = { ...day, nhlPos: [...day.nhlPos] };
  const stat = { ...boxscore };
  const result = buildUpdatedPlayerDayRow(
    existing,
    stat,
    new Set(["G", "A", "P"]),
    "TOR",
  );
  assert.deepEqual(result.nhlPos, ["C", "LW"]);
  assert.equal(result.gshlTeamId, "team");
  assert.equal(result.dailyPos, "BN");
  assert.equal(result.G, "2");
  assert.equal(result.GP, "1");
  assert.equal(result.GS, "");
  assert.deepEqual(existing.nhlPos, ["C", "LW"]);
});

test("NHL position is a fallback when no Yahoo eligibility was stored", () => {
  const existing = {
    ...day,
    nhlPos: [],
    dailyPos: RosterPosition.RW,
  };
  const stat = { ...boxscore, positionCode: "R" };
  assert.deepEqual(
    buildUpdatedPlayerDayRow(existing, stat, new Set(), "TOR").nhlPos,
    ["RW"],
  );
});
