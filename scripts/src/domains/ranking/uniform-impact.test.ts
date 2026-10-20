import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseRecord } from "../../integrations/data/records";
import { loadPeriodImpact } from "./period-impact";
import { HISTORICAL_DAY_IMPACT_POLICY } from "./player-day-impact";
import { rankUniformImpactSets } from "../../integrations/ranking/uniform-impact";
import {
  careerImpactKey,
  fitSeasonImpactReference,
  impactFields,
  scoreSeasonImpact,
} from "./uniform-impact";

const day = (
  id: string,
  weekId: string,
  date: string,
  team: string,
  G: number,
  pos = "C",
): DatabaseRecord => ({
  _id: id,
  seasonId: "s",
  playerId: "p",
  weekId,
  date,
  gshlTeamId: team,
  GP: 1,
  GS: pos === "BN" ? 0 : 1,
  posGroup: "F",
  dailyPos: pos,
  G,
});
const weeks = [
  {
    _id: "w1",
    seasonId: "s",
    startDate: "2025-01-01",
    endDate: "2025-01-07",
    weekType: "RS",
  },
  {
    _id: "w2",
    seasonId: "s",
    startDate: "2025-01-08",
    endDate: "2025-01-14",
    weekType: "RS",
  },
];
const exposure = {
  version: "owner-independent-nhl-calendar-exposure-v1",
  weeks: weeks.map((w) => ({
    weekId: w._id,
    startDate: w.startDate,
    endDate: w.endDate,
    meanGamesPerNhlTeam: 3,
  })),
};
async function reference() {
  const api = await loadPeriodImpact();
  const appearance = (G: number) => ({
    role: "skater" as const,
    raw: { G },
    availableFields: ["G"],
  });
  return api.fitBlockContexts(
    [
      {
        matchupId: "old",
        startDate: "2024-01-01",
        endDate: "2024-01-07",
        calendarDays: 7,
        nhlGamesPerTeam: 3,
        categories: ["G"],
        home: { raw: { G: 2 }, appearances: [appearance(1), appearance(1)] },
        away: { raw: { G: 1 }, appearances: [appearance(1), appearance(0)] },
      },
    ],
    {
      ...HISTORICAL_DAY_IMPACT_POLICY,
      trainedBefore: "2025-01-01",
      contextModel: "schedule-kernel",
      exposureBandwidth: 0.15,
      referencePolicy: "retrospective-fixed",
    },
  );
}
test("period contributions use starter days rather than aggregate GP; daily bench potential remains rated", async () => {
  const days = [
    day("d1", "w1", "2025-01-01", "t", 1),
    day("d2", "w1", "2025-01-02", "t", 1, "Util"),
    day("bench", "w1", "2025-01-03", "t", 20, "BN"),
    day("d3", "w2", "2025-01-08", "t", 1),
  ];
  const result = await scoreSeasonImpact({
    season: { _id: "s", legacyId: "2", categories: ["G"] },
    weeks,
    days,
    reference: await reference(),
    exposure,
    tables: {
      playerDayStatLines: days,
      playerWeekStatLines: [
        {
          _id: "pw1",
          playerId: "p",
          weekId: "w1",
          gshlTeamId: "t",
          GP: 99,
          G: 999,
        },
        { _id: "pw2", playerId: "p", weekId: "w2", gshlTeamId: "t" },
      ],
      playerTotalStatLines: [{ _id: "pt", playerId: "p", seasonType: "RS" }],
      teamWeekStatLines: [
        { _id: "tw1", weekId: "w1", gshlTeamId: "t" },
        { _id: "tw2", weekId: "w2", gshlTeamId: "t" },
      ],
      teamSeasonStatLines: [{ _id: "ts", gshlTeamId: "t", seasonType: "RS" }],
    },
  });
  const pw1 = result.scores.get("playerWeekStatLines")!.get("pw1")!;
  assert.equal(pw1.ratingAppearances, 2);
  assert.equal(pw1.averageRating, Math.round((pw1.Rating / 2) * 1e5) / 1e5);
  assert.ok(result.scores.get("playerDayStatLines")!.get("bench")!.Rating > 0);
  const ptotal = result.scores.get("playerTotalStatLines")!.get("pt")!;
  assert.equal(ptotal.ratingAppearances, 3);
  assert.ok(
    Math.abs(
      ptotal.Rating -
        pw1.Rating -
        result.scores.get("playerWeekStatLines")!.get("pw2")!.Rating,
    ) < 2e-5,
  );
  const tw = result.scores.get("teamWeekStatLines")!;
  assert.ok(
    Math.abs(
      result.scores.get("teamSeasonStatLines")!.get("ts")!.Rating -
        tw.get("tw1")!.Rating -
        tw.get("tw2")!.Rating,
    ) < 2e-5,
  );
  assert.equal(
    result.careerTotals.get(
      careerImpactKey({ playerId: "p", seasonType: "RS" }, false),
    )!.appearances,
    3,
  );
});
test("within-week transfers are recombined for player totals; row identity works before insertion", async () => {
  const days = [
    day("a", "w1", "2025-01-01", "a", 1),
    day("b", "w1", "2025-01-02", "b", 1),
  ];
  const ref = await reference();
  const row = { playerId: "p", seasonType: "RS" };
  const result = await scoreSeasonImpact({
    season: { _id: "s", categories: ["G"] },
    weeks,
    days,
    reference: ref,
    exposure,
    tables: {
      playerTotalStatLines: [row],
      playerSplitStatLines: [
        { playerId: "p", gshlTeamId: "a", seasonType: "RS" },
        { playerId: "p", gshlTeamId: "b", seasonType: "RS" },
      ],
    },
  });
  assert.equal(result.scores.get("playerTotalStatLines")!.size, 1);
  assert.equal(result.scores.get("playerSplitStatLines")!.size, 2);
  const total = [...result.scores.get("playerTotalStatLines")!.values()][0]!;
  const api = await loadPeriodImpact();
  const expected = api.scoreBlock(
    {
      role: "skater",
      raw: { G: 2 },
      availableFields: ["G"],
      skaterAppearances: 2,
      goalieAppearances: 0,
    },
    ref,
    {
      categories: ["G"],
      weekDays: 7,
      nhlGamesPerTeam: 3,
      goalieMinimum: 2,
      blockKind: "replacement",
    },
  );
  assert.deepEqual(total, impactFields(100 * expected.value!, 2));
});
test("category masking preserves exact values and unique-category fallback stays isolated", async () => {
  const appearance = {
    role: "skater",
    raw: { G: 1, A: 2 },
    availableFields: ["G", "A"],
  };
  const side = { raw: { G: 2, A: 4 }, appearances: [appearance, appearance] };
  const source = {
    matchupId: "outside",
    weekId: "w1",
    seasonId: "outside",
    startDate: "2025-01-01",
    endDate: "2025-01-07",
    calendarDays: 7,
    categories: ["G", "A"],
    home: side,
    away: side,
  };
  const target = {
    ...source,
    matchupId: "target",
    weekId: "w2",
    seasonId: "target",
    startDate: "2025-01-08",
    endDate: "2025-01-14",
    categories: ["G", "SO"],
  };
  const inputs = { corpus: { matchups: [source, target] }, exposure };
  const all = await fitSeasonImpactReference(inputs, "target");
  const masked = await fitSeasonImpactReference(inputs, "target", ["G"]);
  const api = await loadPeriodImpact();
  for (const n of [1, 2, 3]) {
    const b = {
      role: "skater" as const,
      raw: { G: 3 },
      availableFields: ["G"],
      skaterAppearances: n,
      goalieAppearances: 0,
    };
    const o = {
      categories: ["G"],
      weekDays: 7,
      nhlGamesPerNhlTeam: 3,
      nhlGamesPerTeam: 3,
      goalieMinimum: 2,
      blockKind: "replacement" as const,
    };
    assert.deepEqual(
      api.scoreBlock(b, masked, o).categoryContributions,
      api.scoreBlock(b, all, o).categoryContributions,
    );
  }
  const categories = all.sides.map(
    (side) => (side as { categories: string[] }).categories,
  );
  assert.equal(categories.filter((c) => c.includes("G")).length, 2);
  assert.equal(categories.filter((c) => c.includes("SO")).length, 2);
});

