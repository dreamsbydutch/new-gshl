import assert from "node:assert/strict";
import { test } from "node:test";
import {
  rankConditionalNhlRosterTalent,
  NHL_TALENT_LINEUP_USAGE,
} from "./nhl-conditional-roster-talent";

function roster() {
  return (["F", "D", "G"] as const).flatMap((position, role) =>
    Array.from(
      { length: position === "F" ? 14 : position === "D" ? 8 : 2 },
      (_, i) => ({
        id: `${position}${i}`,
        nhlPlayerId: role * 100 + i + 1,
        playerName: `${position}${i}`,
        position,
        ratePer60: 1,
        status: "qualified" as const,
      }),
    ),
  );
}

void test("NHL roster players keep slots and ice shares before higher-rated organizational depth", () => {
  const players = roster().map((p) => ({
    ...p,
    membership: "nhl-roster" as const,
  }));
  const unknown = {
    ...players[0]!,
    ratePer60: null,
    status: "unavailable" as const,
  };
  const depth = {
    ...players[0]!,
    id: "depth",
    nhlPlayerId: 999,
    membership: "organization" as const,
    ratePer60: 10,
  };
  const team = rankConditionalNhlRosterTalent([
    {
      id: "t",
      name: "T",
      abbr: "T",
      selectionPolicy: "nhl-first",
      roster: [unknown, ...players.slice(1), depth],
    },
  ])[0]!;
  assert.ok(team.slotsComplete);
  assert.ok(!team.complete);
  assert.equal(team.rank, null);
  assert.equal(team.selected.length, 24);
  assert.ok(team.selected.some((p) => p.id === unknown.id && p.gar === null));
  assert.ok(team.outsideDepth.some((p) => p.id === depth.id));
  assert.equal(team.unmodeled[0]!.id, unknown.id);
  const missing = team.selected.find((p) => p.id === unknown.id)!;
  assert.ok(missing.minutesPerTeamGame > 0);
  assert.ok(
    Math.abs(
      team.modeledGar! - (492 - (missing.minutesPerTeamGame * 82) / 60),
    ) < 1e-10,
  );
  const promoted = rankConditionalNhlRosterTalent([
    {
      id: "t",
      name: "T",
      abbr: "T",
      selectionPolicy: "nhl-first",
      roster: [...players.slice(1), depth],
    },
  ])[0]!;
  assert.equal(promoted.groups[0]!.roster.at(-1)!.id, depth.id);
  assert.ok(promoted.complete);
  const unknownTeam = rankConditionalNhlRosterTalent([
    {
      id: "t",
      name: "T",
      abbr: "T",
      selectionPolicy: "nhl-first",
      roster: players.map((p) => ({
        ...p,
        ratePer60: null,
        status: "unavailable",
      })),
    },
  ])[0]!;
  assert.equal(unknownTeam.selected.length, 24);
  assert.ok(unknownTeam.slotsComplete);
  assert.equal(unknownTeam.modeledGar, null);
  assert.equal(unknownTeam.gar, null);
});
void test("incomplete lineups cannot rank above complete negative lineups or break competition ties", () => {
  const team = (id: string, offset: number, partial = false) => ({
    id,
    name: id,
    abbr: id,
    roster: roster()
      .filter((p) => !partial || p.id !== "D7")
      .map((p) => ({
        ...p,
        id: `${id}-${p.id}`,
        nhlPlayerId: p.nhlPlayerId + offset,
        ratePer60: partial ? 100 : -1,
      })),
  });
  const input = [
    team("Z partial", 1000, true),
    team("B full", 2000),
    team("A full", 3000),
    team("A partial", 4000, true),
  ];
  const result = rankConditionalNhlRosterTalent(input);
  assert.deepEqual(
    result.map((t) => [t.id, t.rank]),
    [
      ["A full", 1],
      ["B full", 1],
      ["A partial", null],
      ["Z partial", null],
    ],
  );
  assert.ok(result[2]!.knownSubtotal > result[0]!.knownSubtotal);
  assert.deepEqual(
    rankConditionalNhlRosterTalent([...input].reverse()),
    result,
  );
});
void test("conditional team talent respects one shared regulation ice budget and a goalie split", () => {
  const input = [{ id: "team", name: "Team", abbr: "T", roster: roster() }];
  const copy = structuredClone(input);
  const team = rankConditionalNhlRosterTalent(input)[0]!;
  assert.ok(team.complete);
  assert.ok(Math.abs(team.modeledGar! - 492) < 1e-10); // 360 minutes * 82 / 60.
  assert.ok(Math.abs(team.groups[2]!.total - 82) < 1e-10);
  assert.deepEqual(
    team.groups[2]!.roster.map((p) => p.minutesPerTeamGame),
    [39, 21],
  );
  assert.deepEqual(input, copy);
});
void test("a missing slot stays missing without reallocating its ice time or dropping negative GAR", () => {
  const players = roster();
  const full = rankConditionalNhlRosterTalent([
    { id: "full", name: "Full", abbr: "F", roster: players },
  ])[0]!;
  const partial = rankConditionalNhlRosterTalent([
    {
      id: "partial",
      name: "Partial",
      abbr: "P",
      roster: players.filter((p) => p.id !== "D7"),
    },
  ])[0]!;
  assert.ok(!partial.complete);
  assert.ok(partial.modeledGar! < full.modeledGar!);
  const negative = rankConditionalNhlRosterTalent([
    {
      id: "negative",
      name: "Negative",
      abbr: "N",
      roster: players.map((p) => ({ ...p, ratePer60: -1 })),
    },
  ])[0]!;
  assert.ok(Math.abs(negative.modeledGar! + 492) < 1e-10);
});

