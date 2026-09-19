import type {
  DraftHubPickView,
  DraftPick,
  GSHLTeam,
  Player,
} from "@gshl-types";
import { orderDraftPicks, serializeDraftHubPick } from "./draft-hub";

export function groupRemainingDraftPicksByFranchise(
  picks: readonly DraftPick[],
  teams: readonly Pick<GSHLTeam, "id" | "franchiseId">[],
): Map<string, DraftPick[]> {
  const franchiseByTeam = new Map(
    teams.map((team) => [team.id, team.franchiseId]),
  );
  const remaining = new Map<string, DraftPick[]>();
  for (const pick of orderDraftPicks(picks)) {
    if (pick.isSigning || pick.playerId) continue;
    const franchiseId = franchiseByTeam.get(pick.gshlTeamId);
    if (!franchiseId) continue;
    const entries = remaining.get(franchiseId) ?? [];
    entries.push(pick);
    remaining.set(franchiseId, entries);
  }
  return remaining;
}

export function formatDraftPickLabel(
  pick: Pick<DraftPick, "round" | "pick">,
): string {
  return `${String(pick.round).padStart(2, "0")}-${String(pick.pick).padStart(2, "0")}`;
}

/** Project the existing public league rows for the read-only TV display. */
export function buildDraftTvPicks(
  picks: readonly DraftPick[],
  teams: readonly GSHLTeam[],
  players: readonly Player[],
): DraftHubPickView[] {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const playerById = new Map(players.map((player) => [player.id, player]));
  function teamSummary(id: string | null | undefined) {
    const team = id ? teamById.get(id) : undefined;
    return team
      ? {
          id: team.id,
          franchiseId: team.franchiseId,
          ownerId: team.ownerId,
          name: team.name ?? "Unknown team",
          abbr: team.abbr ?? "",
          logoUrl: team.logoUrl,
        }
      : null;
  }
  return picks.map((pick) => {
    const player = pick.playerId ? playerById.get(pick.playerId) : undefined;
    return {
      // Public Convex reads carry epoch timestamps despite the adapter's Date type.
      pick: serializeDraftHubPick({
        ...pick,
        createdAt: new Date(pick.createdAt),
        updatedAt: new Date(pick.updatedAt),
      }),
      team: teamSummary(pick.gshlTeamId),
      originalTeam: teamSummary(pick.originalTeamId),
      player: player
        ? {
            id: player.id,
            fullName: player.fullName,
            nhlPos: player.nhlPos,
            nhlTeam: [player.nhlTeam],
          }
        : null,
    };
  });
}
