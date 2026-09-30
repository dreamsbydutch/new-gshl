import type {
  NhlContractAnalyticsInput,
  NormalizedNhlContract,
} from "../../types/nhl-contract-analytics";

import { NORMALIZED_SALARY_CAP } from "./nhl-salary-caps";

export const NORMALIZED_NHL_CAP = NORMALIZED_SALARY_CAP;

export function normalizeNhlContract(
  contract: NhlContractAnalyticsInput,
  caps: Readonly<Record<number, number>>,
): NormalizedNhlContract {
  const termNeedsReview =
    !Number.isInteger(contract.length) ||
    contract.length < 1 ||
    contract.length > 30 ||
    contract.expirySeasonStartYear - contract.startSeasonStartYear + 1 !==
      contract.length ||
    new Set(contract.seasons.map((row) => row.seasonStartYear)).size !==
      contract.seasons.length ||
    contract.seasons.some(
      (row) =>
        !Number.isFinite(row.capHit) ||
        row.capHit < 0 ||
        !Number.isInteger(row.seasonStartYear) ||
        row.seasonStartYear < contract.startSeasonStartYear ||
        row.seasonStartYear > contract.expirySeasonStartYear,
    );
  const valid = contract.seasons.filter(
    (row) => Number.isFinite(row.capHit) && row.capHit >= 0,
  );
  const byYear = new Map(valid.map((row) => [row.seasonStartYear, row.capHit]));
  // A contract's AAV can cover seasons absent from a directory snapshot, but
  // only when every observed season agrees (allowing whole-dollar rounding).
  const values = valid.map((row) => row.capHit);
  const consistentAav =
    values.length && Math.max(...values) - Math.min(...values) <= 1
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  const years = termNeedsReview
    ? [...byYear.keys()].sort((a, b) => a - b)
    : Array.from(
        { length: contract.length },
        (_, index) => contract.startSeasonStartYear + index,
      );
  const breakdown = years.map((seasonStartYear) => {
    const observed = byYear.get(seasonStartYear);
    const capHit = observed ?? consistentAav;
    const providedCap = caps[seasonStartYear];
    const salaryCap =
      providedCap && Number.isFinite(providedCap) && providedCap > 0
        ? providedCap
        : null;
    const capShare =
      capHit !== null && salaryCap !== null ? capHit / salaryCap : null;
    return {
      seasonStartYear,
      capHit,
      salaryCap,
      capShare,
      normalizedSalary:
        capShare === null ? null : capShare * NORMALIZED_NHL_CAP,
      usesContractAav: observed === undefined && capHit !== null,
    };
  });
  const missingCapYears = breakdown
    .filter((row) => row.salaryCap === null)
    .map((row) => row.seasonStartYear);
  const missingSalaryYears = breakdown
    .filter((row) => row.capHit === null)
    .map((row) => row.seasonStartYear);
  const complete =
    !termNeedsReview && !missingCapYears.length && !missingSalaryYears.length;
  const normalizedAav = complete
    ? breakdown.reduce((sum, row) => sum + row.normalizedSalary!, 0) /
      contract.length
    : null;
  const nominalAav =
    !termNeedsReview && !missingSalaryYears.length
      ? breakdown.reduce((sum, row) => sum + row.capHit!, 0) / contract.length
      : null;
  return {
    ...contract,
    normalizedAav,
    nominalAav,
    averageCapShare:
      normalizedAav === null ? null : normalizedAav / NORMALIZED_NHL_CAP,
    missingCapYears,
    missingSalaryYears,
    termNeedsReview,
    breakdown,
  };
}

export function rankNormalizedContracts(
  contracts: readonly NhlContractAnalyticsInput[],
  caps: Readonly<Record<number, number>>,
) {
  return contracts
    .map((contract) => normalizeNhlContract(contract, caps))
    .sort(
      (a, b) =>
        (b.normalizedAav ?? -1) - (a.normalizedAav ?? -1) ||
        a.playerName.localeCompare(b.playerName) ||
        b.signingDate - a.signingDate ||
        a.id.localeCompare(b.id),
    );
}
