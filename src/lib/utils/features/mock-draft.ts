import type {
  BuildMockDraftProjectionOptions,
  DraftBoardPlayer,
  GSHLTeam,
  ProjectedDraftPick,
  RosterPosition,
} from "@gshl-types";
import { generateLineupAssignments } from "./draft-admin";
import { calculateDraftRosterTalentRating } from "./draft-roster-board";

export type {
  BuildMockDraftProjectionOptions,
  ProjectedDraftPick,
} from "@gshl-types";

/**
 * Creates a comparison result for players.
 *
 * @param left - The left to use.
 * @param right - The right to use.
 * @returns The comparison callback result.
 */
function comparePlayers(
  left: Pick<
    DraftBoardPlayer,
    "overallRk" | "overallRating" | "preDraftRk" | "id"
  >,
  right: Pick<
    DraftBoardPlayer,
    "overallRk" | "overallRating" | "preDraftRk" | "id"
  >,
): number {
  const overallRankDelta = (left.overallRk ?? 9999) - (right.overallRk ?? 9999);
  if (overallRankDelta !== 0) return overallRankDelta;

  const overallDelta = (right.overallRating ?? 0) - (left.overallRating ?? 0);
  if (overallDelta !== 0) return overallDelta;

  const draftRankDelta = (left.preDraftRk ?? 9999) - (right.preDraftRk ?? 9999);
  if (draftRankDelta !== 0) return draftRankDelta;

  return String(left.id).localeCompare(String(right.id));
}

function hasTalentRating(
  player: Pick<DraftBoardPlayer, "overallRating">,
): boolean {
  return (
    player.overallRating !== null &&
    player.overallRating !== undefined &&
    Number.isFinite(Number(player.overallRating))
  );
}

function selectHighestRatedPlayerAtEachPosition<
  TPlayer extends DraftBoardPlayer,
>(players: readonly TPlayer[]): TPlayer[] {
  const highestRatedByPosition = new Map<RosterPosition, TPlayer>();

  for (const player of players) {
    for (const position of normalizePlayerPositions(player)) {
      const current = highestRatedByPosition.get(position);
      const playerRating = Number(player.overallRating);
      const currentRating = Number(current?.overallRating);
      if (
        !current ||
        playerRating > currentRating ||
        (playerRating === currentRating && comparePlayers(player, current) < 0)
      ) {
        highestRatedByPosition.set(position, player);
      }
    }
  }

  return [
    ...new Map(
      [...highestRatedByPosition.values()].map((player) => [
        String(player.id),
        player,
      ]),
    ).values(),
  ].sort(comparePlayers);
}

/**
 * Sorts projected picks.
 *
 * @param left - The left to use.
 * @param right - The right to use.
 * @returns The sorted projected picks.
 */
function sortProjectedPicks(
  left: ProjectedDraftPick,
  right: ProjectedDraftPick,
): number {
  return (
    Number(left.pick.round ?? 0) - Number(right.pick.round ?? 0) ||
    Number(left.pick.pick ?? 0) - Number(right.pick.pick ?? 0)
  );
}

function getTeamRosterKey(team: GSHLTeam): string {
  return team.ownerId ? `owner:${team.ownerId}` : `team:${team.id}`;
}

function normalizePlayerPositions(player: DraftBoardPlayer): RosterPosition[] {
  return Array.isArray(player.nhlPos) ? player.nhlPos : [player.nhlPos];
}

/**
 * Rebuilds the entire lineup and then scores every player at their resulting
 * tier. Adding one player may therefore move several existing players between
 * primary, secondary, utility, and bench weights.
 */
function calculateTalentAfterFullLineupOptimization(
  roster: readonly DraftBoardPlayer[],
): number | null {
  const assignments = generateLineupAssignments(
    roster.map((player) => ({
      id: String(player.id),
      nhlPos: normalizePlayerPositions(player),
      lineupPos: player.lineupPos,
      overallRating: player.overallRating,
    })),
  );
  const lineupPositionByPlayerId = new Map(
    assignments.map((assignment) => [
      String(assignment.playerId),
      assignment.lineupPos,
    ]),
  );

  return calculateDraftRosterTalentRating(
    roster.map((player) => ({
      overallRating: player.overallRating,
      lineupPos: lineupPositionByPlayerId.get(String(player.id)) ?? null,
    })),
  );
}

function asDraftedRosterPlayer<TPlayer extends DraftBoardPlayer>(
  player: TPlayer,
  team: GSHLTeam,
): TPlayer {
  return {
    ...player,
    ownerId: team.ownerId,
    gshlTeamId: team.id,
    lineupPos: null,
  };
}

