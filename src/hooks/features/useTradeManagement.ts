"use client";
import { useState } from "react";
import { useSeasons } from "../main/useSeason";
import { useTeams } from "../main/useTeam";
import { useTrades } from "../main/useTrades";
import { getTorontoDate } from "@gshl-utils/domain/contracts";
import type { TradeReviewInput } from "@gshl-lib/types/trades";

export function useTradeManagement() {
  const seasons = useSeasons();
  const season = seasons.data.find((s) => s.isActive);
  const teamsQuery = useTeams({
    seasonId: season?.id,
    enabled: Boolean(season),
  });
  const teams = [...teamsQuery.data].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? ""),
  );
  const [teamAId, setA] = useState("");
  const [teamBId, setB] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(getTorontoDate);
  const [playerIdsA, setPlayersA] = useState<string[]>([]),
    [playerIdsB, setPlayersB] = useState<string[]>([]);
  const [pickIdsA, setPicksA] = useState<string[]>([]),
    [pickIdsB, setPicksB] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState<TradeReviewInput | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const input = {
    seasonId: season?.id ?? "",
    teamAId,
    teamBId,
    effectiveDate,
    playerIdsA,
    playerIdsB,
    pickIdsA,
    pickIdsB,
    notes,
  };
  const remote = useTrades(input, review);
  const clear = () => {
    setPlayersA([]);
    setPlayersB([]);
    setPicksA([]);
    setPicksB([]);
    setReview(null);
    setError("");
  };
  const chooseTeam = (side: "A" | "B", id: string) => {
    clear();
    setMessage("");
    if (side === "A") setA(id);
    else setB(id);
  };
  const toggle = (side: "A" | "B", kind: "player" | "pick", id: string) => {
    const set =
      kind === "player"
        ? side === "A"
          ? setPlayersA
          : setPlayersB
        : side === "A"
          ? setPicksA
          : setPicksB;
    set((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };
  const sides = (["A", "B"] as const).map((side) => {
    const owner =
      side === "A" ? remote.catalog?.ownerAId : remote.catalog?.ownerBId;
    const other =
      side === "A" ? remote.catalog?.ownerBId : remote.catalog?.ownerAId;
    return {
      side,
      teamId: side === "A" ? teamAId : teamBId,
      selectedPlayers: side === "A" ? playerIdsA : playerIdsB,
      selectedPicks: side === "A" ? pickIdsA : pickIdsB,
      players: (remote.catalog?.players ?? [])
        .filter((p) =>
          p.contractOwnerIds.length
            ? p.contractOwnerIds.includes(owner!)
            : p.ownerId === owner || p.ownerId === other,
        )
        .map((p) => ({
          ...p,
          disabled: (side === "A" ? playerIdsB : playerIdsA).includes(p.id),
          alreadyMoved: p.ownerId === other,
        })),
      picks: (remote.catalog?.picks ?? []).filter((p) => p.ownerId === owner),
    };
  });
  function startReview() {
    setError("");
    setMessage("");
    if (!teamAId || !teamBId || teamAId === teamBId) {
      setError("Choose two different teams.");
      return;
    }
    if (
      !playerIdsA.length &&
      !playerIdsB.length &&
      !pickIdsA.length &&
      !pickIdsB.length
    ) {
      setError("Choose at least one player or pick.");
      return;
    }
    setReview({ ...input, requestId: crypto.randomUUID() });
  }
  async function confirm() {
    const preview = remote.preview?.preview;
    if (!review || !preview || remote.record.isPending) return;
    try {
      await remote.record.mutateAsync({
        ...review,
        expectedVersion: preview.version,
      });
      clear();
      setNotes("");
      setMessage("Trade recorded.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not record the trade.",
      );
    }
  }
  return {
    season,
    teams,
    sides,
    effectiveDate,
    setEffectiveDate,
    notes,
    setNotes,
    review,
    preview: remote.preview?.preview,
    previewError: remote.preview?.error,
    loading: seasons.isLoading || teamsQuery.isLoading,
    catalogLoading:
      Boolean(teamAId && teamBId && teamAId !== teamBId) &&
      remote.catalog === undefined,
    pending: remote.record.isPending,
    error,
    message,
    chooseTeam,
    toggle,
    startReview,
    confirm,
    cancelReview: () => {
      setReview(null);
      setError("");
    },
  };
}
