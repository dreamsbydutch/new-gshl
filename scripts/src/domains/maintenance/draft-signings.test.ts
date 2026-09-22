import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inferDraftContinuation,
  planDraftSignings,
  signingPickWriteData,
  type DraftSigningSource,
} from "./draft-signings";

void test("compatibility writes retain the existing pick's legacy import ID", () => {
  const source = fixture();
  source.picks[5]!.legacyId = "legacy-pick-6";
  const change = planDraftSignings(source)[0]!.changes[0]!;
  assert.equal(signingPickWriteData(change).legacyId, "legacy-pick-6");
  assert.equal(signingPickWriteData(change).playerId, "signed");
  assert.equal(change.before?.playerId, null);
});

function fixture(): DraftSigningSource {
  return {
    seasons: [
      { id: "s", name: "2021-22", year: 2022, startDate: "2021-10-01" },
    ],
    teams: [
      { id: "a", seasonId: "s", franchiseId: "fa" },
      { id: "b", seasonId: "s", franchiseId: "fb" },
    ],
    franchises: [
      { id: "fa", ownerId: "oa", name: "A" },
      { id: "fb", ownerId: "ob", name: "B" },
    ],
    players: [{ id: "signed", fullName: "Signed Player" }],
    contracts: [
      {
        id: "contract",
        playerId: "signed",
        ownerId: "oa",
        signingDate: "2021-06-01",
        startDate: "2021-06-01",
        expiryDate: "2022-04-01",
        expiryStatus: "RFA",
      },
    ],
    picks: ["a", "b", "a", "b", "b", "a"].map((teamId, i) => ({
      id: `p${i + 1}`,
      seasonId: "s",
      round: Math.floor(i / 2) + 1,
      pick: i + 1,
      originalTeamId: teamId,
      gshlTeamId: teamId,
      playerId: i >= 4 ? null : `drafted-${i}`,
      isSigning: i >= 4,
      isTraded: false,
    })),
    openings: [
      {
        seasonId: "s",
        date: "2021-10-01",
        rows: [{ playerId: "signed", gshlTeamId: "a" }],
      },
    ],
  };
}

void test("fills the team's lowest empty pick as an untraded signing and is idempotent", () => {
  const source = fixture(),
    before = structuredClone(source);
  const plan = planDraftSignings(source)[0]!;
  assert.equal(plan.changes.length, 1);
  const change = plan.changes[0]!;
  assert.equal(change.id, "p6");
  assert.equal(change.data.isTraded, false);
  assert.equal(change.data.isSigning, true);
  assert.deepEqual(source, before);
  source.picks = source.picks.map((p) =>
    p.id === change.id ? { ...p, ...change.data } : p,
  );
  assert.equal(planDraftSignings(source)[0]!.changes.length, 0);
  assert.equal(planDraftSignings(source)[0]!.accounted, 1);
});

void test("restores unassigned signing placeholders through their original team", () => {
  const source = fixture();
  source.picks[5] = { ...source.picks[5]!, gshlTeamId: null, isTraded: true };
  const change = planDraftSignings(source)[0]!.changes[0]!;
  assert.equal(change.id, "p6");
  assert.equal(change.data.gshlTeamId, "a");
  assert.equal(change.data.originalTeamId, "a");
  assert.equal(change.data.isTraded, false);
});

void test("extends delayed snake without replacing filled picks or filling another team's positions", () => {
  const source = fixture();
  source.picks = source.picks.map((p) => ({
    ...p,
    playerId: `existing-${p.id}`,
    isSigning: false,
  }));
  source.players.push({ id: "signed2", fullName: "Second Player" });
  source.contracts.push({
    ...source.contracts[0]!,
    id: "c2",
    playerId: "signed2",
  });
  const plan = planDraftSignings(source)[0]!;
  assert.deepEqual(
    plan.changes.map((c) => [c.kind, c.data.round, c.data.pick]),
    [
      ["insert", 4, 7],
      ["insert", 5, 10],
    ],
  );
  const picks = [
    ...source.picks,
    ...plan.changes.map((c, i) => ({ ...c.data, id: `new${i}` })),
  ];
  assert.equal(planDraftSignings({ ...source, picks })[0]!.changes.length, 0);
});

