"use client";

import { useMemo, useState } from "react";
import { useNhlContractAnalytics } from "../main/useNhlContractAnalytics";
import { rankNormalizedContracts } from "../../lib/utils/domain/normalized-nhl-contracts";
import { useNhlContractTalent } from "../main/useNhlContractTalent";
import { buildNhlContractTalentViews } from "../../lib/utils/domain/nhl-contract-talent-view";
import { parseNhlTalentForecastArtifact } from "../../lib/utils/domain/nhl-contract-talent-forecast";
import forecastJson from "../../lib/data/nhl-contract-talent-forecast.json";
import type {
  NhlContractTalentView,
  NhlContractSort,
} from "../../lib/types/nhl-contract-talent-view";

const forecastReference = parseNhlTalentForecastArtifact(forecastJson);

const PAGE_SIZE = 50;

export function useNormalizedNhlContracts() {
  const data = useNhlContractAnalytics();
  const talent = useNhlContractTalent();
  const [sortBy, setSortBy] = useState<NhlContractSort>("salary");
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
  const salaryRanked = useMemo(
    () => rankNormalizedContracts(data.contracts, caps),
    [data.contracts, caps],
  );
  const talentViews = useMemo(() => {
    if (talent.isLoading || talent.error)
      return new Map<string, NhlContractTalentView>();
    const current =
      talent.populations[0]?.currentSeasonStartYear ??
      forecastReference.cutoffYear;
    return buildNhlContractTalentViews(
      data.contracts,
      talent.populations,
      forecastReference,
      current,
    );
  }, [data.contracts, talent.isLoading, talent.error, talent.populations]);
  const ranked = useMemo(
    () =>
      salaryRanked
        .map((row) => {
          const scores = talentViews.get(row.id);
          return {
            ...row,
            talent: scores,
            actualTalent: scores?.actual?.completedYearsGar82Average ?? null,
            forecastTalent: scores?.forecast.averageGar82 ?? null,
          };
        })
        .sort((a, b) => {
          if (sortBy === "salary") return 0;
          const field = sortBy === "actual" ? "actualTalent" : "forecastTalent";
          return (
            (b[field] ?? -Infinity) - (a[field] ?? -Infinity) ||
            a.playerName.localeCompare(b.playerName) ||
            a.id.localeCompare(b.id)
          );
        }),
    [salaryRanked, talentViews, sortBy],
  );
  const rankedRows = useMemo(() => {
    let previous: number | null = null,
      lastRank = 0;
    return ranked.map((row, index) => {
      if (sortBy === "salary")
        return { ...row, rank: row.normalizedAav === null ? null : index + 1 };
      const score = sortBy === "actual" ? row.actualTalent : row.forecastTalent;
      if (score !== null && score !== previous) lastRank = index + 1;
      previous = score;
      return { ...row, rank: score === null ? null : lastRank };
    });
  }, [ranked, sortBy]);
  const filtered = useMemo(
    () =>
      rankedRows.filter((row) =>
        `${row.playerName} ${row.startSeasonStartYear} ${row.expirySeasonStartYear}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      ),
    [rankedRows, search],
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
    isLoading: data.isLoading || (sortBy !== "salary" && talent.isLoading),
    loaded: data.contracts.length,
    total: ranked.length,
    rankedCount: rankedRows.filter((row) => row.rank !== null).length,
    sortBy,
    setSortBy: (value: NhlContractSort) => {
      setSortBy(value);
      setPage(0);
    },
    talentLoading: talent.isLoading,
    talentError: talent.error,
    talentLoadedSeasons: talent.loadedSeasons,
    talentTotalSeasons: talent.totalSeasons,
    forecastOriginYear: forecastReference.cutoffYear,
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
