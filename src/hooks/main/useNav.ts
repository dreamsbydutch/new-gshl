/**
 * Returns the current persisted navigation selections and reset action in a
 * single shallow-subscribed object for components that need navigation context.
 */
import { useShallow } from "zustand/react/shallow";
import { useNavStore } from "@gshl-cache";
import { useEffect, useState } from "react";

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
  const resetNavigation = useNavStore((state) => state.resetNavigation);
  return { resetNavigation };
}

export function useSelectedSeasonId() {
  const selectedSeasonId = useNavStore((state) => state.selectedSeasonId);
  return { selectedSeasonId };
}

/**
 * Persistence hydrates after the server/client render boundary. Contextual URL
 * defaults must wait for this signal or they can replace a user's stored state
 * with the store's legacy placeholder defaults.
 */
export function useNavigationHydration() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(useNavStore.persist.hasHydrated());
    const stopHydrating = useNavStore.persist.onHydrate(() => {
      setHasHydrated(false);
    });
    const finishHydrating = useNavStore.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });

    return () => {
      stopHydrating();
      finishHydrating();
    };
  }, []);

  return { hasHydrated };
}
