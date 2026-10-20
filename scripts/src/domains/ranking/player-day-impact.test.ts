import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const sandbox = vm.createContext({});
vm.runInContext(
  fs.readFileSync(
    new URL(
      "../../runtime/RankingEngine/player-day-impact.js",
      import.meta.url,
    ),
    "utf8",
  ),
  sandbox,
);
const api = sandbox.RankingEngine.PlayerDayImpact;
const policy = {
  ratioPrecision: { GAA: 5, SVP: 5 },
  qualificationCategories: ["W", "GAA", "SV", "SVP", "SO"],
};
const fitOptions = { ...policy, trainedBefore: "2025-01-10" };
const options = { categories: ["G"], weekDays: 7, goalieMinimum: 2 };
const zero = { G: 0, PM: 0, W: 0, GA: 0, SV: 0, SA: 0, SO: 0, TOI: 0 };
function appearance(role: string, fields: Record<string, number>) {
  return {
    role,
    raw: { ...zero, ...fields },
    availableFields: Object.keys(zero),
  };
}
function context(id = "matchup1") {
  return {
    matchupId: id,
    endDate: "2025-01-05",
    configuredGameDays: 7,
    categories: ["G", "PM", "W", "GAA", "SVP", "SV", "SO"],
    home: {
      raw: { ...zero, G: 2 },
      appearances: [appearance("skater", { G: 2 })],
    },
    away: {
      raw: { ...zero, G: 1 },
      appearances: [appearance("skater", { G: 1 })],
    },
  };
}

test("exact weighted counting margins handle ties, signed harm and position invariance", () => {
  const ctx = context();
  const before = JSON.stringify(ctx);
  const model = api.fitContexts([ctx], fitOptions);
  // Background margins -1 and -2: +1 turns one loss into a tie.
  const row = { GP: 1, posGroup: "F", G: 1 };
  assert.equal(api.score(row, model, options).ifStarted, 0.25);
  assert.equal(
    api.score({ ...row, posGroup: "D" }, model, options).ifStarted,
    0.25,
  );
  assert.equal(JSON.stringify(ctx), before);
  assert.ok(Object.isFrozen(model));
  const pm = context("pm");
  pm.home.raw.PM = 0;
  pm.away.raw.PM = 0;
  assert.equal(
    api.score(
      { GP: 1, posGroup: "D", PM: -1 },
      api.fitContexts([pm], fitOptions),
      { ...options, categories: ["PM"] },
    ).ifStarted,
    -0.5,
  );
});

test("sides carry equal total weight despite different appearance counts", () => {
  const c = context();
  c.home.appearances = [
    appearance("skater", { G: 1 }),
    appearance("skater", { G: 1 }),
  ];
  const model = api.fitContexts([c], fitOptions);
  assert.equal(model.groups[7].counts.G.weight, 2);
  assert.equal(api.score({ GP: 1, G: 1 }, model, options).ifStarted, 0.25);
});

test("future outcomes and unsupported week lengths cannot supply a reference", () => {
  const c = context();
  c.endDate = "2025-01-10";
  const model = api.fitContexts([c], fitOptions);
  assert.equal(model.provenance.matchups, 0);
  assert.equal(
    api.score({ GP: 1, G: 1 }, model, options).status,
    "unavailable",
  );
  const earlier = api.fitContexts([context()], fitOptions);
  assert.equal(
    api.score({ GP: 1, G: 1, date: "2025-01-09" }, earlier, options).status,
    "unavailable",
  );
  assert.equal(
    api.score({ GP: 1, G: 1 }, earlier, { ...options, weekDays: 8 }).status,
    "unavailable",
  );
});

test("bench potential remains visible, zero appearances are zero and missing source is unavailable", () => {
  const model = api.fitContexts([context()], fitOptions);
  const bench = api.score({ GP: 1, G: 1 }, model, {
    ...options,
    started: false,
  });
  assert.equal(bench.ifStarted, 0.25);
  assert.equal(bench.counted, 0);
  assert.equal(api.score({ GP: 0 }, model, options).ifStarted, 0);
  assert.equal(
    api.score({ GP: 1, G: null }, model, options).status,
    "unavailable",
  );
  assert.equal(
    api.score({ GP: 1, G: 0, availableFields: [] }, model, options).status,
    "unavailable",
  );
});

