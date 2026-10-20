import assert from "node:assert/strict";
import test from "node:test";
import {
  rankRowsWithRankingEngine,
  type RankingEngineRow,
} from "./ranking-engine";

const native = (playerId: string, i: number) => ({
  id: playerId,
  playerId,
  seasonId: "s",
  seasonType: "RS",
  posGroup: "F",
  GP: 40,
  GS: 35,
  G: 10 + i * 3,
  A: 20 - i,
  P: 30 + i * 2,
  PM: i,
  PPP: 5 + i,
  SOG: 100 + i * 10,
  HIT: 20,
  BLK: 15,
  days: 100,
});
function fixture() {
  const totals = [0, 1, 2].map((i) => ({
    ...native(`p${i}`, i),
    Rating: 1000 * (i + 1),
    ratingVersion: "gshl-category-impact-v3",
    averageRating: 50,
    ratingAppearances: 35,
  }));
  const splits = totals.map((r, i) => ({ ...r, gshlTeamId: `t${i}` }));
  const teams = totals.map((_, i) => ({
    id: `t${i}`,
    gshlTeamId: `t${i}`,
    seasonId: "s",
    seasonType: "RS",
    Rating: 50,
    G: 100 + i * 20,
    GP: 200,
    GS: 180,
    MS: 1,
    BS: 1,
    teamW: 10 + i,
    teamL: 5 - i,
    teamT: 0,
  }));
  return {
    teams,
    context: {
      seasonRows: [
        {
          id: "s",
          year: 2025,
          categories: ["G", "A", "P", "PM", "PPP", "SOG", "HIT", "BLK"],
        },
      ],
      teamSeasonRows: teams,
      playerTotalRows: totals,
      playerSplitRows: splits,
      playerNhlRows: totals.map((r, i) => ({
        ...r,
        overallRating: 70 + i * 5,
      })),
      draftPickRows: totals.map((r, i) => ({
        playerId: r.playerId,
        gshlTeamId: `t${i}`,
        seasonId: "s",
        pick: 1 + i * 20,
        isSigning: false,
      })),
    },
  };
}

void test("Calder benchmarks use temporary legacy native-stat ratings while published v3 rows remain exact", async () => {
  const { teams, context } = fixture();
  const before = structuredClone({ teams, context });
  const legacyTotals = await rankRowsWithRankingEngine(
    context.playerTotalRows,
    {
      dataModelName: "PlayerTotalStatLine",
      outputField: "legacyPreview",
      mutate: false,
      dataContext: context,
    },
  );
  const legacySplits = await rankRowsWithRankingEngine(
    context.playerSplitRows,
    {
      dataModelName: "PlayerSplitStatLine",
      outputField: "legacyPreview",
      mutate: false,
      dataContext: context,
    },
  );
  const legacy = (rows: typeof legacyTotals) =>
    rows.map((r) => {
      const copy: RankingEngineRow = { ...r, Rating: r.legacyPreview };
      delete copy.ratingVersion;
      delete copy.averageRating;
      delete copy.ratingAppearances;
      return copy;
    });
  const options = {
    dataModelName: "TeamSeasonStatLine",
    outputField: "legacyAwardsPreview",
    mutate: false,
  };
  const result = await rankRowsWithRankingEngine(teams, {
    ...options,
    dataContext: context,
  });
  const expected = await rankRowsWithRankingEngine(teams, {
    ...options,
    dataContext: {
      ...context,
      playerTotalRows: legacy(legacyTotals),
      playerSplitRows: legacy(legacySplits),
    },
  });
  assert.deepEqual(
    result.map((r) => [r.calderRating, r.calderRk]),
    expected.map((r) => [r.calderRating, r.calderRk]),
  );
  const withoutNhl = await rankRowsWithRankingEngine(teams, {
    ...options,
    dataContext: { ...context, playerNhlRows: [] },
  });
  const expectedWithoutNhl = await rankRowsWithRankingEngine(teams, {
    ...options,
    dataContext: {
      ...context,
      playerNhlRows: [],
      playerTotalRows: legacy(legacyTotals),
      playerSplitRows: legacy(legacySplits),
    },
  });
  assert.deepEqual(
    withoutNhl.map((r) => [r.calderRating, r.calderRk]),
    expectedWithoutNhl.map((r) => [r.calderRating, r.calderRk]),
  );
  assert.deepEqual({ teams, context }, before);
});

void test("all legacy award outputs ignore the numerical scale of published category contributions", async () => {
  const { teams, context } = fixture();
  const run = (factor: number) =>
    rankRowsWithRankingEngine(teams, {
      dataModelName: "TeamSeasonStatLine",
      outputField: "legacyAwardsPreview",
      mutate: false,
      dataContext: {
        ...context,
        playerTotalRows: context.playerTotalRows.map((r) => ({
          ...r,
          Rating: r.Rating * factor,
        })),
        playerSplitRows: context.playerSplitRows.map((r) => ({
          ...r,
          Rating: r.Rating * factor,
        })),
      },
    });
  const a = await run(1),
    b = await run(-100);
  const awards = (rows: typeof a) =>
    rows.map((r) =>
      Object.fromEntries(
        Object.entries(r).filter(([k]) =>
          /^(hart|norris|vezina|calder|jackAdams|GMOY)(Rating|Rk)$/.test(k),
        ),
      ),
    );
  assert.deepEqual(awards(a), awards(b));
  assert.deepEqual(
    a.map((r) => r.Rating),
    teams.map((r) => r.Rating),
  );
});
