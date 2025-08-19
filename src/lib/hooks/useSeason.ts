"use client";

import { useSeasonNavigation } from "@gshl-cache";
import { clientApi as api } from "@gshl-trpc";

export function useActiveSeason() {
  const { selectedSeasonId } = useSeasonNavigation();
  const data = api.season.getById.useQuery({ id: selectedSeasonId });
  return {
    ...data,
    data: {
      ...data.data,
      startDate: new Date(data.data?.startDate ?? ""),
      endDate: new Date(data.data?.endDate ?? ""),
      signingEndDate: new Date(data.data?.signingEndDate ?? ""),
    },
  };
}
export function useCurrentSeason() {
  const now = new Date();
  const year = now.getMonth() < 6 ? now.getFullYear() : now.getFullYear() + 1;

  const data = api.season.getAll.useQuery({ where: { year } });
  return {
    ...data,
    data: data.data?.map((season) => ({
      ...season,
      startDate: new Date(season.startDate ?? ""),
      endDate: new Date(season.endDate ?? ""),
      signingEndDate: new Date(season.signingEndDate ?? ""),
    })),
  };
}

export function useAllSeasons() {
  const data = api.season.getAll.useQuery({ orderBy: { year: "asc" } });
  return {
    ...data,
    data: data.data?.map((season) => ({
      ...season,
      startDate: new Date(season.startDate ?? ""),
      endDate: new Date(season.endDate ?? ""),
      signingEndDate: new Date(season.signingEndDate ?? ""),
    })),
  };
}

export function useSeasonById(id: number) {
  const data = api.season.getById.useQuery({ id });
  return {
    ...data,
    data: {
      ...data.data,
      startDate: new Date(data.data?.startDate ?? ""),
      endDate: new Date(data.data?.endDate ?? ""),
      signingEndDate: new Date(data.data?.signingEndDate ?? ""),
    },
  };
}
export function useSeasonByYear(year: number) {
  const data = api.season.getAll.useQuery({ where: { year } });
  return {
    ...data,
    data: data.data?.map((season) => ({
      ...season,
      startDate: new Date(season.startDate ?? ""),
      endDate: new Date(season.endDate ?? ""),
      signingEndDate: new Date(season.signingEndDate ?? ""),
    })),
  };
}
