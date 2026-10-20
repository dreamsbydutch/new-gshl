import assert from "node:assert/strict";
import test from "node:test";
import { rankRowsWithRankingEngine } from "./ranking-engine";
import {
  loadPlayerDayImpact,
  HISTORICAL_DAY_IMPACT_POLICY,
  toDayImpactAppearance,
} from "./player-day-impact";

async function reference() {
  const api = await loadPlayerDayImpact();
  return api.fitContexts(
    [
      {
        matchupId: "history",
        startDate: "2020-01-01",
        endDate: "2020-01-07",
        calendarDays: 7,
        categories: ["G"],
        home: {
          raw: { G: 2 },
          appearances: [
            { role: "skater", raw: { G: 2 }, availableFields: ["G"] },
          ],
        },
        away: {
          raw: { G: 0 },
          appearances: [
            { role: "skater", raw: { G: 0 }, availableFields: ["G"] },
          ],
        },
      },
    ],
    { ...HISTORICAL_DAY_IMPACT_POLICY, trainedBefore: "2021-01-01" },
  );
}
void test("public opt-in day profile keeps equal performance values across F/D/owners and separate bench contribution", async () => {
  const model = await reference(),
    base = { date: "2021-01-02", weekId: "w", GP: "1", G: "1" };
  const rows = [
    {
      ...base,
      playerId: "a",
      gshlTeamId: "team-a",
      posGroup: "F",
      dailyPos: "C",
    },
    {
      ...base,
      playerId: "b",
      gshlTeamId: "team-b",
      posGroup: "D",
      dailyPos: "D",
    },
    {
      ...base,
      playerId: "c",
      gshlTeamId: "team-c",
      posGroup: "D",
      dailyPos: "BN",
    },
  ];
  const original = structuredClone(rows);
  const result = await rankRowsWithRankingEngine(rows, {
    dataModelName: "PlayerDayStatLine",
    mutate: false,
    includeBreakdown: true,
    playerDayImpact: {
      reference: model,
      actualMatchupsByWeekAndTeamId: {
        w: {
          "team-a": {
            own: { raw: { G: 1 }, goalieAppearances: 0 },
            opponent: { raw: { G: 0 }, goalieAppearances: 0 },
          },
        },
      },
      contextsByWeekId: {
        w: {
          startDate: "2021-01-01",
          endDate: "2021-01-07",
          categories: ["G"],
          weekDays: 7,
          goalieMinimum: 2,
        },
      },
    },
  });
  assert.deepEqual(rows, original);
  assert.deepEqual(
    result.map((r) => r.Rating),
    [25, 25, 25],
  );
  const details = result.map(
    (r) => r.__ratingDebug as { ifStarted: number; counted: number },
  );
  assert.deepEqual(
    details.map((d) => d.ifStarted),
    [0.25, 0.25, 0.25],
  );
  assert.deepEqual(
    details.map((d) => d.counted),
    [0.25, 0.25, 0],
  );
  assert.equal(
    (
      result[0]?.__ratingDebug as {
        actualMatchupImpact: { counted: number };
      }
    ).actualMatchupImpact.counted,
    0.5,
  );
});
void test("unsupported histories stay unavailable and misuse cannot fall through to legacy/storage", async () => {
  const model = await reference(),
    rows = [
      {
        date: "2021-01-02",
        weekId: "w",
        GP: "1",
        G: "1",
        posGroup: "F",
        dailyPos: "C",
      },
    ];
  const result = await rankRowsWithRankingEngine(rows, {
    dataModelName: "PlayerDayStatLine",
    mutate: false,
    includeBreakdown: true,
    playerDayImpact: {
      reference: model,
      contextsByWeekId: {
        w: {
          startDate: "2021-01-01",
          endDate: "2021-01-07",
          categories: ["G"],
          weekDays: 28,
          goalieMinimum: 2,
        },
      },
    },
  });
  assert.equal(result[0]?.Rating, "");
  assert.equal(
    (result[0]?.__ratingDebug as { status: string }).status,
    "unavailable",
  );
  await assert.rejects(
    rankRowsWithRankingEngine(rows, {
      dataModelName: "PlayerWeekStatLine",
      playerDayImpact: { reference: model, contextsByWeekId: {} },
    }),
    /player-day-only/,
  );
});
void test("normalization keeps missing categories unknown and signed plus/minus intact", () => {
  const row = toDayImpactAppearance({
    posGroup: "D",
    GP: "1",
    G: null,
    A: "",
    PM: "-3",
    TOI: "18.25",
    SOG: " ",
  });
  assert.deepEqual(row.raw, { PM: -3, TOI: 18.25 });
  assert(!row.availableFields.includes("G"));
  assert.throws(
    () => toDayImpactAppearance({ posGroup: "G", GP: true }),
    /zero or one/,
  );
  assert.throws(
    () => toDayImpactAppearance({ posGroup: "D", GP: 1, BLK: "NaN" }),
    /Invalid daily/,
  );
  assert.throws(
    () => toDayImpactAppearance({ posGroup: "F", GP: null, G: 0 }),
    /GP is missing/,
  );
  assert.equal(toDayImpactAppearance({ posGroup: "F", GP: null }).GP, 0);
});

void test("reference freezes before week start, not merely before the appearance", async () => {
  const model = await reference();
  await assert.rejects(
    rankRowsWithRankingEngine(
      [
        {
          date: "2021-01-02",
          weekId: "w",
          GP: 1,
          G: 1,
          posGroup: "F",
          dailyPos: "C",
        },
      ],
      {
        dataModelName: "PlayerDayStatLine",
        playerDayImpact: {
          reference: model,
          contextsByWeekId: {
            w: {
              startDate: "2020-12-28",
              endDate: "2021-01-03",
              categories: ["G"],
              weekDays: 7,
              goalieMinimum: 2,
            },
          },
        },
      },
    ),
    /frozen before the week starts/,
  );
});
