import type { DraftPick, GSHLTeam, Season } from "@gshl-types";
import type {
  TeamDraftPickListProps,
  ProcessedDraftPick,
  DraftPickItemProps,
} from "@gshl-types";
import type { UseTeamDraftPickListDataOptions } from "@gshl-types";
import type { DraftPickListProjection } from "@gshl-lib/types/draft-selection";

// Re-export types for backward compatibility
export type { TeamDraftPickListProps, ProcessedDraftPick, DraftPickItemProps };

/**
 * Formats draft pick description for display.
 *
 * @param draftPick - The draft pick to use.
 * @returns The formatted draft pick description.
 */
export const formatDraftPickDescription = (draftPick: DraftPick): string => {
  const roundText = `${draftPick.round} Round`;
  const overallText = Number.isInteger(+draftPick.pick)
    ? `, ${draftPick.pick} Overall`
    : "";
  return `${roundText}${overallText}`;
};

/**
 * Provide a '(via Team Name)' suffix when the pick originated from another franchise.
 * @param draftPick Subject pick.
 * @param teams All teams (for name lookup by franchiseId).
 * @param originalTeam Original team entity when different from owning team.
 * @returns Suffix string or empty when no difference.
 */
export const getOriginalTeamName = (
  teams: GSHLTeam[],
  originalTeam: GSHLTeam | undefined,
): string => {
  if (!originalTeam) return "";
  const teamName = teams.find(
    (team) => team.franchiseId === originalTeam.franchiseId,
  )?.name;
  return teamName ? ` (via ${teamName})` : "";
};

export function buildDraftPickSeasonOptions(
  seasons: readonly Season[],
): Season[] {
  return [...seasons].sort(
    (left, right) =>
      Number(right.year) - Number(left.year) ||
      String(right.name).localeCompare(String(left.name)),
  );
}

export function resolveDraftPickSeasonTeam(
  teams: readonly GSHLTeam[],
  referenceTeam: GSHLTeam,
): GSHLTeam | undefined {
  if (referenceTeam.franchiseId) {
    const franchiseTeam = teams.find(
      (team) => String(team.franchiseId) === String(referenceTeam.franchiseId),
    );
    if (franchiseTeam) return franchiseTeam;
  }

  if (!referenceTeam.ownerId) return undefined;
  return teams.find(
    (team) => String(team.ownerId) === String(referenceTeam.ownerId),
  );
}

/** Resolve the complete pick list against real season metadata and franchise identity. */
export function buildTeamDraftPickList(
  options: UseTeamDraftPickListDataOptions,
  now: number = Date.now(),
): DraftPickListProjection {
  const {
    seasons = [],
    draftPicks,
    players = [],
    gshlTeamId,
    selectedSeasonId,
  } = options;
  const teams = options.allTeams ?? options.teams ?? [];
  const seasonOptions = buildDraftPickSeasonOptions(seasons);
  const explicitSelection = selectedSeasonId !== undefined;
  const byStart = [...seasons].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );
  const activeSeason = explicitSelection
    ? seasons.find((season) => String(season.id) === String(selectedSeasonId))
    : (byStart.find((season) => new Date(season.startDate).getTime() >= now) ??
      byStart.at(-1));
  const activeSeasonId = explicitSelection
    ? selectedSeasonId
    : activeSeason?.id;
  const baseTeam = teams.find((team) => String(team.id) === String(gshlTeamId));
  const resolvedTeamId =
    (baseTeam && activeSeasonId
      ? teams.find(
          (team) =>
            String(team.seasonId) === String(activeSeasonId) &&
            String(team.franchiseId) === String(baseTeam.franchiseId),
        )?.id
      : undefined) ?? gshlTeamId;
  const relatedTeamIds = new Set(
    baseTeam
      ? teams
          .filter((team) =>
            baseTeam.franchiseId
              ? String(team.franchiseId) === String(baseTeam.franchiseId)
              : baseTeam.ownerId != null &&
                String(team.ownerId) === String(baseTeam.ownerId),
          )
          .map((team) => String(team.id))
      : [],
  );
  let picks = !gshlTeamId
    ? []
    : (draftPicks ?? []).filter((pick) =>
        relatedTeamIds.size
          ? relatedTeamIds.has(String(pick.gshlTeamId))
          : String(pick.gshlTeamId) === String(resolvedTeamId),
      );
  if (activeSeasonId !== undefined) {
    const scoped = picks.filter(
      (pick) => String(pick.seasonId) === String(activeSeasonId),
    );
    if (explicitSelection || scoped.length) picks = scoped;
  }
  const playerById = new Map(players.map((player) => [player.id, player]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const processedDraftPicks = [...picks]
    .sort(
      (a, b) =>
        Number(a.round) - Number(b.round) || Number(a.pick) - Number(b.pick),
    )
    .map((draftPick) => ({
      draftPick,
      originalTeam:
        draftPick.originalTeamId &&
        draftPick.originalTeamId !== draftPick.gshlTeamId
          ? teamById.get(draftPick.originalTeamId)
          : undefined,
      isAvailable: !draftPick.playerId,
      selectedPlayer: draftPick.playerId
        ? playerById.get(draftPick.playerId)
        : undefined,
    }));
  return {
    processedDraftPicks,
    seasonOptions,
    selectionOptions:
      explicitSelection && !activeSeason
        ? [
            ...seasonOptions,
            {
              id: selectedSeasonId,
              name: `Unknown season (${selectedSeasonId})`,
            },
          ]
        : seasonOptions,
    activeSeason,
    activeSeasonId,
    resolvedTeamId,
    ready: Boolean(draftPicks && resolvedTeamId),
    isLoading: false,
  };
}
