import { useMemo } from "react";

// Types for input and output
export interface LineupPlayerInput {
  playerId: string | number;
  nhlPos: string[]; // e.g. ["C", "LW"]
  rating: number; // numeric rating used for optimization
}

export interface LineupPlayerOutput extends LineupPlayerInput {
  lineupPos?: string; // One of C,LW,RW,D,G,Util corresponding to the slot filled
}

// Fixed lineup slots in order; duplicates mean multiple of that position.
// Util can accept any non-goalie skater (not "G").
const LINEUP_SLOTS: string[] = [
  "C",
  "C",
  "LW",
  "LW",
  "RW",
  "RW",
  "Util", // any skater except G
  "D",
  "D",
  "D",
  "G",
];

// Helper: determine if a player can occupy a particular slot.
function isEligibleForSlot(player: LineupPlayerInput, slot: string): boolean {
  if (slot === "Util") {
    return player.nhlPos.some((p) => p !== "G"); // any non-goalie position qualifies
  }
  return player.nhlPos.includes(slot);
}

interface UseOptimalLineupOptions {
  // Optional override for slots (maintain semantics above if provided)
  slots?: string[];
  // When true (default) attempt exhaustive optimal search; when false, falls back to greedy heuristic
  exhaustive?: boolean;
}

interface OptimalLineupResult {
  players: LineupPlayerOutput[]; // array mapped back with lineupPos populated when selected
  totalRating: number; // sum of ratings for filled slots
  filledSlots: number; // number of slots actually filled (may be < slots length if insufficient eligible players)
  unfilledSlots: string[]; // list of any remaining slots that could not be filled
}

/**
 * useOptimalLineup
 * Given a list of players (with id, eligible NHL positions, rating) returns an assignment of players to lineup slots
 * maximizing the total rating. Performs exhaustive search (backtracking) over feasible assignments. Because the lineup
 * size is small (11 slots) this is tractable; pruning heuristics are applied for efficiency. Falls back to a greedy
 * heuristic if exhaustive search disabled or search space explodes beyond a safety cap.
 */
