"use client";

import { useState } from "react";
import type {
  DraftCorrectionPick,
  StagedDraftCorrection,
} from "@gshl-lib/types/draft-corrections";
import { useSeasons } from "../main/useSeason";
import { useDraftCorrections } from "../main/useDraftCorrections";

export function useDraftPickManagement() {
  const seasons = useSeasons({ orderBy: { year: "desc" } });
  const [chosenSeason, setChosenSeason] = useState("");
  const seasonId = chosenSeason || (seasons.data[0]?.id ?? "");
  const [editing, setEditing] = useState<DraftCorrectionPick | null>(null);
  const [form, setForm] = useState<DraftCorrectionPick | null>(null);
  const [staged, setStaged] = useState<StagedDraftCorrection[]>([]);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [teamId, setTeamId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const remote = useDraftCorrections(seasonId, editing?.id);
  const players = (remote.data?.picks ?? []).flatMap((p) =>
    p.playerId
      ? [{ id: p.playerId, fullName: p.playerName ?? p.playerId }]
      : [],
  );
  const teamName = (id: string | null) =>
    remote.data?.teams.find((team) => team.id === id)?.name ??
    (id ? `Missing team (${id})` : "Unassigned");
  const projected = (remote.data?.picks ?? []).map(
    (pick) => staged.find((edit) => edit.after.id === pick.id)?.after ?? pick,
  );
  const picks = projected.filter(
    (pick) =>
      (!teamId || pick.gshlTeamId === teamId) &&
      `${pick.round}-${pick.pick} ${pick.playerName ?? ""} ${teamName(pick.gshlTeamId)} ${teamName(pick.originalTeamId)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function edit(pick: DraftCorrectionPick) {
    setEditing(pick);
    setForm({ ...pick });
    setError("");
    setMessage("");
    setReviewing(false);
  }
  function cancel() {
    setEditing(null);
    setForm(null);
    setError("");
    setReviewing(false);
  }
  function selectSeason(id: string) {
    cancel();
    setChosenSeason(id);
    setTeamId("");
    setMessage("");
  }
  function stage() {
    if (!form || !editing) return;
    if (
      ![form.round, form.pick].every(
        (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0,
      )
    ) {
      setError("Round and pick must be positive whole numbers");
      return;
    }
    const before =
      staged.find((entry) => entry.before.id === editing.id)?.before ?? editing;
    const after = {
      ...form,
      playerName:
        players.find((player) => player.id === form.playerId)?.fullName ?? null,
    };
    setStaged((current) => [
      ...current.filter((entry) => entry.before.id !== editing.id),
      { before, after },
    ]);
    cancel();
  }
  function discard() {
    setStaged([]);
    setReason("");
    cancel();
  }
  async function save() {
    if (!staged.length || remote.isPending) return;
    setError("");
    try {
      await remote.mutateAsync({
        seasonId,
        reason,
        edits: staged.map(({ before, after }) => ({
          pickId: before.id,
          expectedVersion: before.version,
          changes: {
            gshlTeamId: after.gshlTeamId,
            originalTeamId: after.originalTeamId,
            round: Number(after.round),
            pick: Number(after.pick),
            playerId: after.playerId,
            isTraded: after.isTraded,
            isSigning: after.isSigning,
          },
        })),
      });
      discard();
      setMessage(
        "Corrections saved together. Each team retains its selected players; rosters and contracts are unchanged.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save corrections",
      );
    }
  }
  return {
    seasons: seasons.data,
    seasonId,
    selectSeason,
    picks,
    total: remote.data?.picks.length ?? 0,
    teams: remote.data?.teams ?? [],
    players,
    playersLoading: false,
    isLoading: seasons.isLoading || (Boolean(seasonId) && !remote.data),
    history: remote.history,
    editing,
    form,
    setForm,
    edit,
    cancel,
    reason,
    setReason,
    search,
    setSearch,
    teamId,
    setTeamId,
    staged,
    stage,
    discard,
    message,
    error,
    reviewing,
    setReviewing,
    save,
    isPending: remote.isPending,
    teamName,
  };
}
