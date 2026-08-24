import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireActiveUser,
  requireCommissioner,
  requireOwnerOrCommissioner,
} from "./lib/auth";
import { upsertLeagueWirePost, withdrawLeagueWirePost } from "./leagueWire";
import type {
  DraftHubPlayerSummary,
  DraftHubTeamSummary,
  DraftPick,
  LineupAssignment,
  LineupCandidate,
  RosterPosition as RosterPositionType,
} from "../src/lib/types";
import {
  DRAFT_PICK_CLOCK_MS,
  findLatestCompletedLiveDraftPick,
  resolveDraftClockState,
  serializeDraftHubPick,
} from "../src/lib/utils/features/draft-hub";
import { generateLineupAssignments } from "../src/lib/utils/features/draft-admin";
import {
  ContractStatus,
  RosterPosition,
} from "../src/lib/utils/domain/constants";
import { toUtcTimestamp } from "./lib/timestamps";

function toDate(value: unknown, fallback: number): Date {
  return new Date(toUtcTimestamp(value) ?? fallback);
}

function toIsoTimestamp(value: unknown): string | null {
  const timestamp = toUtcTimestamp(value);
  return timestamp === null ? null : new Date(timestamp).toISOString();
}

function toDraftPick(row: Doc<"draftPicks">): DraftPick {
  return {
    id: String(row._id),
    seasonId: String(row.seasonId),
    gshlTeamId: String(row.gshlTeamId ?? ""),
    originalTeamId: row.originalTeamId ? String(row.originalTeamId) : null,
    round: String(row.round ?? ""),
    pick: String(row.pick ?? ""),
    playerId: row.playerId ? String(row.playerId) : null,
    onClockStartedAt: toIsoTimestamp(row.onClockStartedAt),
    onClockExpiresAt: toIsoTimestamp(row.onClockExpiresAt),
    onClockEndedAt: toIsoTimestamp(row.onClockEndedAt),
    isTraded: row.isTraded,
    isSigning: row.isSigning,
    createdAt: toDate(row.createdAt, row._creationTime),
    updatedAt: toDate(row.updatedAt, row._creationTime),
  };
}

function compareRows(
  left: Doc<"draftPicks">,
  right: Doc<"draftPicks">,
): number {
  return (
    Number(left.round ?? 0) - Number(right.round ?? 0) ||
    Number(left.pick ?? 0) - Number(right.pick ?? 0)
  );
}

async function loadTeamSummaries(
  ctx: Parameters<typeof requireActiveUser>[0],
  seasonId: Id<"seasons">,
): Promise<Map<string, DraftHubTeamSummary>> {
  const teams = await ctx.db
    .query("teams")
    .withIndex("by_seasonId", (range) => range.eq("seasonId", seasonId))
    .collect();
  const entries = await Promise.all(
    teams.map(async (team) => {
      const franchise = await ctx.db.get(team.franchiseId);
      const summary: DraftHubTeamSummary = {
        id: String(team._id),
        franchiseId: String(team.franchiseId),
        ownerId: franchise ? String(franchise.ownerId) : null,
        name: String(franchise?.name ?? "Unknown team"),
        abbr: String(franchise?.abbr ?? ""),
        logoUrl: franchise?.logoUrl ?? null,
      };
      return [String(team._id), summary] as const;
    }),
  );
  return new Map(entries);
}

function playerSummary(
  player: Doc<"players"> | null,
): DraftHubPlayerSummary | null {
  if (!player) return null;
  return {
    id: String(player._id),
    fullName: player.fullName,
    nhlPos: player.nhlPos ?? [],
    nhlTeam: player.nhlTeam ?? [],
  };
}

function parseTime(value: unknown): number | null {
  return toUtcTimestamp(value);
}

function toRosterPosition(value: unknown): RosterPositionType | null {
  switch (value) {
    case RosterPosition.BN:
      return RosterPosition.BN;
    case RosterPosition.IR:
      return RosterPosition.IR;
    case RosterPosition.IRplus:
      return RosterPosition.IRplus;
    case RosterPosition.LW:
      return RosterPosition.LW;
    case RosterPosition.C:
      return RosterPosition.C;
    case RosterPosition.RW:
      return RosterPosition.RW;
    case RosterPosition.D:
      return RosterPosition.D;
    case RosterPosition.G:
      return RosterPosition.G;
    case RosterPosition.Util:
      return RosterPosition.Util;
    default:
      return null;
  }
}

function toLineupCandidate(player: Doc<"players">): LineupCandidate {
  const parsedRating =
    player.overallRating === null || player.overallRating === undefined
      ? null
      : Number(player.overallRating);
  return {
    id: String(player._id),
    nhlPos: (player.nhlPos ?? [])
      .map(toRosterPosition)
      .filter((position): position is RosterPositionType => position !== null),
    lineupPos: toRosterPosition(player.lineupPos),
    overallRating: Number.isFinite(parsedRating) ? parsedRating : null,
  };
}

