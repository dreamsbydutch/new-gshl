"use client";

import { useMemo, useState } from "react";
import { useNhlPlayerTalent } from "../main/useNhlPlayerTalent";

const PAGE_SIZE = 50;
export function useNhlPlayerGarRankings() {
  const [year, setYear] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("all");
  const [page, setPage] = useState(0);
  const data = useNhlPlayerTalent(year);
  const rows = useMemo(() => {
    const people = new Map(
      data.population?.players?.map((player) => [player.playerId, player]),
    );
    const ranked = (data.population?.observations ?? [])
      .map((row) => ({
        ...row,
        name: people.get(row.playerId)?.name ?? "Unknown player",
        teams: people.get(row.playerId)?.teams ?? [],
        gar82:
          row.goalsAboveReplacement !== null &&
          row.teamGames !== null &&
          row.teamGames > 0
            ? (row.goalsAboveReplacement * 82) / row.teamGames
            : null,
      }))
      .sort(
        (a, b) =>
          (b.goalsAboveReplacement ?? -Infinity) -
            (a.goalsAboveReplacement ?? -Infinity) ||
          a.name.localeCompare(b.name),
      );
    let rank = 0;
    let previous: number | null = null;
    return ranked
      .map((row, index) => {
        if (
          row.goalsAboveReplacement !== null &&
          row.goalsAboveReplacement !== previous
        )
          rank = index + 1;
        previous = row.goalsAboveReplacement;
        return {
          ...row,
          rank: row.goalsAboveReplacement === null ? null : rank,
        };
      })
      .filter(
        (row) =>
          (position === "all" || row.position === position) &&
          `${row.name} ${row.teams.join(" ")}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      );
  }, [data.population, position, search]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  return {
    ...data,
    search,
    position,
    page: currentPage,
    pageCount,
    total: rows.length,
    rows: rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    setPage,
    changeYear: (value: number) => {
      setYear(value);
      setPage(0);
    },
    changeSearch: (value: string) => {
      setSearch(value);
      setPage(0);
    },
    changePosition: (value: string) => {
      setPosition(value);
      setPage(0);
    },
    isLoading:
      data.seasons === undefined ||
      (data.selected !== undefined && data.population === undefined),
  };
}
