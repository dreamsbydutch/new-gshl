"use client";

import { useEffect, useMemo } from "react";

import {
  resolveDefaultSeason,
  findCurrentSeason,
  findSeasonById,
  toSeasonSummary,
  buildSeasonSummaries,
} from "@gshl-utils";
import { clientApi as api } from "@gshl-trpc";

import { useNavStore } from "../cache/store";

type SeasonStateOptions = {
  autoSelect?: boolean;
  referenceDate?: Date;
};

export function useActiveSeason() {
  const selectedSeasonId = useNavStore((state) => state.selectedSeasonId);
  const data = api.season.getById.useQuery(
    { id: selectedSeasonId },
    { enabled: Boolean(selectedSeasonId) },
  );

  return {
    ...data,
    data: data.data,
  };
}

export function useAllSeasons() {
  const data = api.season.getAll.useQuery({ orderBy: { year: "asc" } });
  return {
    ...data,
    data: data.data,
  };
}

export function useCurrentSeason(options: { referenceDate?: Date } = {}) {
  const { referenceDate = new Date() } = options;
  const query = useAllSeasons();
  const currentSeason = useMemo(
    () => findCurrentSeason(query.data, referenceDate),
    [query.data, referenceDate],
  );

  return {
    ...query,
    data: currentSeason ? [currentSeason] : [],
  };
}

export function useSeasonState(options: SeasonStateOptions = {}) {
  const { autoSelect = true, referenceDate = new Date() } = options;
  const query = useAllSeasons();
  const seasons = useMemo(() => query.data ?? [], [query.data]);
  const seasonOptions = useMemo(() => buildSeasonSummaries(seasons), [seasons]);

  const selectedSeasonId = useNavStore((state) => state.selectedSeasonId);
  const setSelectedSeasonId = useNavStore((state) => state.setSeasonId);

  const currentSeason = useMemo(
    () => findCurrentSeason(seasons, referenceDate),
    [seasons, referenceDate],
  );

  const selectedSeason = useMemo(
    () => findSeasonById(seasons, selectedSeasonId),
    [seasons, selectedSeasonId],
  );

  const defaultSeason = useMemo(
    () => resolveDefaultSeason(seasons, referenceDate),
    [seasons, referenceDate],
  );

  const {
    data: selectedSeasonData,
    isLoading: isSelectedSeasonLoading,
    isFetching: isSelectedSeasonFetching,
    refetch: refetchSelectedSeason,
  } = api.season.getById.useQuery(
    { id: String(selectedSeasonId ?? "") },
    { enabled: Boolean(selectedSeasonId) },
  );

  const resolvedSelectedSeason = selectedSeasonData ?? selectedSeason;

  const currentSeasonSummary = useMemo(
    () => toSeasonSummary(currentSeason),
    [currentSeason],
  );

  const selectedSeasonSummary = useMemo(
    () => toSeasonSummary(resolvedSelectedSeason),
    [resolvedSelectedSeason],
  );

  const defaultSeasonSummary = useMemo(
    () => toSeasonSummary(defaultSeason),
    [defaultSeason],
  );

  useEffect(() => {
    if (!autoSelect) return;
    if (query.isLoading || query.isFetching) return;
    if (selectedSeasonId) return;
    if (!seasons.length) return;
    if (!defaultSeason?.id) return;

    setSelectedSeasonId(String(defaultSeason.id));
  }, [
    autoSelect,
    query.isLoading,
    query.isFetching,
    selectedSeasonId,
    seasons,
    defaultSeason,
    setSelectedSeasonId,
  ]);

  return {
    ...query,
    seasons,
    currentSeason,
    currentSeasonSummary,
    selectedSeason: resolvedSelectedSeason,
    selectedSeasonSummary,
    defaultSeason,
    defaultSeasonSummary,
    seasonOptions,
    selectedSeasonId,
    setSelectedSeasonId,
    isSelectedSeasonLoading,
    isSelectedSeasonFetching,
    refetchSelectedSeason,
  };
}

export function useSeasonById(id: string) {
  const data = api.season.getById.useQuery({ id });
  return {
    ...data,
    data: data.data,
  };
}

export function useSeasonByYear(year: number) {
  const data = api.season.getAll.useQuery({ where: { year } });
  return {
    ...data,
    data: data.data,
  };
}
