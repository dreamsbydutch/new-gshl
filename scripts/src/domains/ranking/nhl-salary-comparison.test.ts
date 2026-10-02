import test from "node:test";
import assert from "node:assert/strict";
import { compareNhlSalaries, type SalarySeason } from "./nhl-salary-comparison";

function fixture(n = 200): SalarySeason {
  return {
    startYear: 2024,
    ratings: Array.from({ length: n }, (_, i) => ({
      nhlPlayerId: i + 1,
      playerId: `p${i}`,
      name: `Player ${i}`,
      position: "F",
      games: 70,
      status: "rated",
      seasonValue: i - 100,
      abilityPer60: i / 100,
      seasonRating: i / 2,
      limitedSeason: false,
    })),
    contracts: Array.from({ length: n }, (_, i) => ({
      playerId: `p${i}`,
      contractId: `c${i}`,
      capHit: (i + 1) * 50000,
      cashSalary: 123,
      signingStatus: "UFA",
      signingAge: 28,
      length: 4,
      startYear: 2023,
      endYear: 2026,
      source: "historical-json",
      validHeader: true,
    })),
  };
}

void test("cap shares use historical ceiling; matched pay and rating ranks agree", () => {
  const { rows, cohorts } = compareNhlSalaries([fixture()]);
  assert.equal(rows[199]!.capSharePct, (100 * 10000000) / 88000000);
  assert.equal(rows[199]!.cashSalary, 123);
  assert.equal(rows[199]!.payPercentile, 100);
  assert.ok(rows.every((r) => r.valuePayGap === 0));
  assert.equal(cohorts[0]!.capVsValueSpearman, 1);
});

void test("sparse contracts, limited seasons and provisional players receive no benchmark", () => {
  const sparse = fixture();
  sparse.contracts = sparse.contracts.slice(0, 100);
  assert.ok(
    compareNhlSalaries([sparse]).rows.every((r) => !r.benchmarkEligible),
  );
  const limited = fixture();
  limited.ratings[0]!.limitedSeason = true;
  assert.ok(
    compareNhlSalaries([limited]).rows.every((r) => r.payPercentile === null),
  );
  const provisional = fixture();
  provisional.ratings[0]!.status = "provisional";
  const result = compareNhlSalaries([provisional]);
  assert.equal(result.rows[0]!.payPercentile, null);
  assert.equal(result.cohorts[0]!.qualified, 199);
});

void test("missing, duplicate, unlinked and invalid contracts are explicit, never guessed", () => {
  const season = fixture();
  season.contracts.push({ ...season.contracts[0]!, contractId: "overlap" });
  season.contracts[1]!.endYear = 2023;
  season.ratings[2]!.playerId = null;
  season.contracts = season.contracts.filter((c) => c.playerId !== "p3");
  const { rows } = compareNhlSalaries([season]);
  assert.deepEqual(
    rows.slice(0, 4).map((r) => r.matchIssue),
    [
      "ambiguous-contract",
      "invalid-contract",
      "unlinked-player",
      "missing-contract",
    ],
  );
  assert.ok(
    rows.slice(0, 4).every((r) => r.capHit === null && r.valuePayGap === null),
  );
});

void test("peer prices exclude self, preserve signing status and suppress small samples", () => {
  const season = fixture();
  season.contracts[100]!.signingStatus = "RFA";
  season.contracts[101]!.signingStatus = null;
  const { rows } = compareNhlSalaries([season]);
  assert.equal(rows[100]!.valuePeers, null);
  assert.equal(rows[101]!.valuePeers, null);
  const target = rows[50]!;
  const peers = rows.filter(
    (r) =>
      r.nhlPlayerId !== target.nhlPlayerId &&
      r.signingStatus === "UFA" &&
      Math.abs(r.valuePercentile! - target.valuePercentile!) <= 10,
  );
  assert.equal(target.valuePeers!.n, peers.length);
  assert.equal(target.valuePeers!.n, 38);
  assert.equal(target.valuePeers!.median, 2550000);
  assert.ok(target.salaryPeers);
});

void test("position cohorts stay separate and duplicate ratings fail", () => {
  const season = fixture();
  season.ratings[0]!.position = "G";
  const result = compareNhlSalaries([season]);
  assert.equal(result.rows[0]!.payPercentile, null);
  assert.equal(result.rows[1]!.cohortCount, 199);
  assert.throws(() => compareNhlSalaries([season, season]), /Duplicate/);
});
