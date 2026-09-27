import assert from "node:assert/strict";
import test from "node:test";
import {
  loadNHLMatchupRoster,
  type NHLMatchupReader,
} from "../src/server/nhl-matchup-data";
import { nhlGameResponseSchema } from "../src/lib/utils/features/nhl";

const game = nhlGameResponseSchema.parse({
  id: 2025020662,
  season: 20252026,
  gameType: 2,
  gameDate: "2026-01-05",
  startTimeUTC: "2026-01-06T00:00:00Z",
  gameState: "OFF",
  gameScheduleState: "OK",
  updatedAt: 1,
  awayTeam: { abbrev: "TOR", placeName: { default: "Toronto" } },
  homeTeam: { abbrev: "MTL", placeName: { default: "Montreal" } },
});
const team = {
  id: "selected-season-team",
  ownerId: "owner",
  name: "Team",
  abbr: "T",
  logoUrl: "/team.png",
};
const player = {
  id: "p1",
  ownerId: "owner",
  nhlApiId: "1",
  fullName: "Test Player",
  firstName: "Test",
  lastName: "Player",
  nhlPos: ["C"],
  posGroup: "F" as const,
  nhlTeam: ["TOR"],
  gshlTeamId: "previous-season-team",
  lineupPos: "C",
};
const day = {
  playerId: player.id,
  gshlTeamId: team.id,
  date: game.gameDate,
  dailyPos: "BN",
  nhlTeam: ["MTL"],
};
const now = Date.parse("2026-09-26T12:00:00Z");
function reader(overrides: Partial<NHLMatchupReader> = {}): NHLMatchupReader {
  return {
    seasons: async (year) => {
      assert.equal(year, 2026);
      return [{ id: "season" }];
    },
    teams: async (id) => {
      assert.equal(id, "season");
      return [team];
    },
    datePage: async () => {
      throw new Error("Unexpected date read");
    },
    playersByIds: async () => {
      throw new Error("Unexpected player read");
    },
    playersByOwner: async () => {
      throw new Error("Historical games must not read current rosters");
    },
    ...overrides,
  };
}

for (const season of [20242025, 20252026, 20262027]) {
  void test(`matchup season ${season} resolves the GSHL ending year`, async () => {
    const result = await loadNHLMatchupRoster(
      { ...game, season },
      reader({
        seasons: async (year) => {
          assert.equal(year, season % 10000);
          return [];
        },
      }),
      now,
    );
    assert.equal(result.season, null);
  });
}

void test("past matchup paginates only its indexed date and hydrates only matching players", async () => {
  const cursors: (string | null)[] = [];
  const result = await loadNHLMatchupRoster(
    game,
    reader({
      datePage: async (seasonId, date, cursor) => {
        assert.equal(seasonId, "season");
        assert.equal(date, game.gameDate);
        cursors.push(cursor);
        return cursor === null
          ? {
              items: [{ ...day, playerId: "irrelevant", nhlTeam: ["EDM"] }],
              nextCursor: "next",
              hasMore: true,
            }
          : { items: [day], nextCursor: null, hasMore: false };
      },
      playersByIds: async (ids) => {
        assert.deepEqual(ids, ["p1"]);
        return [player];
      },
    }),
    now,
  );
  assert.deepEqual(cursors, [null, "next"]);
  assert.equal(result.players.length, 1);
  assert.equal(result.players[0]?.side, "home");
  assert.equal(result.players[0]?.lineupStatus, "Bench");
  assert.equal(result.players[0]?.gshlTeam.id, team.id);
});

void test("upcoming matchup includes current owned players despite old or missing season assignments, without date reads", async () => {
  const result = await loadNHLMatchupRoster(
    { ...game, gameState: "FUT", gameDate: "2026-10-01" },
    reader({
      playersByOwner: async (ownerId) => {
        assert.equal(ownerId, "owner");
        return [
          player,
          {
            ...player,
            id: "p2",
            nhlApiId: "2",
            gshlTeamId: null,
            nhlTeam: ["MTL"],
            lineupPos: "BN",
          },
          { ...player, id: "other-nhl", nhlTeam: ["EDM"] },
          { ...player, id: "free", ownerId: null },
        ];
      },
    }),
    now,
  );
  assert.equal(result.players.length, 2);
  assert.deepEqual(
    result.players.map((row) => row.side),
    ["away", "home"],
  );
  assert.ok(
    result.players.every(
      (row) => row.gshlTeam.id === team.id && row.lineupStatus === "Planned",
    ),
  );
});

void test("completed games today never infer historical ownership from current rosters", async () => {
  const result = await loadNHLMatchupRoster(
    game,
    reader({
      datePage: async () => ({ items: [], nextCursor: null, hasMore: false }),
    }),
    Date.parse("2026-01-05T23:00:00Z"),
  );
  assert.deepEqual(result.players, []);
});

void test("a missing GSHL season remains empty instead of using a different season", async () => {
  const result = await loadNHLMatchupRoster(
    game,
    reader({ seasons: async () => [] }),
    now,
  );
  assert.equal(result.season, null);
  assert.deepEqual(result.players, []);
});

void test("a failed or endless date read fails without presenting partial or current rosters", async () => {
  await assert.rejects(
    loadNHLMatchupRoster(
      game,
      reader({
        datePage: async () => {
          throw new Error("Unavailable");
        },
      }),
      now,
    ),
    /Unavailable/,
  );
  let calls = 0;
  await assert.rejects(
    loadNHLMatchupRoster(
      game,
      reader({
        datePage: async () => ({
          items: [day],
          nextCursor: String(++calls),
          hasMore: true,
        }),
      }),
      now,
    ),
    /row budget/,
  );
  assert.equal(calls, 20);
});
