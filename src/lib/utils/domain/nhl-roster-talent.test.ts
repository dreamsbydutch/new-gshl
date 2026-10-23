import assert from "node:assert/strict";
import test from "node:test";
import { rankNhlRosterTalent } from "./nhl-roster-talent";
import type {
  NhlRosterTalentPlayer,
  NhlRosterTalentTeam,
} from "../../types/nhl-roster-talent";

function roster(offset = 0): NhlRosterTalentPlayer[] {
  return [
    ...Array.from({ length: 15 }, (_, i) => ({
      position: "F",
      gar: 15 - i,
    })),
    ...Array.from({ length: 9 }, (_, i) => ({
      position: "D",
      gar: 9 - i,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      position: "G",
      gar: 3 - i,
    })),
  ].map((p, i) => ({
    ...p,
    status: "qualified" as const,
    id: `p${offset + i}`,
    nhlPlayerId: offset + i + 1,
    playerName: `Player ${offset + i}`,
  }));
}
function team(id = "a", players = roster()): NhlRosterTalentTeam {
  return { id, name: id, abbr: id.toUpperCase(), roster: players };
}

void test("selects 14F/8D/2G independently and sums signed projected annual GAR exactly once", () => {
  const input = team();
  const before = structuredClone(input);
  const result = rankNhlRosterTalent([input])[0]!;
  assert.deepEqual(
    result.groups.map((g) => [g.position, g.roster.length, g.total]),
    [
      ["F", 14, 119],
      ["D", 8, 44],
      ["G", 2, 5],
    ],
  );
  assert.equal(result.gar, 168);
  assert.equal(result.selected.length, 24);
  assert.equal(result.outsideDepth.length, 3);
  assert.equal(result.rank, 1);
  assert.deepEqual(input, before);
});

void test("negative depth players cannot be dropped to inflate team strength", () => {
  const players = roster().map((p) => ({
    ...p,
    gar: p.position === "F" ? -1 : p.position === "D" ? -2 : -3,
  }));
  const result = rankNhlRosterTalent([team("negative", players)])[0]!;
  assert.equal(result.gar, -36);
  assert.equal(result.selected.length, 24);
});

void test("unknown players remain unknown; incomplete groups expose provisional subtotals", () => {
  const players = roster().filter((p) => p.position !== "G" || p.gar === 3);
  players.push({
    id: "unknown",
    nhlPlayerId: 99,
    playerName: "Unrated goalie",
    position: "G",
    gar: null,
    status: "unavailable",
  });
  const result = rankNhlRosterTalent([team("missing", players)])[0]!;
  assert.equal(result.gar, null);
  assert.equal(result.rank, null);
  assert.equal(result.modeledGar, 166);
  assert.equal(result.provisional, true);
  assert.equal(result.knownSubtotal, 166);
  assert.equal(result.unmodeled[0]?.id, "unknown");
});

void test("all-unknown rosters have no score; unknown prospects do not become replacement zeros", () => {
  const players = roster().map((p) => ({
    ...p,
    gar: null,
    status: "unavailable" as const,
  }));
  const result = rankNhlRosterTalent([team("unknown", players)])[0]!;
  assert.equal(result.gar, null);
  assert.equal(result.selected.length, 0);
  assert.equal(result.unmodeled.length, 27);
  const known = rankNhlRosterTalent([
    team("known", [
      ...roster(),
      { ...players[0]!, id: "prospect", nhlPlayerId: 88 },
    ]),
  ])[0]!;
  assert.equal(known.gar, 168);
  assert.equal(known.unmodeled.length, 1);
  assert.equal(known.provisional, true);
});

void test("partial teams retain subtotals without outranking complete teams through missing values", () => {
  const full = team("full");
  const partial = team(
    "partial",
    roster(100)
      .filter((p) => p.position !== "G" || p.gar === 3)
      .map((p) => ({
        ...p,
        gar: p.position === "G" ? 1000 : p.gar,
        status: "research" as const,
      })),
  );
  const ranked = rankNhlRosterTalent([full, partial]);
  assert.equal(ranked[0]?.id, "full");
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[0]?.provisional, false);
  assert.equal(ranked[1]?.gar, null);
  assert.equal(ranked[1]?.modeledGar, 1163);
  assert.equal(ranked[1]?.provisional, true);
  assert.equal(ranked[1]?.researchPlayers.length, 23);
  assert.equal(ranked[1]?.rank, null);
});

void test("selection and competition ranks are deterministic across roster/team order and ties", () => {
  const a = team("a");
  const b = team("b", roster(100));
  const c = team(
    "c",
    roster(200).map((p) => ({ ...p, gar: -1 })),
  );
  const first = rankNhlRosterTalent([c, b, a]);
  const second = rankNhlRosterTalent(
    [a, b, c].map((t) => ({ ...t, roster: [...t.roster].reverse() })),
  );
  assert.deepEqual(
    first.map((t) => [t.id, t.rank]),
    [
      ["a", 1],
      ["b", 1],
      ["c", 3],
    ],
  );
  assert.deepEqual(first, second);
});

void test("unknown NHL identities retain deterministic selected and outside-depth ordering", () => {
  const input = {
    ...team("unknown"),
    selectionPolicy: "nhl-first" as const,
    roster: Array.from({ length: 16 }, (_, i) => ({
      id: `unknown-${String(i).padStart(2, "0")}`,
      nhlPlayerId: null,
      playerName: `Unknown ${i}`,
      position: "F",
      gar: null,
      status: "unavailable" as const,
      membership: "organization" as const,
    })),
  };
  const forward = rankNhlRosterTalent([input]);
  assert.deepEqual(
    rankNhlRosterTalent([{ ...input, roster: [...input.roster].reverse() }]),
    forward,
  );
  assert.equal(forward[0]!.rank, null);
  assert.equal(forward[0]!.outsideDepth.length, 2);
});

void test("rejects duplicate canonical players across teams and nonfinite or identity-free values", () => {
  assert.throws(
    () => rankNhlRosterTalent([team("a"), team("b")]),
    /Duplicate NHL roster player/,
  );
  assert.throws(
    () =>
      rankNhlRosterTalent([
        team("a"),
        team(
          "b",
          roster().map((p) => ({ ...p, id: `other-${p.id}` })),
        ),
      ]),
    /canonical NHL identity/,
  );
  for (const value of [NaN, Infinity, -Infinity])
    assert.throws(
      () => rankNhlRosterTalent([team("a", [{ ...roster()[0]!, gar: value }])]),
      /finite/,
    );
  assert.throws(
    () =>
      rankNhlRosterTalent([
        team("a", [{ ...roster()[0]!, nhlPlayerId: null }]),
      ]),
    /identity/,
  );
});