function projectedRoster() {
  return roster().map((player, index) => ({
    ...player,
    membership: "nhl-roster" as const,
    projectedMinutesPerAppearance:
      player.position === "G" ? (index % 2 ? 20 : 60) : 25 - (index % 14),
    projectedGoalieRoleWeight: player.position === "G" ? 1 : null,
  }));
}

void test("projected allocation preserves selection, reserve budgets and360minutes without changing equal rates", () => {
  const input = [
    { id: "team", name: "Team", abbr: "T", roster: projectedRoster() },
  ];
  const original = structuredClone(input);
  const standard = rankConditionalNhlRosterTalent(input)[0]!;
  const team = rankConditionalNhlRosterTalent(input, "projected")[0]!;
  assert.equal(standard.allocationBasis, "standard");
  assert.equal(team.allocationBasis, "projected");
  assert.equal(team.usageComplete, true);
  assert.deepEqual(team.usageIssues, []);
  assert.equal(team.rank, 1);
  assert.deepEqual(
    team.selected.map((p) => p.id),
    standard.selected.map((p) => p.id),
  );
  assert.deepEqual(input, original);
  for (const group of team.groups) {
    const budget = NHL_TALENT_LINEUP_USAGE[group.position].minutes;
    assert.ok(
      Math.abs(
        group.roster.reduce((n, p) => n + p.minutesPerTeamGame, 0) - budget,
      ) < 1e-10,
    );
    if (group.position === "G") continue;
    const primaryCount = group.position === "F" ? 12 : 6;
    const policy = NHL_TALENT_LINEUP_USAGE[group.position];
    const denominator = policy.weights.reduce(
      (n: number, w: number) => n + w,
      0,
    );
    const byUsage = [...group.roster].sort(
      (a, b) =>
        b.projectedMinutesPerAppearance! - a.projectedMinutesPerAppearance! ||
        a.nhlPlayerId! - b.nhlPlayerId!,
    );
    for (const p of byUsage.slice(primaryCount))
      assert.ok(
        Math.abs(p.minutesPerTeamGame - (budget * 2) / denominator) < 1e-10,
      );
    const first = byUsage[0]!,
      second = byUsage[1]!;
    assert.equal(first.ratePer60, second.ratePer60);
    assert.notEqual(first.gar, second.gar);
    assert.ok(
      Math.abs(
        first.minutesPerTeamGame / second.minutesPerTeamGame -
          first.projectedMinutesPerAppearance! /
            second.projectedMinutesPerAppearance!,
      ) < 1e-10,
    );
  }
  assert.ok(Math.abs(team.knownSubtotal - 492) < 1e-10);
  assert.deepEqual(
    team.groups[2]!.roster.map((p) => p.minutesPerTeamGame),
    [30, 30],
  );
  assert.deepEqual(
    rankConditionalNhlRosterTalent(
      [{ ...input[0]!, roster: [...input[0]!.roster].reverse() }],
      "projected",
    ),
    [team],
  );
});

