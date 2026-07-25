import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";
import {
  runPowerRankingsFixture,
  type PowerRankingFixtureData,
} from "./apps-script-power-engine";

const seasonId = "season-1";

function week(
  id: string,
  weekNum: number,
  startDate: string,
  endDate: string,
  isActive = false,
): DatabaseRecord {
  return {
    id,
    seasonId,
    weekNum,
    weekType: "RS",
    startDate,
    endDate,
    isActive,
  };
}

function teamWeek(
  weekId: string,
  teamId: string,
  value: number,
): DatabaseRecord {
  return {
    seasonId,
    weekId,
    gshlTeamId: teamId,
    GP: 10,
    G: value,
    A: value,
    P: value,
    PM: value,
    PPP: value,
    SOG: value,
    HIT: value,
    BLK: value,
    W: value,
    GAA: value ? 2 : 5,
    SVP: value ? 0.92 : 0.88,
  };
}

function matchup(
  id: string,
  weekId: string,
  homeScore: number,
  awayScore: number,
): DatabaseRecord {
  return {
    id,
    seasonId,
    weekId,
    homeTeamId: "team-a",
    awayTeamId: "team-b",
    gameType: "CC",
    homeScore,
    awayScore,
    homeWin: homeScore > awayScore,
    awayWin: awayScore > homeScore,
    tie: homeScore === awayScore,
    isComplete: weekId !== "week-3",
  };
}

function fixture(
  activeValue: number,
  activeHomeScore: number,
): PowerRankingFixtureData {
  return {
    seasons: [
      {
        id: seasonId,
        year: 2026,
        startDate: "2026-07-01",
        endDate: "2026-08-31",
        isActive: true,
      },
    ],
    weeks: [
      week("week-1", 1, "2026-07-01", "2026-07-07"),
      week("week-2", 2, "2026-07-08", "2026-07-14"),
      week("week-3", 3, "2026-07-21", "2026-07-27", true),
      week("week-4", 4, "2026-08-01", "2026-08-07"),
    ],
    franchises: [
      { id: "franchise-a", ownerId: "owner-a" },
      { id: "franchise-b", ownerId: "owner-b" },
    ],
    teams: [
      {
        id: "team-a",
        seasonId,
        franchiseId: "franchise-a",
      },
      {
        id: "team-b",
        seasonId,
        franchiseId: "franchise-b",
      },
    ],
    teamWeeks: [
      teamWeek("week-1", "team-a", 10),
      teamWeek("week-1", "team-b", 1),
      teamWeek("week-2", "team-a", 8),
      teamWeek("week-2", "team-b", 2),
      teamWeek("week-3", "team-a", activeValue),
      teamWeek("week-3", "team-b", 1),
    ],
    matchups: [
      matchup("matchup-1", "week-1", 8, 3),
      matchup("matchup-2", "week-2", 7, 4),
      matchup("matchup-3", "week-3", activeHomeScore, 2),
    ],
  };
}

function rowByTeamWeek(
  rows: DatabaseRecord[],
  weekId: string,
  teamId: string,
): DatabaseRecord {
  const row = rows.find(
    (candidate) =>
      candidate.weekId === weekId && candidate.gshlTeamId === teamId,
  );
  assert.ok(row);
  return row;
}

void test("publishes only completed and active start-of-week snapshots", async () => {
  const result = await runPowerRankingsFixture(seasonId, fixture(4, 4), {
    todayDate: "2026-07-25",
  });
  const rows = result.weekUpdates ?? [];

  assert.equal(rows.length, 6);
  assert.equal(
    rows.some((row) => row.weekId === "week-4"),
    false,
  );

  const weekOneA = rowByTeamWeek(rows, "week-1", "team-a");
  const weekOneB = rowByTeamWeek(rows, "week-1", "team-b");
  assert.equal(weekOneA.powerRating, 50);
  assert.equal(weekOneB.powerRating, 50);
  assert.equal(weekOneA.powerStatScore, 0);
  assert.equal(weekOneA.powerStatEwma, 0);

  const weekTwoA = rowByTeamWeek(rows, "week-2", "team-a");
  const weekTwoB = rowByTeamWeek(rows, "week-2", "team-b");
  assert.ok(Number(weekTwoA.powerRating) > Number(weekTwoB.powerRating));
  assert.ok(Number(weekTwoA.powerStatScore) > Number(weekTwoB.powerStatScore));
  assert.ok(Number(weekTwoA.powerStatEwma) > Number(weekTwoB.powerStatEwma));
  assert.ok(Number(weekTwoA.gmLadderRating) > Number(weekTwoB.gmLadderRating));
  assert.ok(Number(weekTwoA.powerElo) > Number(weekTwoB.powerElo));
});

