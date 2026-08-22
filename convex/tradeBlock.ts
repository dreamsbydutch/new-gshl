import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireActiveUser, requireOwnerAccess } from "./lib/auth";
import { toUtcTimestamp, utcTimestampToDateKey } from "./lib/timestamps";
import { normalizeTradeBlockNote } from "../src/lib/utils/features/trade-block";

const INELIGIBLE_EXPIRY_STATUSES = new Set(["Buyout", "Retired", "Injured"]);
const PLAYING_CONTRACT_TYPES = new Set(["STANDARD", "EXTENSION"]);

function contractTypes(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
}

function isEligibleContract(
  contract: Doc<"contracts">,
  ownerId: Id<"owners">,
  now: number,
) {
  if (contract.ownerId !== ownerId) return false;
  if (INELIGIBLE_EXPIRY_STATUSES.has(String(contract.expiryStatus ?? ""))) {
    return false;
  }
  if (
    !contractTypes(contract.contractType).some((type) =>
      PLAYING_CONTRACT_TYPES.has(type),
    )
  ) {
    return false;
  }

  const capHitEnd = toUtcTimestamp(
    contract.capHitEndDate ?? contract.expiryDate,
  );
  return capHitEnd !== null && capHitEnd >= now;
}

function selectDisplayContract(
  contracts: readonly Doc<"contracts">[],
  ownerId: Id<"owners">,
  playerId: Id<"players">,
  now: number,
) {
  return contracts
    .filter(
      (contract) =>
        contract.playerId === playerId &&
        isEligibleContract(contract, ownerId, now),
    )
    .sort((left, right) => {
      const leftStart =
        toUtcTimestamp(left.startDate) ?? Number.MAX_SAFE_INTEGER;
      const rightStart =
        toUtcTimestamp(right.startDate) ?? Number.MAX_SAFE_INTEGER;
      return leftStart - rightStart;
    })[0];
}

async function loadOwnerResources(
  ctx: QueryCtx,
  ownerIds: readonly Id<"owners">[],
) {
  const entries = await Promise.all(
    ownerIds.map(async (ownerId) => {
      const [contracts, franchises] = await Promise.all([
        ctx.db
          .query("contracts")
          .withIndex("by_ownerId", (range) => range.eq("ownerId", ownerId))
          .collect(),
        ctx.db
          .query("franchises")
          .withIndex("by_ownerId", (range) => range.eq("ownerId", ownerId))
          .collect(),
      ]);
      return [
        String(ownerId),
        {
          contracts,
          franchise:
            franchises.find((franchise) => franchise.isActive) ??
            franchises[0] ??
            null,
        },
      ] as const;
    }),
  );
  return new Map(entries);
}

function projectCandidate(options: {
  player: Doc<"players">;
  contract: Doc<"contracts">;
  franchise: Doc<"franchises"> | null;
  listing?: Doc<"tradeBlockEntries">;
}) {
  const { player, contract, franchise, listing } = options;
  return {
    listingId: listing ? String(listing._id) : null,
    ownerId: String(contract.ownerId),
    playerId: String(player._id),
    fullName: player.fullName,
    posGroup: player.posGroup,
    nhlPos: player.nhlPos ?? [],
    nhlTeam: player.nhlTeam ?? [],
    overallRating:
      player.overallRating === null || player.overallRating === undefined
        ? null
        : Number(player.overallRating),
    overallRank:
      player.overallRk === null || player.overallRk === undefined
        ? null
        : Number(player.overallRk),
    capHit: Number(contract.capHit ?? contract.contractSalary ?? 0),
    contractLength: Number(contract.contractLength ?? 0),
    expiryDate: utcTimestampToDateKey(
      contract.capHitEndDate ?? contract.expiryDate,
    ),
    team: {
      name: franchise?.name ?? "Unknown team",
      abbr: franchise?.abbr ?? "",
      logoUrl: franchise?.logoUrl ?? null,
    },
    note: listing?.note ?? null,
    listedAt: listing?.createdAt ?? null,
    updatedAt: listing?.updatedAt ?? null,
  };
}

