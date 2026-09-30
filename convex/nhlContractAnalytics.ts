import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireCommissioner } from "./lib/auth";
import { NHL_SALARY_CAP_BY_START_YEAR } from "../src/lib/utils/domain/nhl-salary-caps";

export const page = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const result = await ctx.db
      .query("nhlContracts")
      .order("asc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(Math.max(args.paginationOpts.numItems, 1), 100),
      });
    const page = await Promise.all(
      result.page.map(async (contract) => {
        const [player, seasons] = await Promise.all([
          ctx.db.get(contract.playerId),
          ctx.db
            .query("nhlContractSeasons")
            .withIndex("by_contractId_seasonStartYear", (q) =>
              q.eq("contractId", contract._id),
            )
            .take(31),
        ]);
        return {
          id: contract._id,
          playerName: player?.fullName ?? "Unknown player",
          position: player?.posGroup ?? "",
          signingDate: contract.signingDate,
          startSeasonStartYear: contract.startSeasonStartYear,
          expirySeasonStartYear: contract.expirySeasonStartYear,
          length: contract.length,
          seasons: seasons.map((row) => ({
            seasonStartYear: row.seasonStartYear,
            capHit: row.capHit,
          })),
        };
      }),
    );
    return { ...result, page };
  },
});

export const salaryCaps = query({
  args: {},
  handler: async (ctx) => {
    await requireCommissioner(ctx);
    const rows = await ctx.db
      .query("nhlSalaryCaps")
      .withIndex("by_seasonStartYear", (q) =>
        q.gte("seasonStartYear", 1900).lte("seasonStartYear", 2200),
      )
      .take(301);
    return {
      defaults: NHL_SALARY_CAP_BY_START_YEAR,
      overrides: rows.map((row) => ({
        seasonStartYear: row.seasonStartYear,
        salaryCap: row.salaryCap,
      })),
    };
  },
});

export const saveSalaryCaps = mutation({
  args: {
    rows: v.array(
      v.object({ seasonStartYear: v.number(), salaryCap: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    if (!args.rows.length || args.rows.length > 100)
      throw new Error("Provide 1–100 season caps");
    const years = new Set<number>();
    for (const row of args.rows) {
      if (
        !Number.isInteger(row.seasonStartYear) ||
        row.seasonStartYear < 1900 ||
        row.seasonStartYear > 2200 ||
        !Number.isFinite(row.salaryCap) ||
        row.salaryCap <= 0 ||
        row.salaryCap > 1_000_000_000 ||
        years.has(row.seasonStartYear)
      )
        throw new Error(
          "Use distinct seasons and positive salary caps up to $1 billion",
        );
      years.add(row.seasonStartYear);
    }
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("nhlSalaryCaps")
        .withIndex("by_seasonStartYear", (q) =>
          q.eq("seasonStartYear", row.seasonStartYear),
        )
        .unique();
      if (!existing)
        await ctx.db.insert("nhlSalaryCaps", { ...row, updatedAt: Date.now() });
      else if (existing.salaryCap !== row.salaryCap)
        await ctx.db.patch(existing._id, {
          salaryCap: row.salaryCap,
          updatedAt: Date.now(),
        });
    }
    return { saved: args.rows.length };
  },
});

/** Add the supplied caps without overwriting subsequent commissioner edits. */
export const seedSuppliedCaps = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    let inserted = 0;
    let unchanged = 0;
    let preservedOverrides = 0;
    for (const [year, salaryCap] of Object.entries(
      NHL_SALARY_CAP_BY_START_YEAR,
    )) {
      const seasonStartYear = Number(year);
      const existing = await ctx.db
        .query("nhlSalaryCaps")
        .withIndex("by_seasonStartYear", (q) =>
          q.eq("seasonStartYear", seasonStartYear),
        )
        .unique();
      if (!existing) {
        inserted++;
        if (args.apply)
          await ctx.db.insert("nhlSalaryCaps", {
            seasonStartYear,
            salaryCap,
            updatedAt: Date.now(),
          });
      } else if (existing.salaryCap === salaryCap) unchanged++;
      else preservedOverrides++;
    }
    return {
      apply: args.apply === true,
      inserted,
      unchanged,
      preservedOverrides,
    };
  },
});
