/**
 * Returns the current persisted navigation selections and reset action in a
 * single shallow-subscribed object for components that need navigation context.
 */
import { useShallow } from "zustand/react/shallow";
import { useNavStore } from "@gshl-cache";

export function useNav() {
  return useNavStore(
    useShallow((state) => ({
      selectedSeasonId: state.selectedSeasonId,
      selectedOwnerId: state.selectedOwnerId,
      selectedWeekId: state.selectedWeekId,
      selectedLeagueOfficeType: state.selectedLeagueOfficeType,
      selectedLockerRoomType: state.selectedLockerRoomType,
      selectedScheduleType: state.selectedScheduleType,
      selectedStandingsType: state.selectedStandingsType,
      resetNavigation: state.resetNavigation,
    })),
  );
}

/**
 * Returns only the navigation reset action for callers that do not need the
 * rest of the navigation store state.
 */
export function useNavigationReset() {
  return useNavStore((state) => state.resetNavigation);
}

export function useSelectedSeasonId() {
  return useNavStore((state) => state.selectedSeasonId);
}
