"use client";

import { useMemo, useState } from "react";

import {
  useActivePlayers,
  useContracts,
  useNHLTeams,
  useSeasonState,
} from "../main";
import type {
  DraftClassCertainty,
  DraftClassPosition,
  NHLTeam,
} from "@gshl-types";
import {
  buildDraftClassRows,
  filterDraftClassRows,
  findMostRecentSeason,
  summarizeDraftClass,
} from "@gshl-utils";

export function useDraftClassExplorer() {
  const [selectedOffset, setSelectedOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<DraftClassPosition>("all");
  const [certainty, setCertainty] = useState<DraftClassCertainty>("all");
  const { currentSeason, defaultSeason, seasons } = useSeasonState();
  const draftClassSeason = useMemo(
    () => currentSeason ?? findMostRecentSeason(seasons) ?? defaultSeason,
    [currentSeason, defaultSeason, seasons],
  );
  const draftYear = Number(draftClassSeason?.year ?? new Date().getFullYear());
  const playersQuery = useActivePlayers();
  const contractsQuery = useContracts();
  const nhlTeamsQuery = useNHLTeams();
  const nhlTeams = useMemo(
    () => nhlTeamsQuery.data.filter((team): team is NHLTeam => "abbr" in team),
    [nhlTeamsQuery.data],
  );
  const rows = useMemo(
    () =>
      buildDraftClassRows({
        players: playersQuery.data ?? [],
        contracts: contractsQuery.data ?? [],
        draftYear,
        offset: selectedOffset,
      }),
    [contractsQuery.data, draftYear, playersQuery.data, selectedOffset],
  );
  const visibleRows = useMemo(
    () => filterDraftClassRows({ rows, search, position, certainty }),
    [certainty, position, rows, search],
  );
  const summary = useMemo(() => summarizeDraftClass(rows), [rows]);

  return {
    draftYear,
    selectedOffset,
    selectedYear: draftYear + selectedOffset,
    setSelectedOffset,
    search,
    setSearch,
    position,
    setPosition,
    certainty,
    setCertainty,
    rows,
    visibleRows,
    summary,
    nhlTeams,
    isLoading: playersQuery.isLoading || contractsQuery.isLoading,
  };
}
