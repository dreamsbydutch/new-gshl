"use client";

import { useMemo, useState } from "react";
import { useNhlContractAnalytics } from "../main/useNhlContractAnalytics";
import { rankNormalizedContracts } from "../../lib/utils/domain/normalized-nhl-contracts";

const PAGE_SIZE = 50;

export function useNormalizedNhlContracts() {
  const data = useNhlContractAnalytics();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [capDrafts, setCapDrafts] = useState<Record<number, string>>({});
  const [capError, setCapError] = useState<string | null>(null);
  const [capSaved, setCapSaved] = useState(false);
  const caps = useMemo(() => {
    const result: Record<number, number> = { ...data.salaryCaps?.defaults };
    for (const row of data.salaryCaps?.overrides ?? [])
      result[row.seasonStartYear] = row.salaryCap;
    return result;
  }, [data.salaryCaps]);
  const ranked = useMemo(
    () => rankNormalizedContracts(data.contracts, caps),
    [data.contracts, caps],
  );
  const filtered = useMemo(
    () =>
      ranked
        .map((row, index) => ({
          ...row,
          rank: row.normalizedAav === null ? null : index + 1,
        }))
        .filter((row) =>
          `${row.playerName} ${row.startSeasonStartYear} ${row.expirySeasonStartYear}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        ),
    [ranked, search],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const years = useMemo(() => {
    const known = new Set(Object.keys(caps).map(Number));
    for (const contract of data.contracts) {
      for (
        let year = contract.startSeasonStartYear;
        year <=
        Math.min(
          contract.expirySeasonStartYear,
          contract.startSeasonStartYear + 30,
        );
        year++
      )
        known.add(year);
    }
    return [...known].sort((a, b) => a - b);
  }, [data.contracts, caps]);
  const saveCaps = async () => {
    setCapError(null);
    setCapSaved(false);
    const rows = Object.entries(capDrafts).map(([year, value]) => ({
      seasonStartYear: Number(year),
      salaryCap: Number(value.replace(/[$,\s]/g, "")),
    }));
    if (
      rows.some(
        (row) =>
          !Number.isFinite(row.salaryCap) ||
          row.salaryCap <= 0 ||
          row.salaryCap > 1_000_000_000,
      )
    ) {
      setCapError(
        "Enter a positive dollar amount up to $1 billion for each edited season.",
      );
      return;
    }
    try {
      await data.saveSalaryCaps.mutateAsync({ rows });
      setCapDrafts({});
      setCapSaved(true);
    } catch (error) {
      setCapError(
        error instanceof Error ? error.message : "Could not save salary caps.",
      );
    }
  };
  return {
    isLoading: data.isLoading,
    loaded: data.contracts.length,
    total: ranked.length,
    rankedCount: ranked.filter((row) => row.normalizedAav !== null).length,
    rows: filtered.slice(
      currentPage * PAGE_SIZE,
      (currentPage + 1) * PAGE_SIZE,
    ),
    resultCount: filtered.length,
    search,
    setSearch: (value: string) => {
      setSearch(value);
      setPage(0);
    },
    page: currentPage,
    pageCount,
    setPage,
    expandedId,
    setExpandedId,
    caps,
    years,
    capDrafts,
    changeCap: (year: number, value: string) => {
      setCapDrafts((current) => ({ ...current, [year]: value }));
      setCapSaved(false);
    },
    saveCaps,
    savingCaps: data.saveSalaryCaps.isPending,
    capError,
    capSaved,
  };
}
