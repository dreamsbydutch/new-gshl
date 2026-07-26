import assert from "node:assert/strict";
import test from "node:test";
import { buildPlayerActivityContext } from "./player-activity";

const REFERENCE_DATE = new Date("2026-07-26T00:00:00Z");

test("uses the active and immediately previous seasons for NHL games", () => {
  const context = buildPlayerActivityContext({
    players: [{ id: "player-1" }, { id: "player-2" }],
    seasons: [
      { id: "season-2024", year: 2024, isActive: false },
      { id: "season-2025", year: 2025, isActive: false },
      { id: "season-2026", year: 2026, isActive: true },
    ],
    statLines: [
      { playerId: "player-1", seasonId: "season-2025", GP: "18" },
      { playerId: "player-1", seasonId: "season-2026", GP: 2 },
      { playerId: "player-2", seasonId: "season-2024", GP: 82 },
    ],
    referenceDate: REFERENCE_DATE,
  });

  assert.equal(context.currentSeasonId, "season-2026");
  assert.equal(context.previousSeasonId, "season-2025");
  assert.deepEqual(context.evidenceByPlayerId.get("player-1"), {
    evidenceComplete: true,
    currentSeasonId: "season-2026",
    currentSeasonYear: 2026,
    currentSeasonGames: 2,
    previousSeasonId: "season-2025",
    previousSeasonYear: 2025,
    previousSeasonGames: 18,
  });
  assert.equal(
    context.evidenceByPlayerId.get("player-2")?.previousSeasonGames,
    0,
  );
});

test("marks evidence incomplete when a previous season is unavailable", () => {
  const context = buildPlayerActivityContext({
    players: [{ id: "player-1" }],
    seasons: [{ id: "season-2026", year: 2026, isActive: true }],
    statLines: [],
    referenceDate: REFERENCE_DATE,
  });

  assert.equal(
    context.evidenceByPlayerId.get("player-1")?.evidenceComplete,
    false,
  );
});
