import assert from "node:assert/strict";
import test from "node:test";
import {
  loadPeriodImpact,
  type PeriodImpactBlock,
  type PeriodImpactFitOptions,
  type PeriodImpactScoreOptions,
} from "./period-impact";
import {
  loadPlayerDayImpact,
  HISTORICAL_DAY_IMPACT_POLICY,
  type DayImpactContext,
} from "./player-day-impact";

const fields = [
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "SV",
  "SA",
  "SO",
  "TOI",
];
const zero = Object.fromEntries(fields.map((f) => [f, 0]));
function appearance(role: "skater" | "goalie", stats: Record<string, number>) {
  return { role, raw: { ...zero, ...stats }, availableFields: fields };
}
function fixture(): DayImpactContext {
  return {
    matchupId: "pair",
    startDate: "2024-01-01",
    endDate: "2024-01-07",
    calendarDays: 7,
    nhlGamesPerTeam: 3,
    categories: ["G", "PM", "W", "GAA", "SVP", "SV", "SO"],
    home: {
      raw: { ...zero, G: 6, W: 1, GA: 3, SV: 47, SA: 50, TOI: 120 },
      appearances: [
        appearance("skater", { G: 1 }),
        appearance("skater", { G: 2 }),
        appearance("skater", { G: 3 }),
        appearance("goalie", { W: 1, GA: 1, SV: 29, SA: 30, TOI: 60 }),
        appearance("goalie", { GA: 2, SV: 18, SA: 20, TOI: 60 }),
      ],
    },
    away: {
      raw: { ...zero, G: 3, W: 1, GA: 4, SV: 56, SA: 60, TOI: 120 },
      appearances: [
        appearance("skater", { G: 3 }),
        appearance("goalie", { W: 1, GA: 2, SV: 28, SA: 30, TOI: 60 }),
        appearance("goalie", { GA: 2, SV: 28, SA: 30, TOI: 60 }),
      ],
    },
  };
}
const fit: PeriodImpactFitOptions = {
  ...HISTORICAL_DAY_IMPACT_POLICY,
  trainedBefore: "2025-01-01",
  contextModel: "schedule-kernel",
  exposureBandwidth: 0.15,
  referencePolicy: "retrospective-fixed",
};
const options: PeriodImpactScoreOptions = {
  categories: ["G"],
  weekDays: 7,
  nhlGamesPerTeam: 3,
  goalieMinimum: 2,
  blockKind: "replacement",
};
function block(
  role: PeriodImpactBlock["role"],
  n: number,
  raw: Record<string, number>,
): PeriodImpactBlock {
  return {
    role,
    raw: { ...zero, ...raw },
    availableFields: fields,
    skaterAppearances: role === "skater" ? n : 0,
    goalieAppearances: role === "goalie" ? n : 0,
  };
}

test("single appearances preserve the validated daily value exactly in retrospective early seasons", async () => {
  const api = await loadPeriodImpact(),
    daily = await loadPlayerDayImpact(),
    model = api.fitBlockContexts([fixture()], fit);
  for (const role of ["skater", "goalie"] as const) {
    const raw =
      role === "skater"
        ? { ...zero, G: 1, PM: -2 }
        : { ...zero, W: 1, GA: 1, SV: 29, SA: 30, TOI: 60 };
    const opts = { ...options, categories: ["G", "PM", "W", "GAA", "SVP"] };
    const expected = daily.score(
      { GP: 1, role, raw, availableFields: fields },
      model.dailyReference,
      opts,
    );
    const result = api.scoreBlock(block(role, 1, raw), model, opts);
    assert.equal(result.value, expected.ifStarted);
    assert.equal(result.average, result.value);
    assert.deepEqual(
      JSON.parse(JSON.stringify(result.categoryContributions)),
      JSON.parse(JSON.stringify(expected.categoryContributions)),
    );
    assert.equal(result.reference.retrospective, true);
  }
});

test("exact counting subsets match explicit without-replacement enumeration and truncate only at source size", async () => {
  const api = await loadPeriodImpact(),
    model = api.fitBlockContexts([fixture()], fit);
  // Home remove-two subsets leave margins 0,-1,-2. +1 gains .5,.5,0;
  // away has one skater, truncates removal to one, and +1 remains below six.
  const result = api.scoreBlock(block("skater", 2, { G: 1 }), model, options);
  assert.ok(Math.abs(result.value! - 1 / 6) < 1e-14);
  assert.equal(result.average, result.value! / 2);
  assert.equal(
    api.scoreBlock(block("skater", 10, { G: 4 }), model, options).value,
    0.5,
  );
  assert.equal(
    api.scoreBlock(block("skater", 10, { G: 0 }), model, options).value,
    0,
  );
});

test("whole goalie block preserves joint raw workload and integer qualification", async () => {
  const api = await loadPeriodImpact(),
    model = api.fitBlockContexts([fixture()], fit);
  const result = api.scoreBlock(
    block("goalie", 2, { W: 1, GA: 2, SV: 58, SA: 60, TOI: 120 }),
    model,
    { ...options, categories: ["W", "GAA", "SVP"] },
  );
  assert.equal(result.value, 2.5);
  assert.equal(result.average, 1.25);
  assert.equal(
    Object.values(result.qualificationContributions).reduce((s, v) => s + v, 0),
    2.5,
  );
  const larger = api.scoreBlock(
    block("goalie", 3, { W: 1, GA: 2, SV: 58, SA: 60, TOI: 120 }),
    model,
    { ...options, categories: ["W", "GAA", "SVP"] },
  );
  assert.equal(larger.value, 2.5);
});

