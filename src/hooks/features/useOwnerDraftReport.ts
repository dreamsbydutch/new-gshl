"use client";
import { useState } from "react";
import { useOwnerDraftHistory } from "../main/useOwnerDraftHistory";

export function useOwnerDraftReport(ownerId: string | null | undefined) {
  const [seasonId, selectSeason] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const query = useOwnerDraftHistory(ownerId, seasonId);
  const picks = query.data?.picks ?? [];
  const selections = picks.filter((pick) => pick.playerId && !pick.signing);
  const graded = selections.filter((pick) => pick.surplus !== null);
  const hits = graded.filter((pick) => pick.surplus! > 0);
  const positions = ["F", "D", "G"].map((position) => ({
    position,
    count: selections.filter((pick) => pick.position === position).length,
  }));
  const retained = selections.filter((pick) => pick.days !== null);
  const ranked = [...graded].sort((a, b) => b.surplus! - a.surplus!);
  return {
    ...query,
    selectSeason,
    filter,
    setFilter,
    selections,
    graded,
    hits,
    positions,
    season: query.data?.seasons.find(
      (season) => season.id === query.data?.selectedSeasonId,
    ),
    averageDays: retained.length
      ? retained.reduce((sum, pick) => sum + pick.days!, 0) / retained.length
      : null,
    best: ranked.find((pick) => pick.surplus! > 0),
    worst: [...ranked].reverse().find((pick) => pick.surplus! < 0),
    visiblePicks: picks.filter(
      (pick) =>
        filter === "all" ||
        (filter === "hits" ? (pick.surplus ?? 0) > 0 : (pick.surplus ?? 0) < 0),
    ),
  };
}
