import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { resolveContractSigningAssignments } from "./contractSigning";
import { rebuildTeamLineup } from "./teamLineup";
import { toUtcTimestamp } from "./timestamps";

type SigningRequest = {
  playerId: Id<"players">;
  franchiseId: Id<"franchises">;
  seasonId: Id<"seasons">;
  contractLength: number;
  contractSalary: Doc<"contracts">["contractSalary"];
  contractType: Doc<"contracts">["contractType"];
  signingStatus: Doc<"contracts">["signingStatus"];
  expiryStatus: Doc<"contracts">["expiryStatus"];
  startDate: unknown;
  expiryDate: unknown;
};

/** Called inside the caller's mutation, after its authorization and terms checks. */
export async function signContract(ctx: MutationCtx, request: SigningRequest) {
  const startDate = toUtcTimestamp(request.startDate);
  const expiryDate = toUtcTimestamp(request.expiryDate);
  if (startDate === null || expiryDate === null) {
    throw new Error("The selected contract seasons have invalid dates");
  }
  if (
    !Number.isInteger(request.contractLength) ||
    request.contractLength < 1 ||
    request.contractLength > 3
  ) {
    throw new Error("Invalid contract length");
  }
  const [player, franchise, seasons] = await Promise.all([
    ctx.db.get(request.playerId),
    ctx.db.get(request.franchiseId),
    ctx.db.query("seasons").collect(),
  ]);
  if (!player || !franchise) throw new Error("Player or franchise not found");
  const ordered = [...seasons].sort(
    (a, b) => Number(a.year) - Number(b.year) || a._id.localeCompare(b._id),
  );
  const signingIndex = ordered.findIndex(
    (season) => season._id === request.seasonId,
  );
  if (signingIndex < 0)
    throw new Error("The contract signing season could not be resolved");
  const covered = ordered.slice(
    signingIndex + 1,
    signingIndex + 1 + request.contractLength,
  );
  if (covered.length !== request.contractLength) {
    throw new Error("The required future seasons have not been configured");
  }
  const rows = await Promise.all(
    covered.map(async (season) => {
      const [teams, picks] = await Promise.all([
        ctx.db
          .query("teams")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
          .collect(),
        ctx.db
          .query("draftPicks")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
          .collect(),
      ]);
      return { teams, picks };
    }),
  );
  const teams = rows.flatMap((row) => row.teams);
  const picks = rows.flatMap((row) => row.picks);
  const assignments = resolveContractSigningAssignments({
    signingSeasonId: request.seasonId,
    contractLength: request.contractLength,
    franchiseId: request.franchiseId,
    seasons: ordered.map((season) => ({ id: season._id, year: season.year })),
    teams: teams.map((team) => ({ ...team, id: team._id })),
    picks: picks.map((pick) => ({
      ...pick,
      id: pick._id,
      gshlTeamId: pick.gshlTeamId,
      playerId: pick.playerId,
    })),
  });
  const firstTeam = teams.find((team) => team._id === assignments[0]?.teamId);
  if (!firstTeam)
    throw new Error("The first covered team could not be resolved");
  const reservedPicks = assignments.map((assignment) => {
    const pick = picks.find((row) => row._id === assignment.pickId);
    if (!pick) throw new Error("The signing pick could not be resolved");
    return pick;
  });
  const now = Date.now();
  const contractId = await ctx.db.insert("contracts", {
    playerId: player._id,
    ownerId: franchise.ownerId,
    seasonId: request.seasonId,
    contractType: request.contractType,
    contractLength: request.contractLength,
    contractSalary: request.contractSalary,
    signingStatus: request.signingStatus,
    expiryStatus: request.expiryStatus,
    signingDate: now,
    startDate,
    expiryDate,
    capHit: request.contractSalary,
    capHitEndDate: expiryDate,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(player._id, {
    ownerId: franchise.ownerId,
    gshlTeamId: firstTeam._id,
    isSignable: false,
    isResignable: null,
    lineupPos: null,
    updatedAt: now,
  });
  for (const pick of reservedPicks) {
    await ctx.db.patch(pick._id, {
      playerId: player._id,
      isSigning: true,
      onClockStartedAt: null,
      onClockExpiresAt: null,
      onClockEndedAt: null,
      updatedAt: now,
    });
  }
  await rebuildTeamLineup(ctx, {
    policy: "signing",
    ownerId: franchise.ownerId,
    teamId: firstTeam._id,
    updatedAt: now,
  });
  return contractId;
}
