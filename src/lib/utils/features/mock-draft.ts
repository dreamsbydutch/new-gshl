import type {
  AutoDraftCandidate,
  BuildMockDraftProjectionOptions,
  DraftBoardPlayer,
  GSHLTeam,
  LineupCandidate,
  MockDraftDisplayPick,
  MockDraftDisplayPlayer,
  ProjectedDraftPick,
  RosterPosition,
} from "@gshl-types";
import { getPlayerNhlAbbreviation } from "../domain/player";
import { generateLineupAssignments } from "./draft-admin";
import { getDraftCompositeRanks, getDraftCompositeScores } from "./draft-hub";
import { calculateDraftRosterTalentPoints } from "./draft-roster-board";

export type {
  BuildMockDraftProjectionOptions,
  MockDraftDisplayPick,
  MockDraftDisplayPlayer,
  ProjectedDraftPick,
} from "@gshl-types";

type MockDraftProjectionSource = {
  pick: MockDraftDisplayPick["pick"];
  gshlTeam?: MockDraftDisplayPick["gshlTeam"];
  projectedPlayer?: MockDraftDisplayPlayer;
};

function compactMockDraftPlayer(
  player: MockDraftDisplayPlayer,
): MockDraftDisplayPlayer {
  return {
    fullName: player.fullName,
    ...(player.nhlTeam !== undefined ? { nhlTeam: player.nhlTeam } : {}),
    ...(player.nhlPos !== undefined ? { nhlPos: player.nhlPos } : {}),
    ...(player.age !== undefined ? { age: player.age } : {}),
    ...(player.seasonRating !== undefined
      ? { seasonRating: player.seasonRating }
      : {}),
    ...(player.seasonRk !== undefined ? { seasonRk: player.seasonRk } : {}),
    ...(player.overallRating !== undefined
      ? { overallRating: player.overallRating }
      : {}),
    ...(player.overallRk !== undefined ? { overallRk: player.overallRk } : {}),
  };
}

/** Projects the mock-draft algorithm output to the fields rendered by its card. */
export function compactMockDraftProjection(
  projectedPicks: readonly MockDraftProjectionSource[],
): MockDraftDisplayPick[] {
  return projectedPicks.map(({ pick, gshlTeam, projectedPlayer }) => ({
    pick: {
      id: pick.id,
      round: pick.round,
      pick: pick.pick,
    },
    ...(gshlTeam
      ? {
          gshlTeam: {
            name: gshlTeam.name,
            logoUrl: gshlTeam.logoUrl,
          },
        }
      : {}),
    ...(projectedPlayer
      ? {
          projectedPlayer: compactMockDraftPlayer(projectedPlayer),
        }
      : {}),
  }));
}

