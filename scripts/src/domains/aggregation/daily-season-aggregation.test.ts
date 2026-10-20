import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseRecord } from "../../integrations/data/records";
import {
  refreshDailySeasonAggregates,
  type DailyAggregationDependencies,
} from "./daily-season-aggregation";
import { uniformImpactDaysForSeason } from "../../integrations/ranking/uniform-impact";

const season = {
  id: "s",
  _id: "s",
  legacyId: "1",
  categories: ["G", "A", "P", "W", "GAA", "SVP"],
};
const day = (extra: DatabaseRecord = {}): DatabaseRecord => ({
  id: "day",
  _id: "day",
  legacyId: "legacy-day",
  seasonId: "s",
  weekId: "w",
  gshlTeamId: "t",
  playerId: "p",
  date: "2020-01-06",
  posGroup: "F",
  nhlPos: ["C"],
  nhlTeam: ["TOR"],
  dailyPos: "C",
  GP: 1,
  GS: 1,
  G: 1,
  A: 0,
  P: 1,
  PM: 0,
  PIM: 0,
  PPP: 0,
  SOG: 2,
  HIT: 0,
  BLK: 0,
  ...extra,
});
function fixture(source: DatabaseRecord[] = [day()]) {
  const writes: Array<{
    model: string;
    rows: DatabaseRecord[];
    deleteStale?: boolean;
  }> = [];
  const patches: Array<{ id: string; patch: DatabaseRecord }> = [];
  const reads: string[] = [];
  const scored: Array<{ tables: string[]; days: DatabaseRecord[] }> = [];
  const historical: DatabaseRecord = {
    seasonId: "old",
    playerId: "p",
    gshlTeamId: "old-team",
    seasonType: "LT",
    posGroup: "F",
    GP: "3",
    GS: "2",
    G: "1",
    PM: "-3",
    days: "7",
    nhlPos: ["C"],
    nhlTeam: ["BOS"],
  };
  const dependencies: DailyAggregationDependencies = {
    fetchDateRows: async (id, date) => {
      reads.push(`Boundary:${id}:${date}`);
      return source.filter((row) => row.date === date);
    },
    fetchWeekRows: async (id, weekIds) => {
      reads.push(`ScopedDays:${id}:${weekIds.join(",")}`);
      return source.filter((row) => weekIds.includes(String(row.weekId)));
    },
    fetchSeasonRows: async (model, id) => {
      reads.push(`${model}:${id}`);
      if (model === "PlayerDayStatLine") return source;
      if (model === "Week")
        return [
          {
            id: "w",
            _id: "w",
            seasonId: "s",
            weekType: "RS",
            startDate: "2020-01-06",
            endDate: "2020-01-12",
            isComplete: true,
          },
        ];
      if (model === "Team") return [{ id: "t", _id: "t", seasonId: "s" }];
      return id === "old" ? [{ ...historical }] : [];
    },
    fetchSeasons: async () => {
      reads.push("Season");
      return [{ id: "s" }, { id: "old" }];
    },
    rank: async (sets, options) => {
      scored.push({
        tables: Object.keys(sets),
        days: uniformImpactDaysForSeason(options, "s")!,
      });
      for (const [table, rows] of Object.entries(sets))
        for (const row of rows ?? []) {
          const n =
            table === "playerDayStatLines"
              ? Number(row.GP) > 0
                ? 1
                : 0
              : Number(row.GS ?? 0);
          Object.assign(row, {
            Rating: n ? -50 * n : 0,
            averageRating: n ? -50 : 0,
            ratingVersion: "gshl-category-impact-v3",
            ratingAppearances: n,
          });
          if (table === "teamWeekStatLines")
            Object.assign(row, {
              powerRating: 99,
              powerRk: 1,
              gmLadderRating: 44,
              overallRating: 12,
            });
        }
      return true;
    },
    updateDay: async (id, patch) => {
      patches.push({ id, patch });
    },
    replace: async (model, _id, rows, deleteStale) => {
      writes.push({ model, rows, deleteStale });
      return { modelName: model, seasonRows: rows.length };
    },
  };
  return { dependencies, writes, patches, reads, scored };
}

