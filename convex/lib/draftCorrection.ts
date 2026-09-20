import type { Doc } from "../_generated/dataModel";

/** Canonical editable record; clocks and roster state are deliberately separate. */
export function draftCorrectionSnapshot(pick: Doc<"draftPicks">) {
  return {
    gshlTeamId: pick.gshlTeamId ?? null,
    originalTeamId: pick.originalTeamId ?? null,
    round: String(pick.round),
    pick: String(pick.pick ?? ""),
    playerId: pick.playerId ?? null,
    isTraded: Boolean(pick.isTraded),
    isSigning: Boolean(pick.isSigning),
  };
}

export function draftCorrectionVersion(pick: Doc<"draftPicks">) {
  return JSON.stringify({
    ...draftCorrectionSnapshot(pick),
    updatedAt: pick.updatedAt ?? null,
    onClockStartedAt: pick.onClockStartedAt ?? null,
    onClockExpiresAt: pick.onClockExpiresAt ?? null,
    onClockEndedAt: pick.onClockEndedAt ?? null,
  });
}
