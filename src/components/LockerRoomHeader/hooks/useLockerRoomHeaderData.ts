import { useMemo } from "react";
import type { GSHLTeam } from "@gshl-types";
import { formatOwnerName } from "../utils";

export const useLockerRoomHeaderData = (currentTeam: GSHLTeam) => {
  const formattedOwnerName = useMemo(() => {
    return formatOwnerName(currentTeam);
  }, [currentTeam]);

  return {
    formattedOwnerName,
  };
};
