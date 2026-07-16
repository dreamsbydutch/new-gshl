/**
 * Navigation Helpers
 *
 * Individual hooks for managing different aspects of navigation state.
 * Each hook provides getters, setters, and smart defaults for its navigation section.
 */

import { useNavStore } from "./store";
import { useWeeks, useSeasonState } from "@gshl-hooks";
import { useEffect } from "react";

type NavStoreState = ReturnType<typeof useNavStore.getState>;

type NavigationSelectionOptions = {
  fallback?: string;
  selector: (state: NavStoreState) => string;
  setter: (state: NavStoreState) => (value: string) => void;
};

function useNavigationSelection(options: NavigationSelectionOptions) {
  const selectedValue = useNavStore(options.selector);
  const setSelectedValue = useNavStore(options.setter);
  const resolvedValue =
    selectedValue === "" ? (options.fallback ?? selectedValue) : selectedValue;

  return {
    selectedValue: resolvedValue,
    setSelectedValue,
  };
}

/**
 * Schedule type navigation hook
 * @returns Schedule type state and setter with default fallback to "week"
 */
export function useScheduleNavigation() {
  const { selectedValue, setSelectedValue } = useNavigationSelection({
    selector: (state) => state.selectedScheduleType,
    setter: (state) => state.setScheduleType,
    fallback: "week",
  });

  return {
    selectedType: selectedValue,
    setSelectedType: setSelectedValue,
  };
}

/**
 * Standings type navigation hook
 * @returns Standings type state and setter with default fallback to "overall"
 */
export function useStandingsNavigation() {
  const { selectedValue, setSelectedValue } = useNavigationSelection({
    selector: (state) => state.selectedStandingsType,
    setter: (state) => state.setStandingsType,
    fallback: "overall",
  });

  return {
    selectedType: selectedValue,
    setSelectedType: setSelectedValue,
  };
}

/**
 * Locker room type navigation hook
 * @returns Locker room type state and setter with default fallback to "roster"
 */
export function useLockerRoomNavigation() {
  const { selectedValue, setSelectedValue } = useNavigationSelection({
    selector: (state) => state.selectedLockerRoomType,
    setter: (state) => state.setLockerRoomType,
    fallback: "roster",
  });

  return {
    selectedType: selectedValue,
    setSelectedType: setSelectedValue,
  };
}

/**
 * League office type navigation hook
 * @returns League office type state and setter with default fallback to "home"
 */
export function useLeagueOfficeNavigation() {
  const { selectedValue, setSelectedValue } = useNavigationSelection({
    selector: (state) => state.selectedLeagueOfficeType,
    setter: (state) => state.setLeagueOfficeType,
    fallback: "home",
  });

  return {
    selectedType: selectedValue,
    setSelectedType: setSelectedValue,
  };
}

/**
 * Season navigation hook with smart defaults
 * Automatically selects current season → next season → most recent season
 * @returns Season data, ID, and setter with intelligent fallback logic
 */
export function useSeasonNavigation() {
  const {
    selectedSeason,
    currentSeason,
    defaultSeason,
    selectedSeasonSummary,
    currentSeasonSummary,
    defaultSeasonSummary,
    seasonOptions,
    selectedSeasonId,
    setSelectedSeasonId,
    isSelectedSeasonLoading,
    isSelectedSeasonFetching,
    refetchSelectedSeason,
  } = useSeasonState();

  return {
    selectedSeason: selectedSeason ?? currentSeason ?? defaultSeason,
    selectedSeasonSummary:
      selectedSeasonSummary ?? currentSeasonSummary ?? defaultSeasonSummary,
    currentSeasonSummary,
    defaultSeasonSummary,
    seasonOptions,
    selectedSeasonId,
    setSelectedSeasonId,
    isSelectedSeasonLoading,
    isSelectedSeasonFetching,
    refetchSelectedSeason,
  };
}

/**
 * Week navigation hook with smart defaults
 * Automatically selects current week → next week → previous week
 * @returns Week data, ID, and setter with intelligent fallback logic
 */
export function useWeekNavigation() {
  const { selectedWeekId, setWeekId, selectedSeasonId } = useNavStore();

  const { data: currentWeekData, isLoading: isCurrentWeekLoading } = useWeeks({
    seasonId: selectedSeasonId,
    timeMode: "current",
  });
  const { data: nextWeekData, isLoading: isNextWeekLoading } = useWeeks({
    seasonId: selectedSeasonId,
    timeMode: "next",
  });
  const { data: previousWeekData, isLoading: isPreviousWeekLoading } = useWeeks(
    { seasonId: selectedSeasonId, timeMode: "previous" },
  );

  // Extract first week from array results
  const currentWeek = currentWeekData?.[0];
  const nextWeek = nextWeekData?.[0];
  const previousWeek = previousWeekData?.[0];

  useEffect(() => {
    if (selectedWeekId || !selectedSeasonId) return;

    const isLoading =
      isCurrentWeekLoading || isNextWeekLoading || isPreviousWeekLoading;
    if (isLoading) return;

    if (currentWeek?.id) {
      setWeekId(currentWeek.id);
      return;
    }

    if (nextWeek?.id) {
      setWeekId(nextWeek.id);
      return;
    }

    if (previousWeek?.id) {
      setWeekId(previousWeek.id);
      return;
    }
  }, [
    selectedWeekId,
    selectedSeasonId,
    currentWeek,
    nextWeek,
    previousWeek,
    isCurrentWeekLoading,
    isNextWeekLoading,
    isPreviousWeekLoading,
    setWeekId,
  ]);

  return {
    selectedWeek: currentWeek ?? nextWeek ?? previousWeek,
    selectedWeekId: selectedWeekId,
    setSelectedWeekId: setWeekId,
  };
}

/**
 * Team/owner navigation hook
 * @returns Owner ID and setter for team selection
 */
export function useTeamNavigation() {
  const { selectedValue, setSelectedValue } = useNavigationSelection({
    selector: (state) => state.selectedOwnerId,
    setter: (state) => state.setOwnerId,
  });

  return {
    selectedOwnerId: selectedValue,
    setSelectedOwnerId: setSelectedValue,
  };
}

/**
 * Master navigation hook
 * @returns All navigation sections in a single object
 */
export function useAllNavigation() {
  const schedule = useScheduleNavigation();
  const standings = useStandingsNavigation();
  const lockerRoom = useLockerRoomNavigation();
  const leagueOffice = useLeagueOfficeNavigation();
  const season = useSeasonNavigation();
  const week = useWeekNavigation();
  const team = useTeamNavigation();

  return {
    schedule,
    standings,
    lockerRoom,
    leagueOffice,
    season,
    week,
    team,
  };
}