/** Lists NHL abbreviations referenced by the compact cards in first-use order. */
export function getMockDraftReferencedNhlAbbreviations(
  projectedPicks: readonly MockDraftDisplayPick[],
): string[] {
  return [
    ...new Set(
      projectedPicks.flatMap(({ projectedPlayer }) => {
        const abbreviation = getPlayerNhlAbbreviation(projectedPlayer?.nhlTeam);
        return abbreviation ? [abbreviation] : [];
      }),
    ),
  ];
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

function normalizePlayerPositions(
  player: AutoDraftCandidate,
): RosterPosition[] {
  return Array.isArray(player.nhlPos) ? player.nhlPos : [player.nhlPos];
}

/**
 * Rebuilds the entire lineup and then scores every player at their resulting
 * tier. Adding one player may therefore move several existing players between
 * primary, secondary, utility, and bench weights.
 */
function calculatePointsAfterFullLineupOptimization(
  roster: readonly LineupCandidate[],
): number {
  const assignments = generateLineupAssignments(
    roster.map((player) => ({
      id: String(player.id),
      nhlPos: player.nhlPos,
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

  return calculateDraftRosterTalentPoints(
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
    completedPicks: suppliedCompletedPicks = [],
    teams,
    take,
  } = options;
  const teamById = new Map(teams.map((team) => [String(team.id), team]));
  const playerById = new Map(
    [
      ...draftPlayers,
      ...rosterPlayers,
      ...suppliedCompletedPicks.map(({ player }) => player),
    ].map((player) => [String(player.id), player]),
  );
  const completedByPickId = new Map(
    suppliedCompletedPicks.map((entry) => [String(entry.pick.id), entry]),
  );
  for (const pick of seasonDraftPicks) {
    const player = pick.playerId
      ? playerById.get(String(pick.playerId))
      : undefined;
    if (!pick.isSigning && player && !completedByPickId.has(String(pick.id))) {
      completedByPickId.set(String(pick.id), { pick, player });
    }
  }
  const completedPicks = [...completedByPickId.values()];
  const unavailablePlayerIds = new Set([
    ...seasonDraftPicks.flatMap((pick) =>
      pick.playerId ? [String(pick.playerId)] : [],
    ),
    ...rosterPlayers.map((player) => String(player.id)),
    ...completedPicks.map(({ player }) => String(player.id)),
  ]);
  const remainingPlayers = draftPlayers.filter(
    (player) => !unavailablePlayerIds.has(String(player.id)),
  );
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
      {
        ...asDraftedRosterPlayer(completedPick.player, completedPickTeam),
        lineupPos: completedPick.player.lineupPos,
      },
    ]);
  }
  const projectedPicks: ProjectedDraftPick<TPlayer>[] = [];

  for (const pick of [...seasonDraftPicks]
    .filter((x) => !x.playerId && !x.isSigning)
    .sort(
      (left, right) =>
        Number(left.round ?? 0) - Number(right.round ?? 0) ||
        Number(left.pick ?? 0) - Number(right.pick ?? 0),
    )) {
    const gshlTeam = teamById.get(String(pick.gshlTeamId));
    const teamRoster = gshlTeam
      ? (rosterByTeamKey.get(getTeamRosterKey(gshlTeam)) ?? [])
      : [];
    const { player: projectedPlayer, score: bestTalentGain } =
      selectAutoDraftPlayer(remainingPlayers, teamRoster);

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

/**
 * Uses the same composite as Best Available, then measures the improvement
 * after fitting each candidate into the team's existing lineup.
 */
export function selectAutoDraftPlayer<TPlayer extends AutoDraftCandidate>(
  players: readonly TPlayer[],
  teamRoster: readonly AutoDraftCandidate[],
) {
  const ranks = getDraftCompositeRanks(players);
  // Score the roster against the same source depths as the available pool.
  const scores = getDraftCompositeScores([...players, ...teamRoster], players);
  const toLineupPlayer = (player: AutoDraftCandidate): LineupCandidate => ({
    id: String(player.id),
    nhlPos: normalizePlayerPositions(player),
    lineupPos: player.lineupPos,
    // Composite scores run from 0 (best) to 1 (missing all sources).
    // Keep a small positive value so every eligible player can fill a slot.
    overallRating: 1 + 100 * (1 - (scores.get(String(player.id)) ?? 1)),
  });
  const roster = teamRoster.map(toLineupPlayer);
  const currentPoints = calculatePointsAfterFullLineupOptimization(roster);
  const rankOf = (player: TPlayer) => ranks.get(String(player.id)) ?? Infinity;
  const bestByEligibility = new Map<string, TPlayer>();
  for (const player of players) {
    const key = [...new Set(normalizePlayerPositions(player))].sort().join("|");
    const current = bestByEligibility.get(key);
    if (!current || rankOf(player) < rankOf(current))
      bestByEligibility.set(key, player);
  }
  let projectedPlayer: TPlayer | undefined;
  let bestGain = Number.NEGATIVE_INFINITY;
  for (const candidate of bestByEligibility.values()) {
    const gain =
      calculatePointsAfterFullLineupOptimization([
        ...roster,
        toLineupPlayer({ ...candidate, lineupPos: null }),
      ]) - currentPoints;
    const tied = Math.abs(gain - bestGain) < 1e-9;
    if (
      (!tied && gain > bestGain) ||
      (tied &&
        (!projectedPlayer || rankOf(candidate) < rankOf(projectedPlayer)))
    ) {
      projectedPlayer = candidate;
      bestGain = gain;
    }
  }
  return { player: projectedPlayer, score: bestGain };
}
