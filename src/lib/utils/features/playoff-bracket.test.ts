import assert from "node:assert/strict";
import test from "node:test";

import type {
  GSHLTeam,
  Matchup,
  Season,
  TeamSeasonStatLine,
} from "@gshl-types";
import { MatchupType } from "../domain/constants";
import { buildPlayoffBracket } from "./playoff-bracket";

function season(legacyId: string): Season {
  return {
    id: `season-${legacyId}`,
    legacyId,
    year: 2014 + Number(legacyId),
    name: `Season ${legacyId}`,
    categories: [],
    rosterSpots: [],
    startDate: "2024-01-01",
    endDate: "2024-12-31",
    isActive: false,
    usesLegacyTies: false,
    signingEndDate: "2024-12-31",
    draftStartAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function team(id: string, conference: "SV" | "HH"): GSHLTeam {
  return {
    id,
    seasonId: "season-7",
    franchiseId: `${id}-franchise`,
    name: `Team ${id}`,
    abbr: id,
    logoUrl: `${id}.png`,
    isActive: true,
    yahooId: null,
    confId: conference,
    confName: conference === "SV" ? "Sunview" : "Hickory Hotel",
    confAbbr: conference,
    confLogoUrl: `${conference}.png`,
    ownerId: `${id}-owner`,
    ownerFirstName: null,
    ownerLastName: null,
    ownerNickname: null,
    ownerEmail: null,
    ownerOwing: null,
    ownerIsActive: true,
  };
}

function stat(
  teamId: string,
  overallRk: number,
  conferenceRk: number,
  wildcardRk: number | null = null,
): TeamSeasonStatLine {
  return {
    id: `${teamId}-stat`,
    seasonId: "season-7",
    seasonType: "RS",
    gshlTeamId: teamId,
    days: 0,
    GP: 10,
    MG: 0,
    IR: 0,
    IRplus: 0,
    GS: 0,
    G: 0,
    A: 0,
    P: 0,
    PM: 0,
    PIM: 0,
    PPP: 0,
    SOG: 0,
    HIT: 0,
    BLK: 0,
    W: 0,
    GA: 0,
    GAA: 0,
    SV: 0,
    SA: 0,
    SVP: 0,
    SO: 0,
    TOI: 0,
    Rating: 0,
    ADD: 0,
    MS: 0,
    BS: 0,
    streak: "",
    powerRk: 0,
    teamW: 5,
    teamHW: 0,
    teamHL: 0,
    teamL: 2,
    teamT: 0,
    teamCCW: 0,
    teamCCHW: 0,
    teamCCHL: 0,
    teamCCL: 0,
    teamCCT: 0,
    overallRk,
    conferenceRk,
    wildcardRk,
    playersUsed: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function matchup(
  homeTeamId: string,
  awayTeamId: string,
  isComplete = true,
): Matchup {
  return {
    id: `${homeTeamId}-${awayTeamId}-qf`,
    seasonId: "season-7",
    weekId: "playoff-week",
    homeTeamId,
    awayTeamId,
    gameType: MatchupType.QUARTER_FINAL,
    homeRank: 1,
    awayRank: 4,
    homeScore: isComplete ? 3 : null,
    awayScore: isComplete ? 1 : null,
    homeWin: isComplete,
    awayWin: false,
    tie: false,
    isComplete,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function seasonSevenTeamsAndStats() {
  const teams = Array.from({ length: 14 }, (_, index) =>
    team(`team-${index + 1}`, index < 7 ? "SV" : "HH"),
  );
  const stats = teams.map((currentTeam, index) =>
    stat(
      currentTeam.id,
      index + 1,
      (index % 7) + 1,
      index >= 6 ? index - 5 : null,
    ),
  );
  return { teams, stats };
}

void test("uses the league-wide 1–8 bracket through season six", () => {
  const { teams, stats } = seasonSevenTeamsAndStats();
  const bracket = buildPlayoffBracket(
    teams.slice(0, 8),
    stats.slice(0, 8),
    [],
    season("6"),
  );

  assert.equal(bracket.format, "league");
  assert.deepEqual(
    [
      bracket.columns[0]?.matchups[0]?.homeTeam?.id,
      bracket.columns[0]?.matchups[0]?.awayTeam?.id,
    ],
    ["team-1", "team-8"],
  );
  assert.equal(bracket.columns.length, 3);
});

void test("builds the season seven conference crossover bracket", () => {
  const { teams, stats } = seasonSevenTeamsAndStats();
  const bracket = buildPlayoffBracket(teams, stats, [], season("7"));

  assert.equal(bracket.format, "conference");
  assert.equal(bracket.columns.length, 5);
  assert.equal(bracket.columns[0]?.title, "Sunview");
  assert.equal(bracket.columns[4]?.title, "Hickory Hotel");
  assert.equal(bracket.columns[0]?.matchups[0]?.awayTeam?.id, "team-4");
  assert.equal(bracket.columns[4]?.matchups[0]?.awayTeam?.id, "team-5");
});

void test("uses a played matchup and advances its winner into the bracket", () => {
  const { teams, stats } = seasonSevenTeamsAndStats();
  const bracket = buildPlayoffBracket(
    teams,
    stats,
    [matchup("team-1", "team-7")],
    season("7"),
  );

  assert.equal(bracket.hasPlayedMatchups, true);
  assert.equal(bracket.columns[0]?.matchups[0]?.source, "played");
  assert.equal(bracket.columns[1]?.matchups[0]?.homeTeam?.id, "team-1");
});
