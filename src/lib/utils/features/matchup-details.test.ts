import assert from "node:assert/strict";
import test from "node:test";

import type {
  PlayerStatColumn,
  PlayerStatColumnKey,
  PlayerStatRow,
} from "@gshl-types";
import type { NHLSchedule } from "@gshl-lib/types/nhl";
import {
  buildPlayerStatColumns,
  getPlayerStatCardColumns,
  getPlayerTodayGames,
  getMatchupTodayGames,
  isMatchupInPlay,
  isMatchupDetailsComplete,
  renderPlayerStatCell,
} from "./matchup-details";

void test("completed matchups show Three Stars despite a missing or stale completion flag", () => {
  const now = new Date("2026-10-01T16:00:00Z");
  for (const result of [
    { homeWin: true },
    { awayWin: true },
    { tie: true },
    { isComplete: true },
  ]) {
    assert.equal(
      isMatchupDetailsComplete({ isComplete: false, ...result }, null, now),
      true,
    );
  }
  assert.equal(
    isMatchupDetailsComplete(
      { isComplete: false },
      { endDate: "2026-09-30" },
      now,
    ),
    true,
  );
  assert.equal(
    isMatchupDetailsComplete({}, { endDate: "2026-09-30" }, now),
    true,
  );
});

void test("live scores and the final evening of a matchup do not reveal Three Stars", () => {
  const live = { isComplete: false, homeScore: 7, awayScore: 5 };
  const week = { endDate: "2026-10-01" };
  assert.equal(
    isMatchupDetailsComplete(live, week, new Date("2026-10-02T03:59:59Z")),
    false,
  );
  assert.equal(
    isMatchupDetailsComplete(live, week, new Date("2026-10-02T04:00:00Z")),
    true,
  );
  assert.equal(
    isMatchupDetailsComplete(
      live,
      { endDate: "2026-10-10" },
      new Date("2026-10-01T16:00:00Z"),
    ),
    false,
  );
  assert.equal(isMatchupDetailsComplete(live, null), false);
  assert.equal(isMatchupDetailsComplete(live, { endDate: "invalid" }), false);
  assert.equal(
    isMatchupDetailsComplete(null, { endDate: "2020-01-01" }),
    false,
  );
});

void test("today's games match current NHL teams, aliases, and either side without duplicates", () => {
  const games: NHLSchedule["gameWeek"][number]["games"] = [
    {
      id: 2026020001,
      season: 20262027,
      gameType: 2,
      startTimeUTC: "2026-10-02T00:00:00Z",
      gameState: "FUT",
      gameScheduleState: "OK",
      awayTeam: { abbrev: "NJD", placeName: { default: "New Jersey" } },
      homeTeam: { abbrev: "TOR", placeName: { default: "Toronto" } },
    },
  ];
  assert.deepEqual(
    getPlayerTodayGames({ id: "away", nhlTeam: [" nj "] }, games),
    games,
  );
  assert.deepEqual(
    getPlayerTodayGames({ id: "home", nhlTeam: ["TOR"] }, games),
    games,
  );
  assert.deepEqual(
    getPlayerTodayGames({ id: "both", nhlTeam: ["TOR", "NJD"] }, games),
    games,
  );
  assert.deepEqual(
    getPlayerTodayGames(
      { id: "traded", nhlTeam: ["BOS"], currentNhlTeam: ["NJD"] },
      games,
    ),
    games,
  );
  assert.deepEqual(
    getPlayerTodayGames(
      { id: "off", nhlTeam: ["TOR"], currentNhlTeam: ["BOS"] },
      games,
    ),
    [],
  );
  assert.deepEqual(
    getPlayerTodayGames(
      { id: "unsigned", nhlTeam: ["TOR"], currentNhlTeam: [] },
      games,
    ),
    [],
  );
  assert.deepEqual(getPlayerTodayGames({ id: "unknown" }, games), []);
  assert.deepEqual(
    getPlayerTodayGames({ id: "no-games", nhlTeam: ["TOR"] }, []),
    [],
  );
});

