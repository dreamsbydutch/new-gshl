import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCommissioner } from "./lib/auth";
import { toUtcTimestamp } from "./lib/timestamps";

const kind = v.union(
  v.literal("charge"),
  v.literal("payment"),
  v.literal("credit"),
  v.literal("refund"),
);
type Kind = "charge" | "payment" | "credit" | "refund";
// Well below integer precision limits, including the legacy dollars conversion.
const MAX_CENTS = 100_000_000_00;
function checkedCents(value: number, positive = false) {
  if (
    !Number.isSafeInteger(value) ||
    Math.abs(value) > MAX_CENTS ||
    (positive && value <= 0)
  )
    throw new Error("Amount must be valid whole cents within $100,000,000");
  return value;
}
function balanceCents(owner: Doc<"owners">) {
  const cents = Math.round(owner.owing * 100);
  if (
    !Number.isFinite(owner.owing) ||
    Math.abs(owner.owing * 100 - cents) > 0.00001
  )
    throw new Error("Owner balance has invalid currency precision");
  return checkedCents(cents);
}
function text(value: string, label: string, max = 500) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max)
    throw new Error(
      `${label} is required and must be at most ${max} characters`,
    );
  return trimmed;
}
function delta(entry: { kind: Kind | "opening"; amountCents: number }) {
  return entry.kind === "payment" || entry.kind === "credit"
    ? -entry.amountCents
    : entry.amountCents;
}
async function ownerOrThrow(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"owners">,
) {
  const owner = await ctx.db.get(ownerId);
  if (!owner) throw new Error("Owner not found");
  return owner;
}
async function ensureOpening(
  ctx: MutationCtx,
  owner: Doc<"owners">,
  actor: Id<"authUsers">,
  now: number,
) {
  const existing = await ctx.db
    .query("ownerLedgerEntries")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", owner._id))
    .first();
  if (!existing)
    await ctx.db.insert("ownerLedgerEntries", {
      ownerId: owner._id,
      kind: "opening",
      amountCents: balanceCents(owner),
      description: "Opening balance carried forward from existing owner owing",
      effectiveAt: now,
      createdAt: now,
      createdBy: actor,
    });
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireCommissioner(ctx);
    const [owners, seasons] = await Promise.all([
      ctx.db.query("owners").take(1001),
      ctx.db.query("seasons").take(201),
    ]);
    if (owners.length > 1000 || seasons.length > 200)
      throw new Error(
        "Accounts overview exceeds its supported owner or season limit",
      );
    return {
      owners: owners.map((owner) => ({
        _id: owner._id,
        firstName: owner.firstName,
        lastName: owner.lastName,
        isActive: owner.isActive,
        balanceCents: balanceCents(owner),
      })),
      seasons: seasons.map((season) => ({
        _id: season._id,
        name: season.name,
      })),
    };
  },
});

export const history = query({
  args: { ownerId: v.id("owners"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const owner = await ownerOrThrow(ctx, args.ownerId);
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100)
      throw new Error("Page size must be between 1 and 100");
    const result = await ctx.db
      .query("ownerLedgerEntries")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      openingBalanceCents:
        args.paginationOpts.cursor === null && result.page.length === 0
          ? balanceCents(owner)
          : null,
    };
  },
});

export const record = mutation({
  args: {
    ownerId: v.id("owners"),
    kind,
    amountCents: v.number(),
    effectiveAt: v.number(),
    description: v.string(),
    reference: v.optional(v.string()),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCommissioner(ctx);
    const owner = await ownerOrThrow(ctx, args.ownerId);
    checkedCents(args.amountCents, true);
    if (
      !Number.isSafeInteger(args.effectiveAt) ||
      toUtcTimestamp(args.effectiveAt) === null
    )
      throw new Error("Invalid effective date");
    const description = text(args.description, "Description");
    const reference = args.reference?.trim()
      ? text(args.reference, "Reference", 200)
      : undefined;
    const requestId = text(args.requestId, "Request ID", 200);
    const existing = await ctx.db
      .query("ownerLedgerEntries")
      .withIndex("by_requestId", (q) => q.eq("requestId", requestId))
      .unique();
    if (existing) {
      if (
        existing.ownerId !== args.ownerId ||
        existing.kind !== args.kind ||
        existing.amountCents !== args.amountCents ||
        existing.effectiveAt !== args.effectiveAt ||
        existing.description !== description ||
        existing.reference !== reference
      )
        throw new Error("Request ID already used for a different entry");
      return existing._id;
    }
    const nextBalance = checkedCents(balanceCents(owner) + delta(args));
    const now = Date.now();
    await ensureOpening(ctx, owner, actor._id, now);
    const entryId = await ctx.db.insert("ownerLedgerEntries", {
      ...args,
      description,
      reference,
      requestId,
      createdAt: now,
      createdBy: actor._id,
    });
    await ctx.db.patch(owner._id, { owing: nextBalance / 100, updatedAt: now });
    return entryId;
  },
});

