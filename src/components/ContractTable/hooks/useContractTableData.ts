import { useMemo } from "react";
import type { Contract, GSHLTeam, Player, Season } from "@gshl-types";
import { calculateCapSpace } from "../utils";

export const useContractTableData = (
  currentSeason: Season | undefined,
  currentTeam: GSHLTeam | undefined,
  contracts: Contract[] | undefined,
  players: Player[] | undefined,
) => {
  const sortedContracts = useMemo(() => {
    if (!contracts) return [];
    return contracts.sort((a, b) => +b.capHit - +a.capHit);
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

    return {
      currentYear: calculateCapSpace(contracts, 2025, 4, 19),
      year2026: calculateCapSpace(contracts, 2026, 4, 19),
      year2027: calculateCapSpace(contracts, 2027, 4, 19),
      year2028: calculateCapSpace(contracts, 2028, 4, 19),
    };
  }, [contracts]);

  const isDataReady = currentSeason && currentTeam && contracts && players;

  return {
    sortedContracts,
    capSpaceByYear,
    isDataReady,
  };
};
