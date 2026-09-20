import { selectAutoDraftPlayer } from "../src/lib/utils/features/mock-draft";
import { nextDraftMode } from "./lib/draftMode";
import {
  draftCorrectionSnapshot,
  draftCorrectionVersion,
} from "./lib/draftCorrection";
import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { emitNotification } from "./lib/notificationEvents";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireActiveUser,
  requireCommissioner,
  requireOwnerOrCommissioner,
} from "./lib/auth";
import type {
  DraftHubPlayerSummary,
  DraftHubTeamSummary,
  DraftPick,
  LineupAssignment,
  LineupCandidate,
  RosterPosition as RosterPositionType,
} from "../src/lib/types";
import {
  getDraftPickClockMs,
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

export async function notificationClock(
  ctx: QueryCtx | MutationCtx,
  seasonId: Id<"seasons">,
) {
  const season = await ctx.db.get(seasonId);
  const rows = await ctx.db
    .query("draftPicks")
    .withIndex("by_seasonId_round_pick", (q) => q.eq("seasonId", seasonId))
    .collect();
  return resolveDraftClockState(
    [...rows].sort(compareRows).map(toDraftPick),
    toUtcTimestamp(season?.draftStartAt),
    new Date(),
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
        draftAuto: team.draftAuto ?? false,
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

export const adminPicks = query({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, { seasonId }) => {
    await requireCommissioner(ctx);
    const [rows, teams] = await Promise.all([
      ctx.db
        .query("draftPicks")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", seasonId))
        .collect(),
      loadTeamSummaries(ctx, seasonId),
    ]);
    return {
      teams: [...teams.values()],
      picks: await Promise.all(
        [...rows].sort(compareRows).map(async (row) => ({
          id: row._id,
          ...draftCorrectionSnapshot(row),
          version: draftCorrectionVersion(row),
          playerName: row.playerId
            ? ((await ctx.db.get(row.playerId))?.fullName ?? "Missing player")
            : null,
        })),
      ),
    };
  },
});

export const correctionHistory = query({
  args: { pickId: v.id("draftPicks") },
  handler: async (ctx, { pickId }) => {
    await requireCommissioner(ctx);
    return ctx.db
      .query("draftPickCorrections")
      .withIndex("by_pickId", (q) => q.eq("pickId", pickId))
      .order("desc")
      .take(20);
  },
});

export const correctPicks = mutation({
  args: {
    seasonId: v.id("seasons"),
    reason: v.string(),
    edits: v.array(
      v.object({
        pickId: v.id("draftPicks"),
        expectedVersion: v.string(),
        changes: v.object({
          gshlTeamId: v.id("teams"),
          originalTeamId: v.union(v.id("teams"), v.null()),
          round: v.number(),
          pick: v.number(),
          playerId: v.union(v.id("players"), v.null()),
          isTraded: v.boolean(),
          isSigning: v.boolean(),
        }),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireCommissioner(ctx);
    if (!args.edits.length || args.edits.length > 500)
      throw new Error("Stage between 1 and 500 corrections");
    const reason = args.reason.trim();
    if (!reason || reason.length > 1000)
      throw new Error("Enter a correction reason (1-1000 characters)");
    const season = await ctx.db.get(args.seasonId);
    if (!season) throw new Error("Draft season not found");
    const rows = await ctx.db
      .query("draftPicks")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", args.seasonId))
      .collect();
    const started = (toUtcTimestamp(season.draftStartAt) ?? 0) <= Date.now();
    if (started && rows.some((p) => !p.isSigning && !p.playerId))
      throw new Error(
        "Corrections are available before the draft starts or after every pick is complete",
      );
    const edits = new Map(args.edits.map((edit) => [edit.pickId, edit]));
    if (edits.size !== args.edits.length)
      throw new Error("Each pick may be edited only once per batch");
    for (const edit of args.edits) {
      const row = rows.find((p) => p._id === edit.pickId);
      if (!row) throw new Error("Draft pick not found in this season");
      if (draftCorrectionVersion(row) !== edit.expectedVersion)
        throw new Error(
          "A staged pick changed. Discard the batch and reopen the picks before saving.",
        );
      const changes = edit.changes;
      if (
        ![changes.round, changes.pick].every(
          (n) => Number.isSafeInteger(n) && n > 0,
        )
      )
        throw new Error("Round and pick must be positive whole numbers");
      for (const teamId of new Set([
        changes.gshlTeamId,
        changes.originalTeamId,
      ])) {
        if (!teamId) continue;
        const team = await ctx.db.get(teamId);
        if (team?.seasonId !== args.seasonId)
          throw new Error("Choose teams from the pick's season");
      }
      if (changes.playerId && !(await ctx.db.get(changes.playerId)))
        throw new Error("Player not found");
    }
    const finalRows = rows.map((row) => ({
      ...row,
      ...edits.get(row._id)?.changes,
    }));
    if (started && finalRows.some((p) => !p.isSigning && !p.playerId))
      throw new Error("A correction cannot reopen a completed draft");
    // Validate the final batch so swaps do not fail on intermediate duplicates.
    const slots = new Set<string>();
    const players = new Set<string>();
    for (const row of finalRows) {
      const slot = `${Number(row.round)}:${Number(row.pick)}`;
      if (slots.has(slot))
        throw new Error("Each round and pick must be unique after corrections");
      slots.add(slot);
      if (row.playerId) {
        if (players.has(row.playerId))
          throw new Error(
            "Each player must appear only once after corrections",
          );
        players.add(row.playerId);
      }
    }
    // Correct draft history independently of current player ownership.
    // Only draft picks and their audit records are written below.
    const changedRows = rows.filter(
      (row) =>
        edits.has(row._id) &&
        JSON.stringify(draftCorrectionSnapshot(row)) !==
          JSON.stringify(
            draftCorrectionSnapshot({ ...row, ...edits.get(row._id)!.changes }),
          ),
    );
    if (!changedRows.length) throw new Error("No changes to save");
    const now = Date.now();
    for (const row of changedRows) {
      const changes = edits.get(row._id)!.changes;
      const before = JSON.stringify(draftCorrectionSnapshot(row));
      const after = JSON.stringify(
        draftCorrectionSnapshot({ ...row, ...changes }),
      );
      await ctx.db.patch(row._id, { ...changes, updatedAt: now });
      await ctx.db.insert("draftPickCorrections", {
        seasonId: row.seasonId,
        pickId: row._id,
        userId: user._id,
        reason,
        before,
        after,
        createdAt: now,
      });
    }
    return { correctedCount: changedRows.length };
  },
});
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
      teams: [...teamById.values()],
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

async function completePick(
  ctx: MutationCtx,
  args: {
    seasonId: Id<"seasons">;
    pickId: Id<"draftPicks">;
    playerId: Id<"players">;
  },
  automatic?: "timeout" | "auto",
) {
  const user = automatic ? null : await requireOwnerOrCommissioner(ctx);
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
  if (clock.status !== "on_clock" && clock.status !== "commissioner_required") {
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

  const isCommissioner = user?.role === "commissioner";
  if (
    !automatic &&
    !isCommissioner &&
    (!user?.ownerId || user.ownerId !== franchise.ownerId)
  ) {
    throw new Error("Only the on-the-clock owner can make this pick");
  }
  if (
    clock.status === "commissioner_required" &&
    !isCommissioner &&
    !automatic
  ) {
    throw new Error("The clock expired; a commissioner must make this pick");
  }

  if (!automatic && activeTeam.draftAuto)
    throw new Error("Switch this team to Live before making a pick");
  await ctx.db.patch(
    activeTeam._id,
    nextDraftMode(activeTeam, automatic === "timeout"),
  );

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
    playerContracts.some((contract) => contractCoversDraft(contract, draftDate))
  ) {
    throw new Error("That player already has a contract for this season");
  }

  await ctx.db.patch(player._id, {
    ownerId: franchise.ownerId,
    gshlTeamId: activeTeam._id,
    isSignable: false,
    isResignable: null,
    lineupPos: null,
    updatedAt: nowTimestamp,
  });

  const draftedPlayerRow: Doc<"players"> = {
    ...player,
    ownerId: franchise.ownerId,
    gshlTeamId: activeTeam._id,
    isSignable: false,
    isResignable: null,
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
      nowTimestamp + getDraftPickClockMs(activeRow.round),
    onClockEndedAt: nowTimestamp,
    isSigning: false,
    updatedAt: nowTimestamp,
  });

  const nextPick =
    orderedRows.find(
      (pick) => pick._id !== activeRow._id && !pick.isSigning && !pick.playerId,
    ) ?? null;
  if (nextPick) {
    await ctx.db.patch(nextPick._id, {
      onClockStartedAt: nowTimestamp,
      onClockExpiresAt: nowTimestamp + getDraftPickClockMs(nextPick.round),
      onClockEndedAt: null,
      updatedAt: nowTimestamp,
    });
  }

  await emitNotification(ctx, {
    key: `pick:${activeRow._id}:${nowTimestamp}`,
    category: "draft_pick",
    title: "Pick confirmed",
    body: `Your team selected ${player.fullName}.`,
    href: "/draft/my-team",
    ownerId: franchise.ownerId,
    pickId: activeRow._id,
    clockStartedAt: nowTimestamp,
    expiresAt: nowTimestamp + 3600000,
  });
  await ctx.scheduler.runAfter(0, internal.draft.notifyState, {
    seasonId: args.seasonId,
  });
  return {
    completedPickId: String(activeRow._id),
    nextPickId: nextPick ? String(nextPick._id) : null,
    isComplete: nextPick === null,
    lineupPos: draftedPlayerAssignment.lineupPos,
  };
}
export const submitPick = mutation({
  args: {
    seasonId: v.id("seasons"),
    pickId: v.id("draftPicks"),
    playerId: v.id("players"),
  },
  handler: (ctx, args) => completePick(ctx, args),
});
export const setTeamMode = mutation({
  args: { teamId: v.id("teams"), auto: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrCommissioner(ctx);
    const team = await ctx.db.get(args.teamId);
    const franchise = team ? await ctx.db.get(team.franchiseId) : null;
    if (!team || !franchise) throw new Error("Team not found");
    if (user.role !== "commissioner" && user.ownerId !== franchise.ownerId)
      throw new Error(
        "Only this team's owner or a commissioner can change draft mode",
      );
    await ctx.db.patch(team._id, {
      draftAuto: args.auto,
      draftTimeoutStreak: 0,
    });
    await ctx.scheduler.runAfter(0, internal.draft.notifyState, {
      seasonId: team.seasonId,
    });
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
    // Undo removes the timeout from the streak; Auto still needs an explicit toggle.
    await ctx.db.patch(team._id, { draftTimeoutStreak: 0 });

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
      onClockExpiresAt:
        restartedAt + getDraftPickClockMs(latestCompletedPick.round),
      onClockEndedAt: null,
      updatedAt: nowTimestamp,
    });

    await ctx.scheduler.runAfter(0, internal.draft.notifyState, {
      seasonId: args.seasonId,
    });
    return {
      undonePickId: String(latestCompletedPick._id),
      releasedPlayerId: String(player._id),
    };
  },
});

export const notifyState = internalMutation({
  args: {
    seasonId: v.id("seasons"),
    expectedPickId: v.optional(v.id("draftPicks")),
    expectedClockStartedAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { seasonId, expectedPickId, expectedClockStartedAt },
  ) => {
    const season = await ctx.db.get(seasonId);
    if (!season) return;
    const now = Date.now(),
      start = toUtcTimestamp(season.draftStartAt);
    if (start === null) return;
    const rows = await ctx.db
      .query("draftPicks")
      .withIndex("by_seasonId_round_pick", (q) => q.eq("seasonId", seasonId))
      .collect();
    const picks = [...rows].sort(compareRows).map(toDraftPick);
    const clock = resolveDraftClockState(picks, start, new Date(now));
    // Ignore timers from picks that were completed, undone, or rescheduled.
    if (
      expectedPickId &&
      (clock.activePick?.id !== String(expectedPickId) ||
        clock.clockStartedAt !== expectedClockStartedAt)
    )
      return;
    if (
      clock.activePick &&
      (clock.status === "on_clock" || clock.status === "commissioner_required")
    ) {
      const active = rows.find(
        (row) => String(row._id) === clock.activePick!.id,
      )!;
      const team = active.gshlTeamId
        ? await ctx.db.get(active.gshlTeamId)
        : null;
      if (
        team &&
        (team.draftAuto || clock.status === "commissioner_required")
      ) {
        const franchise = await ctx.db.get(team.franchiseId);
        const draftDate = toUtcTimestamp(season.startDate);
        if (!franchise || draftDate === null) return;
        const [players, contracts] = await Promise.all([
          ctx.db
            .query("players")
            .withIndex("by_isActive", (q) => q.eq("isActive", true))
            .collect(),
          ctx.db.query("contracts").collect(),
        ]);
        const covered = contracts.filter((contract) =>
          contractCoversDraft(contract, draftDate),
        );
        const drafted = new Set(
          rows.flatMap((row) => (row.playerId ? [String(row.playerId)] : [])),
        );
        const contracted = new Set(
          covered.map((contract) => String(contract.playerId)),
        );
        const rosterIds = new Set([
          ...covered
            .filter((contract) => contract.ownerId === franchise.ownerId)
            .map((contract) => String(contract.playerId)),
          ...rows
            .filter(
              (row) =>
                row.gshlTeamId === team._id && !row.isSigning && row.playerId,
            )
            .map((row) => String(row.playerId)),
        ]);
        const candidates = players.map((player) => ({
          ...toLineupCandidate(player),
          fullName: player.fullName,
          yahooDraftRk:
            player.yahooDraftRk == null ? null : Number(player.yahooDraftRk),
          dailyFaceoffRk:
            player.dailyFaceoffRk == null
              ? null
              : Number(player.dailyFaceoffRk),
          nhlRk: player.nhlRk == null ? null : Number(player.nhlRk),
          overallRk: player.overallRk == null ? null : Number(player.overallRk),
        }));
        const selected = selectAutoDraftPlayer(
          candidates.filter(
            (player) => !drafted.has(player.id) && !contracted.has(player.id),
          ),
          candidates.filter((player) => rosterIds.has(player.id)),
        ).player;
        if (!selected) return;
        const player = players.find(
          (player) => String(player._id) === selected.id,
        )!;
        await completePick(
          ctx,
          { seasonId, pickId: active._id, playerId: player._id },
          team.draftAuto ? "auto" : "timeout",
        );
        return;
      }
      if (clock.clockExpiresAt)
        await ctx.scheduler.runAt(
          clock.clockExpiresAt,
          internal.draft.notifyState,
          {
            seasonId,
            expectedPickId: active._id,
            expectedClockStartedAt: clock.clockStartedAt ?? undefined,
          },
        );
    }
    const base = { href: "/draft", expiresAt: start, seasonId };
    if (
      now < start &&
      now >= start - 15 * 60000 &&
      picks.some((pick) => !pick.isSigning)
    ) {
      await emitNotification(ctx, {
        ...base,
        key: `start:${seasonId}:${start}`,
        category: "draft_start",
        title: "Draft starting soon",
        body: `${season.name} starts in ${Math.ceil((start - now) / 60000)} minutes.`,
      });
      await ctx.scheduler.runAt(start, internal.draft.notifyState, {
        seasonId,
      });
      return;
    }
    if (clock.status === "complete") {
      const lastEnded = Math.max(
        0,
        ...rows.map((row) => toUtcTimestamp(row.onClockEndedAt) ?? 0),
      );
      if (lastEnded > now - 5 * 60000)
        await emitNotification(ctx, {
          ...base,
          key: `complete:${seasonId}:${lastEnded}`,
          category: "draft_complete",
          title: "Draft complete",
          body: `${season.name}: all selections are in.`,
          expiresAt: lastEnded + 3600000,
        });
      return;
    }
    if (
      clock.status !== "on_clock" ||
      !clock.activePick ||
      !clock.clockExpiresAt ||
      !clock.clockStartedAt
    )
      return;
    const expiresAt = toUtcTimestamp(clock.clockExpiresAt)!;
    const clockStartedAt = toUtcTimestamp(clock.clockStartedAt)!;
    const teamById = await loadTeamSummaries(ctx, seasonId);
    const ownerFor = (pick: DraftPick) =>
      teamById.get(pick.gshlTeamId)?.ownerId as Id<"owners"> | undefined;
    const active = rows.find(
      (row) => String(row._id) === clock.activePick!.id,
    )!;
    const ownerId = ownerFor(clock.activePick);
    if (ownerId) {
      const event = {
        href: "/draft",
        ownerId,
        pickId: active._id,
        clockStartedAt,
        expiresAt,
      };
      await emitNotification(ctx, {
        ...event,
        key: `turn:${active._id}:${clockStartedAt}:${ownerId}`,
        category: "draft_turn",
        title: "You are on the clock",
        body: `Round ${active.round}, pick ${active.pick}. Make your selection.`,
      });
      if (now >= expiresAt - 60000)
        await emitNotification(ctx, {
          ...event,
          key: `clock:${active._id}:${clockStartedAt}:${ownerId}`,
          category: "draft_clock",
          title: "Your draft clock is running low",
          body: "Less than a minute remains. Make your pick.",
        });
      else
        await ctx.scheduler.runAt(
          expiresAt - 60000,
          internal.draft.notifyState,
          {
            seasonId,
            expectedPickId: active._id,
            expectedClockStartedAt: clockStartedAt,
          },
        );
    }
    for (const [index, pick] of clock.upcomingPicks.slice(0, 2).entries()) {
      const upcomingOwner = ownerFor(pick);
      if (!upcomingOwner || upcomingOwner === ownerId) continue;
      const row = rows.find((row) => String(row._id) === pick.id)!;
      await emitNotification(ctx, {
        href: "/draft",
        ownerId: upcomingOwner,
        pickId: row._id,
        key: `upcoming:${pick.id}:${toUtcTimestamp(row.updatedAt) ?? 0}:${upcomingOwner}`,
        category: "draft_upcoming",
        title: "Your pick is coming up",
        body: `Your team picks in ${index + 1} ${index === 0 ? "selection" : "selections"}.`,
        expiresAt: now + 8 * 60000,
      });
    }
  },
});