void test("goalie deployment follows role evidence independently of ability rank", () => {
  const players = projectedRoster().map((p) => ({
    ...p,
    ratePer60: p.id === "G0" ? 2 : 1,
    projectedGoalieRoleWeight: p.id === "G0" ? 0.4 : p.id === "G1" ? 0.6 : null,
  }));
  const input = [{ id: "t", name: "T", abbr: "T", roster: players }];
  const copy = structuredClone(input);
  const team = rankConditionalNhlRosterTalent(input, "projected")[0]!;
  const goalies = team.groups.find((g) => g.position === "G")!.roster;
  assert.deepEqual(
    goalies.map((p) => p.minutesPerTeamGame),
    [24, 36],
  );
  assert.ok(goalies.every((p) => p.allocationBasis === "projected"));
  assert.equal(
    goalies.reduce((sum, p) => sum + p.minutesPerTeamGame, 0),
    60,
  );
  assert.deepEqual(input, copy);
  const missing = structuredClone(input);
  missing[0]!.roster.find((p) => p.id === "G0")!.projectedGoalieRoleWeight =
    null;
  const fallback = rankConditionalNhlRosterTalent(missing, "projected")[0]!;
  assert.equal(fallback.usageComplete, false);
  assert.equal(fallback.rank, null);
  assert.ok(
    fallback.groups
      .find((g) => g.position === "G")!
      .roster.every((p) => p.allocationBasis === "standard-fallback"),
  );
});

void test("projected primary roles use minutes rather than rate while preserving NHL membership priority", () => {
  const players = projectedRoster().map((p) => ({
    ...p,
    ratePer60: p.id === "F0" ? 10 : 1,
    projectedMinutesPerAppearance:
      p.id === "F0" ? 1 : p.projectedMinutesPerAppearance,
  }));
  const depth = {
    ...players.find((p) => p.id === "F13")!,
    membership: "organization" as const,
    projectedMinutesPerAppearance: 65,
  };
  const input = {
    id: "t",
    name: "Team",
    abbr: "T",
    selectionPolicy: "nhl-first" as const,
    roster: players.map((p) => (p.id === depth.id ? depth : p)),
  };
  const team = rankConditionalNhlRosterTalent([input], "projected")[0]!;
  assert.equal(team.groups[0]!.roster[0]!.id, "F0"); // Display remains GAR order.
  const reserveShare =
    (180 * 2) / NHL_TALENT_LINEUP_USAGE.F.weights.reduce((n, w) => n + w, 0);
  assert.ok(
    Math.abs(
      team.selected.find((p) => p.id === "F0")!.minutesPerTeamGame -
        reserveShare,
    ) < 1e-10,
  );
  assert.ok(
    Math.abs(
      team.selected.find((p) => p.id === depth.id)!.minutesPerTeamGame -
        reserveShare,
    ) < 1e-10,
  );
  assert.equal(
    team.selected.find((p) => p.id === depth.id)!.membership,
    "organization",
  );
  assert.ok(
    team.selected.find((p) => p.id === "F12")!.minutesPerTeamGame >
      reserveShare,
  );
});

void test("unknown primary usage holds its own share and slot while known forwards remain projected", () => {
  const players = projectedRoster().map((p) => ({
    ...p,
    projectedMinutesPerAppearance:
      p.id === "F0" ? null : p.projectedMinutesPerAppearance,
  }));
  const input = [{ id: "t", name: "T", abbr: "T", roster: players }];
  const standard = rankConditionalNhlRosterTalent(input)[0]!;
  const projected = rankConditionalNhlRosterTalent(input, "projected")[0]!;
  assert.equal(projected.allocationBasis, "partial-projected");
  assert.equal(projected.usageComplete, false);
  assert.equal(projected.complete, false);
  assert.equal(projected.provisional, true);
  assert.equal(projected.gar, null);
  assert.equal(projected.rank, null);
  assert.ok(Math.abs(projected.modeledGar! - standard.modeledGar!) < 1e-10);
  const held = projected.selected.find((p) => p.id === "F0")!;
  assert.equal(
    held.minutesPerTeamGame,
    standard.selected.find((p) => p.id === "F0")!.minutesPerTeamGame,
  );
  assert.equal(held.allocationBasis, "standard-fallback");
  const known = projected.groups[0]!.roster.filter((p) => p.id !== "F0");
  assert.ok(known.every((p) => p.allocationBasis === "projected"));
  const reserveShare = (180 * 2) / 184;
  assert.equal(
    known.filter((p) => p.minutesPerTeamGame === reserveShare).length,
    2,
  );
  assert.equal(projected.groups[0]!.allocationBasis, "partial-projected");
  assert.equal(projected.groups[0]!.usageComplete, false);
  assert.equal(projected.groups[1]!.allocationBasis, "projected");
  assert.equal(projected.groups[1]!.usageComplete, true);
  assert.ok(projected.usageIssues.some((reason) => reason.includes("F0")));
  const partial = rankConditionalNhlRosterTalent(
    [{ ...input[0]!, roster: projectedRoster().filter((p) => p.id !== "D7") }],
    "projected",
  )[0]!;
  assert.equal(partial.allocationBasis, "partial-projected");
  assert.equal(partial.usageComplete, false);
  assert.equal(partial.rank, null);
  assert.ok(partial.usageIssues.some((reason) => reason.includes("8 defense")));
});

