import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOwnerRankings,
  OWNER_LADDER_MAX_RATING,
  OWNER_LADDER_MIN_RATING,
} from "./owner-rankings";
import {
  AwardsList,
  MatchupType,
  SeasonType,
  type GSHLTeam,
  type Matchup,
  type Owner,
  type Season,
  type TeamAward,
  type Week,
} from "@gshl-types";

const now = new Date("2026-01-01T00:00:00.000Z");

const owner = (id: string, isActive: boolean): Owner => ({
  id,
  firstName: id,
  lastName: "Owner",
  nickName: id,
  owing: 0,
  isActive,
  createdAt: now,
  updatedAt: now,
});

const season = (id: string, year: number): Season => ({
  id,
  year,
  name: `${year} Season`,
  categories: [],
  rosterSpots: [],
  startDate: `${year}-01-01`,
  endDate: `${year}-12-31`,
  signingEndDate: `${year}-12-31`,
  isActive: year === 2025,
  usesLegacyTies: false,
  createdAt: now,
  updatedAt: now,
});

const team = (id: string, seasonId: string, ownerId: string): GSHLTeam => ({
  id,
  seasonId,
  franchiseId: ownerId,
  name: `${ownerId} Team`,
  abbr: ownerId,
  logoUrl: null,
  isActive: true,
  yahooId: null,
  confId: "conf",
  confName: "Conference",
  confAbbr: "C",
  confLogoUrl: null,
  ownerId,
  ownerFirstName: ownerId,
  ownerLastName: "Owner",
  ownerNickname: ownerId,
  ownerEmail: null,
  ownerOwing: 0,
  ownerIsActive: true,
});

const week = (id: string, seasonId: string, weekNum: number): Week => ({
  id,
  seasonId,
  weekNum,
  weekType: SeasonType.REGULAR_SEASON,
  gameDays: 7,
  startDate: "2025-01-01",
  endDate: "2025-01-07",
  isActive: false,
  isPlayoffs: false,
  createdAt: now,
  updatedAt: now,
});

const matchup = (
  id: string,
  seasonId: string,
  weekId: string,
  homeTeamId: string,
  awayTeamId: string,
  gameType: MatchupType,
  homeScore: number,
  awayScore: number,
): Matchup => ({
  id,
  seasonId,
  weekId,
  homeTeamId,
  awayTeamId,
  gameType,
  homeScore,
  awayScore,
  homeWin: homeScore > awayScore,
  awayWin: awayScore > homeScore,
  tie: homeScore === awayScore,
  isComplete: true,
  createdAt: now,
  updatedAt: now,
});

const award = (
  id: string,
  seasonId: string,
  ownerId: string,
  awardKey: AwardsList,
): TeamAward => ({
  id,
  seasonId,
  ownerId,
  award: awardKey,
  nomineeIds: [],
  createdAt: now,
  updatedAt: now,
});

void test("seeds every newcomer at zero alongside active and inactive owners", () => {
  const owners = [
    owner("legacy", false),
    owner("active", true),
    owner("rookie", true),
  ];
  const seasons = [season("s1", 2024), season("s2", 2025)];
  const teams = [
    team("legacy-s1", "s1", "legacy"),
    team("active-s1", "s1", "active"),
    team("active-s2", "s2", "active"),
    team("rookie-s2", "s2", "rookie"),
  ];
  const result = buildOwnerRankings({
    owners,
    seasons,
    teams,
    weeks: [week("w1", "s1", 1)],
    matchups: [
      matchup(
        "m1",
        "s1",
        "w1",
        "legacy-s1",
        "active-s1",
        MatchupType.CONFERENCE,
        6,
        4,
      ),
    ],
    teamAwards: [],
  });
  const rookie = result.rankings.find((entry) => entry.owner.id === "rookie");
  assert.ok(rookie);
  assert.equal(rookie.seedRating, OWNER_LADDER_MIN_RATING);
  assert.equal(rookie.rating, OWNER_LADDER_MIN_RATING);
  assert.ok(result.rankings.some((entry) => !entry.isActive));
  assert.ok(
    result.rankings.every((entry) => entry.rating >= OWNER_LADDER_MIN_RATING),
  );
  assert.ok(
    result.rankings.every((entry) => entry.rating <= OWNER_LADDER_MAX_RATING),
  );
});

void test("weights playoff stages, Cups, and leadership awards", () => {
  const owners = [owner("winner", true), owner("runner", true)];
  const teams = [
    team("winner-team", "s1", "winner"),
    team("runner-team", "s1", "runner"),
  ];
  const result = buildOwnerRankings({
    owners,
    seasons: [season("s1", 2025)],
    teams,
    weeks: [week("final-week", "s1", 1)],
    matchups: [
      matchup(
        "final",
        "s1",
        "final-week",
        "winner-team",
        "runner-team",
        MatchupType.FINAL,
        8,
        5,
      ),
    ],
    teamAwards: [
      award("cup", "s1", "winner", AwardsList.GSHL_CUP),
      award("coach", "s1", "winner", AwardsList.JACK_ADAMS),
      award("gm", "s1", "winner", AwardsList.GM_OF_THE_YEAR),
    ],
  });
  const winner = result.rankings.find((entry) => entry.owner.id === "winner");
  assert.ok(winner);
  assert.equal(winner.cups, 1);
  assert.equal(winner.finalsAppearances, 1);
  assert.equal(winner.playoffAppearances, 1);
  assert.equal(winner.coachAwards, 1);
  assert.equal(winner.gmAwards, 1);
  assert.equal(winner.totalAwards, 3);
  assert.ok(winner.achievementBonus >= 106);
  assert.ok(winner.rating <= OWNER_LADDER_MAX_RATING);
  assert.ok(
    result.rankings.every((entry) => entry.elo >= OWNER_LADDER_MIN_RATING),
  );
  assert.ok(
    result.rankings.every((entry) => entry.elo <= OWNER_LADDER_MAX_RATING),
  );
  assert.equal(result.recentBattles[0]?.gameType, MatchupType.FINAL);
});