async function rebuildTeamLineup(
  ctx: MutationCtx,
  ownerId: Id<"owners">,
  teamId: Id<"teams">,
  updatedAt: number,
  explicitlyIncludedPlayers: readonly Doc<"players">[] = [],
): Promise<LineupAssignment[]> {
  const [ownerRosterRows, teamRosterRows] = await Promise.all([
    ctx.db
      .query("players")
      .withIndex("by_ownerId", (range) => range.eq("ownerId", ownerId))
      .collect(),
    ctx.db
      .query("players")
      .withIndex("by_gshlTeamId", (range) => range.eq("gshlTeamId", teamId))
      .collect(),
  ]);
  const rosterById = new Map<string, Doc<"players">>();
  for (const rosterPlayer of [
    ...ownerRosterRows,
    ...teamRosterRows,
    ...explicitlyIncludedPlayers,
  ]) {
    rosterById.set(String(rosterPlayer._id), rosterPlayer);
  }
  const lineupAssignments = generateLineupAssignments(
    [...rosterById.values()]
      .filter((rosterPlayer) => rosterPlayer.isActive)
      .map(toLineupCandidate),
  );
  for (const assignment of lineupAssignments) {
    const rosterPlayer = rosterById.get(assignment.playerId);
    if (!rosterPlayer) continue;
    await ctx.db.patch(rosterPlayer._id, {
      lineupPos: assignment.lineupPos,
      updatedAt,
    });
  }
  return lineupAssignments;
}

function contractCoversDraft(
  contract: Doc<"contracts">,
  draftDate: number,
): boolean {
  if (
    contract.expiryStatus === ContractStatus.BUYOUT ||
    contract.signingStatus === ContractStatus.BUYOUT
  ) {
    return false;
  }
  const startDate = parseTime(contract.startDate);
  const expiryDate = parseTime(contract.capHitEndDate ?? contract.expiryDate);
  return (
    startDate !== null &&
    expiryDate !== null &&
    startDate <= draftDate &&
    expiryDate >= draftDate
  );
}

export const status = query({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);
    const [season, draftPickRows] = await Promise.all([
      ctx.db.get(args.seasonId),
      ctx.db
        .query("draftPicks")
        .withIndex("by_seasonId_round_pick", (range) =>
          range.eq("seasonId", args.seasonId),
        )
        .collect(),
    ]);
    if (!season) throw new Error("Draft season not found");

    const clock = resolveDraftClockState(
      [...draftPickRows].sort(compareRows).map(toDraftPick),
      toUtcTimestamp(season.draftStartAt),
      new Date(),
    );

    return { status: clock.status };
  },
});

export const state = query({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);
    const [season, draftPickRows, teamById] = await Promise.all([
      ctx.db.get(args.seasonId),
      ctx.db
        .query("draftPicks")
        .withIndex("by_seasonId_round_pick", (range) =>
          range.eq("seasonId", args.seasonId),
        )
        .collect(),
      loadTeamSummaries(ctx, args.seasonId),
    ]);
    if (!season) throw new Error("Draft season not found");

    const orderedRows = [...draftPickRows].sort(compareRows);
    const draftPicks = orderedRows.map(toDraftPick);
    const now = new Date();
    const draftStartAt = toUtcTimestamp(season.draftStartAt);
    const clock = resolveDraftClockState(draftPicks, draftStartAt, now);
    const selectedPlayers = await Promise.all(
      orderedRows.map((row) =>
        row.playerId ? ctx.db.get(row.playerId) : Promise.resolve(null),
      ),
    );

    return {
      season: {
        id: String(season._id),
        name: season.name,
        year: Number(season.year),
        startDate: toUtcTimestamp(season.startDate) ?? 0,
        draftStartAt: toUtcTimestamp(season.draftStartAt) ?? 0,
      },
      serverNow: now.getTime(),
      status: clock.status,
      activePickId: clock.activePick?.id ?? null,
      completedCount: clock.completedCount,
      remainingCount: clock.remainingCount,
      clockStartedAt: toUtcTimestamp(clock.clockStartedAt),
      clockExpiresAt: toUtcTimestamp(clock.clockExpiresAt),
      recentPickIds: clock.recentPicks.map((pick) => pick.id),
      upcomingPickIds: clock.upcomingPicks.map((pick) => pick.id),
      picks: draftPicks.map((pick, index) => ({
        pick: serializeDraftHubPick(pick),
        team: teamById.get(String(pick.gshlTeamId)) ?? null,
        originalTeam: pick.originalTeamId
          ? (teamById.get(String(pick.originalTeamId)) ?? null)
          : null,
        player: playerSummary(selectedPlayers[index] ?? null),
      })),
    };
  },
});

