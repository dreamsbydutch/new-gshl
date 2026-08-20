import assert from "node:assert/strict";
import test from "node:test";
import {
  moneyValue,
  normalizeSalary,
  parseSalaryHistory,
  reconcileSalaryCandidates,
  seasonLabel,
} from "./nhl-salaries";

test("normalizes salaries to a $100 million cap", () => {
  assert.equal(normalizeSalary(8_800_000, 88_000_000), 10_000_000);
  assert.equal(normalizeSalary(1_000_000, null), null);
  assert.equal(seasonLabel(2024), "2024-25");
});

test("parses currency strings and player-centric salary history", () => {
  assert.equal(moneyValue("$4.5M"), 4_500_000);
  const rows = parseSalaryHistory({
    "Connor McDavid": {
      nhlApiId: "8478402",
      salaries: {
        "2023-24": "$12,500,000",
        2024: 12_500_000,
      },
    },
  });

  assert.deepEqual(
    rows
      .map((row) => ({
        name: row.fullName,
        season: row.seasonStartYear,
        salary: row.salary,
      }))
      .sort((left, right) => left.season - right.season),
    [
      { name: "Connor McDavid", season: 2023, salary: 12_500_000 },
      { name: "Connor McDavid", season: 2024, salary: 12_500_000 },
    ],
  );
});

test("resolves players and computes normalized historical rows", () => {
  const result = reconcileSalaryCandidates(
    [
      {
        nhlApiId: "8478402",
        seasonStartYear: 2024,
        salary: 8_800_000,
        source: "historical-json",
      },
    ],
    [
      {
        id: "player-1",
        legacyId: "10",
        nhlApiId: "8478402",
        fullName: "Connor McDavid",
      },
    ],
  );

  assert.equal(result.unmatched.length, 0);
  assert.equal(result.rows[0]?.playerId, "player-1");
  assert.equal(result.rows[0]?.salaryCap, 88_000_000);
  assert.equal(result.rows[0]?.normalizedSalary, 10_000_000);
});

test("parses the ranked salary-history export as ending-year cap hits", () => {
  const rows = parseSalaryHistory([
    {
      Season: "2009",
      Name: "Alex Ovechkin",
      Birthdate: "1985-09-17",
      Pos: "L",
      "Cap Hit": "$9,538,462",
      NormalizedYearlySalary: "$16,822,684",
      ContractId: "2009-Alex Ovechkin-F",
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.seasonStartYear, 2008);
  assert.equal(rows[0]?.salary, 9_538_462);
  assert.equal(rows[0]?.capHit, 9_538_462);
  assert.equal(rows[0]?.salaryCap, 56_700_000);
  assert.equal(rows[0]?.birthDate, "1985-09-17");
  assert.equal(rows[0]?.sourceRef, "salaryHistory.json:2009-Alex Ovechkin-F");
});

test("uses birthdate to separate players sharing the same name", () => {
  const result = reconcileSalaryCandidates(
    [
      {
        fullName: "Elias Pettersson",
        birthDate: "2004-02-16",
        position: "D",
        seasonStartYear: 2024,
        salary: 838_333,
        source: "historical-json",
      },
    ],
    [
      {
        id: "forward",
        fullName: "Elias Pettersson",
        birthday: "1998-11-12",
        nhlPos: ["C"],
      },
      {
        id: "defense",
        fullName: "Elias Pettersson",
        birthday: "2004-02-16",
        nhlPos: ["D"],
      },
    ],
  );

  assert.equal(result.ambiguous.length, 0);
  assert.equal(result.rows[0]?.playerId, "defense");
});

test("uses a unique birthdate when the stored player has a different name", () => {
  const result = reconcileSalaryCandidates(
    [
      {
        fullName: "Matt Dumba",
        birthDate: "1994-07-25",
        position: "D",
        seasonStartYear: 2023,
        salary: 3_900_000,
        source: "historical-json",
      },
    ],
    [
      {
        id: "player-1",
        fullName: "Mathew Dumba",
        birthday: "1994-07-25",
        nhlPos: ["D"],
      },
    ],
  );

  assert.equal(result.unmatched.length, 0);
  assert.equal(result.rows[0]?.playerId, "player-1");
});

test("uses last name and normalized wing position for guarded alias matches", () => {
  const result = reconcileSalaryCandidates(
    [
      {
        fullName: "Yegor Chinakhov",
        birthDate: "2001-02-01",
        position: "R",
        seasonStartYear: 2024,
        salary: 2_100_000,
        source: "historical-json",
      },
    ],
    [
      {
        id: "chinakhov",
        fullName: "Egor Chinakhov",
        birthday: "2001-02-01",
        nhlPos: ["LW", "RW"],
      },
      {
        id: "parssinen",
        fullName: "Juuso Parssinen",
        birthday: "2001-02-01",
        nhlPos: ["C"],
      },
    ],
  );

  assert.equal(result.ambiguous.length, 0);
  assert.equal(result.rows[0]?.playerId, "chinakhov");
});