void test("active-week play cannot change that week's rating", async () => {
  const quiet = await runPowerRankingsFixture(seasonId, fixture(3, 3), {
    todayDate: "2026-07-25",
  });
  const dominant = await runPowerRankingsFixture(seasonId, fixture(100, 20), {
    todayDate: "2026-07-25",
  });
  const quietRows = quiet.weekUpdates ?? [];
  const dominantRows = dominant.weekUpdates ?? [];

  for (const teamId of ["team-a", "team-b"]) {
    const quietWeek = rowByTeamWeek(quietRows, "week-3", teamId);
    const dominantWeek = rowByTeamWeek(dominantRows, "week-3", teamId);
    assert.equal(dominantWeek.powerRating, quietWeek.powerRating);
    assert.equal(dominantWeek.powerRk, quietWeek.powerRk);
    assert.equal(dominantWeek.powerComposite, quietWeek.powerComposite);
  }
});

void test("matchup ranks use the entering-week power order", async () => {
  const result = await runPowerRankingsFixture(seasonId, fixture(4, 4), {
    todayDate: "2026-07-25",
  });
  const rows = result.weekUpdates ?? [];
  const matchups = result.matchupUpdates ?? [];
  const weekTwoMatchup = matchups.find((row) => row.id === "matchup-2");
  assert.ok(weekTwoMatchup);
  assert.equal(
    weekTwoMatchup.homeRank,
    rowByTeamWeek(rows, "week-2", "team-a").powerRk,
  );
  assert.equal(
    weekTwoMatchup.awayRank,
    rowByTeamWeek(rows, "week-2", "team-b").powerRk,
  );
});

void test("current-season awards cannot leak into weekly GM snapshots", async () => {
  const data = fixture(4, 4);
  data.teamAwards = [
    {
      id: "future-award",
      seasonId,
      ownerId: "owner-a",
      award: "gshlCup",
    },
  ];
  const result = await runPowerRankingsFixture(seasonId, data, {
    todayDate: "2026-07-25",
  });
  const rows = result.weekUpdates ?? [];

  assert.equal(
    rowByTeamWeek(rows, "week-1", "team-a").gmLadderRating,
    rowByTeamWeek(rows, "week-1", "team-b").gmLadderRating,
  );
});

void test("completed prior-season awards seed the next season", async () => {
  const data = fixture(4, 4);
  data.seasons.unshift({
    id: "season-0",
    year: 2025,
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    isActive: false,
  });
  data.teamAwards = [
    {
      id: "prior-award",
      seasonId: "season-0",
      ownerId: "owner-a",
      award: "gshlCup",
    },
  ];
  const result = await runPowerRankingsFixture(seasonId, data, {
    todayDate: "2026-07-25",
  });
  const rows = result.weekUpdates ?? [];

  assert.ok(
    Number(rowByTeamWeek(rows, "week-1", "team-a").gmLadderRating) >
      Number(rowByTeamWeek(rows, "week-1", "team-b").gmLadderRating),
  );
});