function goalieContext() {
  const c = context();
  c.home.appearances = [
    appearance("goalie", { W: 1, GA: 1, SV: 29, SA: 30, TOI: 60 }),
    appearance("goalie", { GA: 1, SV: 29, SA: 30, TOI: 60 }),
  ];
  c.away.appearances = [
    appearance("goalie", { GA: 2, SV: 28, SA: 30, TOI: 60 }),
    appearance("goalie", { GA: 2, SV: 28, SA: 30, TOI: 60 }),
  ];
  c.home.raw = { ...zero, W: 1, GA: 2, SV: 58, SA: 60, TOI: 120 };
  c.away.raw = { ...zero, GA: 4, SV: 56, SA: 60, TOI: 120 };
  return c;
}

test("goalie insertion crosses minimum and uses joint raw workload", () => {
  const model = api.fitContexts([goalieContext()], fitOptions);
  const scored = api.score(
    { GP: 1, posGroup: "G", W: 1, GA: 0, SV: 20, SA: 20, TOI: 30 },
    model,
    { ...options, categories: ["W", "GAA", "SVP"] },
  );
  assert.equal(scored.status, "rated");
  // Home backgrounds gain all three; away backgrounds gain only a W tie.
  assert.equal(scored.ifStarted, 1.75);
  assert.equal(scored.support.GAA, 2);
  assert.equal(
    Object.values(scored.qualificationContributions).reduce(
      (s: number, x) => s + Number(x),
      0,
    ),
    1.75,
  );
});

test("actual ratio harm is signed, workload weighted, and bench is uncounted", () => {
  const row = { GP: 1, posGroup: "G", GA: 4, SV: 6, SA: 10, TOI: 10 };
  const own = {
    raw: { ...zero, GA: 4, SV: 36, SA: 40, TOI: 70 },
    goalieAppearances: 3,
  };
  const opp = {
    raw: { ...zero, GA: 2, SV: 58, SA: 60, TOI: 120 },
    goalieAppearances: 2,
  };
  const opts = { ...policy, categories: ["GAA", "SVP"], goalieMinimum: 2 };
  const value = api.actualImpact(row, own, opp, opts);
  assert.equal(value.ifStarted, -2);
  assert.equal(
    api.actualImpact(row, own, opp, { ...opts, started: false }).counted,
    0,
  );
});

test("minimum policy, ties and ratio precision are explicit and configurable", () => {
  const row = { GP: 1, posGroup: "G", W: 1, SO: 1 };
  const own = { raw: { W: 1, SO: 1 }, goalieAppearances: 1 };
  const opp = { raw: { W: 0, SO: 0 }, goalieAppearances: 0 };
  const opts = {
    ...policy,
    qualificationCategories: ["W", "GAA", "SVP"],
    categories: ["W", "SO"],
    goalieMinimum: 2,
  };
  assert.equal(api.actualImpact(row, own, opp, opts).ifStarted, 0.5);
  assert.equal(
    api.actualImpact(row, own, opp, {
      ...opts,
      qualificationCategories: ["W", "SO"],
    }).ifStarted,
    0,
  );
  assert.throws(
    () => api.fitContexts([], { trainedBefore: "2025-01-10" }),
    /precision/,
  );
});

test("unknown zero-shot qualified ratio stays unavailable and deterministic cap is disclosed", () => {
  const row = { GP: 1, posGroup: "G", SV: 0, SA: 0 };
  const a = { raw: { SV: 0, SA: 0 }, goalieAppearances: 2 };
  assert.equal(
    api.actualImpact(row, a, a, {
      ...policy,
      categories: ["SVP"],
      goalieMinimum: 2,
    }).status,
    "unavailable",
  );
  const c = goalieContext();
  const first = api.fitContexts([c], { ...fitOptions, maxGoalieContexts: 2 });
  assert.equal(first.groups[7].originalGoalieContexts, 4);
  assert.equal(first.groups[7].goalies.length, 2);
  assert.equal(
    JSON.stringify(first),
    JSON.stringify(
      api.fitContexts([c], { ...fitOptions, maxGoalieContexts: 2 }),
    ),
  );
});