export const submitPick = mutation({
  args: {
    seasonId: v.id("seasons"),
    pickId: v.id("draftPicks"),
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrCommissioner(ctx);
    const [season, pickRows, player] = await Promise.all([
      ctx.db.get(args.seasonId),
      ctx.db
        .query("draftPicks")
        .withIndex("by_seasonId_round_pick", (range) =>
          range.eq("seasonId", args.seasonId),
        )
        .collect(),
      ctx.db.get(args.playerId),
    ]);
    if (!season) throw new Error("Draft season not found");
    if (!player) throw new Error("Player not found");

    const orderedRows = [...pickRows].sort(compareRows);
    const activeRow =
      orderedRows.find((pick) => !pick.isSigning && !pick.playerId) ?? null;
    if (!activeRow) throw new Error("The draft is complete");
    if (activeRow._id !== args.pickId) {
      throw new Error("That pick is no longer on the clock");
    }

    const now = new Date();
    const nowTimestamp = now.getTime();
    const clock = resolveDraftClockState(
      orderedRows.map(toDraftPick),
      toUtcTimestamp(season.draftStartAt),
      now,
    );
    if (clock.status === "upcoming") {
      throw new Error("The draft has not started");
    }
    if (
      clock.status !== "on_clock" &&
      clock.status !== "commissioner_required"
    ) {
      throw new Error("The active draft clock is unavailable");
    }

    if (!activeRow.gshlTeamId) {
      throw new Error("The active pick does not have a team");
    }
    const activeTeam = await ctx.db.get(activeRow.gshlTeamId);
    const franchise = activeTeam
      ? await ctx.db.get(activeTeam.franchiseId)
      : null;
    if (!activeTeam || !franchise) {
      throw new Error("The active pick team could not be resolved");
    }

    const isCommissioner = user.role === "commissioner";
    if (
      !isCommissioner &&
      (!user.ownerId || user.ownerId !== franchise.ownerId)
    ) {
      throw new Error("Only the on-the-clock owner can make this pick");
    }
    if (clock.status === "commissioner_required" && !isCommissioner) {
      throw new Error("The clock expired; a commissioner must make this pick");
    }

    if (!player.isActive) {
      throw new Error("That player is not draft eligible");
    }
    if (
      orderedRows.some(
        (pick) => pick.playerId === args.playerId && pick._id !== activeRow._id,
      )
    ) {
      throw new Error("That player has already been drafted");
    }

    const draftDate = parseTime(season.startDate);
    if (draftDate === null) {
      throw new Error("The draft season start date is invalid");
    }
    const playerContracts = await ctx.db
      .query("contracts")
      .withIndex("by_playerId", (range) => range.eq("playerId", args.playerId))
      .collect();
    if (
      playerContracts.some((contract) =>
        contractCoversDraft(contract, draftDate),
      )
    ) {
      throw new Error("That player already has a contract for this season");
    }

    await ctx.db.patch(player._id, {
      ownerId: franchise.ownerId,
      gshlTeamId: activeTeam._id,
      lineupPos: null,
      updatedAt: nowTimestamp,
    });

    const draftedPlayerRow: Doc<"players"> = {
      ...player,
      ownerId: franchise.ownerId,
      gshlTeamId: activeTeam._id,
      lineupPos: null,
      updatedAt: nowTimestamp,
    };
    const lineupAssignments = await rebuildTeamLineup(
      ctx,
      franchise.ownerId,
      activeTeam._id,
      nowTimestamp,
      [draftedPlayerRow],
    );
    const draftedPlayerAssignment = lineupAssignments.find(
      (assignment) => assignment.playerId === String(player._id),
    );
    if (!draftedPlayerAssignment) {
      throw new Error("The drafted player could not be placed in the lineup");
    }

    await ctx.db.patch(activeRow._id, {
      playerId: args.playerId,
      onClockStartedAt:
        toUtcTimestamp(activeRow.onClockStartedAt) ??
        toUtcTimestamp(clock.clockStartedAt) ??
        nowTimestamp,
      onClockExpiresAt:
        toUtcTimestamp(activeRow.onClockExpiresAt) ??
        toUtcTimestamp(clock.clockExpiresAt) ??
        nowTimestamp + DRAFT_PICK_CLOCK_MS,
      onClockEndedAt: nowTimestamp,
      isSigning: false,
      updatedAt: nowTimestamp,
    });

    const nextPick =
      orderedRows.find(
        (pick) =>
          pick._id !== activeRow._id && !pick.isSigning && !pick.playerId,
      ) ?? null;
    if (nextPick) {
      await ctx.db.patch(nextPick._id, {
        onClockStartedAt: nowTimestamp,
        onClockExpiresAt: nowTimestamp + DRAFT_PICK_CLOCK_MS,
        onClockEndedAt: null,
        updatedAt: nowTimestamp,
      });
    }

    const teamHref = `/lockerroom?view=roster&season=${encodeURIComponent(String(season._id))}&owner=${encodeURIComponent(String(franchise.ownerId))}`;
    await upsertLeagueWirePost(ctx, {
      seasonId: season._id,
      kind: "draft_pick",
      sourceKey: `draft-pick:${String(activeRow._id)}`,
      occurredAt: nowTimestamp,
      title: `${franchise.name} drafts ${player.fullName}`,
      summary: `Round ${String(activeRow.round)}, pick ${String(activeRow.pick ?? "-")}`,
      teamIds: [activeTeam._id],
      playerIds: [player._id],
      links: [
        {
          label: "View draft",
          href: `/draft?season=${encodeURIComponent(String(season._id))}#draft-pick-${encodeURIComponent(String(activeRow._id))}`,
        },
        {
          label: "View player",
          href: `${teamHref}#player-${encodeURIComponent(String(player._id))}`,
        },
      ],
    });

    return {
      completedPickId: String(activeRow._id),
      nextPickId: nextPick ? String(nextPick._id) : null,
      isComplete: nextPick === null,
      lineupPos: draftedPlayerAssignment.lineupPos,
    };
  },
});