test("frequent publishes signed PD/PW/TD/TW v3 only and preserves day source/legacy identity", async () => {
  const source = [day()];
  const before = structuredClone(source);
  const f = fixture(source);
  const result = await refreshDailySeasonAggregates(
    season,
    true,
    undefined,
    { mode: "frequent" },
    f.dependencies,
  );
  assert.equal(result.mode, "frequent");
  assert.deepEqual(
    f.writes.map((w) => w.model),
    ["PlayerWeekStatLine", "TeamDayStatLine", "TeamWeekStatLine"],
  );
  assert.equal(f.reads.includes("Season"), false);
  assert.equal(
    f.reads.some(
      (x) => x.startsWith("PlayerSplit") || x.startsWith("PlayerTotal"),
    ),
    false,
  );
  assert.deepEqual(f.scored[0]!.tables.sort(), [
    "playerDayStatLines",
    "playerWeekStatLines",
    "teamDayStatLines",
    "teamWeekStatLines",
  ]);
  assert.deepEqual(f.patches, [
    {
      id: "day",
      patch: {
        Rating: -50,
        averageRating: -50,
        ratingVersion: "gshl-category-impact-v3",
        ratingAppearances: 1,
        legacyId: "legacy-day",
      },
    },
  ]);
  for (const write of f.writes) {
    assert.equal(write.deleteStale, false);
    assert.ok(
      write.rows.every((r) => r.ratingVersion === "gshl-category-impact-v3"),
    );
    assert.ok(
      write.rows.every(
        (r) =>
          !["powerRating", "powerRk", "gmLadderRating", "overallRating"].some(
            (field) => Object.hasOwn(r, field),
          ),
      ),
    );
  }
  assert.deepEqual(source, before);
});

test("overnight includes all six rollups and careers from bounded historical published periods", async () => {
  const f = fixture();
  await refreshDailySeasonAggregates(
    season,
    true,
    undefined,
    { mode: "overnight" },
    f.dependencies,
  );
  assert.deepEqual(
    f.writes.map((w) => w.model),
    [
      "PlayerWeekStatLine",
      "TeamDayStatLine",
      "TeamWeekStatLine",
      "PlayerSplitStatLine",
      "PlayerTotalStatLine",
      "TeamSeasonStatLine",
      "PlayerCareerSplitStatLine",
      "PlayerCareerTotalStatLine",
    ],
  );
  assert.ok(
    f.reads.includes("PlayerSplitStatLine:old") &&
      f.reads.includes("PlayerTotalStatLine:old"),
  );
  assert.equal(
    f.reads.some(
      (x) => x === "PlayerDayStatLine:old" || x === "PlayerWeekStatLine:old",
    ),
    false,
  );
  const careers = f.writes.find(
    (w) => w.model === "PlayerCareerTotalStatLine",
  )!.rows;
  const postseason = careers.find((r) => r.seasonType === "PO")!;
  assert.equal(postseason.GP, "3");
  assert.equal(postseason.GS, "2");
  assert.equal(postseason.PM, "-3");
  assert.equal(postseason.ratingAppearances, 2);
  assert.equal(postseason.Rating, -100);
  assert.ok(f.writes.every((w) => w.deleteStale === false));
});

test("preview lineup and scoring share the hypothetical cohort with zero writes", async () => {
  const source = [day({ dailyPos: "BN", GS: 0 })];
  const f = fixture(source);
  const original = structuredClone(source);
  await refreshDailySeasonAggregates(
    season,
    false,
    {
      date: "2020-01-06",
      days: [
        {
          seasonId: "s",
          weekId: "w",
          date: "2020-01-06",
          playerId: "p",
          gshlTeamId: "t",
          dailyPos: "C",
          nhlPos: ["C"],
          posGroup: "F",
        },
      ],
    },
    { mode: "frequent" },
    f.dependencies,
  );
  assert.equal(f.scored[0]!.days[0]!.dailyPos, "C");
  assert.equal(f.scored[0]!.days[0]!.GS, "1");
  assert.equal(f.patches.length, f.writes.length);
  assert.equal(f.writes.length, 0);
  assert.deepEqual(source, original);
  await assert.rejects(
    refreshDailySeasonAggregates(
      season,
      true,
      { date: "2020-01-06", days: [] },
      { mode: "frequent" },
      f.dependencies,
    ),
    /persisted/,
  );
});

