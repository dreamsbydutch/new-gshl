/**
 * useNavSelections
 * ----------------
 * Centralizes access to persisted navigation selections (season, owner, week).
 * This avoids duplicated `useNavStore` subscriptions across derived hooks that
 * simply need the current selection context.
 */
import { useNavStore } from "@gshl-cache";

export const useNavSelections = () => {
  const selectedSeasonId = useNavStore((state) => state.selectedSeasonId);
  const selectedOwnerId = useNavStore((state) => state.selectedOwnerId);
  const selectedWeekId = useNavStore((state) => state.selectedWeekId);

  return { selectedSeasonId, selectedOwnerId, selectedWeekId };
};