test("configured five-decimal rate ties are applied after pooling, not per appearance", () => {
  const row = { GP: 1, posGroup: "G", GA: 2, TOI: 60 };
  const own = { raw: { GA: 2, TOI: 120 }, goalieAppearances: 3 };
  const opp = { raw: { GA: 1, TOI: 59.9999 }, goalieAppearances: 2 };
  const opts = { ...policy, categories: ["GAA"], goalieMinimum: 2 };
  assert.equal(api.actualImpact(row, own, opp, opts).ifStarted, -0.5);
  assert.equal(
    api.actualImpact(row, own, opp, {
      ...opts,
      ratioPrecision: { GAA: 10, SVP: 5 },
    }).ifStarted,
    0,
  );
  assert.equal(
    api.actualImpact({ ...row, GA: -1 }, own, opp, opts).status,
    "unavailable",
  );
});

test("appearance weighting is an explicit alternative to uniform side-week weighting", () => {
  const c = context();
  c.home.appearances = [
    appearance("skater", { G: 1 }),
    appearance("skater", { G: 1 }),
  ];
  const model = api.fitContexts([c], {
    ...fitOptions,
    backgroundWeighting: "appearance",
  });
  assert.equal(model.provenance.backgroundWeighting, "appearance");
  assert.equal(model.groups[7].counts.G.weight, 3);
  assert.ok(
    Math.abs(api.score({ GP: 1, G: 1 }, model, options).ifStarted - 1 / 3) <
      1e-14,
  );
  assert.throws(
    () =>
      api.fitContexts([c], { ...fitOptions, backgroundWeighting: "guessed" }),
    /Unknown/,
  );
});

test("normal counting alternative uses weighted moments and integer tie continuity", () => {
  const model = api.fitContexts([context()], {
    ...fitOptions,
    countModel: "normal",
  });
  assert.equal(model.groups[7].counts.G.mean, -1.5);
  assert.equal(model.groups[7].counts.G.standardDeviation, 0.5);
  const value = api.score({ GP: 1, G: 2 }, model, options).ifStarted;
  // Independently tabulated standard-normal CDF: [Phi(0)+Phi(2)-Phi(-4)-Phi(-2)]/2.
  assert.ok(Math.abs(value - 0.7272340323790838) < 2e-7);
  const c = context();
  c.home.raw.G = 0;
  c.away.raw.G = 0;
  c.home.appearances = [appearance("skater", { G: 0 })];
  c.away.appearances = [appearance("skater", { G: 0 })];
  const degenerate = api.fitContexts([c], {
    ...fitOptions,
    countModel: "normal",
  });
  assert.equal(api.score({ GP: 1, G: 1 }, degenerate, options).ifStarted, 0.5);
});

test("invalid game facts, unknown counting models and impossible subtraction fail closed", () => {
  const model = api.fitContexts([context()], fitOptions);
  for (const fields of [
    { G: -1 },
    { G: 0.5 },
    { G: 1, TOI: -1 },
    { G: 1, W: 2 },
    { G: 1, SO: 2 },
    { G: 1, SV: 10, SA: 9 },
  ]) {
    assert.equal(
      api.score({ GP: 1, ...fields }, model, options).status,
      "unavailable",
    );
  }
  assert.throws(() => api.score({ GP: 0.5, G: 1 }, model, options), /GP/);
  assert.throws(
    () =>
      api.score({ GP: 1, G: 1 }, { ...model, countModel: "other" }, options),
    /Unknown/,
  );
  const opts = { ...policy, categories: ["G"], goalieMinimum: 2 };
  assert.equal(
    api.actualImpact(
      { GP: 1, G: 2 },
      { raw: { G: 1 }, goalieAppearances: 0 },
      { raw: { G: 1 }, goalieAppearances: 0 },
      opts,
    ).status,
    "unavailable",
  );
  const gopts = { ...policy, categories: ["GAA"], goalieMinimum: 1 };
  const own = { raw: { GA: 0, TOI: 60 }, goalieAppearances: 1 };
  const opp = { raw: { GA: 0, TOI: 60 }, goalieAppearances: 1 };
  assert.equal(
    api.actualImpact(
      { GP: 1, posGroup: "G", GA: 0, TOI: 60 + 1e-9 },
      own,
      opp,
      gopts,
    ).status,
    "rated",
  );
  // Official count anomalies GA+SV!=SA remain accepted: do not impose that identity.
  assert.notEqual(
    api.score(
      { GP: 1, posGroup: "G", W: 0, GA: 3, SV: 29, SA: 31, TOI: 60 },
      api.fitContexts([goalieContext()], fitOptions),
      { ...options, categories: ["W", "GAA", "SVP"] },
    ).status,
    "unavailable",
  );
});