test("already published day metadata is idempotent and GP0 pending days get explicit zero v3", async () => {
  const f = fixture([
    day({
      Rating: -50,
      averageRating: -50,
      ratingVersion: "gshl-category-impact-v3",
      ratingAppearances: 1,
    }),
    day({
      id: "pending",
      _id: "pending",
      playerId: "pending",
      GP: 0,
      GS: 0,
      G: 0,
      P: 0,
    }),
  ]);
  await refreshDailySeasonAggregates(
    season,
    true,
    undefined,
    {},
    f.dependencies,
  );
  assert.equal(f.patches.length, 1);
  assert.equal(f.patches[0]!.id, "pending");
  assert.deepEqual(f.patches[0]!.patch, {
    Rating: 0,
    averageRating: 0,
    ratingVersion: "gshl-category-impact-v3",
    ratingAppearances: 0,
    legacyId: "legacy-day",
  });
});

test("missing rating metadata fails before any publication", async () => {
  const f = fixture();
  f.dependencies.rank = async () => true;
  await assert.rejects(
    refreshDailySeasonAggregates(season, true, undefined, {}, f.dependencies),
    /v3 rating/,
  );
  assert.equal(f.patches.length + f.writes.length, 0);
});

test("generated scoring overrides reject cross-season/duplicate days and detach valid rows", () => {
  assert.equal(uniformImpactDaysForSeason({}, "s"), undefined);
  assert.deepEqual(
    uniformImpactDaysForSeason({ daysBySeason: new Map([["s", []]]) }, "s"),
    [],
  );
  assert.throws(
    () =>
      uniformImpactDaysForSeason(
        { daysBySeason: new Map([["s", [day({ seasonId: "other" })]]]) },
        "s",
      ),
    /canonical/,
  );
  assert.throws(
    () =>
      uniformImpactDaysForSeason(
        { daysBySeason: new Map([["s", [day(), day()]]]) },
        "s",
      ),
    /Duplicate/,
  );
  const original = day();
  const selected = uniformImpactDaysForSeason(
    { daysBySeason: new Map([["s", [original]]]) },
    "s",
  )!;
  selected[0]!.dailyPos = "BN";
  assert.equal(original.dailyPos, "C");
});

test("frequent week scope leaves other weeks untouched and retains acquisition boundary context", async () => {
  const source = [
    day(),
    day({
      id: "prior",
      _id: "prior",
      playerId: "other",
      date: "2020-01-05",
      weekId: "old-week",
      GP: 0,
      GS: 0,
      G: 0,
      P: 0,
    }),
  ];
  const original = structuredClone(source),
    f = fixture(source);
  const load = f.dependencies.fetchSeasonRows;
  f.dependencies.fetchSeasonRows = async (model, id) =>
    model === "Week"
      ? [
          ...(await load(model, id)),
          {
            id: "old-week",
            seasonId: "s",
            weekType: "RS",
            startDate: "2019-12-30",
            endDate: "2020-01-05",
            isComplete: true,
          },
          {
            id: "other-week",
            seasonId: "s",
            weekType: "RS",
            startDate: "2020-01-13",
            endDate: "2020-01-19",
            isComplete: true,
          },
        ]
      : load(model, id);
  const result = await refreshDailySeasonAggregates(
    season,
    true,
    undefined,
    { mode: "frequent", weekIds: ["w"] },
    f.dependencies,
  );
  assert.deepEqual(result.weekIds, ["w"]);
  assert.ok(f.reads.includes("ScopedDays:s:w"));
  assert.ok(f.reads.includes("Boundary:s:2020-01-05"));
  assert.equal(f.reads.includes("PlayerDayStatLine:s"), false);
  assert.deepEqual(
    f.scored[0]!.days.map((r) => r.id),
    ["day"],
  );
  assert.equal(f.patches.length, 1);
  assert.equal(f.patches[0]!.id, "day");
  for (const write of f.writes)
    assert.ok(write.rows.every((r) => r.weekId === "w"));
  assert.equal(
    f.writes.find((w) => w.model === "PlayerWeekStatLine")!.rows[0]!.ADD,
    "1",
  );
  assert.deepEqual(source, original);
});

test("unknown, empty or overnight week scope fails before rating or publication", async () => {
  for (const options of [
    { mode: "frequent" as const, weekIds: [] },
    { mode: "frequent" as const, weekIds: ["missing"] },
    { mode: "frequent" as const, weekIds: ["w", "w"] },
    { mode: "overnight" as const, weekIds: ["w"] },
  ]) {
    const f = fixture();
    await assert.rejects(
      refreshDailySeasonAggregates(
        season,
        true,
        undefined,
        options,
        f.dependencies,
      ),
      /scope|week/i,
    );
    assert.equal(f.scored.length + f.patches.length + f.writes.length, 0);
  }
});
