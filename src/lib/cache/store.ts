/**
 * Navigation State Store
 *
 * Zustand store for managing navigation state across the application
 * with persistence across browser sessions.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NavigationStoreState } from "@gshl-types";

const DEFAULT_STORE_STATE = {
  selectedScheduleType: "week",
  selectedSeasonId: "11",
  selectedWeekId: "0",
  selectedOwnerId: "1",
  selectedLockerRoomType: "roster",
  selectedLeagueOfficeType: "home",
  selectedStandingsType: "overall",
} as const;

/**
 * Navigation state store with persistence
 * @returns Zustand store hook for navigation state
 */
export const useNavStore = create<NavigationStoreState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STORE_STATE,

      setScheduleType: (type) => set({ selectedScheduleType: type }),
      // Week ids belong to a season. Reset the week whenever the season
      // changes so schedule queries never combine a new season with a stale
      // week from the previously selected season.
      setSeasonId: (id) =>
        set((state) =>
          state.selectedSeasonId === id
            ? { selectedSeasonId: id }
            : { selectedSeasonId: id, selectedWeekId: "0" },
        ),
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