test("zero appearances with recorded activity are unavailable", () => {
  const model = api.fitContexts([context()], fitOptions);
  for (const extra of [{ G: 1 }, { PM: -1 }, { TOI: 1 }, { GS: 1 }])
    assert.equal(
      api.score({ GP: 0, ...extra }, model, options).status,
      "unavailable",
    );
});

test("goalie cache respects minimum and category policies without mutating fitted or mutable models", () => {
  const model = api.fitContexts([goalieContext()], fitOptions);
  const q = { GP: 1, posGroup: "G", W: 1, GA: 1, SV: 29, SA: 30, TOI: 60 };
  const opts = { ...options, categories: ["W", "GAA", "SVP"] };
  const first = JSON.stringify(api.score(q, model, opts));
  api.score(q, model, { ...opts, goalieMinimum: 1 });
  api.score(q, model, { ...opts, categories: ["SVP"] });
  assert.equal(JSON.stringify(api.score(q, model, opts)), first);
  const mutable = JSON.parse(JSON.stringify(model));
  api.score(q, mutable, opts);
  mutable.groups[7].goalies = [];
  assert.equal(api.score(q, mutable, opts).status, "unavailable");
});

test("saved reference hydration validates, detaches and freezes a reusable equivalent model", () => {
  const original = api.fitContexts([goalieContext()], fitOptions);
  const saved = JSON.parse(JSON.stringify(original));
  const hydrated = api.hydrateReference(saved);
  assert.ok(Object.isFrozen(hydrated));
  assert.ok(Object.isFrozen(hydrated.groups[7].goalies));
  const row = { GP: 1, posGroup: "G", W: 1, GA: 2, SV: 28, SA: 30, TOI: 60 };
  const opts = { ...options, categories: ["W", "GAA", "SVP"] };
  const expected = JSON.stringify(api.score(row, original, opts));
  saved.groups[7].goalies = [];
  assert.equal(JSON.stringify(api.score(row, hydrated, opts)), expected);
  assert.equal(JSON.stringify(api.score(row, hydrated, opts)), expected);
  assert.throws(
    () => api.hydrateReference({ ...original, countModel: "other" }),
    /Unknown/,
  );
  const bad = JSON.parse(JSON.stringify(original));
  bad.groups[7].goalies[0].weight = -1;
  assert.throws(() => api.hydrateReference(bad), /goalie context/);
});

test("schedule exposure matches equal hockey opportunity across different calendar durations", () => {
  const c = { ...context(), configuredGameDays: 21, nhlGamesPerTeam: 4.6875 };
  const model = api.fitContexts([c], {
    ...fitOptions,
    contextModel: "schedule-kernel",
    exposureBandwidth: 0.3,
  });
  const row = { GP: 1, posGroup: "F", G: 1 };
  const target = { ...options, weekDays: 28, nhlGamesPerTeam: 4.6875 };
  const score = api.score(row, model, target);
  assert.equal(score.ifStarted, 0.25);
  assert.equal(score.context.targetNhlGamesPerTeam, 4.6875);
  assert.equal(score.context.sourceSideWeeks, 2);
  assert.equal(score.context.effectiveSourceSideWeeks, 2);
  assert.equal(score.context.extrapolated, false);
  assert.equal(
    api.score({ ...row, posGroup: "D" }, model, target).ifStarted,
    score.ifStarted,
  );
  assert.equal(
    api.score(row, model, { ...target, weekDays: 6 }).ifStarted,
    score.ifStarted,
  );
});

test("schedule kernel pools exact margin atoms with independently calculated Gaussian weights", () => {
  const a = { ...context("a"), nhlGamesPerTeam: 1 };
  const b = { ...context("b"), nhlGamesPerTeam: 2 };
  b.home.raw.G = 0;
  b.away.raw.G = 0;
  b.home.appearances = [appearance("skater", { G: 0 })];
  b.away.appearances = [appearance("skater", { G: 0 })];
  const model = api.fitContexts([a, b], {
    ...fitOptions,
    contextModel: "schedule-kernel",
    exposureBandwidth: 1,
  });
  const score = api.score({ GP: 1, G: 1 }, model, {
    ...options,
    nhlGamesPerTeam: 1,
  });
  const k = Math.exp(-0.5 * Math.log(2) ** 2);
  assert.ok(Math.abs(score.ifStarted - (0.25 + 0.5 * k) / (1 + k)) < 1e-14);
  assert.equal(score.support.G, 2 + 2 * k);
  assert.ok(
    Math.abs(
      score.context.effectiveSourceSideWeeks -
        (2 + 2 * k) ** 2 / (2 + 2 * k * k),
    ) < 1e-14,
  );
  const narrow = api.fitContexts([a, b], {
    ...fitOptions,
    contextModel: "schedule-kernel",
    exposureBandwidth: 1e-300,
  });
  assert.equal(
    api.score({ GP: 1, G: 1 }, narrow, { ...options, nhlGamesPerTeam: 1.5 })
      .ifStarted,
    0.5,
  );
});

