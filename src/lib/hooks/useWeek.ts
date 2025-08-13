import { convertInputDate } from "@gshl-utils";
import { clientApi as api } from "@gshl-trpc";

export function useCurrentWeek(weekId?: number) {
  const now = new Date();
  const { data: season } = api.season.getActive.useQuery();
  const { data: weeks } = weekId
    ? api.week.getAll.useQuery({
        where: { id: weekId },
        orderBy: { startDate: "asc" },
      })
    : api.week.getAll.useQuery({
        where: { seasonId: season?.id },
        orderBy: { startDate: "asc" },
      });
  const currentWeek = weekId
    ? weeks?.[0]
    : weeks?.find(
        (week) =>
          convertInputDate(+week.startDate) <= now &&
          convertInputDate(+week.endDate) >= now,
      );

  return {
    data: currentWeek
      ? {
          ...currentWeek,
          startDate: convertInputDate(+currentWeek.startDate),
          endDate: convertInputDate(+currentWeek.endDate),
        }
      : undefined,
    isLoading: !currentWeek,
    error: null,
  };
}
export function usePreviousWeek(weekId?: number) {
  const now = new Date();
  const { data: season } = api.season.getActive.useQuery();
  const { data: weeks } = weekId
    ? api.week.getAll.useQuery({ orderBy: { startDate: "asc" } })
    : api.week.getAll.useQuery({
        where: { seasonId: season?.id },
        orderBy: { startDate: "asc" },
      });
  const mostRecentWeek = weekId
    ? weeks?.[weeks?.findIndex((week) => week.id === weekId) - 1]
    : weeks?.find(
        (week) =>
          convertInputDate(+week.startDate) < now &&
          convertInputDate(+week.endDate) < now,
      );

  return {
    data: mostRecentWeek
      ? {
          ...mostRecentWeek,
          startDate: convertInputDate(+mostRecentWeek.startDate),
          endDate: convertInputDate(+mostRecentWeek.endDate),
        }
      : undefined,
    isLoading: !mostRecentWeek,
    error: null,
  };
}
export function useNextWeek(weekId?: number) {
  const now = new Date();
  const { data: season } = api.season.getActive.useQuery();
  const { data: weeks } = weekId
    ? api.week.getAll.useQuery({ orderBy: { startDate: "asc" } })
    : api.week.getAll.useQuery({
        where: { seasonId: season?.id },
        orderBy: { startDate: "asc" },
      });
  const nextWeek = weekId
    ? weeks?.[weeks?.findIndex((week) => week.id === weekId) + 1]
    : weeks?.find(
        (week) =>
          convertInputDate(+week.startDate) > now &&
          convertInputDate(+week.endDate) > now,
      );

  return {
    data: nextWeek
      ? {
          ...nextWeek,
          startDate: convertInputDate(+nextWeek.startDate),
          endDate: convertInputDate(+nextWeek.endDate),
        }
      : undefined,
    isLoading: !nextWeek,
    error: null,
  };
}

export function useWeekById(weekId: number) {
  const {
    data: week,
    isLoading,
    error,
  } = api.week.getById.useQuery({ id: weekId });

  return {
    data: week
      ? {
          ...week,
          startDate: convertInputDate(+week.startDate),
          endDate: convertInputDate(+week.endDate),
        }
      : undefined,
    isLoading,
    error,
  };
}

export function useWeeksBySeasonId(seasonId: number) {
  const {
    data: weeks,
    isLoading,
    error,
  } = api.week.getAll.useQuery({
    where: { seasonId },
    orderBy: { startDate: "asc" },
  });
  return {
    data: weeks?.map((week) => ({
      ...week,
      startDate: convertInputDate(+week.startDate),
      endDate: convertInputDate(+week.endDate),
    })),
    isLoading,
    error,
  };
}

export function useRegularSeasonWeeks(seasonId?: number) {
  const {
    data: weeks,
    isLoading,
    error,
  } = api.week.getAll.useQuery({
    where: { seasonId, isPlayoffs: false },
    orderBy: { startDate: "asc" },
  });
  return {
    data: weeks?.map((week) => ({
      ...week,
      startDate: convertInputDate(+week.startDate),
      endDate: convertInputDate(+week.endDate),
    })),
    isLoading,
    error,
  };
}
export function usePlayoffWeeks(seasonId?: number) {
  const {
    data: weeks,
    isLoading,
    error,
  } = api.week.getAll.useQuery({
    where: { seasonId, isPlayoffs: true },
    orderBy: { startDate: "asc" },
  });

  return {
    data: weeks?.map((week) => ({
      ...week,
      startDate: convertInputDate(+week.startDate),
      endDate: convertInputDate(+week.endDate),
    })),
    isLoading,
    error,
  };
}

export function useAllWeeks() {
  const {
    data: weeks,
    isLoading,
    error,
  } = api.week.getAll.useQuery({ orderBy: { startDate: "asc" } });

  return {
    data: weeks?.map((week) => ({
      ...week,
      startDate: convertInputDate(+week.startDate),
      endDate: convertInputDate(+week.endDate),
    })),
    isLoading,
    error,
  };
}
