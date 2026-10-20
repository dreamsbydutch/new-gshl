import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prepareNightlyNhlRefresh,
  verifyNightlyNhlRefresh,
  type NightlyDbSnapshot,
} from "./nightly-season-refresh";

function fixture() {
  const players = Array.from({ length: 8 }, (_, i) => ({
    nhlPlayerId: 100 + i,
    name: `Person ${i}`,
    fields: {
      GP: 10,
      G: 5 + i,
      A: 10,
      P: 15 + i,
      PM: 0,
      PIM: 2,
      PPP: 1,
      SOG: 20 + i,
      HIT: 10,
      BLK: 5,
      GS: null,
      W: null,
      GA: null,
      GAA: null,
      SV: null,
      SA: null,
      SVP: null,
      SO: null,
      QS: null,
      RBS: null,
      TOI: 100,
      nhlPos: ["C"],
      posGroup: "F",
      nhlTeam: ["TOR"],
    },
  }));
  const snapshot: NightlyDbSnapshot = {
    season: {
      _id: "season",
      year: "2026",
      categories: [
        "G",
        "A",
        "P",
        "PPP",
        "SOG",
        "HIT",
        "BLK",
        "W",
        "GAA",
        "SVP",
      ],
    },
    players: players.map((p, i) => ({
      _id: `player${i}`,
      nhlApiId: String(p.nhlPlayerId),
    })),
    stats: [],
    teams: [{ _id: "club", abbr: "TOR" }],
    teamStats: [],
  };
  const teams = [
    {
      nhlTeamAbbr: "TOR",
      officialTeamId: 10,
      fields: { GP: 1, W: 1, L: 0, OTL: 0, P: 2, GF: 2, GA: 1 },
    },
  ];
  return { players, snapshot, teams };
}
test("nightly preparation scores entire official cohort, uses canonical IDs and preserves inputs", async () => {
  const x = fixture(),
    before = JSON.stringify(x);
  const plan = await prepareNightlyNhlRefresh(x.snapshot, x.players, x.teams);
  assert.equal(plan.players.length, 8);
  assert.equal(
    plan.players.every(
      (p) =>
        typeof p.fields.seasonRating === "number" &&
        Number.isFinite(p.fields.seasonRating),
    ),
    true,
  );
  assert.equal(plan.players[0].playerId, "player0");
  assert.equal(plan.players[0].expectedRow, null);
  assert.equal(plan.teams[0].nhlTeamId, "club");
  assert.equal(JSON.stringify(x), before);
  const sha = "a".repeat(64),
    time = 123;
  const after = {
    ...x.snapshot,
    stats: plan.players.map((p, i) => ({
      _id: `row${i}`,
      playerId: p.playerId,
      ...p.fields,
      nhlStatsSourceSha256: sha,
      nhlStatsSourceFetchedAt: time,
    })),
    teamStats: plan.teams.map((p) => ({
      _id: "teamrow",
      nhlTeamId: p.nhlTeamId,
      ...p.fields,
      sourceSha256: sha,
      sourceFetchedAt: time,
    })),
  };
  verifyNightlyNhlRefresh(after, plan, sha, time);
  Object.assign(after.stats[0], { G: 999 });
  assert.throws(
    () => verifyNightlyNhlRefresh(after, plan, sha, time),
    /verification/,
  );
});
test("unknown/ambiguous identities and disappearing positive source populations fail closed", async () => {
  const x = fixture();
  await assert.rejects(
    prepareNightlyNhlRefresh(
      { ...x.snapshot, players: x.snapshot.players.slice(1) },
      x.players,
      x.teams,
    ),
    /missing/,
  );
  await assert.rejects(
    prepareNightlyNhlRefresh(
      {
        ...x.snapshot,
        players: [...x.snapshot.players, { _id: "other", nhlApiId: "100" }],
      },
      x.players,
      x.teams,
    ),
    /Ambiguous/,
  );
  await assert.rejects(
    prepareNightlyNhlRefresh(
      {
        ...x.snapshot,
        stats: [{ _id: "stray", playerId: "unverified", GP: 1 }],
      },
      x.players,
      x.teams,
    ),
    /missing from official/,
  );
});
