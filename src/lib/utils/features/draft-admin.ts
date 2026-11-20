/** Lineup assignment shared by draft projections and server roster updates. */
import type {
  LineupAssignment,
  LineupCandidate,
  RosterPosition as RosterPositionType,
} from "@gshl-types";
import { RosterPosition } from "../domain/constants";
import {
  DRAFT_ROSTER_BENCH_WEIGHT,
  DRAFT_ROSTER_LINEUP_SLOTS,
} from "./draft-roster-board";

export type { LineupAssignment } from "@gshl-types";

const PROTECTED_LINEUP_POSITIONS = new Set<RosterPositionType>([
  RosterPosition.IR,
  RosterPosition.IRplus,
]);

/**
 * Returns player rating.
 *
 * @param player - The player to use.
 * @returns The requested player rating.
 */
const getPlayerRating = (player: LineupCandidate): number =>
  player.overallRating ?? 0;

/**
 * Checks whether eligible for slot.
 *
 * @param player - The player to use.
 * @param eligiblePositions - The eligible positions to use.
 * @returns True when eligible for slot; otherwise false.
 */
const isEligibleForSlot = (
  player: LineupCandidate,
  eligiblePositions: readonly RosterPositionType[],
): boolean => {
  const positions = player.nhlPos ?? [];
  return positions.some((position) => eligiblePositions.includes(position));
};

/**
 * Generate lineup assignments.
 *
 * @param players - The players to use.
 * @returns The resulting generate lineup assignments.
 */
export function generateLineupAssignments(
  players: readonly LineupCandidate[] | null | undefined,
): LineupAssignment[] {
  if (!players?.length) {
    return [];
  }

  const assignments: LineupAssignment[] = [];
  const usedPlayerIds = new Set<string>();
  const sortedPlayers = [...players].sort(
    (a, b) =>
      getPlayerRating(b) - getPlayerRating(a) || a.id.localeCompare(b.id),
  );

  // Preserve IR slots so they are never reassigned automatically.
  for (const player of sortedPlayers) {
    if (player.lineupPos && PROTECTED_LINEUP_POSITIONS.has(player.lineupPos)) {
      assignments.push({ playerId: player.id, lineupPos: player.lineupPos });
      usedPlayerIds.add(player.id);
    }
  }

  const availablePlayers = sortedPlayers.filter(
    (player) => !usedPlayerIds.has(player.id),
  );
  const emptySlotAssignments = Array<string | null>(
    DRAFT_ROSTER_LINEUP_SLOTS.length,
  ).fill(null);
  let states = new Map<
    number,
    { score: number; playerIdBySlot: Array<string | null> }
  >([[0, { score: 0, playerIdBySlot: emptySlotAssignments }]]);

  for (const player of availablePlayers) {
    const nextStates = new Map(states);

    for (const [mask, state] of states) {
      for (
        let slotIndex = 0;
        slotIndex < DRAFT_ROSTER_LINEUP_SLOTS.length;
        slotIndex += 1
      ) {
        const slot = DRAFT_ROSTER_LINEUP_SLOTS[slotIndex];
        const slotBit = 1 << slotIndex;
        if (!slot || (mask & slotBit) !== 0) continue;
        if (!isEligibleForSlot(player, slot.eligible)) continue;

        const nextMask = mask | slotBit;
        const nextScore =
          state.score +
          getPlayerRating(player) * (slot.weight - DRAFT_ROSTER_BENCH_WEIGHT);
        const existing = nextStates.get(nextMask);
        if (existing && existing.score >= nextScore) continue;

        const playerIdBySlot = [...state.playerIdBySlot];
        playerIdBySlot[slotIndex] = player.id;
        nextStates.set(nextMask, { score: nextScore, playerIdBySlot });
      }
    }

    states = nextStates;
  }

  const bestState = [...states.entries()].reduce(
    (best, candidate) => {
      const [bestMask, bestValue] = best;
      const [candidateMask, candidateValue] = candidate;
      return candidateValue.score > bestValue.score ||
        (candidateValue.score === bestValue.score &&
          candidateMask.toString(2).replaceAll("0", "").length >
            bestMask.toString(2).replaceAll("0", "").length)
        ? candidate
        : best;
    },
    [0, { score: 0, playerIdBySlot: emptySlotAssignments }] as [
      number,
      { score: number; playerIdBySlot: Array<string | null> },
    ],
  )[1];

  for (const [slotIndex, playerId] of bestState.playerIdBySlot.entries()) {
    const slot = DRAFT_ROSTER_LINEUP_SLOTS[slotIndex];
    if (!playerId || !slot) continue;
    assignments.push({ playerId, lineupPos: slot.position });
    usedPlayerIds.add(playerId);
  }

  for (const player of sortedPlayers) {
    if (usedPlayerIds.has(player.id)) {
      continue;
    }

    assignments.push({ playerId: player.id, lineupPos: RosterPosition.BN });
    usedPlayerIds.add(player.id);
  }

  return assignments;
}
