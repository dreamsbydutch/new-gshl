import type { NhlContractAnalyticsInput } from "../../types/nhl-contract-analytics";
import type {
  NhlContractTalentSeason,
  NhlContractTalentSummary,
  NhlContractTalentYear,
} from "../../types/nhl-contract-talent";

const MODEL = "nhl-hockey-overall-reviewed-v1";
const qualifications = new Set([
  "ranked",
  "provisional",
  "incomplete",
  "insufficient-reference",
  "no-nhl-games",
  "missing-source",
  "unresolved-player",
  "source-stat-mismatch",
]);
const year = (value: number) =>
  Number.isInteger(value) && value >= 1900 && value <= 2200;
const nonnegative = (value: number) => Number.isFinite(value) && value >= 0;

/** Actual delivered hockey contribution; salary, cap hit and player GP never set its scale. */
export function summarizeContractTalent(
  contract: NhlContractAnalyticsInput & { playerId?: string },
  seasonRows: readonly NhlContractTalentSeason[],
  options: { currentSeasonStartYear: number },
): NhlContractTalentSummary {
  const current = options.currentSeasonStartYear;
  if (
    !contract.id ||
    !contract.playerId?.trim() ||
    contract.playerId.trim() !== contract.playerId ||
    !year(current) ||
    !year(contract.startSeasonStartYear) ||
    !year(contract.expirySeasonStartYear) ||
    !Number.isInteger(contract.length) ||
    contract.length < 1 ||
    contract.length > 30 ||
    contract.expirySeasonStartYear - contract.startSeasonStartYear + 1 !==
      contract.length
  )
    throw Error(
      "Canonical player identity and valid contract term/current year required",
    );
  const byYear = new Map<number, NhlContractTalentSeason>();
  for (const row of seasonRows) {
    if (
      !year(row.seasonStartYear) ||
      row.playerId !== contract.playerId ||
      !["F", "D", "G"].includes(row.position) ||
      !Number.isInteger(row.games) ||
      !nonnegative(row.games) ||
      !nonnegative(row.minutes) ||
      (row.teamGames !== null &&
        (!Number.isFinite(row.teamGames) ||
          row.teamGames <= 0 ||
          row.teamGames > 100)) ||
      (row.goalsAboveReplacement !== null &&
        !Number.isFinite(row.goalsAboveReplacement)) ||
      typeof row.complete !== "boolean" ||
      !qualifications.has(row.qualification) ||
      (row.modelVersion !== undefined && row.modelVersion !== MODEL) ||
      (row.sourceId !== undefined &&
        (!row.sourceId.trim() || row.sourceId.trim() !== row.sourceId)) ||
      (row.sourceHash !== undefined &&
        !/^[a-f0-9]{64}$/.test(row.sourceHash)) ||
      (row.sourceFetchedAt !== undefined &&
        (!Number.isFinite(row.sourceFetchedAt) || row.sourceFetchedAt <= 0)) ||
      (row.age !== undefined && row.age !== null && !nonnegative(row.age)) ||
      byYear.has(row.seasonStartYear) ||
      (row.seasonStartYear > current &&
        (row.complete || row.goalsAboveReplacement !== null))
    )
      throw Error(
        "Invalid, duplicate, wrong-player or wrong-model talent season",
      );
    if (
      row.qualification === "no-nhl-games" &&
      (!row.complete ||
        row.games !== 0 ||
        row.minutes !== 0 ||
        row.goalsAboveReplacement !== 0 ||
        row.teamGames === null)
    )
      throw Error(
        "Zero absence requires an explicit complete official no-NHL-games season",
      );
    if (
      row.qualification === "ranked" &&
      (row.goalsAboveReplacement === null ||
        row.games === 0 ||
        row.minutes === 0)
    )
      throw Error(
        "Ranked talent season requires observed games, minutes and contribution",
      );
    byYear.set(row.seasonStartYear, row);
  }
  const years: NhlContractTalentYear[] = Array.from(
    { length: contract.length },
    (_, i) => {
      const seasonStartYear = contract.startSeasonStartYear + i;
      const row = byYear.get(seasonStartYear);
      const usable =
        row &&
        ["ranked", "no-nhl-games"].includes(row.qualification) &&
        row.goalsAboveReplacement !== null &&
        (seasonStartYear === current || row.teamGames !== null);
      const state: NhlContractTalentYear["state"] =
        seasonStartYear > current
          ? "future"
          : !row
            ? "missing"
            : !usable
              ? "provisional"
              : seasonStartYear === current
                ? "partial"
                : row.complete
                  ? "covered"
                  : "provisional";
      const known = state === "covered" || state === "partial";
      const gar82 =
        state === "covered"
          ? (row!.goalsAboveReplacement! * 82) / row!.teamGames!
          : null;
      if (gar82 !== null && !Number.isFinite(gar82))
        throw Error("Schedule-standardized contribution must remain finite");
      return {
        seasonStartYear,
        state,
        goalsAboveReplacement: known ? row!.goalsAboveReplacement : null,
        gar82,
        qualification: row?.qualification ?? null,
        ...(row?.sourceId !== undefined ? { sourceId: row.sourceId } : {}),
        ...(row?.sourceHash !== undefined
          ? { sourceHash: row.sourceHash }
          : {}),
        ...(row?.sourceFetchedAt !== undefined
          ? { sourceFetchedAt: row.sourceFetchedAt }
          : {}),
      };
    },
  );
  const past = years.filter((r) => r.seasonStartYear < current);
  const covered = past.filter((r) => r.state === "covered");
  const observed = covered.length
    ? covered.reduce((sum, r) => sum + r.goalsAboveReplacement!, 0)
    : null;
  const coveredAverage = covered.length
    ? covered.reduce((sum, r) => sum + r.gar82!, 0) / covered.length
    : null;
  if (
    (observed !== null && !Number.isFinite(observed)) ||
    (coveredAverage !== null && !Number.isFinite(coveredAverage))
  )
    throw Error("Contract contribution totals must remain finite");
  const complete = past.length > 0 && covered.length === past.length;
  const average = complete ? coveredAverage : null;
  return {
    contractId: contract.id,
    playerId: contract.playerId,
    units: "goals-above-same-position-reference",
    expectedCompletedYears: past.map((r) => r.seasonStartYear),
    coveredCompletedYears: covered.map((r) => r.seasonStartYear),
    missingYears: past
      .filter((r) => r.state === "missing")
      .map((r) => r.seasonStartYear),
    provisionalYears: past
      .filter((r) => r.state === "provisional")
      .map((r) => r.seasonStartYear),
    futureYears: years
      .filter((r) => r.state === "future")
      .map((r) => r.seasonStartYear),
    expectedYearCount: past.length,
    coveredYearCount: covered.length,
    observedDeliveredGoalsAboveReplacement: observed,
    completedDeliveredGoalsAboveReplacement: complete ? observed : null,
    completedYearsGar82Average: average,
    coveredCompletedYearsGar82Average: coveredAverage,
    finalContractGar82Average:
      contract.expirySeasonStartYear < current ? average : null,
    currentSeason: years.find((r) => r.seasonStartYear === current) ?? null,
    years,
  };
}