void test("missing defense usage preserves forward projections and explicit group metadata", () => {
  const players = projectedRoster().map((p) => ({
    ...p,
    projectedMinutesPerAppearance:
      p.id === "D0" ? null : p.projectedMinutesPerAppearance,
  }));
  const input = [{ id: "t", name: "T", abbr: "T", roster: players }];
  const complete = rankConditionalNhlRosterTalent(
    [{ ...input[0]!, roster: projectedRoster() }],
    "projected",
  )[0]!;
  const standard = rankConditionalNhlRosterTalent(input)[0]!;
  const partial = rankConditionalNhlRosterTalent(input, "projected")[0]!;
  assert.equal(partial.allocationBasis, "partial-projected");
  assert.equal(partial.usageComplete, false);
  assert.equal(partial.complete, false);
  assert.equal(partial.gar, null);
  assert.equal(partial.rank, null);
  assert.deepEqual(
    partial.groups.map((g) => [g.allocationBasis, g.usageComplete]),
    [
      ["projected", true],
      ["partial-projected", false],
      ["projected", true],
    ],
  );
  assert.deepEqual(partial.groups[0]!.roster, complete.groups[0]!.roster);
  assert.equal(
    partial.selected.find((p) => p.id === "D0")!.minutesPerTeamGame,
    standard.selected.find((p) => p.id === "D0")!.minutesPerTeamGame,
  );
  assert.ok(
    partial.groups[1]!.roster.filter((p) => p.id !== "D0").every(
      (p) => p.allocationBasis === "projected",
    ),
  );
  assert.notDeepEqual(
    partial.groups[0]!.roster.map((p) => p.minutesPerTeamGame),
    standard.groups[0]!.roster.map((p) => p.minutesPerTeamGame),
  );
  for (const group of partial.groups)
    assert.ok(
      Math.abs(
        group.roster.reduce((n, p) => n + p.minutesPerTeamGame, 0) -
          NHL_TALENT_LINEUP_USAGE[group.position].minutes,
      ) < 1e-10,
    );
  const noSkaterUsage = rankConditionalNhlRosterTalent(
    [
      {
        ...input[0]!,
        roster: projectedRoster().map((p) => ({
          ...p,
          projectedMinutesPerAppearance: null,
          projectedGoalieRoleWeight: null,
        })),
      },
    ],
    "projected",
  )[0]!;
  assert.equal(noSkaterUsage.allocationBasis, "standard-fallback");
  assert.equal(noSkaterUsage.usageComplete, false);
  assert.equal(noSkaterUsage.rank, null);
  assert.deepEqual(
    noSkaterUsage.selected.map((p) => p.minutesPerTeamGame),
    standard.selected.map((p) => p.minutesPerTeamGame),
  );
  assert.equal(complete.allocationBasis, "projected");
  assert.equal(complete.usageComplete, true);
  assert.equal(complete.rank, 1);
  const unknownRating = rankConditionalNhlRosterTalent(
    [
      {
        ...input[0]!,
        selectionPolicy: "nhl-first",
        roster: projectedRoster().map((p) =>
          p.id === "F0"
            ? { ...p, ratePer60: null, status: "unavailable" as const }
            : p,
        ),
      },
    ],
    "projected",
  )[0]!;
  assert.equal(unknownRating.usageComplete, true);
  assert.equal(unknownRating.allocationBasis, "projected");
  assert.equal(unknownRating.selected.find((p) => p.id === "F0")!.gar, null);
  assert.equal(unknownRating.gar, null);
  assert.equal(unknownRating.rank, null);
});