export const voidEntry = mutation({
  args: { entryId: v.id("ownerLedgerEntries"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireCommissioner(ctx);
    const reason = text(args.reason, "Void reason");
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error("Entry not found");
    if (entry.kind === "opening")
      throw new Error("Use a manual adjustment to correct an opening balance");
    if (entry.voidedAt !== undefined) return;
    const owner = await ownerOrThrow(ctx, entry.ownerId);
    const nextBalance = checkedCents(balanceCents(owner) - delta(entry));
    const now = Date.now();
    await ctx.db.patch(entry._id, {
      voidedAt: now,
      voidedBy: actor._id,
      voidReason: reason,
    });
    await ctx.db.patch(owner._id, { owing: nextBalance / 100, updatedAt: now });
  },
});

async function loadFeeRows(
  ctx: QueryCtx | MutationCtx,
  seasonId: Id<"seasons">,
  amountCents: number,
) {
  checkedCents(amountCents, true);
  const season = await ctx.db.get(seasonId);
  if (!season) throw new Error("Season not found");
  const teams = await ctx.db
    .query("teams")
    .withIndex("by_seasonId", (q) => q.eq("seasonId", seasonId))
    .take(101);
  if (teams.length > 100)
    throw new Error("Season exceeds the supported limit of 100 teams");
  const rows = await Promise.all(
    teams.map(async (team) => {
      const franchise = await ctx.db.get(team.franchiseId);
      if (!franchise)
        throw new Error(
          "A season team has no franchise; correct it before assessing fees",
        );
      const owner = await ownerOrThrow(ctx, franchise.ownerId);
      const assessment = await ctx.db
        .query("ownerLedgerEntries")
        .withIndex("by_seasonId_teamId", (q) =>
          q.eq("seasonId", seasonId).eq("teamId", team._id),
        )
        .unique();
      return {
        teamId: team._id,
        ownerId: owner._id,
        ownerName: `${owner.firstName} ${owner.lastName}`,
        teamName: franchise.name,
        amountCents,
        assessed: assessment !== null,
      };
    }),
  );
  return { season, rows };
}
export const feePreview = query({
  args: { seasonId: v.id("seasons"), amountCents: v.number() },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    return (await loadFeeRows(ctx, args.seasonId, args.amountCents)).rows;
  },
});
export const assessFees = mutation({
  args: { seasonId: v.id("seasons"), amountCents: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireCommissioner(ctx);
    const { season, rows } = await loadFeeRows(
      ctx,
      args.seasonId,
      args.amountCents,
    );
    const now = Date.now();
    let created = 0;
    for (const row of rows) {
      if (row.assessed) continue;
      const owner = await ownerOrThrow(ctx, row.ownerId);
      const nextBalance = checkedCents(balanceCents(owner) + args.amountCents);
      await ensureOpening(ctx, owner, actor._id, now);
      await ctx.db.insert("ownerLedgerEntries", {
        ownerId: owner._id,
        kind: "charge",
        amountCents: args.amountCents,
        effectiveAt: now,
        description: `${season.name} annual league fee — ${row.teamName}`,
        seasonId: season._id,
        teamId: row.teamId,
        createdAt: now,
        createdBy: actor._id,
      });
      await ctx.db.patch(owner._id, {
        owing: nextBalance / 100,
        updatedAt: now,
      });
      created++;
    }
    return { created };
  },
});
