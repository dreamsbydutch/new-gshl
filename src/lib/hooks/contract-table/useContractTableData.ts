/**
 * useContractTableData
 * --------------------
 * Centralizes derived state for the contract table UI.
 * Returns:
 * - sortedContracts: contracts sorted descending by cap hit
 * - capSpaceWindow: remaining cap for current season context + next 4 seasons (total 5)
 * - ready: boolean indicating all required datasets are present & non-empty
 */
import { useMemo } from "react";
import type { Contract, GSHLTeam, Player, Season, NHLTeam } from "@gshl-types";
import {
  CAP_CEILING,
  CAP_SEASON_END_DAY,
  CAP_SEASON_END_MONTH,
} from "@gshl-utils";

/** Optional input params – component may render a skeleton until all are present. */
interface Params {
  currentSeason?: Season;
  currentTeam?: GSHLTeam;
  contracts?: Contract[];
  players?: Player[];
  nhlTeams?: NHLTeam[];
}

/**
 * Compute ready state + derived contract metrics for display.
 * @param currentSeason Active season metadata (used for deriving base year)
 * @param currentTeam Target team for which contracts are displayed
 * @param contracts Contract entities for the team
 * @param players Player entities (presence required for readiness)
 * @param nhlTeams NHL team list (presence required for readiness)
 * @returns { sortedContracts, capSpaceWindow, ready }
 */
export function useContractTableData({
  currentSeason,
  currentTeam,
  contracts,
  players,
  nhlTeams,
}: Params) {
  const sortedContracts = useMemo(() => {
    if (!contracts) return [];
    return [...contracts].sort((a, b) => +b.capHit - +a.capHit);
  }, [contracts]);

  const capSpaceWindow = useMemo(() => {
    // Provide stable structure even while loading
    if (!contracts) {
      return [] as { label: string; year: number; remaining: number }[];
    }
    // Assume season.name format "YYYY-YY"; fallback to current year if missing
    const seasonStartYear = currentSeason?.name
      ? parseInt(currentSeason.name.slice(0, 4), 10)
      : new Date().getFullYear();
    // Start window at the season's listed start year (previously +1, per request adjusted earlier)
    const firstAccountingYear = seasonStartYear;
    const calcRemaining = (year: number) => {
      const cutoff = new Date(year, CAP_SEASON_END_MONTH, CAP_SEASON_END_DAY);
      const active = contracts.filter(
        (c) => c.capHitEndDate instanceof Date && c.capHitEndDate > cutoff,
      );
      const total = active.reduce((sum, c) => sum + +c.capHit, 0);
      return CAP_CEILING - total;
    };
    return Array.from({ length: 5 }).map((_, idx) => {
      const year = firstAccountingYear + idx;
      return {
        label: idx === 0 ? `${year}` : `${year}`,
        year,
        remaining: calcRemaining(year),
      };
    });
  }, [contracts, currentSeason]);

  // All required relational data sets must be present & non-empty
  const ready = Boolean(
    currentSeason &&
      currentTeam &&
      contracts &&
      players?.length &&
      nhlTeams?.length,
  );

  return { sortedContracts, capSpaceWindow, ready };
}
