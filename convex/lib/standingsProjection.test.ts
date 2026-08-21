import assert from "node:assert/strict";
import test from "node:test";

import {
  projectStandingsPowerHistory,
  projectStandingsTeamDetail,
  selectStandingsDetailMatchups,
  selectStandingsPlayerTotalLookupSplits,
  selectStandingsTopPlayerTotals,
} from "./standingsProjection";

test("standings power history strips wide rows and unranked statistics", () => {
  const result = projectStandingsPowerHistory({
    weeks: [
      {
        _id: "week-1",
        weekNum: "1",
        weekType: "RS",
        startDate: Date.UTC(2026, 0, 1),
        endDate: "not-sent",
      },
    ],
    weeklyStats: [
      {
        gshlTeamId: "team-1",
        weekId: "week-1",
        powerRating: "87.5",
        powerRk: "2",
        G: 20,
      },
      {
        gshlTeamId: "team-2",
        weekId: "week-1",
        powerRating: 80,
        powerRk: null,
      },
    ],
  });

  assert.deepEqual(result, {
    weeks: [
      {
        id: "week-1",
        weekNum: 1,
        weekType: "RS",
        startDate: "2026-01-01",
      },
    ],
    weeklyStats: [
      {
        gshlTeamId: "team-1",
        weekId: "week-1",
        powerRating: 87.5,
        powerRk: 2,
      },
    ],
  });
});

test("standings detail selects only the rendered matchup window", () => {
  const weeks = Array.from({ length: 6 }, (_, index) => ({
    _id: `week-${index + 1}`,
    weekNum: index + 1,
  }));
  const matchups = [
    ["game-1", "week-1", true],
    ["game-2", "week-2", true],
    ["game-3", "week-3", true],
    ["game-4", "week-4", false],
    ["game-5", "week-5", false],
    ["game-6", "week-6", false],
  ].map(([id, weekId, isComplete]) => ({
    _id: String(id),
    weekId: String(weekId),
    homeTeamId: "team-1",
    awayTeamId: "opponent-1",
    isComplete: Boolean(isComplete),
  }));

  assert.deepEqual(
    selectStandingsDetailMatchups("team-1", matchups, weeks).map(
      (matchup) => matchup._id,
    ),
    ["game-3", "game-2", "game-4", "game-5"],
  );
});

test("standings detail scopes and orders only the top three player totals", () => {
  const totals = [
    { playerId: "player-1", gshlTeamIds: ["team-1"], Rating: 90, P: 30 },
    { playerId: "player-2", gshlTeamIds: ["team-1"], Rating: 91, P: 20 },
    { playerId: "player-3", gshlTeamIds: ["team-1"], Rating: 90, P: 40 },
    { playerId: "player-4", gshlTeamIds: ["team-1"], Rating: 80, P: 80 },
    { playerId: "other", gshlTeamIds: ["team-2"], Rating: 100, P: 100 },
  ].map((total) => ({ ...total, nhlPos: ["C"], posGroup: "F" }));

  assert.deepEqual(
    selectStandingsTopPlayerTotals("team-1", "franchise-1", totals).map(
      (total) => total.playerId,
    ),
    ["player-2", "player-3", "player-1"],
  );
});

test("standings detail deduplicates team-bounded total-stat lookups", () => {
  const splits = [
    {
      id: "split-1",
      seasonId: "season-1",
      playerId: "player-1",
      seasonType: "RS",
    },
    {
      id: "duplicate",
      seasonId: "season-1",
      playerId: "player-1",
      seasonType: "RS",
    },
    {
      id: "playoffs",
      seasonId: "season-1",
      playerId: "player-1",
      seasonType: "PO",
    },
    {
      id: "second-player",
      seasonId: "season-1",
      playerId: "player-2",
      seasonType: "RS",
    },
    {
      id: "other-season",
      seasonId: "season-2",
      playerId: "player-3",
      seasonType: "RS",
    },
  ];

  assert.deepEqual(
    selectStandingsPlayerTotalLookupSplits("season-1", splits).map(
      ({ id, playerId, seasonType }) => [id, playerId, seasonType],
    ),
    [
      ["split-1", "player-1", "RS"],
      ["playoffs", "player-1", "PO"],
      ["second-player", "player-2", "RS"],
    ],
  );
});

