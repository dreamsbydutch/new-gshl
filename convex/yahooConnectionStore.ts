import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const get = internalQuery({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query("yahooConnections")
      .withIndex("by_key", (q) => q.eq("key", "league"))
      .unique(),
});

export const begin = internalMutation({
  args: { ticketHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("yahooConnections")
      .withIndex("by_key", (q) => q.eq("key", "league"))
      .unique();
    if (row?.leaseUntil && row.leaseUntil > Date.now())
      throw new Error("Yahoo connection is busy. Retry shortly.");
    const fields = {
      ticketHash: args.ticketHash,
      pendingUntil: Date.now() + 600_000,
      stateHash: undefined,
      browserHash: undefined,
      generation: (row?.generation ?? 0) + 1,
      updatedAt: Date.now(),
    };
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("yahooConnections", { key: "league", ...fields });
  },
});

export const claimTicket = internalMutation({
  args: {
    ticketHash: v.string(),
    stateHash: v.string(),
    browserHash: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("yahooConnections")
      .withIndex("by_key", (q) => q.eq("key", "league"))
      .unique();
    if (
      row?.ticketHash !== args.ticketHash ||
      (row.pendingUntil ?? 0) <= Date.now()
    )
      return false;
    await ctx.db.patch(row._id, {
      ticketHash: undefined,
      stateHash: args.stateHash,
      browserHash: args.browserHash,
    });
    return true;
  },
});

export const consumeState = internalMutation({
  args: { stateHash: v.string(), browserHash: v.string(), lease: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("yahooConnections")
      .withIndex("by_key", (q) => q.eq("key", "league"))
      .unique();
    if (
      row?.stateHash !== args.stateHash ||
      row.browserHash !== args.browserHash ||
      (row.pendingUntil ?? 0) <= Date.now() ||
      (row.leaseUntil ?? 0) > Date.now()
    )
      return null;
    await ctx.db.patch(row._id, {
      stateHash: undefined,
      browserHash: undefined,
      pendingUntil: undefined,
      lease: args.lease,
      leaseUntil: Date.now() + 90_000,
    });
    return row.generation;
  },
});

export const acquire = internalMutation({
  args: { lease: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("yahooConnections")
      .withIndex("by_key", (q) => q.eq("key", "league"))
      .unique();
    if (!row?.encryptedTokens) throw new Error("Yahoo is not connected.");
    if (
      (row.leaseUntil ?? 0) > Date.now() ||
      (row.pendingUntil ?? 0) > Date.now()
    )
      throw new Error("Yahoo connection is busy. Retry shortly.");
    await ctx.db.patch(row._id, {
      lease: args.lease,
      leaseUntil: Date.now() + 90_000,
    });
    return { encryptedTokens: row.encryptedTokens, generation: row.generation };
  },
});

export const save = internalMutation({
  args: {
    lease: v.string(),
    generation: v.number(),
    encryptedTokens: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("yahooConnections")
      .withIndex("by_key", (q) => q.eq("key", "league"))
      .unique();
    if (
      row?.lease !== args.lease ||
      row.generation !== args.generation ||
      (row.leaseUntil ?? 0) <= Date.now()
    )
      throw new Error("Yahoo connection changed. Retry the connection check.");
    await ctx.db.patch(row._id, {
      encryptedTokens: args.encryptedTokens,
      connectedAt: row.connectedAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const release = internalMutation({
  args: { lease: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("yahooConnections")
      .withIndex("by_key", (q) => q.eq("key", "league"))
      .unique();
    if (row?.lease === args.lease)
      await ctx.db.patch(row._id, { lease: undefined, leaseUntil: undefined });
  },
});

export const disconnect = internalMutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("yahooConnections")
      .withIndex("by_key", (q) => q.eq("key", "league"))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return { connected: false };
  },
});
