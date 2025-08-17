import { useMemo } from "react";
import type { Contract, GSHLTeam, Player, Season } from "@gshl-types";

// Legacy hook moved from components/ContractTable to lib/hooks so components stay presentational.
export const useContractTableData = (
  currentSeason: Season | undefined,
  currentTeam: GSHLTeam | undefined,
  contracts: Contract[] | undefined,
  players: Player[] | undefined,
) => {
  const sortedContracts = useMemo(() => {
    if (!contracts) return [];
    return [...contracts].sort((a, b) => +b.capHit - +a.capHit);
  }, [contracts]);

  const capSpaceByYear = useMemo(() => {
    if (!contracts) {
      return {
        currentYear: 0,
        year2026: 0,
        year2027: 0,
        year2028: 0,
      };
    }
    const CAP = 25000000;
    const calc = (year: number) => {
      const cutoff = new Date(year, 3, 19);
      const active = contracts.filter((c) => c.capHitEndDate > cutoff);
      const total = active.reduce((s, c) => s + +c.capHit, 0);
      return CAP - total;
    };
    return {
      currentYear: calc(2025),
      year2026: calc(2026),
      year2027: calc(2027),
      year2028: calc(2028),
    };
  }, [contracts]);

  const isDataReady = Boolean(
    currentSeason && currentTeam && contracts && players?.length,
  );

  return {
    sortedContracts,
    capSpaceByYear,
    isDataReady,
  };
};