void test("relevant games include both GSHL sides, deduplicate players, and exclude unrelated games", () => {
  const game: NHLSchedule["gameWeek"][number]["games"][number] = {
    id: 2026020001,
    season: 20262027,
    gameType: 2,
    startTimeUTC: "2026-10-02T00:00:00Z",
    gameState: "LIVE",
    gameScheduleState: "OK",
    awayTeam: { abbrev: "NJD", placeName: { default: "New Jersey" }, score: 2 },
    homeTeam: { abbrev: "TOR", placeName: { default: "Toronto" }, score: 1 },
  };
  const away = { id: "away", fullName: "Away Player", nhlTeam: ["NJ"] };
  const home = {
    id: "home",
    fullName: "Home Player",
    nhlTeam: ["BOS"],
    currentNhlTeam: ["TOR"],
  };
  const unrelated = {
    ...game,
    id: 2026020002,
    awayTeam: { ...game.awayTeam, abbrev: "BOS" },
    homeTeam: { ...game.homeTeam, abbrev: "MTL" },
  };
  const games = [game, unrelated];
  assert.deepEqual(getMatchupTodayGames(games, [away, away], [home]), [
    { game, awayPlayers: [away], homePlayers: [home] },
  ]);
  assert.deepEqual(getMatchupTodayGames(games, [], [home]), [
    { game, awayPlayers: [], homePlayers: [home] },
  ]);
  assert.deepEqual(getMatchupTodayGames(games, [], []), []);
  assert.deepEqual(getMatchupTodayGames([], [away], [home]), []);
  assert.equal(games.length, 2);
});

void test("the NHL games panel appears only within the active matchup's schedule days", () => {
  const week = { startDate: "2026-10-01", endDate: "2026-10-07" };
  for (const date of ["2026-10-01", "2026-10-04", "2026-10-07"])
    assert.equal(isMatchupInPlay({}, week, date), true);
  for (const date of [undefined, "2026-09-30", "2026-10-08"])
    assert.equal(isMatchupInPlay({}, week, date), false);
  for (const result of [
    { isComplete: true },
    { homeWin: true },
    { awayWin: true },
    { tie: true },
  ])
    assert.equal(isMatchupInPlay(result, week, "2026-10-04"), false);
  assert.equal(isMatchupInPlay(null, week, "2026-10-04"), false);
  assert.equal(isMatchupInPlay({}, null, "2026-10-04"), false);
});

function player(
  posGroup: "F" | "D" | "G",
  values: Partial<PlayerStatRow> = {},
): PlayerStatRow {
  return {
    id: `${posGroup.toLowerCase()}-player`,
    posGroup,
    ...values,
  };
}

function columns(...keys: PlayerStatColumnKey[]): PlayerStatColumn[] {
  return keys.map((key) => ({ key, label: String(key) }));
}

void test("weekly status columns include zeroes and retain values for skaters and goalies", () => {
  for (const position of ["F", "G"] as const) {
    const row = player(position, {
      MG: 0,
      IR: 1,
      IRplus: "2",
      ADD: 1,
      MS: "3",
      BS: 4,
    });
    const result = buildPlayerStatColumns({
      players: [row],
      categories: ["G", "W"],
    });
    assert.deepEqual(
      result.map((column) => column.key),
      [
        "player",
        "pos",
        "nhlTeam",
        "GP",
        "G",
        "W",
        "MS",
        "BS",
        "ADD",
        "MG",
        "IR",
        "IRplus",
      ],
    );
    assert.equal(
      result.find((column) => column.key === "IRplus")?.label,
      "IR+",
    );
    assert.deepEqual(
      (["MG", "IR", "IRplus", "ADD", "MS", "BS"] as const).map((key) =>
        renderPlayerStatCell(row, key),
      ),
      ["-", "1", "2", "1", "3", "4"],
    );
  }
});

