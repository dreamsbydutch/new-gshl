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

export function toLineupCandidate(player: Doc<"players">): LineupCandidate {
  // Unknown ratings stay null; the assignment algorithm scores them as zero.
  const rating =
    player.overallRating == null ? null : Number(player.overallRating);
  return {
    id: String(player._id),
    nhlPos: (player.nhlPos ?? [])
      .map(toRosterPosition)
      .filter((position): position is RosterPositionType => position !== null),
    lineupPos: toRosterPosition(player.lineupPos),
    overallRating: Number.isFinite(rating) ? rating : null,
  };
}

type LineupRequest = {
  ownerId: Id<"owners">;
  teamId: Id<"teams">;
  updatedAt: number;
} & (
  | { policy: "draft"; explicitlyIncludedPlayers?: readonly Doc<"players">[] }
  | { policy: "signing" }
);

/** Rebuild using the workflow's roster membership and write policy. */
export async function rebuildTeamLineup(
  ctx: MutationCtx,
  request: LineupRequest,
): Promise<LineupAssignment[]> {
  const { ownerId, teamId, updatedAt, policy } = request;
  const [ownerRoster, teamRoster] = await Promise.all([
    ctx.db
      .query("players")
      .withIndex("by_ownerId", (range) => range.eq("ownerId", ownerId))
      .collect(),
    policy === "draft"
      ? ctx.db
          .query("players")
          .withIndex("by_gshlTeamId", (range) => range.eq("gshlTeamId", teamId))
          .collect()
      : Promise.resolve([]),
  ]);
  // Explicit rows win over indexed snapshots, including a just-drafted player.
  const rosterById = new Map<string, Doc<"players">>();
  for (const player of [
    ...ownerRoster,
    ...teamRoster,
    ...(policy === "draft" ? (request.explicitlyIncludedPlayers ?? []) : []),
  ]) {
    rosterById.set(String(player._id), player);
  }
  const assignments = generateLineupAssignments(
    [...rosterById.values()]
      .filter((player) => player.isActive)
      .map((player) => toLineupCandidate(player)),
  );
  for (const assignment of assignments) {
    const player = rosterById.get(assignment.playerId);
    if (!player) continue;
    await ctx.db.patch(player._id, {
      ...(policy === "signing" ? { gshlTeamId: teamId } : {}),
      lineupPos: assignment.lineupPos,
      updatedAt,
    });
  }
  return assignments;
}
