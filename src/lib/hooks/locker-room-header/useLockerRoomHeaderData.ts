import { useMemo } from "react";
import type { GSHLTeam } from "@gshl-types";
import { formatOwnerName } from "@gshl-utils/locker-room-header";

/**
 * Derivation hook for LockerRoomHeader.
 * Responsibilities:
 * - Produce memoized owner display name for the provided team.
 * - Encapsulate any future header-specific derived values.
 * Pure: no side-effects or data fetching.
 * @param currentTeam Active team whose info is displayed.
 */
export const useLockerRoomHeaderData = (currentTeam: GSHLTeam) => {
  const formattedOwnerName = useMemo(
    () => formatOwnerName(currentTeam),
    [currentTeam],
  );

  return { formattedOwnerName };
};