void test("rolling roster talent excludes the rated week's player results", async () => {
  const data = fixture(4, 4);
  data.seasons.unshift({
    id: "season-0",
    year: 2025,
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    isActive: false,
  });
  data.playerNhlRows = [
    {
      seasonId: "season-0",
      playerId: "player-a",
      overallRating: 50,
    },
    {
      seasonId: "season-0",
      playerId: "player-b",
      overallRating: 50,
    },
  ];
  data.playerDays = [
    {
      seasonId,
      weekId: "week-1",
      date: "2026-07-01",
      gshlTeamId: "team-a",
      playerId: "player-a",
    },
    {
      seasonId,
      weekId: "week-1",
      date: "2026-07-01",
      gshlTeamId: "team-b",
      playerId: "player-b",
    },
    {
      seasonId,
      weekId: "week-2",
      date: "2026-07-08",
      gshlTeamId: "team-a",
      playerId: "player-a",
    },
    {
      seasonId,
      weekId: "week-2",
      date: "2026-07-08",
      gshlTeamId: "team-b",
      playerId: "player-b",
    },
  ];
  data.playerWeeks = [
    {
      seasonId,
      weekId: "week-1",
      playerId: "player-a",
      Rating: 100,
      GP: 10,
    },
    {
      seasonId,
      weekId: "week-1",
      playerId: "player-b",
      Rating: 20,
      GP: 10,
    },
    {
      seasonId,
      weekId: "week-2",
      playerId: "player-a",
      Rating: 1,
      GP: 10,
    },
    {
      seasonId,
      weekId: "week-2",
      playerId: "player-b",
      Rating: 120,
      GP: 10,
    },
  ];

  const result = await runPowerRankingsFixture(seasonId, data, {
    todayDate: "2026-07-25",
  });
  const rows = result.weekUpdates ?? [];
  assert.equal(
    rowByTeamWeek(rows, "week-1", "team-a").powerTalent,
    rowByTeamWeek(rows, "week-1", "team-b").powerTalent,
  );
  assert.ok(
    Number(rowByTeamWeek(rows, "week-2", "team-a").powerTalent) >
      Number(rowByTeamWeek(rows, "week-2", "team-b").powerTalent),
  );
});

void test("no-activity and inactive franchises still receive neutral snapshots", async () => {
  const data = fixture(4, 4);
  data.teamWeeks = [];
  data.matchups = [
    {
      id: "missing-score-1",
      seasonId,
      weekId: "week-1",
      homeTeamId: "team-a",
      awayTeamId: "team-b",
      gameType: "CC",
      isComplete: true,
    },
    {
      id: "missing-score-2",
      seasonId,
      weekId: "week-2",
      homeTeamId: "team-a",
      awayTeamId: "team-b",
      gameType: "CC",
      isComplete: true,
    },
  ];
  data.franchises = data.franchises.map((franchise) => ({
    ...franchise,
    isActive: false,
  }));

  const result = await runPowerRankingsFixture(seasonId, data, {
    todayDate: "2026-07-25",
  });
  const rows = result.weekUpdates ?? [];

  assert.equal(rows.length, 6);
  for (const row of rows) {
    assert.equal(row.powerRating, 50);
    assert.equal(row.gmLadderRating, 250);
    assert.equal(row.powerStatScore, 0);
    assert.equal(row.powerStatEwma, 0);
  }
});

void test("filtered playoff rebuilds replay completed regular-season state", async () => {
  const data = fixture(4, 4);
  const playoffWeek = data.weeks.find((row) => row.id === "week-3");
  assert.ok(playoffWeek);
  playoffWeek.weekType = "PO";

  const result = await runPowerRankingsFixture(seasonId, data, {
    todayDate: "2026-07-25",
    weekTypes: ["PO"],
  });
  const rows = result.weekUpdates ?? [];

  assert.equal(rows.length, 2);
  assert.ok(
    Number(rowByTeamWeek(rows, "week-3", "team-a").powerRating) >
      Number(rowByTeamWeek(rows, "week-3", "team-b").powerRating),
  );
});

void test("unchanged inputs replay deterministically", async () => {
  const data = fixture(4, 4);
  const first = await runPowerRankingsFixture(seasonId, data, {
    todayDate: "2026-07-25",
  });
  const second = await runPowerRankingsFixture(seasonId, data, {
    todayDate: "2026-07-25",
  });

  assert.equal(JSON.stringify(second), JSON.stringify(first));
});