void test("goalies show dashes for every skater-only category, even with stored values", () => {
  for (const key of [
    "G",
    "A",
    "P",
    "PM",
    "PIM",
    "PPP",
    "SOG",
    "HIT",
    "BLK",
  ] as const) {
    assert.equal(renderPlayerStatCell(player("G", { [key]: 3 }), key), "-");
  }
});

void test("forwards and defensemen show dashes for every goalie-only category", () => {
  for (const position of ["F", "D"] as const) {
    for (const key of ["W", "GA", "GAA", "SV", "SA", "SVP", "SO"] as const) {
      assert.equal(
        renderPlayerStatCell(player(position, { [key]: 3 }), key),
        "-",
      );
    }
  }
});

void test("eligible zeroes, goalie precision, and shared stats retain their values", () => {
  assert.equal(renderPlayerStatCell(player("F", { G: 0 }), "G"), "0");
  assert.equal(renderPlayerStatCell(player("D"), "BLK"), "0");
  assert.equal(renderPlayerStatCell(player("G", { W: 0 }), "W"), "0");
  assert.equal(renderPlayerStatCell(player("G", { GAA: 2.5 }), "GAA"), "2.50");
  assert.equal(
    renderPlayerStatCell(player("G", { SVP: 0.925 }), "SVP"),
    "0.925",
  );
  for (const position of ["F", "D", "G"] as const) {
    assert.equal(renderPlayerStatCell(player(position, { GP: 2 }), "GP"), "2");
    assert.equal(
      renderPlayerStatCell(player(position, { Rating: 8.125 }), "Rating"),
      "8.125",
    );
  }
});

void test("selects compact skater stats in the season column order", () => {
  const result = getPlayerStatCardColumns(
    player("F"),
    columns("player", "W", "P", "G", "SVP", "A", "SOG"),
  );

  assert.deepEqual(
    result.map((column) => column.key),
    ["P", "G", "A", "SOG"],
  );
});

void test("selects only goalie categories for compact goalie cards", () => {
  const result = getPlayerStatCardColumns(
    player("G"),
    columns("player", "G", "W", "GAA", "SVP", "SO", "P"),
  );

  assert.deepEqual(
    result.map((column) => column.key),
    ["W", "GAA", "SVP", "SO"],
  );
});

void test("returns no compact columns when the requested limit is empty", () => {
  assert.deepEqual(
    getPlayerStatCardColumns(player("D"), columns("G", "A"), 0),
    [],
  );
});

void test("builds identity, available context, and deduplicated season columns", () => {
  const result = buildPlayerStatColumns({
    players: [player("F", { GP: "2", Rating: "8.125" })],
    categories: ["G", "SV%", "G"],
  });

  assert.deepEqual(
    result.map((column) => column.key),
    [
      "player",
      "pos",
      "nhlTeam",
      "GP",
      "Rating",
      "G",
      "SVP",
      "MS",
      "BS",
      "ADD",
      "MG",
      "IR",
      "IRplus",
    ],
  );
});

void test("weekly status columns remain visible when the payload has no status values", () => {
  const keys = ["MS", "BS", "ADD", "MG", "IR", "IRplus"] as const;
  for (const players of [
    [],
    [player("F")],
    [player("G", { MS: null, BS: "", ADD: " " })],
  ]) {
    const result = buildPlayerStatColumns({ players, categories: ["G", "W"] });
    assert.deepEqual(
      result.slice(-6).map((column) => column.key),
      [...keys],
    );
  }
  for (const key of keys) {
    assert.equal(renderPlayerStatCell(player("F"), key), "-");
    assert.equal(renderPlayerStatCell(player("G", { [key]: null }), key), "-");
    assert.equal(renderPlayerStatCell(player("F", { [key]: " " }), key), "-");
    for (const value of [0, "0", "0.0", " 0 "] as const) {
      assert.equal(
        renderPlayerStatCell(player("G", { [key]: value }), key),
        "-",
      );
      assert.equal(
        renderPlayerStatCell(player("F", { [key]: value }), key),
        "-",
      );
    }
    assert.equal(renderPlayerStatCell(player("G", { [key]: 2 }), key), "2");
  }
});
