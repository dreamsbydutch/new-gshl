import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOwnerRankings,
  OWNER_LADDER_BASE_RATING,
  OWNER_LADDER_REFERENCE_CEILING,
  OWNER_LADDER_REFERENCE_FLOOR,
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

void test("seeds every newcomer at the entry baseline alongside active and inactive owners", () => {
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
  assert.equal(rookie.seedRating, OWNER_LADDER_BASE_RATING);
  assert.equal(rookie.rating, OWNER_LADDER_BASE_RATING);
  assert.ok(result.rankings.some((entry) => !entry.isActive));
  assert.ok(result.rankings.some((entry) => entry.rating > rookie.rating));
  assert.ok(result.rankings.some((entry) => entry.rating < rookie.rating));
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
  assert.ok(winner.rating > OWNER_LADDER_BASE_RATING);
  assert.equal(result.recentBattles[0]?.gameType, MatchupType.FINAL);
});

void test("awards an equal-score playoff game to the home owner", () => {
  const result = buildOwnerRankings({
    owners: [owner("home", true), owner("away", true)],
    seasons: [season("s1", 2025)],
    teams: [team("home-team", "s1", "home"), team("away-team", "s1", "away")],
    weeks: [week("playoff-week", "s1", 1)],
    matchups: [
      matchup(
        "semi",
        "s1",
        "playoff-week",
        "home-team",
        "away-team",
        MatchupType.SEMI_FINAL,
        5,
        5,
      ),
    ],
    teamAwards: [],
  });
  const home = result.rankings.find((entry) => entry.owner.id === "home");
  const away = result.rankings.find((entry) => entry.owner.id === "away");

  assert.equal(home?.playoffRecord.wins, 1);
  assert.equal(home?.playoffRecord.ties, 0);
  assert.equal(away?.playoffRecord.losses, 1);
  assert.equal(away?.playoffRecord.ties, 0);
  assert.equal(result.recentBattles[0]?.winnerOwnerId, "home");
});

void test("penalizes the last-place Brophy Trophy", () => {
  const result = buildOwnerRankings({
    owners: [owner("last-place", true)],
    seasons: [season("s1", 2025)],
    teams: [team("last-place-team", "s1", "last-place")],
    weeks: [],
    matchups: [],
    teamAwards: [award("brophy", "s1", "last-place", AwardsList.BROPHY)],
  });
  const lastPlace = result.rankings.find(
    (entry) => entry.owner.id === "last-place",
  );

  assert.ok(lastPlace);
  assert.equal(lastPlace.totalAwards, 1);
  assert.equal(lastPlace.otherAwards, 0);
  assert.equal(lastPlace.brophyAwards, 1);
  assert.equal(lastPlace.achievementBonus, -10);
  assert.equal(lastPlace.rating, OWNER_LADDER_BASE_RATING - 10);
});

void test("ranks the stronger career resume above a weaker late Elo run", () => {
  const owners = [
    owner("stronger-resume", true),
    owner("weaker-resume", true),
    owner("benchmark", true),
  ];
  const teams = owners.map((item) => team(`${item.id}-team`, "s1", item.id));
  const weeks = Array.from({ length: 40 }, (_, index) =>
    week(`w${index + 1}`, "s1", index + 1),
  );
  const matchups: Matchup[] = [];
  let game = 0;
  const addGames = (ownerId: string, count: number, ownerWins: boolean) => {
    for (let index = 0; index < count; index += 1) {
      game += 1;
      matchups.push(
        matchup(
          `m${game}`,
          "s1",
          `w${game}`,
          `${ownerId}-team`,
          "benchmark-team",
          MatchupType.CONFERENCE,
          ownerWins ? 6 : 2,
          ownerWins ? 2 : 6,
        ),
      );
    }
  };

  // The weaker owner finishes hot, while the stronger owner has the clearly
  // better full-season record. Recency should not reverse their career order.
  addGames("stronger-resume", 8, true);
  addGames("weaker-resume", 14, false);
  addGames("stronger-resume", 12, false);
  addGames("weaker-resume", 6, true);

  const result = buildOwnerRankings({
    owners,
    seasons: [season("s1", 2025)],
    teams,
    weeks,
    matchups,
    teamAwards: [],
  });
  const stronger = result.rankings.find(
    (entry) => entry.owner.id === "stronger-resume",
  );
  const weaker = result.rankings.find(
    (entry) => entry.owner.id === "weaker-resume",
  );

  assert.ok(stronger);
  assert.ok(weaker);
  assert.equal(stronger.overallRecord.winPercentage, 0.4);
  assert.equal(weaker.overallRecord.winPercentage, 0.3);
  assert.ok(stronger.rating > weaker.rating);
  assert.ok(stronger.rank < weaker.rank);
});

void test("treats zero and 1000 as reference points rather than hard limits", () => {
  const owners = [owner("dominant", true), owner("struggling", true)];
  const seasons = Array.from({ length: 12 }, (_, index) =>
    season(`s${index + 1}`, 2014 + index),
  );
  const teams = seasons.flatMap((item) => [
    team(`dominant-${item.id}`, item.id, "dominant"),
    team(`struggling-${item.id}`, item.id, "struggling"),
  ]);
  const weeks = seasons.flatMap((item) =>
    Array.from({ length: 30 }, (_, index) =>
      week(`${item.id}-w${index + 1}`, item.id, index + 1),
    ),
  );
  const matchups = seasons.flatMap((item) =>
    Array.from({ length: 30 }, (_, index) =>
      matchup(
        `${item.id}-m${index + 1}`,
        item.id,
        `${item.id}-w${index + 1}`,
        `dominant-${item.id}`,
        `struggling-${item.id}`,
        MatchupType.CONFERENCE,
        10,
        0,
      ),
    ),
  );
  const teamAwards = seasons.flatMap((item) => [
    award(`${item.id}-cup`, item.id, "dominant", AwardsList.GSHL_CUP),
    award(`${item.id}-gm`, item.id, "dominant", AwardsList.GM_OF_THE_YEAR),
    award(`${item.id}-brophy`, item.id, "struggling", AwardsList.BROPHY),
  ]);

  const result = buildOwnerRankings({
    owners,
    seasons,
    teams,
    weeks,
    matchups,
    teamAwards,
  });
  const dominant = result.rankings.find(
    (entry) => entry.owner.id === "dominant",
  );
  const struggling = result.rankings.find(
    (entry) => entry.owner.id === "struggling",
  );

  assert.ok(dominant);
  assert.ok(struggling);
  assert.ok(dominant.rating > OWNER_LADDER_REFERENCE_CEILING);
  assert.ok(struggling.rating < OWNER_LADDER_REFERENCE_FLOOR);
});
