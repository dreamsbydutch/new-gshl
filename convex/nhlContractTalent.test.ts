import assert from "node:assert/strict";
import { test } from "node:test";
import type { Doc } from "./_generated/dataModel";
import {
  projectNhlContractTalentSeason,
  talentPopulationDigest,
} from "./lib/nhlContractTalent";
import { talentSeason } from "./nhlContractAnalytics";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

const object = <T>(value: Record<string, unknown>) => value as T;

const stat = (overrides: Partial<Doc<"playerNhlStatLines">> = {}) =>
  object<Doc<"playerNhlStatLines">>({
    _id: "row",
    seasonId: "season",
    playerId: "player",
    posGroup: "D",
    GP: "56",
    TOI: "1000",
    hockeyRating: {
      sourceId: "source",
      modelVersion: "nhl-hockey-overall-reviewed-v1",
      units: "goals-above-same-position-reference",
      seasonValue: -2,
      rank: 1,
      qualification: "ranked",
      nhlPlayerId: 123,
      sourceGames: 56,
      sourcePosition: "D",
      reasons: [],
    },
    ...overrides,
  });
const source = () =>
  object<Doc<"nhlSeasonValues">>({
    _id: "source",
    playerId: "player",
    seasonId: "season",
    nhlSeason: 20202021,
    nhlPlayerId: 123,
    position: "D",
    games: 56,
    minutes: 1000,
    status: "rated",
    gameType: 2,
    profile: "core",
    modelVersion: "nhl-hockey-overall-reviewed-v1",
    seasonValue: -2,
    hockeyOverall: {
      qualification: "ranked",
      sourceStatus: "rated",
      coverage: { officialMinutes: 1 },
    },
    sourceFetchedAt: 1,
    sourceHash: "a".repeat(64),
  });

void test("complete official population is bound before absence can be inferred; signed reviewed values retain their identity", async () => {
  const rows = [stat()];
  const population = await talentPopulationDigest(rows);
  const result = await projectNhlContractTalentSeason({
    rows,
    sources: new Map([["source", source()]]),
    seasonStartYear: 2020,
    currentSeasonStartYear: 2026,
    reference: {
      teamGames: 56,
      expectedPlayers: 1,
      populationSha256: population.sha256,
      sourceSha256: "b".repeat(64),
    },
  });
  assert.equal(result.populationComplete, true);
  assert.equal(result.observations[0]?.goalsAboveReplacement, -2);
  assert.equal(result.observations[0]?.complete, true);
  assert.equal(result.observations[0]?.teamGames, 56);
  const changed = await projectNhlContractTalentSeason({
    rows: [stat({ GP: "55" })],
    sources: new Map([["source", source()]]),
    seasonStartYear: 2020,
    currentSeasonStartYear: 2026,
    reference: {
      teamGames: 56,
      expectedPlayers: 1,
      populationSha256: population.sha256,
      sourceSha256: "b".repeat(64),
    },
  });
  assert.equal(changed.populationComplete, false);
  assert.equal(changed.observations[0]?.goalsAboveReplacement, null);
});
void test("wrong model, identity, exposure, profile and unqualified sources cannot supply a talent value", async () => {
  for (const override of [
    { modelVersion: "old" },
    { playerId: "someone-else" },
    { seasonId: "other" },
    { nhlPlayerId: 9 },
    { games: 55 },
    { profile: "edge" },
    { gameType: 3 },
    { seasonValue: 99 },
    { minutes: 999 },
    { status: "provisional" },
    { nhlSeason: 20212022 },
  ]) {
    const candidate = object<Doc<"nhlSeasonValues">>({
      ...source(),
      ...override,
    });
    const result = await projectNhlContractTalentSeason({
      rows: [stat()],
      sources: new Map([["source", candidate]]),
      seasonStartYear: 2020,
      currentSeasonStartYear: 2026,
    });
    assert.equal(result.observations[0]?.goalsAboveReplacement, null);
    assert.equal(result.populationComplete, false);
  }
});
void test("current source remains raw contribution without invented full-season schedule", async () => {
  const result = await projectNhlContractTalentSeason({
    rows: [stat()],
    sources: new Map([["source", { ...source(), nhlSeason: 20262027 }]]),
    seasonStartYear: 2026,
    currentSeasonStartYear: 2026,
  });
  assert.equal(result.populationComplete, false);
  assert.equal(result.teamGames, null);
  assert.equal(result.observations[0]?.goalsAboveReplacement, -2);
  await assert.rejects(
    () => talentPopulationDigest([stat(), stat()]),
    /Duplicate/,
  );
});
void test("native minutes corrections at unchanged GP withhold stale contribution", async () => {
  const changedMinutes = await projectNhlContractTalentSeason({
    rows: [stat({ TOI: "1800" })],
    sources: new Map([["source", source()]]),
    seasonStartYear: 2020,
    currentSeasonStartYear: 2026,
  });
  assert.equal(changedMinutes.observations[0]?.goalsAboveReplacement, null);
});

void test("talent queries require an active identity and refuse overflowing cohorts", async () => {
  const f = mutationFixture();
  f.signIn(null);
  await assert.rejects(() =>
    invokeMutation(talentSeason, f.ctx, { seasonId: "season" }),
  );
  f.signIn("commissioner");
  f.put("seasons", "season", { year: 2021 });
  for (let i = 0; i < 1201; i++)
    f.put("playerNhlStatLines", `row${i}`, {
      seasonId: "season",
      playerId: `p${i}`,
      GP: 1,
    });
  await assert.rejects(
    () => invokeMutation(talentSeason, f.ctx, { seasonId: "season" }),
    /bounded/,
  );
});

void test("NHL Explorer hydrates season player names and teams for active members only", async () => {
  const f = mutationFixture();
  f.put("authUsers", "owner", { role: "owner", status: "active" });
  f.put("seasons", "season", { year: 2009 });
  f.put("players", "player", {
    fullName: "Historical Player",
    nhlTeam: ["TOR"],
  });
  f.put("playerNhlStatLines", "stat", {
    seasonId: "season",
    playerId: "player",
    GP: "1",
    TOI: "10",
    posGroup: "F",
    nhlTeam: ["WSH"],
  });
  f.signIn(null);
  await assert.rejects(
    invokeMutation(talentSeason, f.ctx, {
      seasonId: "season",
      includePlayers: true,
    }),
    /unauthenticated/i,
  );
  f.signIn("owner");
  const result = (await invokeMutation(talentSeason, f.ctx, {
    seasonId: "season",
    includePlayers: true,
  })) as {
    players: unknown;
    observations: { goalsAboveReplacement: number | null }[];
  };
  assert.deepEqual(result.players, [
    { playerId: "player", name: "Historical Player", teams: ["WSH"] },
  ]);
  assert.equal(result.observations[0]?.goalsAboveReplacement, null);
  const lean = (await invokeMutation(talentSeason, f.ctx, {
    seasonId: "season",
  })) as { players?: unknown };
  assert.equal(lean.players, undefined);
});