test("mixed daily blocks combine role categories without a position multiplier", async () => {
  const api = await loadPeriodImpact(),
    model = api.fitBlockContexts([fixture()], fit);
  const mixed = {
    ...block("team", 0, { G: 1, W: 1, GA: 2, SV: 58, SA: 60, TOI: 120 }),
    skaterAppearances: 2,
    goalieAppearances: 2,
  };
  const result = api.scoreBlock(mixed, model, {
    ...options,
    categories: ["G", "W", "GAA", "SVP"],
  });
  assert.ok(Math.abs(result.value! - (2.5 + 1 / 6)) < 1e-14);
  assert.equal(result.appearances, 4);
});

test("whole team weeks compare the entire team against neutral opponents from an empty baseline", async () => {
  const api = await loadPeriodImpact(),
    model = api.fitBlockContexts([fixture()], fit);
  const team = {
    ...block("team", 0, { G: 6, W: 1, GA: 3, SV: 47, SA: 50, TOI: 120 }),
    skaterAppearances: 3,
    goalieAppearances: 2,
  };
  const result = api.scoreBlock(team, model, {
    ...options,
    categories: ["G", "W", "GAA", "SVP"],
    blockKind: "whole-team-week",
  });
  // G .75; W .5; GAA .75; SVP .75 against the two opponent weeks.
  assert.equal(result.value, 2.75);
  const unqualified = { ...team, goalieAppearances: 1 };
  assert.equal(
    api.scoreBlock(unqualified, model, {
      ...options,
      categories: ["W", "GAA", "SVP"],
      blockKind: "whole-team-week",
    }).value,
    0,
  );
});

test("reference policy, unknown fields and empty source are explicit rather than fabricated", async () => {
  const api = await loadPeriodImpact(),
    model = api.fitBlockContexts([fixture()], fit);
  assert.equal(api.scoreBlock(block("skater", 0, {}), model, options).value, 0);
  const missing = block("skater", 2, { G: 1 });
  missing.availableFields = [];
  assert.equal(api.scoreBlock(missing, model, options).status, "unavailable");
  const causal = api.fitBlockContexts([fixture()], {
    ...fit,
    referencePolicy: "before-week",
  });
  assert.throws(
    () =>
      api.scoreBlock(block("skater", 2, { G: 1 }), causal, {
        ...options,
        weekStartDate: "2014-01-01",
      }),
    /frozen/,
  );
  const empty = api.fitBlockContexts([], fit);
  assert.equal(
    api.scoreBlock(block("skater", 2, { G: 1 }), empty, options).status,
    "unavailable",
  );
  assert.throws(
    () =>
      api.scoreBlock(block("skater", 1, {}), model, {
        ...options,
        blockKind: "whole-team-week",
      }),
    /team block/,
  );
});

test("models and inputs remain immutable and saved hydration preserves cached calculations", async () => {
  const api = await loadPeriodImpact(),
    source = fixture(),
    before = JSON.stringify(source),
    model = api.fitBlockContexts([source], fit);
  const input = block("goalie", 2, { W: 1, GA: 2, SV: 58, SA: 60, TOI: 120 }),
    saved = JSON.parse(JSON.stringify(model));
  const opts = { ...options, categories: ["W", "GAA", "SVP"] };
  const expected = api.scoreBlock(input, model, opts),
    hydrated = api.hydrateBlockReference(saved);
  saved.sides = [];
  assert.equal(
    JSON.stringify(api.scoreBlock(input, hydrated, opts)),
    JSON.stringify(expected),
  );
  assert.equal(JSON.stringify(source), before);
  assert.ok(Object.isFrozen(model));
  assert.equal(
    api.scoreBlock(
      block("goalie", 2, { W: 3, SA: 30, SV: 29, TOI: 120 }),
      model,
      opts,
    ).status,
    "unavailable",
  );
});

test("large team-day counting blocks match an independent hypergeometric calculation", async () => {
  const api = await loadPeriodImpact(),
    f = fixture();
  f.home.appearances = [
    ...Array.from({ length: 20 }, () => appearance("skater", { G: 1 })),
    ...Array.from({ length: 20 }, () => appearance("skater", { G: 0 })),
  ];
  f.home.raw.G = 20;
  f.away.appearances = [appearance("skater", { G: 10 })];
  f.away.raw.G = 10;
  const model = api.fitBlockContexts([f], fit);
  const choose = (n: number, k: number) => {
    let p = 1;
    for (let i = 1; i <= k; i++) p = (p * (n - i + 1)) / i;
    return p;
  };
  const util = (v: number) => (v > 0 ? 1 : v === 0 ? 0.5 : 0);
  let expected = 0;
  for (let x = 0; x <= 14; x++) {
    const probability = (choose(20, x) * choose(20, 14 - x)) / choose(40, 14);
    expected += probability * (util(13 - x) - util(10 - x));
  }
  expected /= 2; // The away source's lone skater is removed and +3 cannot beat20.
  const actual = api.scoreBlock(block("skater", 14, { G: 3 }), model, options);
  assert.ok(Math.abs(actual.value! - expected) < 1e-13);
});
