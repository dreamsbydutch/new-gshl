import assert from "node:assert/strict";
import test from "node:test";
import {
  assertUniqueIncomingHockeyReferencePlayer,
  chooseHockeyReferencePerson,
  collapseHockeyReferencePeople,
} from "./season-identity";

const older = {
  id: "older",
  birthday: "1994-05-25",
  isActive: false,
  nhlTeam: "PIT",
};
const younger = {
  id: "younger",
  birthday: Date.parse("1998-02-02T00:00:00Z"),
  isActive: true,
  nhlTeam: "DAL",
};
const row = (
  sourceIndex: number,
  age: string,
  nhlTeam = "DAL",
  sourcePlayerId?: string,
) => ({
  sourceType: "goalie",
  sourceIndex,
  age,
  nhlTeam,
  sourcePlayerId,
  normalizedName: "mattmurray",
  posGroup: "G",
});

void test("Murray homonyms resolve by February1 season age regardless of present activity/team", () => {
  for (const players of [
    [younger, older],
    [older, younger],
  ]) {
    assert.equal(chooseHockeyReferencePerson("20", "2015", players), older);
    assert.equal(chooseHockeyReferencePerson("16", "2015", players), younger);
    assert.equal(chooseHockeyReferencePerson("27", "2022", players), older);
    assert.equal(chooseHockeyReferencePerson("23", "2022", players), younger);
    assert.equal(chooseHockeyReferencePerson("28", "2023", players), older);
    assert.equal(chooseHockeyReferencePerson("24", "2023", players), younger);
  }
});

void test("missing/inconsistent/tied age proof is ambiguous; a wrong active goalie never wins", () => {
  assert.equal(chooseHockeyReferencePerson("", "2022", [older, younger]), null);
  assert.equal(
    chooseHockeyReferencePerson("25", "2022", [older, younger]),
    null,
  );
  assert.equal(
    chooseHockeyReferencePerson("27", "2022", [
      older,
      { ...younger, birthday: undefined },
    ]),
    null,
  );
  assert.equal(
    chooseHockeyReferencePerson("27", "2022", [
      older,
      { ...younger, birthday: older.birthday },
    ]),
    null,
  );
  assert.equal(
    chooseHockeyReferencePerson("27", "bad", [older, younger]),
    null,
  );
  assert.equal(chooseHockeyReferencePerson("", "2022", [older]), older);
  assert.equal(chooseHockeyReferencePerson("27", "2022", []), null);
});

void test("trade rows collapse per stable source person, never across same-name people", () => {
  const input = [
    row(0, "27", "TOT", "murra01"),
    row(1, "27", "OTT", "murra01"),
    row(2, "23", "DAL", "murra02"),
  ];
  const before = structuredClone(input);
  const result = collapseHockeyReferencePeople(input, (team) => team === "TOT");
  assert.deepEqual(result.rows, [input[0], input[2]]);
  assert.equal(result.duplicateIncomingKeysCollapsed, 1);
  assert.deepEqual(input, before);
  // IDs remain distinct even when two people have identical name AND season age.
  assert.equal(
    collapseHockeyReferencePeople(
      [row(0, "27", "DAL", "one"), row(1, "27", "DAL", "two")],
      () => false,
    ).rows.length,
    2,
  );
});

void test("age fallback distinguishes homonyms while unknown identity cannot collapse rows", () => {
  assert.equal(
    collapseHockeyReferencePeople(
      [row(0, "27", "TOT"), row(1, "27", "OTT"), row(2, "23")],
      (t) => t === "TOT",
    ).rows.length,
    2,
  );
  assert.equal(
    collapseHockeyReferencePeople([row(0, ""), row(1, "")], () => false).rows
      .length,
    2,
  );
});

void test("duplicate incoming canonical key throws before any overwrite, even identical statistics", () => {
  const seen = new Set<string>();
  assertUniqueIncomingHockeyReferencePlayer(seen, "season|older");
  assertUniqueIncomingHockeyReferencePlayer(seen, "season|younger");
  assert.throws(
    () => assertUniqueIncomingHockeyReferencePlayer(seen, "season|older"),
    /refusing overwrite/,
  );
});
