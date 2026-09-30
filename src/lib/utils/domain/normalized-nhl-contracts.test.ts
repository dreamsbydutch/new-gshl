import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeNhlContract,
  rankNormalizedContracts,
} from "./normalized-nhl-contracts";
import { NHL_SALARY_CAP_BY_START_YEAR } from "./nhl-salary-caps";
import type { NhlContractAnalyticsInput } from "../../types/nhl-contract-analytics";

const contract: NhlContractAnalyticsInput = {
  id: "one",
  playerName: "Example Player",
  position: "F",
  signingDate: Date.UTC(2025, 6, 1),
  startSeasonStartYear: 2025,
  expirySeasonStartYear: 2026,
  length: 2,
  seasons: [
    { seasonStartYear: 2025, capHit: 10_000_000 },
    { seasonStartYear: 2026, capHit: 10_000_000 },
  ],
};

void test("averages normalized seasons, not AAV divided by average cap", () => {
  const result = normalizeNhlContract(contract, {
    2025: 50_000_000,
    2026: 100_000_000,
  });
  assert.equal(result.normalizedAav, 15_000_000);
  assert.equal(result.averageCapShare, 0.15);
  assert.equal(result.nominalAav, 10_000_000);
  assert.notEqual(
    result.normalizedAav,
    (10_000_000 / 75_000_000) * 100_000_000,
  );
});

void test("uses each season's actual cap hit and preserves precision until display", () => {
  const varied = {
    ...contract,
    seasons: [
      { seasonStartYear: 2025, capHit: 1_000_001 },
      { seasonStartYear: 2026, capHit: 2_000_003 },
    ],
  };
  const result = normalizeNhlContract(varied, {
    2025: 95_500_000,
    2026: 104_000_000,
  });
  assert.equal(
    result.normalizedAav,
    ((1_000_001 / 95_500_000) * 100_000_000 +
      (2_000_003 / 104_000_000) * 100_000_000) /
      2,
  );
});

void test("fills missing season snapshots only from a consistent observed contract AAV", () => {
  const result = normalizeNhlContract(
    { ...contract, seasons: contract.seasons.slice(0, 1) },
    { 2025: 50_000_000, 2026: 100_000_000 },
  );
  assert.equal(result.normalizedAav, 15_000_000);
  assert.equal(result.breakdown[1]?.usesContractAav, true);
  const incomplete = normalizeNhlContract(
    {
      ...contract,
      length: 3,
      expirySeasonStartYear: 2027,
      seasons: [
        { seasonStartYear: 2025, capHit: 1 },
        { seasonStartYear: 2026, capHit: 2_000_000 },
      ],
    },
    { 2025: 1, 2026: 1, 2027: 1 },
  );
  assert.equal(incomplete.normalizedAav, null);
  assert.deepEqual(incomplete.missingSalaryYears, [2027]);
});

void test("unknown or zero caps and inconsistent contract terms never produce partial rankings", () => {
  assert.equal(
    normalizeNhlContract(contract, { 2025: 50_000_000 }).normalizedAav,
    null,
  );
  assert.equal(
    normalizeNhlContract(contract, { 2025: 50_000_000, 2026: 0 }).normalizedAav,
    null,
  );
  assert.equal(
    normalizeNhlContract(
      { ...contract, length: 3 },
      { 2025: 50_000_000, 2026: 100_000_000 },
    ).termNeedsReview,
    true,
  );
});

void test("rankings recalculate when caps change and never mutate inputs", () => {
  const later = {
    ...contract,
    id: "two",
    playerName: "Later Player",
    startSeasonStartYear: 2026,
    expirySeasonStartYear: 2026,
    length: 1,
    seasons: [{ seasonStartYear: 2026, capHit: 12_000_000 }],
  };
  const input = [later, contract];
  const before = JSON.stringify(input);
  assert.deepEqual(
    rankNormalizedContracts(input, { 2025: 50_000_000, 2026: 100_000_000 }).map(
      (r) => r.id,
    ),
    ["one", "two"],
  );
  assert.deepEqual(
    rankNormalizedContracts(input, {
      2025: 100_000_000,
      2026: 100_000_000,
    }).map((r) => r.id),
    ["two", "one"],
  );
  assert.equal(JSON.stringify(input), before);
});

void test("duplicate, invalid and out-of-term salary rows require review", () => {
  for (const extra of [
    { seasonStartYear: 2025, capHit: 10_000_000 },
    { seasonStartYear: 2027, capHit: 10_000_000 },
    { seasonStartYear: 2026, capHit: -1 },
  ]) {
    const result = normalizeNhlContract(
      { ...contract, seasons: [...contract.seasons, extra] },
      NHL_SALARY_CAP_BY_START_YEAR,
    );
    assert.equal(result.termNeedsReview, true);
    assert.equal(result.normalizedAav, null);
  }
});

void test("supplied end-year ceilings map to the correct NHL season, including all future figures", () => {
  assert.equal(Object.keys(NHL_SALARY_CAP_BY_START_YEAR).length, 37);
  assert.equal(NHL_SALARY_CAP_BY_START_YEAR[2005], 39_000_000);
  assert.equal(NHL_SALARY_CAP_BY_START_YEAR[2012], 60_000_000);
  assert.equal(NHL_SALARY_CAP_BY_START_YEAR[2026], 104_000_000);
  assert.equal(NHL_SALARY_CAP_BY_START_YEAR[2028], 119_200_000);
  assert.equal(NHL_SALARY_CAP_BY_START_YEAR[2041], 224_700_000);
});