void test("standard and delayed snakes continue their final direction", () => {
  const source = fixture();
  assert.deepEqual(inferDraftContinuation(source.picks, ["a", "b"])("a", 6), {
    round: 4,
    pick: 7,
  });
  const standard = source.picks.map((p, i) => ({
    ...p,
    originalTeamId: ["a", "b", "b", "a", "a", "b"][i],
  }));
  assert.deepEqual(inferDraftContinuation(standard, ["a", "b"])("a", 6), {
    round: 4,
    pick: 8,
  });
  assert.throws(
    () => inferDraftContinuation(source.picks.slice(0, 5), ["a", "b"]),
    /Too few/,
  );
  assert.throws(
    () =>
      inferDraftContinuation([...source.picks, source.picks[0]!], ["a", "b"]),
    /duplicate/,
  );
});

void test("does not count late signings or expired contracts still charging cap", () => {
  for (const patch of [
    { signingDate: "2021-10-02" },
    { startDate: "2021-10-02" },
    { expiryDate: "2021-09-30", capHitEndDate: "2023-04-01" },
  ]) {
    const source = fixture();
    source.contracts[0] = { ...source.contracts[0]!, ...patch };
    assert.equal(planDraftSignings(source)[0]!.changes.length, 0);
  }
});

void test("later buyouts retain historical keepers but stale buyout coverage is excluded", () => {
  const source = fixture();
  source.contracts[0]!.expiryStatus = "Buyout";
  assert.equal(planDraftSignings(source)[0]!.changes.length, 1);
  source.openings[0]!.rows = [{ playerId: "someone-else", gshlTeamId: "a" }];
  assert.equal(planDraftSignings(source)[0]!.changes.length, 0);
  assert.equal(planDraftSignings(source)[0]!.excluded.length, 1);
  source.openings = [];
  assert.equal(planDraftSignings(source)[0]!.issues.length, 1);
});

void test("resolves duplicate contract ownership using the opening roster", () => {
  const source = fixture();
  source.contracts.push({
    ...source.contracts[0]!,
    id: "duplicate",
    ownerId: "ob",
  });
  const plan = planDraftSignings(source)[0]!;
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0]!.data.gshlTeamId, "a");
  source.openings = [];
  assert.equal(planDraftSignings(source)[0]!.changes.length, 0);
  assert.equal(planDraftSignings(source)[0]!.issues.length, 1);
});

void test("departed owner contracts need a unique opening-roster successor", () => {
  const source = fixture();
  source.contracts[0]!.ownerId = "departed";
  assert.equal(planDraftSignings(source)[0]!.changes[0]!.data.gshlTeamId, "a");
  source.openings = [];
  assert.equal(planDraftSignings(source)[0]!.changes.length, 0);
});

void test("preserves existing player selections even when contract ownership conflicts", () => {
  const source = fixture();
  source.picks[0]!.playerId = "signed";
  assert.equal(planDraftSignings(source)[0]!.changes.length, 0);
  source.picks[0]!.gshlTeamId = "b";
  assert.equal(planDraftSignings(source)[0]!.changes.length, 0);
  assert.equal(planDraftSignings(source)[0]!.issues.length, 1);
});

void test("uses every existing empty owned slot before extending, and does not invent a draft", () => {
  const source = fixture();
  source.picks[0]!.playerId = null;
  source.picks[5]!.playerId = "last-selection";
  source.picks[5]!.isSigning = false;
  assert.equal(planDraftSignings(source)[0]!.changes[0]!.kind, "fill");
  assert.equal(planDraftSignings(source)[0]!.changes[0]!.id, "p1");
  source.picks = [];
  assert.equal(planDraftSignings(source)[0]!.changes.length, 0);
  assert.match(planDraftSignings(source)[0]!.notes[0]!, /No existing draft/);
});
