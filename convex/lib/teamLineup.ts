import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type {
  LineupAssignment,
  LineupCandidate,
  RosterPosition as RosterPositionType,
} from "../../src/lib/types";
import { generateLineupAssignments } from "../../src/lib/utils/features/draft-admin";
import { RosterPosition } from "../../src/lib/utils/domain/constants";

function toRosterPosition(value: unknown): RosterPositionType | null {
  return Object.values(RosterPosition).includes(value as RosterPositionType)
    ? (value as RosterPositionType)
    : null;
}

function toCandidate(player: Doc<"players">): LineupCandidate {
  const rating = Number(player.overallRating);
  return {
    id: String(player._id),
    nhlPos: (player.nhlPos ?? [])
      .map(toRosterPosition)
      .filter((position): position is RosterPositionType => position !== null),
    lineupPos: toRosterPosition(player.lineupPos),
    overallRating: Number.isFinite(rating) ? rating : null,
  };
}

/** Rebuilds one team's best lineup from its owned, active players. */
export async function rebuildTeamLineup(
  ctx: MutationCtx,
  ownerId: Id<"owners">,
  teamId: Id<"teams">,
  updatedAt: number,
): Promise<LineupAssignment[]> {
  const roster = await ctx.db
    .query("players")
    .withIndex("by_ownerId", (range) => range.eq("ownerId", ownerId))
    .collect();
  const assignments = generateLineupAssignments(
    roster.filter((player) => player.isActive).map(toCandidate),
  );
  for (const assignment of assignments) {
    await ctx.db.patch(assignment.playerId as Id<"players">, {
      gshlTeamId: teamId,
      lineupPos: assignment.lineupPos,
      updatedAt,
    });
  }
  return assignments;
}