test("standings detail projects the complete expanded-card DTO", () => {
  const result = projectStandingsTeamDetail({
    teamId: "team-1",
    owner: {
      firstName: "First",
      lastName: "Owner",
      nickName: "Gem",
    },
    conference: { name: "Sunview", abbr: "SV" },
    teamStats: [
      {
        gshlTeamId: "team-1",
        powerRk: 4,
        G: 10,
        A: 20,
        P: 30,
        PPP: 5,
        SOG: 100,
        HIT: 60,
        BLK: 40,
        W: 7,
        GAA: 2.5,
        SVP: 0.91,
      },
      {
        gshlTeamId: "team-2",
        G: 20,
        A: 10,
        P: 40,
        PPP: 4,
        SOG: 90,
        HIT: 70,
        BLK: 30,
        W: 6,
        GAA: 2,
        SVP: 0.92,
      },
      {
        gshlTeamId: "team-3",
        G: 5,
        A: 30,
        P: 20,
        PPP: 6,
        SOG: 110,
        HIT: 50,
        BLK: 50,
        W: 8,
        GAA: 3,
        SVP: 0.9,
      },
    ],
    matchups: [
      {
        _id: "previous",
        weekId: "week-1",
        homeTeamId: "team-1",
        awayTeamId: "team-2",
        homeScore: 6,
        awayScore: 4,
        isComplete: true,
      },
      {
        _id: "upcoming",
        weekId: "week-2",
        homeTeamId: "team-3",
        awayTeamId: "team-1",
        isComplete: false,
      },
    ],
    weeks: [
      { _id: "week-1", weekNum: 1 },
      { _id: "week-2", weekNum: 2 },
    ],
    opponents: [
      { id: "team-2", name: "Bears", logoUrl: "bears.png" },
      { id: "team-3", name: "Comets", logoUrl: null },
    ],
    playerTotals: [
      {
        playerId: "goalie",
        gshlTeamIds: ["team-1"],
        nhlPos: ["G"],
        posGroup: "G",
        Rating: 91,
        W: 5,
      },
      {
        playerId: "skater",
        gshlTeamIds: ["team-1"],
        nhlPos: ["C", "LW"],
        posGroup: "F",
        Rating: 90,
        P: 50,
      },
    ],
    players: [
      { _id: "goalie", fullName: "Goalie One" },
      { _id: "skater", fullName: "Skater One" },
    ],
  });

  assert.equal(result.ownerName, "Gem");
  assert.equal(result.conferenceLabel, "Sunview");
  assert.equal(result.powerRank, 4);
  assert.deepEqual(
    result.categoryRanks.map((category) => [category.label, category.rank]),
    [
      ["G", 2],
      ["A", 2],
      ["P", 2],
      ["PPP", 2],
      ["SOG", 2],
      ["HIT", 2],
    ],
  );
  assert.deepEqual(result.previousGames, [
    {
      id: "previous",
      isComplete: true,
      opponentLogoUrl: "bears.png",
      opponentName: "Bears",
      resultLabel: "W 6-4",
      resultTone: "win",
      weekLabel: "W1",
    },
  ]);
  assert.deepEqual(result.upcomingGames, [
    {
      id: "upcoming",
      isComplete: false,
      opponentLogoUrl: null,
      opponentName: "Comets",
      resultLabel: "@",
      resultTone: "upcoming",
      weekLabel: "W2",
    },
  ]);
  assert.deepEqual(
    result.topPlayers.map((player) => [
      player.name,
      player.position,
      player.statLabel,
      player.ratingLabel,
    ]),
    [
      ["Goalie One", "G", "5 W", "91.0 RTG"],
      ["Skater One", "C/LW", "50 PTS", "90.0 RTG"],
    ],
  );
});
