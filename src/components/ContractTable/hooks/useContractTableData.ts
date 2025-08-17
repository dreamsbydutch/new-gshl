/**
 * useContractTableData
 * --------------------
 * Centralizes derived state for the contract table UI.
 * Returns:
 * - sortedContracts: contracts sorted descending by cap hit
 * - capSpaceByYear: remaining cap for current + next 3 seasons
 * - ready: boolean indicating all required datasets are present & non-empty
 */
import { useMemo } from "react";
import type { Contract, GSHLTeam, Player, Season, NHLTeam } from "@gshl-types";
import {
  CAP_CEILING,
  CAP_SEASON_END_DAY,
  CAP_SEASON_END_MONTH,
} from "../utils";

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
 * @returns { sortedContracts, capSpaceByYear, ready }
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

  const capSpaceByYear = useMemo(() => {
    if (!contracts) {
      return { currentYear: 0, year2026: 0, year2027: 0, year2028: 0 };
    }
    // Derive baseYear: first season year + 1 (e.g. "2024-25" -> 2025)
    const firstYear = currentSeason?.name
      ? parseInt(currentSeason.name.slice(0, 4), 10)
      : new Date().getFullYear();
    const baseYear = firstYear + 1; // matches prior hard-coded 2025 example for 2024-25 season
    const calc = (year: number) => {
      const cutoff = new Date(year, CAP_SEASON_END_MONTH, CAP_SEASON_END_DAY);
      const active = contracts.filter((c) => c.capHitEndDate > cutoff);
      const total = active.reduce((s, c) => s + +c.capHit, 0);
      return CAP_CEILING - total;
    };
    return {
      currentYear: calc(baseYear),
      year2026: calc(baseYear + 1),
      year2027: calc(baseYear + 2),
      year2028: calc(baseYear + 3),
    };
  }, [contracts, currentSeason]);

  // All required relational data sets must be present & non-empty
  const ready = Boolean(
    currentSeason &&
      currentTeam &&
      contracts &&
      players?.length &&
      nhlTeams?.length,
  );

  return { sortedContracts, capSpaceByYear, ready };
}
