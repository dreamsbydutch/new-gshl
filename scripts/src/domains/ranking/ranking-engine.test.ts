import assert from "node:assert/strict";
import test from "node:test";
import { rankRowsWithRankingEngine } from "./ranking-engine";

test("legacy award category components percentile versioned totals without altering their primary contribution", async () => {
  const rows = [1000, 2500, 9000].map((Rating, i) => ({
    id: `t${i}`,
    gshlTeamId: `t${i}`,
    seasonId: "s",
    seasonType: "RS",
    Rating,
    ratingVersion: "gshl-category-impact-v3",
    GP: 30,
    GS: 20,
    MS: 1,
    BS: 1,
    teamW: i + 1,
    teamL: 3 - i,
    teamT: 0,
    G: i + 1,
  }));
  async function awards(values: typeof rows) {
    return rankRowsWithRankingEngine(values, {
      dataModelName: "TeamSeasonStatLine",
      outputField: "awardCompatibilityPreview",
      mutate: false,
      dataContext: {
        seasonRows: [{ id: "s", year: 2025, categories: ["G"] }],
        teamSeasonRows: values,
      },
    });
  }
  const result = await awards(rows),
    scaled = await awards(rows.map((r) => ({ ...r, Rating: 10 * r.Rating })));
  assert.deepEqual(
    result.map((r) => r.Rating),
    rows.map((r) => r.Rating),
  );
  for (const [i, r] of result.entries()) {
    assert.equal(r.hartRating, scaled[i]?.hartRating);
    assert.ok(Number(r.hartRating) >= 0 && Number(r.hartRating) <= 100);
  }
});

test("retained raw goalie workload does not qualify a forfeited team week", async () => {
  const unqualified = {
    seasonId: "1",
    weekId: "w1",
    seasonType: "RS",
    GP: 1,
    W: null,
    GAA: null,
    SVP: null,
    SO: null,
  };
  const rows = [
    { ...unqualified, id: "without-workload", gshlTeamId: "t1" },
    {
      ...unqualified,
      id: "with-workload",
      gshlTeamId: "t2",
      GA: 0,
      SV: 20,
      SA: 20,
      TOI: 60,
    },
  ];
  const original = structuredClone(rows);
  const result = await rankRowsWithRankingEngine(rows, {
    dataModelName: "TeamWeekStatLine",
    outputField: "Rating",
    mutate: false,
    dataContext: {
      seasonRows: [
        { id: "1", seasonYear: 2025, categories: ["W", "GAA", "SVP"] },
      ],
    },
  });
  assert.equal(result[0]?.Rating, result[1]?.Rating);
  assert.equal(result[0]?.Rating, 18.75);
  assert.deepEqual(rows, original);
});

// Captured from the original engine before removing its storage adapter.
const expectedRatings = {
  PlayerDayStatLine: [172.5, 33.88],
  PlayerWeekStatLine: [161, 44.45],
  PlayerSplitStatLine: [87, 12.23],
  PlayerTotalStatLine: [86, 12.29],
  PlayerCareerSplitStatLine: [87, 12.23],
  PlayerCareerTotalStatLine: [86, 12.29],
  PlayerNHL: [86, 11.05],
  TeamDayStatLine: [100.57, 21.02],
  TeamWeekStatLine: [90.34, 10.8],
  TeamSeasonStatLine: [68.18, 4.55],
};

for (const [dataModelName, expected] of Object.entries(expectedRatings)) {
  test(`preserves ${dataModelName} scores with supplied record data`, async () => {
    const common = {
      seasonId: "1",
      weekId: "w1",
      seasonType: "RS",
      posGroup: "F",
      GP: 1,
      GS: 1,
      MG: 0,
    };
    const rows = [
      {
        ...common,
        id: "a",
        playerId: "a",
        gshlTeamId: "t1",
        G: 2,
        A: 1,
        P: 3,
        PM: 2,
        PPP: 1,
        SOG: 5,
        HIT: 3,
        BLK: 1,
      },
      {
        ...common,
        id: "b",
        playerId: "b",
        gshlTeamId: "t2",
        G: 0,
        A: 1,
        P: 1,
        PM: -1,
        PPP: 0,
        SOG: 2,
        HIT: 1,
        BLK: 0,
      },
    ];
    const original = structuredClone(rows);
    const result = await rankRowsWithRankingEngine(rows, {
      dataModelName,
      outputField: "Rating",
      mutate: false,
      dataContext: {
        seasonRows: [
          {
            id: "1",
            seasonYear: 2025,
            categories: [
              "G",
              "A",
              "P",
              "PM",
              "PPP",
              "SOG",
              "HIT",
              "BLK",
              "W",
              "GAA",
              "SVP",
            ],
          },
        ],
      },
    });
    assert.deepEqual(
      Array.from(result, (row) => row.Rating),
      expected,
    );
    assert.deepEqual(rows, original);
  });
}
