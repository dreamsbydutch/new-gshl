import assert from "node:assert/strict";
import test from "node:test";
import { fetchDailyGameStatus } from "./daily-game-status";

test("schedule cadence ignores exhibition and All-Star games", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      gameWeek: [
        {
          date: "2026-10-20",
          games: [
            { gameType: 1, gameState: "LIVE", gameScheduleState: "OK" },
            { gameType: 4, gameState: "LIVE", gameScheduleState: "OK" },
            { gameType: 2, gameState: "OFF", gameScheduleState: "OK" },
            { gameType: 3, gameState: "CRIT", gameScheduleState: "OK" },
          ],
        },
      ],
    });
  try {
    assert.deepEqual(await fetchDailyGameStatus("2026-10-20"), [
      { gameState: "OFF", gameScheduleState: "OK" },
      { gameState: "CRIT", gameScheduleState: "OK" },
    ]);
  } finally {
    globalThis.fetch = original;
  }
});

test("missing date and unknown game types fail instead of authorizing finalization", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ gameWeek: [] });
    await assert.rejects(
      fetchDailyGameStatus("2026-10-20"),
      /does not confirm/,
    );
    globalThis.fetch = async () =>
      Response.json({
        gameWeek: [
          {
            date: "2026-10-20",
            games: [{ gameState: "OFF", gameScheduleState: "OK" }],
          },
        ],
      });
    await assert.rejects(
      fetchDailyGameStatus("2026-10-20"),
      /does not confirm/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