void test("projected allocation keeps signed values and validates supplied usage including goalies", () => {
  const players = projectedRoster().map((p) => ({
    ...p,
    ratePer60: -1,
    projectedMinutesPerAppearance:
      p.position === "G" ? null : p.projectedMinutesPerAppearance,
  }));
  const negative = rankConditionalNhlRosterTalent(
    [{ id: "t", name: "T", abbr: "T", roster: players }],
    "projected",
  )[0]!;
  assert.equal(negative.allocationBasis, "projected");
  assert.ok(negative.complete);
  assert.equal(negative.rank, 1);
  assert.ok(Math.abs(negative.gar! + 492) < 1e-10);
  for (const value of [0, -1, NaN, Infinity, 65.01])
    for (const playerId of ["F0", "G0"]) {
      const roster = projectedRoster().map((p) => ({
        ...p,
        projectedMinutesPerAppearance:
          p.id === playerId ? value : p.projectedMinutesPerAppearance,
      }));
      for (const mode of ["standard", "projected"] as const)
        assert.throws(
          () =>
            rankConditionalNhlRosterTalent(
              [{ id: "t", name: "T", abbr: "T", roster }],
              mode,
            ),
          /Invalid projected NHL minutes/,
        );
    }
});

void test("projected regulation allocations reject extreme ratios rather than clipping or inventing minutes", () => {
  const players = projectedRoster().map((player) => ({
    ...player,
    projectedMinutesPerAppearance: player.id === "F0" ? 65 : 0.01,
  }));
  const input = [{ id: "t", name: "T", abbr: "T", roster: players }];
  assert.throws(
    () => rankConditionalNhlRosterTalent(input, "projected"),
    /Invalid NHL regulation-minute allocation/,
  );
  assert.equal(rankConditionalNhlRosterTalent(input)[0]!.complete, true);
});

void test("unknown reserve holds its exact standard share without discarding known primary roles", () => {
  const completeInput = {
    id: "t",
    name: "T",
    abbr: "T",
    roster: projectedRoster(),
  };
  const complete = rankConditionalNhlRosterTalent(
    [completeInput],
    "projected",
  )[0]!;
  const input = {
    ...completeInput,
    roster: projectedRoster().map((p) => ({
      ...p,
      projectedMinutesPerAppearance:
        p.id === "F13" ? null : p.projectedMinutesPerAppearance,
    })),
  };
  const original = structuredClone(input);
  const partial = rankConditionalNhlRosterTalent([input], "projected")[0]!;
  const standard = rankConditionalNhlRosterTalent([input])[0]!;
  const forward = partial.groups[0]!;
  assert.equal(forward.allocationBasis, "partial-projected");
  assert.equal(forward.usageComplete, false);
  assert.equal(partial.rank, null);
  assert.equal(partial.gar, null);
  assert.deepEqual(input, original);
  for (const player of forward.roster) {
    assert.equal(
      player.minutesPerTeamGame,
      complete.selected.find((p) => p.id === player.id)!.minutesPerTeamGame,
    );
    assert.equal(
      player.allocationBasis,
      player.id === "F13" ? "standard-fallback" : "projected",
    );
  }
  assert.equal(
    forward.roster.find((p) => p.id === "F13")!.minutesPerTeamGame,
    standard.selected.find((p) => p.id === "F13")!.minutesPerTeamGame,
  );
  assert.equal(forward.unallocatedMinutesPerTeamGame, 0);
});

void test("absent virtual slots retain standard shares unallocated, including primary slots and goalies", () => {
  for (const removed of [["F13"], ["F11", "F12", "F13"], ["G1"]]) {
    const input = {
      id: "t",
      name: "T",
      abbr: "T",
      roster: projectedRoster().filter((p) => !removed.includes(p.id)),
    };
    const partial = rankConditionalNhlRosterTalent([input], "projected")[0]!;
    assert.equal(partial.usageComplete, false);
    assert.equal(partial.gar, null);
    assert.equal(partial.rank, null);
    for (const group of partial.groups) {
      const policy = NHL_TALENT_LINEUP_USAGE[group.position];
      const denominator = policy.weights.reduce(
        (s: number, w: number) => s + w,
        0,
      );
      const expectedMissing = policy.weights
        .slice(group.roster.length)
        .reduce(
          (s: number, w: number) => s + (policy.minutes * w) / denominator,
          0,
        );
      assert.equal(group.unallocatedMinutesPerTeamGame, expectedMissing);
      assert.ok(
        Math.abs(
          group.roster.reduce((s, p) => s + p.minutesPerTeamGame, 0) +
            expectedMissing -
            policy.minutes,
        ) < 1e-10,
      );
    }
  }
});
