import assert from "node:assert/strict";
import test from "node:test";
import { planCalderBackfill } from "./calder-backfill";

void test("v3 team rows replay legacy Calder locally without invoking the main live profile or changing published ratings", async () => {
  const teams = ["a", "b"].map((gshlTeamId) => ({
    id: gshlTeamId,
    gshlTeamId,
    seasonId: "s",
    seasonType: "RS",
    Rating: 1000,
    averageRating: 50,
    ratingVersion: "gshl-category-impact-v3",
    ratingAppearances: 20,
    calderRating: 0,
    calderRk: null,
  }));
  const totals = ["a", "b"].map((playerId) => ({
    id: playerId,
    playerId,
    seasonId: "s",
    seasonType: "RS",
    posGroup: "F",
    GP: 20,
    G: 10,
    A: 10,
    P: 20,
    SOG: 60,
    Rating: 500,
    averageRating: 25,
    ratingVersion: "gshl-category-impact-v3",
    ratingAppearances: 20,
  }));
  const context = {
    seasonRows: [{ id: "s", year: 2025, categories: ["G", "A", "P", "SOG"] }],
    teamSeasonRows: teams,
    playerTotalRows: totals,
    playerSplitRows: totals.map((r) => ({
      ...r,
      gshlTeamId: r.playerId,
      days: 100,
    })),
    draftPickRows: totals.map((r, i) => ({
      seasonId: "s",
      gshlTeamId: r.playerId,
      playerId: r.playerId,
      pick: 1 + i * 50,
      isSigning: false,
    })),
  };
  const before = structuredClone({ teams, context });
  const patches = await planCalderBackfill(teams, context);
  assert.equal(patches.length, 2);
  assert.ok(patches.every((p) => Number.isFinite(p.data.calderRating)));
  assert.ok(
    patches.find((p) => p.id === "b")!.data.calderRating >
      patches.find((p) => p.id === "a")!.data.calderRating,
  );
  assert.ok(
    patches.every(
      (p) => Object.keys(p.data).sort().join() === "calderRating,calderRk",
    ),
  );
  assert.deepEqual({ teams, context }, before);
});

void test("Calder rewards equal production more at a later slot and patches only Calder fields", async () => {
  const rows = ["a", "b"].map((team) => ({
    id: team,
    seasonId: "s",
    seasonType: "RS",
    gshlTeamId: team,
    Rating: 50,
    calderRating: 0,
    calderRk: null,
  }));
  const context = {
    seasonRows: [{ id: "s", year: 2025 }],
    teamSeasonRows: rows,
    playerTotalRows: ["a", "b"].map((playerId) => ({
      playerId,
      seasonId: "s",
      seasonType: "RS",
      Rating: 80,
    })),
    playerSplitRows: ["a", "b"].map((playerId) => ({
      playerId,
      gshlTeamId: playerId,
      seasonId: "s",
      seasonType: "RS",
      Rating: 80,
      days: 167,
    })),
    draftPickRows: ["a", "b"].map((playerId, index) => ({
      playerId,
      gshlTeamId: playerId,
      seasonId: "s",
      pick: index === 0 ? 1 : 100,
      isSigning: false,
    })),
  };
  const original = structuredClone(rows);
  const patches = await planCalderBackfill(rows, context);
  assert.equal(patches.length, 2);
  assert.ok(
    patches.find((row) => row.id === "b")!.data.calderRating >
      patches.find((row) => row.id === "a")!.data.calderRating,
  );
  assert.equal(patches.find((row) => row.id === "b")!.data.calderRk, 1);
  assert.deepEqual(Object.keys(patches[0]!.data).sort(), [
    "calderRating",
    "calderRk",
  ]);
  assert.deepEqual(rows, original);
  const updated = rows.map((row) => ({
    ...row,
    ...patches.find((patch) => patch.id === row.id)!.data,
  }));
  assert.deepEqual(
    await planCalderBackfill(updated, { ...context, teamSeasonRows: updated }),
    [],
  );
  assert.deepEqual(
    await planCalderBackfill(
      rows.map((row) => ({ ...row, seasonType: "PO" })),
      context,
    ),
    [],
  );
  assert.deepEqual(
    await planCalderBackfill(rows, {
      ...context,
      draftPickRows: [
        ...context.draftPickRows,
        {
          playerId: "b",
          gshlTeamId: "a",
          seasonId: "s",
          pick: 200,
          isSigning: true,
        },
      ],
    }),
    patches,
  );
  assert.deepEqual(
    await planCalderBackfill(rows, {
      ...context,
      draftPickRows: [
        ...context.draftPickRows,
        {
          playerId: "playoffs-only",
          gshlTeamId: "a",
          seasonId: "s",
          pick: 50,
          isSigning: false,
        },
      ],
      playerTotalRows: [
        ...context.playerTotalRows,
        {
          playerId: "playoffs-only",
          seasonId: "s",
          seasonType: "PO",
          Rating: 125,
        },
      ],
    }),
    patches,
  );
});
