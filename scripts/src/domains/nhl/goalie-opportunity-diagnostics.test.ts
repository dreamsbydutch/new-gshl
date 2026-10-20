import assert from "node:assert/strict";
import test from "node:test";
import { buildGameValueData, type VerifiedShot } from "./game-value-input";
import { gameFixture } from "./game-value-fixtures";
import { extractGoalieOpportunitySequences } from "./goalie-opportunity-diagnostics";
type Spec = {
  kind: string;
  second?: number;
  team?: number;
  period?: number;
  reason?: string;
  goalie?: number;
  badClock?: boolean;
  shootout?: boolean;
  shooter?: number;
  blocker?: number;
};
function fixture(specs: Spec[]) {
  const f = gameFixture(),
    game = buildGameValueData(f.sources, f.shots),
    template = game.shots.find((s) => s.kind === "SHOT")!;
  const pbp = {
    id: game.gameId,
    plays: specs.map((s, i) => ({
      eventId: i + 1,
      sortOrder: i + 1,
      periodDescriptor: {
        number: s.period ?? 1,
        periodType: s.shootout ? "SO" : "REG",
      },
      timeInPeriod: s.badClock
        ? undefined
        : `00:${String(s.second ?? 10).padStart(2, "0")}`,
      typeDescKey: s.kind,
      situationCode: "1551",
      details: {
        eventOwnerTeamId: s.team,
        reason: s.reason,
        goalieInNetId: s.goalie,
        shootingPlayerId: s.shooter ?? 1,
        blockingPlayerId:
          s.blocker ?? (s.kind === "blocked-shot" ? 11 : undefined),
      },
    })),
  };
  game.shots = specs.flatMap((s, i) =>
    ["shot-on-goal", "missed-shot", "goal"].includes(s.kind)
      ? [
          {
            ...template,
            eventId: i + 1,
            period: s.period ?? 1,
            second: s.second ?? 10,
            home: s.team !== 2,
            kind:
              s.kind === "shot-on-goal"
                ? "SHOT"
                : s.kind === "goal"
                  ? "GOAL"
                  : "MISS",
            goalie: s.goalie ?? 16,
          } satisfies VerifiedShot,
        ]
      : [],
  );
  return { game, pbp };
}
test("exclusive initial-save chains include descriptive misses/blocks and absorb continuation saves once", () => {
  const f = fixture([
    { kind: "shot-on-goal", team: 1 },
    { kind: "missed-shot", team: 1, second: 11 },
    { kind: "blocked-shot", team: 1, second: 12 },
    { kind: "shot-on-goal", team: 1, second: 13 },
  ]);
  const copy = structuredClone(f);
  const result = extractGoalieOpportunitySequences(f.game, f.pbp);
  assert.deepEqual(f, copy);
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.absorbedContinuationSaves, 1);
  assert.equal(result.opportunities[0]!.attempts.length, 3);
  assert.equal(result.opportunities[0]!.attempts[1]!.xg, null);
  assert.equal(result.opportunities[0]!.termination, "source-end-censored");
  assert.equal(result.opportunities[0]!.freezeEvidence, "none");
});
test("misses, blocks and goals never manufacture initial goalie saves", () => {
  const f = fixture([
    { kind: "missed-shot", team: 1 },
    { kind: "blocked-shot", team: 1, second: 11 },
    { kind: "goal", team: 1, second: 12 },
  ]);
  assert.equal(
    extractGoalieOpportunitySequences(f.game, f.pbp).opportunities.length,
    0,
  );
});
test("explicit goalie stoppages are proxies, while no event or a generic freeze never proves individual credit", () => {
  for (const [reason, evidence] of [
    ["goalie-stopped-after-sog", "goalie-stoppage-proxy"],
    ["puck-frozen", "puck-frozen-unspecified"],
    ["icing", "none"],
  ]) {
    const f = fixture([
      { kind: "shot-on-goal", team: 1 },
      { kind: "stoppage", second: 10, reason },
    ]);
    const row = extractGoalieOpportunitySequences(f.game, f.pbp)
      .opportunities[0]!;
    assert.equal(row.freezeEvidence, evidence);
    assert.equal(row.attributableFreeze, false);
  }
  const noEvent = fixture([{ kind: "shot-on-goal", team: 1 }]);
  assert.equal(
    extractGoalieOpportunitySequences(noEvent.game, noEvent.pbp)
      .opportunities[0]!.freezeEvidence,
    "none",
  );
});
test("opponent actions, faceoffs, period changes and elapsed windows prevent continuation bridging", () => {
  for (const [next, termination] of [
    [{ kind: "hit", team: 2, second: 11 }, "opponent-event"],
    [{ kind: "faceoff", team: 1, second: 10 }, "faceoff"],
    [{ kind: "missed-shot", team: 1, second: 1, period: 2 }, "period-boundary"],
    [
      { kind: "missed-shot", team: 1, second: 14 },
      "three-second-window-expired",
    ],
  ] as const) {
    const f = fixture([{ kind: "shot-on-goal", team: 1 }, next]);
    const row = extractGoalieOpportunitySequences(f.game, f.pbp)
      .opportunities[0]!;
    assert.equal(row.termination, termination);
    assert.equal(row.attempts.length, 0);
  }
});
test("unknown clocks/teams and duplicate event order are explicit, not silently crossed", () => {
  for (const [next, termination] of [
    [{ kind: "hit", badClock: true, team: 1 }, "unknown-or-regressing-clock"],
    [{ kind: "hit", second: 11 }, "unknown-event-team"],
  ] as const) {
    const f = fixture([
      { kind: "shot-on-goal", team: 1 },
      next,
      { kind: "missed-shot", team: 1, second: 12 },
    ]);
    assert.equal(
      extractGoalieOpportunitySequences(f.game, f.pbp).opportunities[0]!
        .termination,
      termination,
    );
  }
  const f = fixture([
    { kind: "shot-on-goal", team: 1 },
    { kind: "stoppage", reason: "goalie-stopped-after-sog" },
  ]);
  f.pbp.plays[1]!.sortOrder = 1;
  const result = extractGoalieOpportunitySequences(f.game, f.pbp);
  assert.equal(result.opportunities.length, 0);
  assert.ok(
    result.issues.includes("invalid-or-duplicate-event-identity/order"),
  );
});
test("goalie changes censor the old chain and do not transfer it to another goalie", () => {
  const f = fixture([
    { kind: "shot-on-goal", team: 1 },
    { kind: "shot-on-goal", team: 1, second: 11, goalie: 17 },
  ]);
  f.game.players.push({ ...f.game.players.find((p) => p.id === 16)!, id: 17 });
  const result = extractGoalieOpportunitySequences(f.game, f.pbp);
  assert.equal(
    result.opportunities[0]!.termination,
    "goalie-change-or-conflict",
  );
  assert.equal(result.opportunities[0]!.attempts.length, 0);
  assert.equal(result.opportunities[1]!.goalieId, 17);
});
test("penalty shots, shootouts, empty nets and unverified active goalie exposure do not anchor", () => {
  for (const mode of [
    "penalty-shot",
    "shootout",
    "empty-net",
    "individual-only",
  ]) {
    const f = fixture([{ kind: "shot-on-goal", team: 1 }]);
    if (mode === "penalty-shot") f.game.shots[0]!.attribution = "penalty-shot";
    if (mode === "shootout") f.pbp.plays[0]!.periodDescriptor.periodType = "SO";
    if (mode === "empty-net") f.game.shots[0]!.goalie = 0;
    if (mode === "individual-only")
      f.game.shots[0]!.attribution = "individual-only";
    assert.equal(
      extractGoalieOpportunitySequences(f.game, f.pbp).opportunities.length,
      0,
    );
  }
});