test("missing production reference cannot fall back to a legacy score for a new row", async () => {
  const previous = process.env.GSHL_IMPACT_REFERENCE_CONFIG;
  process.env.GSHL_IMPACT_REFERENCE_CONFIG =
    ".local-data/nonexistent-uniform-impact-test-config.json";
  try {
    await assert.rejects(
      rankUniformImpactSets({
        playerDayStatLines: [{ seasonId: "new", Rating: 9 }],
      }),
      /refusing legacy GSHL rating/,
    );
  } finally {
    if (previous === undefined) delete process.env.GSHL_IMPACT_REFERENCE_CONFIG;
    else process.env.GSHL_IMPACT_REFERENCE_CONFIG = previous;
  }
});

test("empty rows have explicit finite zero total and average; invalid metadata is rejected", () => {
  assert.deepEqual(impactFields(0, 0), {
    Rating: 0,
    averageRating: 0,
    ratingVersion: "gshl-category-impact-v3",
    ratingAppearances: 0,
  });
  assert.throws(() => impactFields(Infinity, 1));
  assert.throws(() => impactFields(1, -1));
});

test("team blocks keep skater time and goalie offense out of team goalie/skater totals", async () => {
  const api = await loadPeriodImpact();
  const skater = {
    role: "skater" as const,
    raw: { G: 1, TOI: 900 },
    availableFields: ["G", "TOI"],
  };
  const goalie = {
    role: "goalie" as const,
    raw: { GA: 2, SV: 28, SA: 30, W: 1, SO: 0, TOI: 60 },
    availableFields: ["GA", "SV", "SA", "W", "SO", "TOI"],
  };
  const side = { raw: { G: 1, ...goalie.raw }, appearances: [skater, goalie] };
  const ref = api.fitBlockContexts(
    [
      {
        matchupId: "old",
        startDate: "2024-01-01",
        endDate: "2024-01-07",
        calendarDays: 7,
        nhlGamesPerTeam: 3,
        categories: ["G", "GAA"],
        home: side,
        away: side,
      },
    ],
    {
      ...HISTORICAL_DAY_IMPACT_POLICY,
      trainedBefore: "2025-01-01",
      contextModel: "schedule-kernel",
      exposureBandwidth: 0.15,
      referencePolicy: "retrospective-fixed",
    },
  );
  const skaterDay = { ...day("s", "w1", "2025-01-01", "t", 1), TOI: 900 };
  const goalieDay = {
    ...day("g", "w1", "2025-01-01", "t", 100, "G"),
    playerId: "goalie",
    posGroup: "G",
    ...goalie.raw,
  };
  const calculate = (days: DatabaseRecord[]) =>
    scoreSeasonImpact({
      season: { _id: "s", legacyId: "1", categories: ["G", "GAA"] },
      weeks,
      days,
      reference: ref,
      exposure,
      tables: {
        teamWeekStatLines: [{ _id: "tw", weekId: "w1", gshlTeamId: "t" }],
      },
    });
  const dirty = await calculate([skaterDay, goalieDay]);
  const clean = await calculate([
    { ...skaterDay, TOI: null },
    { ...goalieDay, G: null },
  ]);
  assert.deepEqual(
    dirty.scores.get("teamWeekStatLines")!.get("tw"),
    clean.scores.get("teamWeekStatLines")!.get("tw"),
  );
});