export const undoPick = mutation({
  args: {
    seasonId: v.id("seasons"),
    pickId: v.id("draftPicks"),
  },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const [season, pickRows] = await Promise.all([
      ctx.db.get(args.seasonId),
      ctx.db
        .query("draftPicks")
        .withIndex("by_seasonId_round_pick", (range) =>
          range.eq("seasonId", args.seasonId),
        )
        .collect(),
    ]);
    if (!season) throw new Error("Draft season not found");

    const orderedRows = [...pickRows].sort(compareRows);
    const latestCompletedDraftPick = findLatestCompletedLiveDraftPick(
      orderedRows.map(toDraftPick),
    );
    const latestCompletedPick = latestCompletedDraftPick
      ? (orderedRows.find(
          (pick) => String(pick._id) === latestCompletedDraftPick.id,
        ) ?? null)
      : null;
    if (!latestCompletedPick?.playerId) {
      throw new Error("There are no completed draft picks to undo");
    }
    if (latestCompletedPick._id !== args.pickId) {
      throw new Error("Only the latest completed draft pick can be undone");
    }
    if (!latestCompletedPick.gshlTeamId) {
      throw new Error("The selected pick does not have a team");
    }

    const [team, player] = await Promise.all([
      ctx.db.get(latestCompletedPick.gshlTeamId),
      ctx.db.get(latestCompletedPick.playerId),
    ]);
    const franchise = team ? await ctx.db.get(team.franchiseId) : null;
    if (!team || !franchise || !player) {
      throw new Error("The selected pick roster could not be resolved");
    }
    const playerStillOnDraftTeam =
      player.gshlTeamId === team._id || player.ownerId === franchise.ownerId;
    if (!playerStillOnDraftTeam) {
      throw new Error(
        "That player's roster assignment changed after the pick and cannot be undone safely",
      );
    }

    const nowTimestamp = Date.now();
    await ctx.db.patch(player._id, {
      ownerId: null,
      gshlTeamId: undefined,
      lineupPos: null,
      updatedAt: nowTimestamp,
    });
    await rebuildTeamLineup(ctx, franchise.ownerId, team._id, nowTimestamp);

    for (const openPick of orderedRows.filter(
      (pick) => !pick.isSigning && !pick.playerId,
    )) {
      await ctx.db.patch(openPick._id, {
        onClockStartedAt: null,
        onClockExpiresAt: null,
        onClockEndedAt: null,
        updatedAt: nowTimestamp,
      });
    }

    const draftStartAt = toUtcTimestamp(season.draftStartAt) ?? nowTimestamp;
    const restartedAt = Math.max(nowTimestamp, draftStartAt);
    await ctx.db.patch(latestCompletedPick._id, {
      playerId: null,
      onClockStartedAt: restartedAt,
      onClockExpiresAt: restartedAt + DRAFT_PICK_CLOCK_MS,
      onClockEndedAt: null,
      updatedAt: nowTimestamp,
    });
    await withdrawLeagueWirePost(
      ctx,
      `draft-pick:${String(latestCompletedPick._id)}`,
    );

    return {
      undonePickId: String(latestCompletedPick._id),
      releasedPlayerId: String(player._id),
    };
  },
});
