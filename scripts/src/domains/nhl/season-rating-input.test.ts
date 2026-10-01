import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNhlRatingInput,
  indexNhlRows,
  type NhlRatingSource,
} from "./season-rating-input";
import { parseNhlReportPage } from "../../integrations/nhl/season-rating-source";

function fixture(): NhlRatingSource {
  const identity = { playerId: 1, seasonId: 20242025 };
  return {
    season: 20242025,
    gameType: 2,
    profile: "core",
    fetchedAt: "2026-01-01T00:00:00Z",
    warnings: [],
    edge: {},
    skaters: {
      summary: [
        {
          ...identity,
          skaterFullName: "Traded Player",
          teamAbbrevs: "TOR,OTT",
          positionCode: "C",
          gamesPlayed: 50,
        },
      ],
      timeonice: [{ ...identity, timeOnIce: 60000, evTimeOnIce: 48000 }],
      scoringRates: [
        {
          ...identity,
          timeOnIcePerGame5v5: 900,
          goals5v5: 10,
          primaryAssists5v5: 12,
          secondaryAssists5v5: 4,
          satRelative5v5: 0.03,
          netMinorPenaltiesPer60: 0.2,
        },
      ],
      goalsForAgainst: [{ ...identity, evenStrengthGoalsAgainst: 20 }],
      powerplay: [
        {
          ...identity,
          ppTimeOnIce: 6000,
          ppGoals: 4,
          ppPrimaryAssists: 3,
          ppSecondaryAssists: 2,
        },
      ],
      penaltykill: [{ ...identity, shTimeOnIce: 6000, ppGoalsAgainstPer60: 5 }],
    },
    goalies: [],
  };
}

test("NHL seconds become minutes; traded totals stay one player and joins use identities", () => {
  const source = fixture();
  const input = buildNhlRatingInput(source);
  const p = input.players[0]!;
  assert.equal(input.players.length, 1);
  assert.equal(p.minutes, 1000);
  assert.equal(p.fiveMinutes, 750);
  assert.equal(p.evMinutes, 800);
  assert.equal(p.ppMinutes, 100);
  assert.equal(p.pkMinutes, 100);
  assert.equal(p.relativeShotShare, 0.03);
  assert.equal(p.team, "TOR,OTT");
  assert.equal(p.fivePrimaryAssists, 12);
});

test("missing NHL fields remain unknown; malformed/duplicate/wrong-season pages fail", () => {
  const source = fixture();
  source.skaters.scoringRates[0]!.satRelative5v5 = null;
  assert.equal(
    buildNhlRatingInput(source).players[0]!.relativeShotShare,
    undefined,
  );
  assert.throws(() =>
    indexNhlRows(
      [...source.skaters.summary, ...source.skaters.summary],
      source.season,
    ),
  );
  assert.throws(() => indexNhlRows(source.skaters.summary, 20232024));
  assert.throws(() => parseNhlReportPage({ data: [], total: "100" }));
  assert.throws(() => parseNhlReportPage({ data: [null], total: 1 }));
  assert.deepEqual(parseNhlReportPage({ data: [], total: 0 }), {
    data: [],
    total: 0,
  });
});

test("EDGE goalie buckets partition shots including outside the three danger zones", () => {
  const source = fixture();
  source.goalies = [
    {
      playerId: 2,
      seasonId: source.season,
      goalieFullName: "Goalie",
      teamAbbrevs: "TOR",
      gamesPlayed: 10,
      timeOnIce: 36000,
      shotsAgainst: 300,
      saves: 270,
    },
  ];
  source.edge["2"] = {
    shotLocationSummary: [
      { locationCode: "all", saves: 270, goalsAgainst: 30 },
      { locationCode: "high", saves: 60, goalsAgainst: 20 },
      { locationCode: "mid", saves: 90, goalsAgainst: 7 },
      { locationCode: "long", saves: 100, goalsAgainst: 2 },
    ],
  };
  const p = buildNhlRatingInput(source).players[1]!;
  assert.deepEqual(p.saveBuckets?.[3], { shots: 21, saves: 20 });
  assert.equal(
    p.saveBuckets?.reduce((sum, b) => sum + b.shots, 0),
    300,
  );
});