test("block continuation attack ownership comes from opposing rostered actors, with same-team actors withheld", () => {
  const f = fixture([
    { kind: "shot-on-goal", team: 1 },
    { kind: "blocked-shot", team: 2, second: 11, shooter: 1, blocker: 11 },
  ]);
  const result = extractGoalieOpportunitySequences(f.game, f.pbp);
  assert.equal(result.opportunities[0]!.attempts.length, 1);
  assert.equal(result.blockedShotActorEvidence["owner-is-blocking-team"], 1);
  f.pbp.plays[1]!.details.blockingPlayerId = 2;
  const ambiguous = extractGoalieOpportunitySequences(f.game, f.pbp);
  assert.equal(ambiguous.opportunities[0]!.attempts.length, 0);
  assert.equal(
    ambiguous.blockedShotActorEvidence["same-team-actors-ambiguous"],
    1,
  );
});

test("map membership alone never verifies a continuation save or supports a goalie-stoppage proxy", () => {
  for (const mode of [
    "penalty-shot",
    "individual-only",
    "wrong-clock",
    "wrong-situation",
    "wrong-team",
  ]) {
    const f = fixture([
      { kind: "shot-on-goal", team: 1 },
      { kind: "shot-on-goal", team: 1, second: 11 },
      { kind: "stoppage", second: 11, reason: "goalie-stopped-after-sog" },
    ]);
    const shot = f.game.shots[1]!;
    if (mode === "penalty-shot") shot.attribution = "penalty-shot";
    if (mode === "individual-only") shot.attribution = "individual-only";
    if (mode === "wrong-clock") shot.second = 12;
    if (mode === "wrong-situation") shot.situation = "5v5:GE";
    if (mode === "wrong-team") shot.home = false;
    const row = extractGoalieOpportunitySequences(f.game, f.pbp)
      .opportunities[0]!;
    assert.equal(row.attempts[0]!.verified, false, mode);
    assert.equal(row.attempts[0]!.xg, null, mode);
    assert.equal(row.freezeEvidence, "none", mode);
  }
});
