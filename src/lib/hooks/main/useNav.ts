/**
 * useNav
 * ----------------
 * Centralizes access to persisted navigation selections (season, owner, week).
 * This avoids duplicated `useNavStore` subscriptions across derived hooks that
 * simply need the current selection context.
 */
import { useNavStore } from "@gshl-cache";

export const useNav = () => {
  const selectedSeasonId = useNavStore((state) => state.selectedSeasonId);
  const selectedOwnerId = useNavStore((state) => state.selectedOwnerId);
  const selectedWeekId = useNavStore((state) => state.selectedWeekId);
  const selectedLeagueOfficeType = useNavStore(
    (state) => state.selectedLeagueOfficeType,
  );
  const selectedLockerRoomType = useNavStore(
    (state) => state.selectedLockerRoomType,
  );
  const selectedScheduleType = useNavStore(
    (state) => state.selectedScheduleType,
  );
  const selectedStandingsType = useNavStore(
    (state) => state.selectedStandingsType,
  );

  return {
    selectedSeasonId,
    selectedOwnerId,
    selectedWeekId,
    selectedLeagueOfficeType,
    selectedLockerRoomType,
    selectedScheduleType,
    selectedStandingsType,
  };
};
