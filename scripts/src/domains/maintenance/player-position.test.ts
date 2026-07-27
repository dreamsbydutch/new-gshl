import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeEligiblePositions,
  reconcilePlayerPositions,
  resolveMostRecentPositionSeason,
} from "./player-position";
import type { ScrapedYahooPlayer } from "../yahoo/player-yahoo-id-backfill";

function yahooPlayer(
  yahooId: string,
  playerName: string,
  positions: string[],
): ScrapedYahooPlayer {
  return {
    yahooId,
    playerName,
    normalizedName: playerName.toLowerCase().replace(/[^a-z]/g, ""),
    nameKeys: [],
    posGroup: positions.includes("G")
      ? "G"
      : positions.includes("D")
        ? "D"
        : "F",
    positions,
    nhlTeam: "TOR",
    sourceGroup: positions.includes("G") ? "goalie" : "skater",
    sourceUrl: "https://example.test/yahoo",
    countOffset: 0,
  };
}

test("normalizes Yahoo multi-position eligibility in stable roster order", () => {
  assert.deepEqual(normalizeEligiblePositions("RW, C / LW, BN"), [
    "C",
    "LW",
    "RW",
  ]);
});

test("uses the latest season that has started and never reaches into an older season", () => {
  const season = resolveMostRecentPositionSeason(
    [
      {
        id: "season-old",
        year: 2025,
        startDate: "2024-10-01",
        endDate: "2025-04-20",
      },
      {
        id: "season-recent",
        year: 2026,
        startDate: "2025-10-01",
        endDate: "2026-04-20",
      },
      {
        id: "season-upcoming",
        year: 2027,
        startDate: "2026-10-01",
        endDate: "2027-04-20",
      },
    ],
    new Date("2026-07-26T12:00:00.000Z"),
  );

  assert.equal(season?.id, "season-recent");
});

test("prefers Yahoo eligibility by stable id over the latest PlayerDay", () => {
  const result = reconcilePlayerPositions({
    players: [
      {
        id: "player-1",
        yahooId: "101",
        fullName: "Mitch Example",
        nhlPos: ["C"],
        posGroup: "F",
      },
    ],
    yahooPlayers: [yahooPlayer("101", "Mitch Example", ["C", "RW"])],
    playerDays: [
      {
        playerId: "player-1",
        date: "2026-04-20",
        nhlPos: ["C", "LW"],
      },
    ],
  });

  assert.deepEqual(result.updates, [
    {
      id: "player-1",
      data: { nhlPos: ["C", "RW"], posGroup: "F" },
    },
  ]);
  assert.equal(result.yahooIdMatches, 1);
  assert.equal(result.playerDayFallbacks, 0);
});

test("uses a unique normalized Yahoo name when a stable id is unavailable", () => {
  const result = reconcilePlayerPositions({
    players: [
      {
        id: "player-1",
        fullName: "Juraj Slafkovský",
        nhlPos: ["LW"],
        posGroup: "F",
      },
    ],
    yahooPlayers: [yahooPlayer("202", "Juraj Slafkovsky", ["LW", "RW"])],
    playerDays: [],
  });

  assert.equal(result.yahooNameMatches, 1);
  assert.deepEqual(result.updates[0]?.data.nhlPos, ["LW", "RW"]);
});

test("falls back to the latest PlayerDay and preserves existing positions when neither source exists", () => {
  const result = reconcilePlayerPositions({
    players: [
      {
        id: "player-day",
        fullName: "Player Day",
        nhlPos: ["C"],
        posGroup: "F",
      },
      {
        id: "preserved",
        fullName: "Preserved Player",
        nhlPos: ["D"],
        posGroup: "D",
      },
    ],
    yahooPlayers: [],
    playerDays: [
      {
        playerId: "player-day",
        date: "2026-04-18",
        nhlPos: ["C", "LW"],
      },
    ],
  });

  assert.equal(result.playerDayFallbacks, 1);
  assert.equal(result.preservedExisting, 1);
  assert.deepEqual(result.updates, [
    {
      id: "player-day",
      data: { nhlPos: ["C", "LW"], posGroup: "F" },
    },
  ]);
});
