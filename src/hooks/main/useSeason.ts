"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type {
  Season,
  UseSeasonStateOptions,
  UseSeasonsOptions,
} from "@gshl-types";
import {
  buildSeasonSummaries,
  findCurrentSeason,
  findSeasonById,
  isSeasonPickable,
  resolveDefaultSeason,
  toSeasonSummary,
} from "@gshl-utils";
import { useNavStore } from "@gshl-cache";

export function useSeasons(options: UseSeasonsOptions = {}) {
  const {
    seasonId,
    year,
    active = false,
    current = false,
    referenceDate = new Date(),
    orderBy = { year: "asc" },
    enabled = true,
  } = options;
  const selectedSeasonId = useNavStore((state) =>
    active ? state.selectedSeasonId : null,
  );
  const normalizedSeasonId = seasonId
    ? String(seasonId)
    : active
      ? selectedSeasonId
      : null;
  const where: Record<string, unknown> = {};
  if (normalizedSeasonId) where.id = normalizedSeasonId;
  if (year !== undefined) where.year = year;

  const result = useQuery(
    api.frontend.seasons,
    enabled
      ? {
          ...(Object.keys(where).length ? { where } : {}),
          orderBy,
        }
      : "skip",
  );
  const seasons = (result ?? []) as unknown as Season[];
  const data = current
    ? (() => {
        const season = findCurrentSeason(seasons, referenceDate);
        return season ? [season] : [];
      })()
    : seasons;

  return {
    data,
    isLoading: enabled && result === undefined,
    isFetching: enabled && result === undefined,
    error: null,
  };
}

export function useSeasonState(options: UseSeasonStateOptions = {}) {
  const { autoSelect = true, referenceDate = new Date() } = options;
  const query = useSeasons({ orderBy: { year: "asc" } });
  const seasons = useMemo(() => query.data ?? [], [query.data]);
  const selectedSeasonId = useNavStore((state) => state.selectedSeasonId);
  const setSelectedSeasonId = useNavStore((state) => state.setSeasonId);
  const currentSeason = useMemo(
    () => findCurrentSeason(seasons, referenceDate),
    [seasons, referenceDate],
  );
  const storedSelectedSeason = useMemo(
    () => findSeasonById(seasons, selectedSeasonId),
    [seasons, selectedSeasonId],
  );
  const defaultSeason = useMemo(
    () => resolveDefaultSeason(seasons, referenceDate),
    [seasons, referenceDate],
  );
  const selectableDefaultSeason = useMemo(
    () =>
      resolveDefaultSeason(
        seasons.filter((season) => isSeasonPickable(season, referenceDate)),
        referenceDate,
      ),
    [seasons, referenceDate],
  );
  const selectedSeason =
    storedSelectedSeason &&
    isSeasonPickable(storedSelectedSeason, referenceDate)
      ? storedSelectedSeason
      : selectableDefaultSeason;

  useEffect(() => {
    if (
      autoSelect &&
      !query.isLoading &&
      selectedSeason?.id &&
      String(selectedSeason.id) !== String(selectedSeasonId)
    ) {
      setSelectedSeasonId(String(selectedSeason.id));
    }
  }, [
    autoSelect,
    query.isLoading,
    selectedSeason,
    selectedSeasonId,
    setSelectedSeasonId,
  ]);

  return {
    ...query,
    seasons,
    currentSeason,
    currentSeasonSummary: toSeasonSummary(currentSeason),
    selectedSeason,
    selectedSeasonSummary: toSeasonSummary(selectedSeason),
    defaultSeason,
    defaultSeasonSummary: toSeasonSummary(defaultSeason),
    seasonOptions: buildSeasonSummaries(seasons, referenceDate),
    selectedSeasonId,
    setSelectedSeasonId,
    isSelectedSeasonLoading: query.isLoading,
    isSelectedSeasonFetching: query.isLoading,
    refetchSelectedSeason: undefined,
  };
}
