import { clientApi as api } from "@gshl-trpc";

export function useCurrentWeek(weekId?: string) {
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
          week.startDate instanceof Date &&
          week.endDate instanceof Date &&
          week.startDate <= now &&
          week.endDate >= now,
      );

  return {
    data: currentWeek,
    isLoading: !currentWeek,
    error: null,
  };
}

export function usePreviousWeek(weekId?: string) {
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
          week.startDate instanceof Date &&
          week.endDate instanceof Date &&
          week.startDate < now &&
          week.endDate < now,
      );

  return {
    data: mostRecentWeek ?? undefined,
    isLoading: !mostRecentWeek,
    error: null,
  };
}

export function useNextWeek(weekId?: string) {
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
          week.startDate instanceof Date &&
          week.endDate instanceof Date &&
          week.startDate > now &&
          week.endDate > now,
      );

  return {
    data: nextWeek ?? undefined,
    isLoading: !nextWeek,
    error: null,
  };
}

export function useWeekById(weekId: string) {
  const {
    data: week,
    isLoading,
    error,
  } = api.week.getById.useQuery({ id: weekId });
  return {
    data: week ?? undefined,
    isLoading,
    error,
  };
}

export function useWeeksBySeasonId(seasonId: string) {
  const {
    data: weeks,
    isLoading,
    error,
  } = api.week.getAll.useQuery({
    where: { seasonId: String(seasonId) },
    orderBy: { startDate: "asc" },
  });
  return {
    data: weeks,
    isLoading,
    error,
  };
}

export function useRegularSeasonWeeks(seasonId?: string) {
  const {
    data: weeks,
    isLoading,
    error,
  } = api.week.getAll.useQuery({
    where: {
      seasonId: seasonId ? String(seasonId) : undefined,
      isPlayoffs: false,
    },
    orderBy: { startDate: "asc" },
  });
  return {
    data: weeks,
    isLoading,
    error,
  };
}

export function usePlayoffWeeks(seasonId?: string) {
  const {
    data: weeks,
    isLoading,
    error,
  } = api.week.getAll.useQuery({
    where: {
      seasonId: seasonId ? String(seasonId) : undefined,
      isPlayoffs: true,
    },
    orderBy: { startDate: "asc" },
  });
  return {
    data: weeks,
    isLoading,
    error,
  };
}

export function useAllWeeks() {
  const {
    data: weeks,
    isLoading,
    error,
  } = api.week.getAll.useQuery({
    orderBy: { startDate: "asc" },
  });
  return {
    data: weeks,
    isLoading,
    error,
  };
}