export function useOptimalLineup(
  players: LineupPlayerInput[],
  options?: UseOptimalLineupOptions,
): OptimalLineupResult {
  const { slots = LINEUP_SLOTS, exhaustive = true } = options ?? {};

  return useMemo(() => {
    if (!players || players.length === 0) {
      return {
        players: [],
        totalRating: 0,
        filledSlots: 0,
        unfilledSlots: [...slots],
      };
    }

    // Pre-sort players by rating descending for quicker pruning
    const sortedPlayers = [...players].sort((a, b) => b.rating - a.rating);

    // Precompute eligibility matrix
    const eligibility: boolean[][] = sortedPlayers.map((p) =>
      slots.map((slot) => isEligibleForSlot(p, slot)),
    );

    // Quick greedy heuristic (also used as initial lower bound for pruning)
    function greedyAssignment(): {
      assignment: (number | null)[];
      score: number;
    } {
      const used: boolean[] = Array.from(
        { length: sortedPlayers.length },
        () => false,
      );
      const assignment: (number | null)[] = Array.from(
        { length: slots.length },
        () => null,
      ); // player index per slot
      let score = 0;
      for (let s = 0; s < slots.length; s++) {
        let bestIdx: number | null = null;
        let bestRating = -Infinity;
        for (let p = 0; p < sortedPlayers.length; p++) {
          if (!used[p] && eligibility[p]?.[s]) {
            if (p < 0 || p >= sortedPlayers.length) continue;
            const playerObj = sortedPlayers[p];
            const r = playerObj?.rating ?? -Infinity;
            if (r > bestRating) {
              bestRating = r;
              bestIdx = p;
            }
          }
        }
        if (bestIdx != null) {
          assignment[s] = bestIdx;
          used[bestIdx] = true;
          if (bestIdx >= 0 && bestIdx < sortedPlayers.length) {
            score += sortedPlayers[bestIdx]!.rating;
          }
        }
      }
      return { assignment, score };
    }

    // If not exhaustive, return greedy immediately
    if (!exhaustive) {
      const { assignment, score } = greedyAssignment();
      const outputPlayers: LineupPlayerOutput[] = sortedPlayers.map((p) => ({
        ...p,
      }));
      assignment.forEach((pIdx, slotIdx) => {
        if (pIdx != null && outputPlayers[pIdx]) {
          outputPlayers[pIdx].lineupPos = slots[slotIdx];
        }
      });
      return {
        players: remapToOriginalOrder(players, sortedPlayers, outputPlayers),
        totalRating: score,
        filledSlots: assignment.filter((a) => a != null).length,
        unfilledSlots: assignment
          .map((a, i) => (a == null ? slots[i] : null))
          .filter((v): v is string => typeof v === "string"),
      };
    }

    // Exhaustive backtracking with pruning
    const playerCount = sortedPlayers.length;
    const slotCount = slots.length;

    // Upper bound helper: maximum possible additional score from remaining slots using highest rated remaining players regardless of eligibility (optimistic)

    let bestScore = -Infinity;
    let bestAssignment: (number | null)[] = Array.from(
      { length: slotCount },
      () => null,
    );

    const used: boolean[] = Array.from({ length: playerCount }, () => false);
    const currentAssignment: (number | null)[] = Array.from(
      { length: slotCount },
      () => null,
    );
    let currentScore = 0;

    // Order slots by difficulty (fewest eligible players first) to enhance pruning
    const slotOrder: number[] = slots
      .map((slot, idx) => ({
        idx,
        eligibleCount: sortedPlayers.filter((_, p) => eligibility[p]?.[idx])
          .length,
      }))
      .sort((a, b) => a.eligibleCount - b.eligibleCount)
      .map((o) => o.idx);

    // (Removed unused cumulativeBest computation to satisfy lint rule)

    const SAFETY_NODE_LIMIT = 1_000_000; // guard against pathological blow-up
    let nodesVisited = 0;

    function backtrack(depth: number) {
      nodesVisited++;
      if (nodesVisited > SAFETY_NODE_LIMIT) return; // safety cutoff

      if (depth === slotOrder.length) {
        // evaluated all slots
        if (currentScore > bestScore) {
          bestScore = currentScore;
          bestAssignment = [...currentAssignment];
        }
        return;
      }

      const slotIdx = slotOrder[depth];
      if (slotIdx === undefined) return; // safety guard

      // Option: leave slot unfilled (only if impossible to fill). We'll attempt filling first.
      let filledAny = false;

      for (let p = 0; p < playerCount; p++) {
        if (used[p]) continue;
        if (!eligibility[p]?.[slotIdx]) continue;
        // choose
        used[p] = true;
        currentAssignment[slotIdx] = p;
        if (p >= 0 && p < sortedPlayers.length) {
          currentScore += sortedPlayers[p]!.rating;
        }
        filledAny = true;

        // Bounding: optimistic remaining score = currentScore + sum of top possible remaining player ratings (independent of eligibility)
        const remainingSlots = slotOrder.length - (depth + 1);
        if (remainingSlots === 0) {
          // evaluate leaf early
          if (currentScore > bestScore) {
            bestScore = currentScore;
            bestAssignment = [...currentAssignment];
          }
        } else {
          // compute optimistic bound using next highest ratings among unused players
          const remainingRatings: number[] = [];
          for (let i = 0; i < playerCount; i++) {
            if (!used[i] && i >= 0 && i < sortedPlayers.length) {
              remainingRatings.push(sortedPlayers[i]!.rating);
            }
          }
          remainingRatings.sort((a, b) => b - a);
          let optimistic = currentScore;
          for (
            let k = 0;
            k < remainingSlots && k < remainingRatings.length;
            k++
          )
            optimistic += remainingRatings[k]!;
          if (optimistic > bestScore) {
            backtrack(depth + 1);
          }
        }

        // undo
        used[p] = false;
        currentAssignment[slotIdx] = null;
        if (p >= 0 && p < sortedPlayers.length) {
          currentScore -= sortedPlayers[p]!.rating;
        }
      }

      if (!filledAny) {
        // leave slot empty
        currentAssignment[slotIdx] = null;
        backtrack(depth + 1);
        currentAssignment[slotIdx] = null;
      }
    }

    // Initialize with greedy lower bound to help pruning
    const greedy = greedyAssignment();
    bestScore = greedy.score;
    bestAssignment = [...greedy.assignment];

    backtrack(0);

    const outputPlayers: LineupPlayerOutput[] = sortedPlayers.map((p) => ({
      ...p,
    }));
    bestAssignment.forEach((pIdx, slotIdx) => {
      if (pIdx != null && outputPlayers[pIdx]) {
        const slotName = slots[slotIdx];
        if (slotName) outputPlayers[pIdx].lineupPos = slotName;
      }
    });

    return {
      players: remapToOriginalOrder(players, sortedPlayers, outputPlayers),
      totalRating: bestScore === -Infinity ? 0 : bestScore,
      filledSlots: bestAssignment.filter((a) => a != null).length,
      unfilledSlots: bestAssignment
        .map((a, i) => (a == null ? slots[i] : null))
        .filter((v): v is string => typeof v === "string"),
    };
  }, [players, slots, exhaustive]);
}

// Remap sorted output back to the original players order
function remapToOriginalOrder(
  original: LineupPlayerInput[],
  sorted: LineupPlayerInput[],
  outputSorted: LineupPlayerOutput[],
): LineupPlayerOutput[] {
  const map = new Map<string | number, LineupPlayerOutput>();
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]) map.set(sorted[i]!.playerId, outputSorted[i]!);
  }
  return original.map((p) => ({
    ...p,
    lineupPos: map.get(p.playerId)?.lineupPos,
  }));
}

export default useOptimalLineup;
