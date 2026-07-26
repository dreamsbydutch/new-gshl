import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser, requireOwnerOrCommissioner } from "./lib/auth";
import type {
  DraftHubPlayerSummary,
  DraftHubTeamSummary,
  DraftPick,
} from "../src/lib/types";
import {
  DRAFT_PICK_CLOCK_MS,
  resolveDraftClockState,
  serializeDraftHubPick,
} from "../src/lib/utils/features/draft-hub";
import { ContractStatus } from "../src/lib/utils/domain/constants";
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
  const expiryDate = parseTime(contract.expiryDate);
  return (
    startDate !== null &&
    expiryDate !== null &&
    startDate < draftDate &&
    expiryDate >= draftDate
  );
}

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

    if (!player.isActive || !player.isSignable) {
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
    await ctx.db.patch(player._id, {
      ownerId: franchise.ownerId,
      gshlTeamId: undefined,
      lineupPos: "BN",
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

    return {
      completedPickId: String(activeRow._id),
      nextPickId: nextPick ? String(nextPick._id) : null,
      isComplete: nextPick === null,
    };
  },
});
