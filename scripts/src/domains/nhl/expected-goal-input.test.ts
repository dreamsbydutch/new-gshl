import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExpectedGoalInput,
  parseExpectedGoalRows,
  VALUE_SITUATIONS,
} from "./expected-goal-input";
import type { NhlRatingSource, NhlStatRow } from "./season-rating-input";

function fixture() {
  const identity = { playerId: 1, seasonId: 20242025 };
  const source: NhlRatingSource = {
    season: 20242025,
    gameType: 2,
    profile: "core",
    fetchedAt: "2026-09-30T00:00:00Z",
    edge: {},
    warnings: [],
    skaters: {
      summary: [
        {
          ...identity,
          skaterFullName: "NHL name",
          positionCode: "D",
          teamAbbrevs: "TOR,FLA",
          gamesPlayed: 80,
        },
      ],
      timeonice: [{ ...identity, timeOnIce: 60000 }],
      scoringRates: [{ ...identity, netMinorPenaltiesPer60: -0.192 }],
      goalsForAgainst: [],
      powerplay: [],
      penaltykill: [],
    },
    goalies: [
      {
        playerId: 2,
        seasonId: 20242025,
        goalieFullName: "Goalie",
        teamAbbrevs: "TOR",
        gamesPlayed: 40,
        timeOnIce: 120000,
        shotsAgainst: 1000,
      },
    ],
  };
  const skater: Record<string, string | number>[] = [
    "all",
    ...VALUE_SITUATIONS,
  ].map((situation) => ({
    playerId: 1,
    season: 2024,
    name: "Different provider name",
    position: "D",
    situation,
    games_played: 80,
    icetime: situation === "all" ? 60000 : situation === "5on5" ? 54000 : 3000,
    timeOnBench: 120000,
    OnIce_F_flurryScoreVenueAdjustedxGoals: 10,
    OnIce_A_flurryScoreVenueAdjustedxGoals: 9,
    OnIce_F_xGoals: 11,
    OnIce_A_xGoals: 10,
    OffIce_F_xGoals: 20,
    OffIce_A_xGoals: 20,
    I_F_goals: 1,
    I_F_xGoals: 1.5,
  }));
  const goalies = [
    {
      playerId: 2,
      season: 2024,
      name: "Goalie",
      position: "G",
      situation: "all",
      games_played: 40,
      icetime: 120000,
      xGoals: 110,
      goals: 100,
      ongoal: 1000,
    },
  ];
  const penalties: NhlStatRow[] = [
    {
      ...identity,
      gamesPlayed: 80,
      penaltiesDrawn: 12,
      penalties: 8,
      netPenalties: 4,
    },
  ];
  return { source, skater, goalies, penalties };
}
function csv(rows: Record<string, string | number>[]) {
  const headers = Object.keys(rows[0]!);
  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((key) => String(row[key] ?? "")).join(","),
    ),
  ].join("\n");
}
const build = (f: ReturnType<typeof fixture>) =>
  buildExpectedGoalInput(f.source, csv(f.skater), csv(f.goalies), f.penalties);

test("joins NHL identities, converts seconds once, and derives penalty sign from explicit counts", () => {
  const input = build(fixture());
  const p = input.players[0]!;
  assert.equal(p.player.name, "NHL name");
  assert.equal(p.player.team, "TOR,FLA");
  assert.equal(p.modeledMinutes, 1000);
  assert.equal(p.netPenalties, 4); // Never use the conflicting -0.192 scoring-rate field.
  assert.deepEqual(p.missing, []);
  assert.equal(input.players[1]!.goalie!.expected, 110);
});

test("small partial coverage is flagged without extrapolation; substantial stale coverage cannot rank", () => {
  const f = fixture();
  f.skater[0]!.games_played = 79;
  f.skater[0]!.icetime = 59400;
  f.skater.find((r) => r.situation === "5on5")!.icetime = 53400;
  let p = build(f).players[0]!;
  assert.equal(p.sourceMinutes, 990);
  assert.equal(p.warnings.length, 1);
  assert.deepEqual(p.missing, []);
  f.skater[0]!.games_played = 70;
  f.skater[0]!.icetime = 50000;
  p = build(f).players[0]!;
  assert.ok(p.missing.includes("NHL/MoneyPuck games or TOI disagreement"));
});

test("missing situation/penalties stay missing; a genuine zero-minute row is supported", () => {
  const f = fixture();
  f.skater = f.skater.filter((r) => r.situation !== "4on5");
  assert.ok(build(f).players[0]!.missing.includes("4on5 coverage"));
  f.penalties = [];
  assert.ok(
    build(f).players[0]!.missing.includes("NHL explicit penalty counts"),
  );
  const z = fixture();
  const row = z.skater.find((r) => r.situation === "4on5")!;
  for (const k of [
    "icetime",
    "OnIce_F_flurryScoreVenueAdjustedxGoals",
    "OnIce_A_flurryScoreVenueAdjustedxGoals",
    "OnIce_F_xGoals",
    "OnIce_A_xGoals",
    "I_F_goals",
    "I_F_xGoals",
  ])
    row[k] = 0;
  assert.deepEqual(build(z).players[0]!.missing, []);
});

test("rejects mixed seasons, duplicate traded identities, malformed numbers and missing xG", () => {
  const f = fixture();
  assert.throws(
    () =>
      parseExpectedGoalRows(csv([...f.skater, f.skater[0]!]), 20242025, false),
    /Duplicate/,
  );
  assert.throws(
    () => parseExpectedGoalRows(csv(f.skater), 20232024, false),
    /season mismatch/,
  );
  f.skater[1]!.OnIce_F_xGoals = "";
  assert.throws(() => build(f), /Invalid MoneyPuck/);
});
