/**
 * Navigation Helpers
 *
 * Individual hooks for managing different aspects of navigation state.
 * Each hook provides getters, setters, and smart defaults for its navigation section.
 */

import { useNavStore } from "./store";
import { usePreviousWeek, useCurrentWeek, useNextWeek } from "../hooks/useWeek";
import { useSeasonState } from "../hooks/useSeason";
import { useEffect } from "react";

/**
 * Schedule type navigation hook
 * @returns Schedule type state and setter with default fallback to "week"
 */
export function useScheduleNavigation() {
  const selectedScheduleType = useNavStore(
    (state) => state.selectedScheduleType,
  );
  const setScheduleType = useNavStore((state) => state.setScheduleType);

  return {
    selectedType: selectedScheduleType || "week",
    setSelectedType: setScheduleType,
  };
}

/**
 * Standings type navigation hook
 * @returns Standings type state and setter with default fallback to "overall"
 */
export function useStandingsNavigation() {
  const selectedStandingsType = useNavStore(
    (state) => state.selectedStandingsType,
  );
  const setStandingsType = useNavStore((state) => state.setStandingsType);

  return {
    selectedType: selectedStandingsType || "overall",
    setSelectedType: setStandingsType,
  };
}

/**
 * Locker room type navigation hook
 * @returns Locker room type state and setter with default fallback to "roster"
 */
export function useLockerRoomNavigation() {
  const selectedLockerRoomType = useNavStore(
    (state) => state.selectedLockerRoomType,
  );
  const setLockerRoomType = useNavStore((state) => state.setLockerRoomType);

  return {
    selectedType: selectedLockerRoomType || "roster",
    setSelectedType: setLockerRoomType,
  };
}

/**
 * League office type navigation hook
 * @returns League office type state and setter with default fallback to "home"
 */
export function useLeagueOfficeNavigation() {
  const selectedLeagueOfficeType = useNavStore(
    (state) => state.selectedLeagueOfficeType,
  );
  const setLeagueOfficeType = useNavStore((state) => state.setLeagueOfficeType);

  return {
    selectedType: selectedLeagueOfficeType || "home",
    setSelectedType: setLeagueOfficeType,
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

  const { data: currentWeek, isLoading: isCurrentWeekLoading } =
    useCurrentWeek();
  const { data: nextWeek, isLoading: isNextWeekLoading } = useNextWeek();
  const { data: previousWeek, isLoading: isPreviousWeekLoading } =
    usePreviousWeek();

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
  const selectedOwnerId = useNavStore((state) => state.selectedOwnerId);
  const setOwnerId = useNavStore((state) => state.setOwnerId);

  return {
    selectedOwnerId: selectedOwnerId,
    setSelectedOwnerId: setOwnerId,
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
