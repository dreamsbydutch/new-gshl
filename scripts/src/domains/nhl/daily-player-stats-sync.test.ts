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

test("a completed early game waits for the full slate before publishing missed games", () => {
  const game = {
    date: day.date,
    gameId: "game",
    teamAbbr: "TOR",
    opponentAbbr: "MTL",
    opp: "MTL",
    score: "2-1",
    gameState: "OFF",
  };
  const absent = { ...boxscore, GP: "" };
  const live = buildUpdatedPlayerDayRow(
    day,
    absent,
    new Set(),
    "TOR",
    game,
    false,
  );
  assert.equal(live.MG, "");
  assert.equal(live.lineupAccountingFinalized, false);
  const final = buildUpdatedPlayerDayRow(
    day,
    absent,
    new Set(),
    "TOR",
    game,
    true,
  );
  assert.equal(final.MG, "1");
  assert.equal(final.lineupAccountingFinalized, true);
  assert.equal(
    buildUpdatedPlayerDayRow(
      day,
      absent,
      new Set(),
      "TOR",
      { ...game, gameScheduleState: "PPD" },
      true,
    ).MG,
    "",
  );
});

test("scheduled and live games cannot become missed games before completion", () => {
  for (const gameState of ["FUT", "LIVE"]) {
    const game = {
      date: day.date,
      gameId: "2026020001",
      teamAbbr: "TOR",
      opponentAbbr: "MTL",
      opp: "MTL",
      score: gameState === "LIVE" ? "1-0" : "",
      gameState,
    };
    const result = buildUpdatedPlayerDayRow(
      day,
      { ...boxscore, GP: "" },
      new Set(["G", "A", "P"]),
      "TOR",
      game,
    );
    assert.equal(result.MG, "", gameState);
  }
});

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

test("a corrected zero replaces previously credited power-play points", () => {
  const result = buildUpdatedPlayerDayRow(
    { ...day, PPP: "2" },
    { ...boxscore, PPP: "0" },
    new Set(["PPP"]),
    "TOR",
  );
  assert.equal(result.PPP, "0");
});