export const market = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireActiveUser(ctx);
    const listings = await ctx.db.query("tradeBlockEntries").collect();
    const viewerOwnerId = user.ownerId ?? null;
    const ownerIds = [
      ...new Map(
        [
          ...listings.map((listing) => listing.ownerId),
          ...(viewerOwnerId ? [viewerOwnerId] : []),
        ].map((ownerId) => [String(ownerId), ownerId] as const),
      ).values(),
    ];
    const ownerResources = await loadOwnerResources(ctx, ownerIds);
    const playerIds = [
      ...new Map(
        listings
          .map((listing) => listing.playerId)
          .map((playerId) => [String(playerId), playerId] as const),
      ).values(),
    ];
    const listedPlayers = new Map(
      (
        await Promise.all(
          playerIds.map(
            async (playerId) => [playerId, await ctx.db.get(playerId)] as const,
          ),
        )
      )
        .filter((entry): entry is readonly [Id<"players">, Doc<"players">] =>
          Boolean(entry[1]),
        )
        .map(([playerId, player]) => [String(playerId), player] as const),
    );
    const now = Date.now();

    const projectedListings = listings
      .map((listing) => {
        const player = listedPlayers.get(String(listing.playerId));
        const resources = ownerResources.get(String(listing.ownerId));
        if (
          !player ||
          !resources ||
          player.ownerId !== listing.ownerId ||
          !player.isActive
        ) {
          return null;
        }
        const contract = selectDisplayContract(
          resources.contracts,
          listing.ownerId,
          listing.playerId,
          now,
        );
        return contract
          ? projectCandidate({
              player,
              contract,
              franchise: resources.franchise,
              listing,
            })
          : null;
      })
      .filter(
        (listing): listing is NonNullable<typeof listing> => listing !== null,
      )
      .sort(
        (left, right) =>
          (right.overallRating ?? -1) - (left.overallRating ?? -1) ||
          left.fullName.localeCompare(right.fullName),
      );

    let candidates: ReturnType<typeof projectCandidate>[] = [];
    if (viewerOwnerId) {
      const resources = ownerResources.get(String(viewerOwnerId));
      const players = await ctx.db
        .query("players")
        .withIndex("by_ownerId", (range) => range.eq("ownerId", viewerOwnerId))
        .collect();
      const listingByPlayerId = new Map(
        listings
          .filter((listing) => listing.ownerId === viewerOwnerId)
          .map((listing) => [String(listing.playerId), listing]),
      );
      if (resources) {
        candidates = players
          .filter((player) => player.isActive)
          .map((player) => {
            const contract = selectDisplayContract(
              resources.contracts,
              viewerOwnerId,
              player._id,
              now,
            );
            return contract
              ? projectCandidate({
                  player,
                  contract,
                  franchise: resources.franchise,
                  listing: listingByPlayerId.get(String(player._id)),
                })
              : null;
          })
          .filter(
            (candidate): candidate is NonNullable<typeof candidate> =>
              candidate !== null,
          )
          .sort((left, right) => left.fullName.localeCompare(right.fullName));
      }
    }

    return {
      viewerOwnerId: viewerOwnerId ? String(viewerOwnerId) : null,
      canManage:
        Boolean(viewerOwnerId) &&
        (user.role === "owner" || user.role === "commissioner"),
      listings: projectedListings,
      candidates,
    };
  },
});

export const save = mutation({
  args: {
    playerId: v.id("players"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireActiveUser(ctx);
    if (!user.ownerId)
      throw new Error("Link an owner profile to manage a trade block.");
    await requireOwnerAccess(ctx, user.ownerId);

    const player = await ctx.db.get(args.playerId);
    if (!player?.isActive || player.ownerId !== user.ownerId) {
      throw new Error("Only active players on your roster can be listed.");
    }
    const ownerContracts = await ctx.db
      .query("contracts")
      .withIndex("by_ownerId", (range) => range.eq("ownerId", user.ownerId!))
      .collect();
    if (
      !selectDisplayContract(
        ownerContracts,
        user.ownerId,
        player._id,
        Date.now(),
      )
    ) {
      throw new Error("This player does not have an active tradable contract.");
    }

    const note = normalizeTradeBlockNote(args.note);
    const existing = await ctx.db
      .query("tradeBlockEntries")
      .withIndex("by_ownerId_playerId", (range) =>
        range.eq("ownerId", user.ownerId!).eq("playerId", player._id),
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { note, updatedAt: now });
      return existing._id;
    }
    return ctx.db.insert("tradeBlockEntries", {
      ownerId: user.ownerId,
      playerId: player._id,
      note,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { listingId: v.id("tradeBlockEntries") },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.listingId);
    if (!listing) return null;
    await requireOwnerAccess(ctx, listing.ownerId);
    await ctx.db.delete(listing._id);
    return listing._id;
  },
});