test("schedule goalie backgrounds retain exact raw tuples and integer minimum semantics", () => {
  const c = {
    ...goalieContext(),
    configuredGameDays: 21,
    nhlGamesPerTeam: 4.6875,
  };
  const regular = api.fitContexts([c], fitOptions);
  const kernel = api.fitContexts([c], {
    ...fitOptions,
    contextModel: "schedule-kernel",
    exposureBandwidth: 0.15,
  });
  const row = { GP: 1, posGroup: "G", W: 1, GA: 0, SV: 20, SA: 20, TOI: 30 };
  const opts = { ...options, categories: ["W", "GAA", "SVP"] };
  const expected = api.score(row, regular, { ...opts, weekDays: 21 });
  const actual = api.score(row, kernel, {
    ...opts,
    weekDays: 28,
    nhlGamesPerTeam: 4.6875,
  });
  assert.equal(actual.ifStarted, expected.ifStarted);
  assert.equal(
    JSON.stringify(actual.categoryContributions),
    JSON.stringify(expected.categoryContributions),
  );
  assert.equal(
    JSON.stringify(actual.qualificationContributions),
    JSON.stringify(expected.qualificationContributions),
  );
  const hydrated = api.hydrateReference(JSON.parse(JSON.stringify(kernel)));
  assert.equal(
    JSON.stringify(
      api.score(row, hydrated, {
        ...opts,
        weekDays: 28,
        nhlGamesPerTeam: 4.6875,
      }),
    ),
    JSON.stringify(actual),
  );
});

test("schedule exposure never falls back silently or consumes future reference outcomes", () => {
  const opts = {
    ...fitOptions,
    contextModel: "schedule-kernel",
    exposureBandwidth: 0.3,
  };
  assert.throws(
    () => api.fitContexts([context()], opts),
    /historical NHL schedule exposure/,
  );
  assert.throws(
    () => api.fitContexts([], { ...opts, exposureBandwidth: 0 }),
    /bandwidth/,
  );
  assert.throws(
    () => api.fitContexts([], { ...opts, maxGoalieContexts: 512 }),
    /uncapped/,
  );
  const c = { ...context(), nhlGamesPerTeam: 3 };
  const model = api.fitContexts([c], opts);
  assert.equal(
    api.score({ GP: 1, G: 1 }, model, options).status,
    "unavailable",
  );
  assert.equal(
    api.score({ GP: 1, G: 1 }, model, { ...options, nhlGamesPerTeam: 0 })
      .status,
    "unavailable",
  );
  const future = { ...c, endDate: fitOptions.trainedBefore };
  const empty = api.fitContexts([future], opts);
  assert.equal(empty.provenance.matchups, 0);
  assert.equal(
    api.score({ GP: 1, G: 1 }, empty, { ...options, nhlGamesPerTeam: 3 })
      .status,
    "unavailable",
  );
  assert.equal(
    api.score({ GP: 1, G: 1 }, model, { ...options, nhlGamesPerTeam: 4 })
      .context.extrapolated,
    true,
  );
});

test("bounded exposure cache recomputes evicted goalie backgrounds exactly", () => {
  const c = { ...goalieContext(), nhlGamesPerTeam: 3 };
  const model = api.fitContexts([c], {
    ...fitOptions,
    contextModel: "schedule-kernel",
    exposureBandwidth: 0.3,
  });
  const row = { GP: 1, posGroup: "G", W: 1, GA: 1, SV: 29, SA: 30, TOI: 60 };
  const opts = {
    ...options,
    categories: ["W", "GAA", "SVP"],
    nhlGamesPerTeam: 3,
  };
  const before = JSON.stringify(api.score(row, model, opts));
  for (let i = 0; i < 10; i++)
    api.score(row, model, { ...opts, nhlGamesPerTeam: 4 + i / 10 });
  assert.equal(JSON.stringify(api.score(row, model, opts)), before);
});
