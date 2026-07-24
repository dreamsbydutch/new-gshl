import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateConferenceRatings,
  buildConferenceContestSeasonViewModel,
  CONFERENCE_RECENCY_RETENTION,
} from "./conference-contest";
import {
  type AwardsList as AwardsListType,
  type ConferenceContestSeasonViewModel,
  type GSHLTeam,
  type Matchup,
  type MatchupType as MatchupTypeValue,
  type Season,
  type TeamAward,
} from "@gshl-types";
import { AwardsList, MatchupType } from "../domain/constants";

const now = new Date("2026-01-01T00:00:00.000Z");

const season = (id: string, year: number, isActive = false): Season => ({
  id,
  year,
  name: `${year} Season`,
  categories: [],
  rosterSpots: [],
  startDate: `${year}-01-01`,
  endDate: `${year}-12-31`,
  signingEndDate: `${year}-12-31`,
  isActive,
  usesLegacyTies: true,
  createdAt: now,
  updatedAt: now,
});

const team = (
  id: string,
  seasonId: string,
  confId: string,
  confName: string,
): GSHLTeam => ({
  id,
  seasonId,
  franchiseId: id,
  name: id,
  abbr: id,
  logoUrl: null,
  isActive: true,
  yahooId: null,
  confId,
  confName,
  confAbbr: confId,
  confLogoUrl: null,
  ownerId: id,
  ownerFirstName: id,
  ownerLastName: null,
  ownerNickname: id,
  ownerEmail: null,
  ownerOwing: null,
  ownerIsActive: true,
});

const matchup = (
  id: string,
  seasonId: string,
  homeTeamId: string,
  awayTeamId: string,
  gameType: MatchupTypeValue,
  homeScore: number,
  awayScore: number,
): Matchup => ({
  id,
  seasonId,
  weekId: `${id}-week`,
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
  awardKey: AwardsListType,
): TeamAward => ({
  id,
  seasonId,
  ownerId,
  nomineeIds: [],
  award: awardKey,
  createdAt: now,
  updatedAt: now,
});

void test("builds a complementary neutral rating when evidence is missing", () => {
  const teams = [
    team("left", "s1", "A", "Alpha"),
    team("right", "s1", "B", "Beta"),
  ];
  const result = buildConferenceContestSeasonViewModel({
    season: season("s1", 2026, true),
    matchups: [],
    gshlTeams: teams,
    teamAwards: [],
  });
  assert.ok(result);
  assert.equal(result.ratingByConferenceId.A, 50);
  assert.equal(result.ratingByConferenceId.B, 50);
});

void test("counts ties as half a win and weights leadership awards triple", () => {
  const teams = [
    team("left", "s1", "A", "Alpha"),
    team("right", "s1", "B", "Beta"),
  ];
  const result = buildConferenceContestSeasonViewModel({
    season: season("s1", 2025),
    gshlTeams: teams,
    matchups: [
      matchup("tie", "s1", "left", "right", MatchupType.NON_CONFERENCE, 5, 5),
    ],
    teamAwards: [
      {
        ...award("coach", "s1", "right", AwardsList.JACK_ADAMS),
        teamId: "left",
      },
      award("gm", "s1", "right", AwardsList.GM_OF_THE_YEAR),
      award("conference", "s1", "left", AwardsList.HICKORY),
    ],
  });
  assert.ok(result);
  assert.equal(result.headToHeadRecordByConferenceId.A?.ties, 1);
  assert.equal(result.headToHeadRecordByConferenceId.B?.ties, 1);
  assert.equal(result.componentsByConferenceId.A?.headToHead, 50);
  assert.equal(result.awardPointsByConferenceId.A, 0);
  assert.equal(result.awardPointsByConferenceId.B, 6);
});

void test("uses a recorded Cup winner without double-counting the completed final", () => {
  const teams = [
    team("left", "s1", "A", "Alpha"),
    team("right", "s1", "B", "Beta"),
  ];
  const result = buildConferenceContestSeasonViewModel({
    season: season("s1", 2025),
    gshlTeams: teams,
    matchups: [
      matchup("final", "s1", "left", "right", MatchupType.FINAL, 8, 4),
    ],
    teamAwards: [award("cup", "s1", "right", AwardsList.GSHL_CUP)],
  });
  assert.ok(result);
  assert.equal(result.championTeamsByConferenceId.A?.length, 0);
  assert.equal(result.championTeamsByConferenceId.B?.length, 1);
  assert.equal(result.awardPointsByConferenceId.B, 0);
  assert.equal(result.componentsByConferenceId.B?.cups, 100);
});

void test("applies exact 85% current-form retention and equal all-time weighting", () => {
  const makeRatingSeason = (year: number, leftRating: number) =>
    ({
      seasonYear: year,
      leftConference: { id: "A", name: "Alpha", abbr: "A", logoUrl: null },
      rightConference: { id: "B", name: "Beta", abbr: "B", logoUrl: null },
      ratingByConferenceId: { A: leftRating, B: 100 - leftRating },
      componentsByConferenceId: {
        A: {
          headToHead: leftRating,
          playoffs: leftRating,
          cups: leftRating,
          awards: leftRating,
        },
        B: {
          headToHead: 100 - leftRating,
          playoffs: 100 - leftRating,
          cups: 100 - leftRating,
          awards: 100 - leftRating,
        },
      },
    }) as unknown as ConferenceContestSeasonViewModel;
  const result = aggregateConferenceRatings([
    makeRatingSeason(2026, 80),
    makeRatingSeason(2025, 20),
  ]);
  assert.ok(result);
  const expectedCurrent =
    (80 + 20 * CONFERENCE_RECENCY_RETENTION) /
    (1 + CONFERENCE_RECENCY_RETENTION);
  assert.equal(result.currentRating.ratingByConferenceId.A, expectedCurrent);
  assert.equal(result.allTimeRating.ratingByConferenceId.A, 50);
  assert.equal(
    (result.currentRating.ratingByConferenceId.A ?? 0) +
      (result.currentRating.ratingByConferenceId.B ?? 0),
    100,
  );
});
