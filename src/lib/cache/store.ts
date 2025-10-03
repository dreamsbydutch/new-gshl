/**
 * Navigation State Store
 *
 * Zustand store for managing navigation state across the application
 * with persistence across browser sessions.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_STORE_STATE } from "./config";

interface NavState {
  selectedScheduleType: string;
  selectedSeasonId: string;
  selectedWeekId: string;
  selectedOwnerId: string;
  selectedLockerRoomType: string;
  selectedLeagueOfficeType: string;
  selectedStandingsType: string;

  setScheduleType: (type: string) => void;
  setSeasonId: (id: string) => void;
  setWeekId: (id: string) => void;
  setOwnerId: (id: string) => void;
  setLockerRoomType: (type: string) => void;
  setLeagueOfficeType: (type: string) => void;
  setStandingsType: (type: string) => void;
  resetNavigation: () => void;
  setDefaults: (defaults: Partial<NavState>) => void;
}

/**
 * Navigation state store with persistence
 * @returns Zustand store hook for navigation state
 */
export const useNavStore = create<NavState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STORE_STATE,

      setScheduleType: (type) => set({ selectedScheduleType: type }),
      setSeasonId: (id) => set({ selectedSeasonId: id }),
      setWeekId: (id) => set({ selectedWeekId: id }),
      setOwnerId: (id) => set({ selectedOwnerId: id }),
      setLockerRoomType: (type) => set({ selectedLockerRoomType: type }),
      setLeagueOfficeType: (type) => set({ selectedLeagueOfficeType: type }),
      setStandingsType: (type) => set({ selectedStandingsType: type }),
      resetNavigation: () => set(DEFAULT_STORE_STATE),
      setDefaults: (defaults) => set({ ...get(), ...defaults }),
    }),
    {
      name: "gshl-nav-state",
      partialize: (state) => ({
        selectedScheduleType: state.selectedScheduleType,
        selectedSeasonId: state.selectedSeasonId,
        selectedWeekId: state.selectedWeekId,
        selectedOwnerId: state.selectedOwnerId,
        selectedLockerRoomType: state.selectedLockerRoomType,
        selectedLeagueOfficeType: state.selectedLeagueOfficeType,
        selectedStandingsType: state.selectedStandingsType,
      }),
    },
  ),
);
