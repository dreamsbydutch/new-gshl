import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCommissioner } from "./lib/auth";
import {
  prepareTrade,
  tradeFingerprint,
  tradeSources,
  playingTradeContract,
} from "./lib/tradeTransaction";
import { rebuildTeamLineup } from "./lib/teamLineup";
import { toUtcTimestamp, utcTimestampToDateKey } from "./lib/timestamps";

const tradeArgs = {
  seasonId: v.id("seasons"),
  teamAId: v.id("teams"),
  teamBId: v.id("teams"),
  effectiveDate: v.string(),
  playerIdsA: v.array(v.id("players")),
  playerIdsB: v.array(v.id("players")),
  pickIdsA: v.array(v.id("draftPicks")),
  pickIdsB: v.array(v.id("draftPicks")),
  notes: v.string(),
};

export const catalog = query({
  args: {
    seasonId: v.id("seasons"),
    teamAId: v.id("teams"),
    teamBId: v.id("teams"),
    effectiveDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const source = await tradeSources(
      ctx,
      args.seasonId,
      args.teamAId,
      args.teamBId,
    );
    const owners = [source.franchiseA.ownerId, source.franchiseB.ownerId];
    const rosters = await Promise.all(
      owners.map((ownerId) =>
        ctx.db
          .query("players")
          .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
          .take(101),
      ),
    );
    if (rosters.some((roster) => roster.length === 101))
      throw Error("Team rosters exceed the supported trade scope");
    const roster = rosters.flat();
    const contracts = source.contracts.filter((c) =>
      playingTradeContract(c, args.effectiveDate),
    );
    const ids = [
      ...new Set([
        ...roster.map((p) => p._id),
        ...contracts.map((c) => c.playerId),
      ]),
    ];
    const players = (await Promise.all(ids.map((id) => ctx.db.get(id))))
      .flatMap((p) =>
        p?.isActive
          ? [
              {
                id: p._id,
                name: p.fullName,
                ownerId: p.ownerId ?? null,
                teamId: p.gshlTeamId ?? null,
                contractOwnerIds: [
                  ...new Set(
                    contracts
                      .filter((c) => c.playerId === p._id)
                      .map((c) => c.ownerId),
                  ),
                ],
              },
            ]
          : [],
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    const picks = source.picks.flatMap((p) => {
      const season = source.seasons.find((s) => s._id === p.seasonId);
      const team = source.teams.find((t) => t._id === p.gshlTeamId);
      const draft = toUtcTimestamp(season?.draftStartAt);
      const start = utcTimestampToDateKey(season?.startDate);
      return season &&
        team &&
        start &&
        start > args.effectiveDate &&
        (draft === null || draft > Date.now()) &&
        !p.playerId &&
        !p.isSigning &&
        p.onClockStartedAt == null &&
        p.onClockExpiresAt == null &&
        p.onClockEndedAt == null
        ? [
            {
              id: p._id,
              ownerId: source.ownerByFranchise.get(team.franchiseId)!,
              label: `${season.name} · Round ${p.round}, pick ${p.pick ?? "—"}`,
            },
          ]
        : [];
    });
    return {
      players,
      picks,
      ownerAId: source.franchiseA.ownerId,
      ownerBId: source.franchiseB.ownerId,
    };
  },
});

export const preview = query({
  args: tradeArgs,
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    try {
      return { preview: (await prepareTrade(ctx, args)).preview, error: null };
    } catch (error) {
      return {
        preview: null,
        error:
          error instanceof Error
            ? error.message
            : "Trade preview is unavailable",
      };
    }
  },
});

export const record = mutation({
  args: { ...tradeArgs, requestId: v.string(), expectedVersion: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCommissioner(ctx);
    if (!args.requestId.trim() || args.requestId.length > 128)
      throw Error("A valid trade request ID is required");
    const { requestId, expectedVersion, ...request } = args;
    const fingerprint = tradeFingerprint(request);
    const previous = await ctx.db
      .query("trades")
      .withIndex("by_requestId", (q) => q.eq("requestId", requestId))
      .unique();
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw Error("This request ID belongs to another trade");
      return previous._id;
    }
    const plan = await prepareTrade(ctx, request);
    if (plan.version !== expectedVersion)
      throw Error(
        "Trade assets changed. Review the trade again before recording it.",
      );
    const now = Date.now();
    const { franchiseA, franchiseB } = plan.source;
    const contractTransfers = plan.transferredPlayers.flatMap((move) =>
      move.contracts.map((contract) => ({
        contractId: contract._id,
        fromOwnerId: contract.ownerId,
        toOwnerId: plan.contractOwners.get(contract._id)!,
        before: JSON.stringify(contract),
      })),
    );
    const id = await ctx.db.insert("trades", {
      seasonId: args.seasonId,
      effectiveDate: args.effectiveDate,
      requestId,
      fingerprint,
      teamAId: args.teamAId,
      teamBId: args.teamBId,
      teamAName: franchiseA.name,
      teamBName: franchiseB.name,
      teamALogoUrl: franchiseA.logoUrl ?? null,
      teamBLogoUrl: franchiseB.logoUrl ?? null,
      players: plan.preview.players.map(
        ({ contracts: _contracts, ...player }) => player,
      ),
      picks: plan.preview.picks,
      contractTransfers,
      pickChanges: plan.pickChanges.map((pick) => ({
        pickId: pick._id,
        before: JSON.stringify(
          plan.source.picks.find((source) => source._id === pick._id),
        ),
        after: JSON.stringify(pick),
      })),
      notes: args.notes.trim(),
      createdBy: user._id,
      createdAt: now,
    });
    for (const transfer of contractTransfers)
      await ctx.db.patch(transfer.contractId, {
        ownerId: transfer.toOwnerId,
        updatedAt: now,
      });
    for (const pick of plan.pickChanges)
      await ctx.db.patch(pick._id, {
        gshlTeamId: pick.gshlTeamId,
        originalTeamId: pick.originalTeamId,
        isTraded: pick.isTraded,
        playerId: pick.playerId,
        isSigning: pick.isSigning,
        updatedAt: now,
      });
    for (const move of plan.transferredPlayers) {
      const ownerId =
        move.to._id === args.teamAId ? franchiseA.ownerId : franchiseB.ownerId;
      if (
        move.player.ownerId !== ownerId ||
        move.player.gshlTeamId !== move.to._id
      )
        await ctx.db.patch(move.player._id, {
          ownerId,
          gshlTeamId: move.to._id,
          lineupPos: null,
          updatedAt: now,
        });
      const listings = await ctx.db
        .query("tradeBlockEntries")
        .withIndex("by_ownerId_playerId", (q) =>
          q
            .eq(
              "ownerId",
              move.from._id === args.teamAId
                ? franchiseA.ownerId
                : franchiseB.ownerId,
            )
            .eq("playerId", move.player._id),
        )
        .take(11);
      if (listings.length > 10)
        throw Error("Too many trade-block listings for the player");
      for (const listing of listings) await ctx.db.delete(listing._id);
    }
    if (plan.transferredPlayers.length)
      for (const [ownerId, teamId] of [
        [franchiseA.ownerId, args.teamAId],
        [franchiseB.ownerId, args.teamBId],
      ] as const)
        await rebuildTeamLineup(ctx, {
          policy: "signing",
          ownerId,
          teamId,
          updatedAt: now,
        });
    return id;
  },
});