/**
 * Builds mock draft projection.
 *
 * @param options - Configuration options for the operation.
 * @returns The sequential roster-optimized mock draft projection.
 */
export function buildMockDraftProjection<
  TPlayer extends DraftBoardPlayer = DraftBoardPlayer,
>(
  options: BuildMockDraftProjectionOptions<TPlayer>,
): ProjectedDraftPick<TPlayer>[] {
  const {
    seasonDraftPicks,
    draftPlayers,
    rosterPlayers,
    completedPicks = [],
    teams,
    take,
  } = options;
  const teamById = new Map(teams.map((team) => [String(team.id), team]));
  const completedPlayerIds = new Set(
    completedPicks.map(({ player }) => String(player.id)),
  );
  const remainingPlayers = draftPlayers
    .filter((player) => !completedPlayerIds.has(String(player.id)))
    .sort(comparePlayers);
  const rosterByTeamKey = new Map<string, TPlayer[]>();
  for (const team of teams) {
    const teamRoster = rosterPlayers.filter(
      (player) =>
        team.ownerId && String(player.ownerId ?? "") === String(team.ownerId),
    );
    rosterByTeamKey.set(getTeamRosterKey(team), teamRoster);
  }

  for (const completedPick of [...completedPicks].sort(
    (left, right) =>
      Number(left.pick.round ?? 0) - Number(right.pick.round ?? 0) ||
      Number(left.pick.pick ?? 0) - Number(right.pick.pick ?? 0),
  )) {
    const completedPickTeam = teamById.get(
      String(completedPick.pick.gshlTeamId),
    );
    if (!completedPickTeam) continue;

    const teamKey = getTeamRosterKey(completedPickTeam);
    const teamRoster = rosterByTeamKey.get(teamKey) ?? [];
    if (
      teamRoster.some(
        (rosterPlayer) =>
          String(rosterPlayer.id) === String(completedPick.player.id),
      )
    ) {
      continue;
    }

    rosterByTeamKey.set(teamKey, [
      ...teamRoster,
      asDraftedRosterPlayer(completedPick.player, completedPickTeam),
    ]);
  }
  const projectedPicks: ProjectedDraftPick<TPlayer>[] = [];

  for (const pick of [...seasonDraftPicks]
    .filter((x) => !x.playerId)
    .sort(
      (left, right) =>
        Number(left.round ?? 0) - Number(right.round ?? 0) ||
        Number(left.pick ?? 0) - Number(right.pick ?? 0),
    )) {
    const gshlTeam = teamById.get(String(pick.gshlTeamId));
    const teamRoster = gshlTeam
      ? (rosterByTeamKey.get(getTeamRosterKey(gshlTeam)) ?? [])
      : [];
    const currentTalent =
      calculateTalentAfterFullLineupOptimization(teamRoster) ?? 0;
    let projectedPlayer: TPlayer | undefined;
    let bestTalentGain = Number.NEGATIVE_INFINITY;
    const ratedCandidates = remainingPlayers.filter(hasTalentRating);
    const candidatePool = ratedCandidates.length
      ? selectHighestRatedPlayerAtEachPosition(ratedCandidates)
      : remainingPlayers;

    for (const candidate of candidatePool) {
      const draftedCandidate = gshlTeam
        ? asDraftedRosterPlayer(candidate, gshlTeam)
        : candidate;
      const resultingTalent =
        calculateTalentAfterFullLineupOptimization([
          ...teamRoster,
          draftedCandidate,
        ]) ?? 0;
      const talentGain = resultingTalent - currentTalent;
      const isBetterGain = talentGain > bestTalentGain;
      const winsTie =
        talentGain === bestTalentGain &&
        (!projectedPlayer || comparePlayers(candidate, projectedPlayer) < 0);

      if (isBetterGain || winsTie) {
        projectedPlayer = candidate;
        bestTalentGain = talentGain;
      }
    }

    const projectedPick: ProjectedDraftPick<TPlayer> = {
      pick,
      gshlTeam,
      projectedPlayer,
      score: projectedPlayer ? bestTalentGain : null,
    };

    projectedPicks.push(projectedPick);

    if (projectedPlayer) {
      const selectedIndex = remainingPlayers.findIndex(
        (player) => player.id === projectedPlayer.id,
      );
      if (selectedIndex >= 0) {
        remainingPlayers.splice(selectedIndex, 1);
      }

      if (gshlTeam) {
        rosterByTeamKey.set(getTeamRosterKey(gshlTeam), [
          ...teamRoster,
          asDraftedRosterPlayer(projectedPlayer, gshlTeam),
        ]);
      }
    }

    if (typeof take === "number" && projectedPicks.length >= take) {
      break;
    }
  }

  return projectedPicks.sort(sortProjectedPicks);
}
