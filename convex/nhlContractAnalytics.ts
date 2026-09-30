import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireCommissioner } from "./lib/auth";
import { NHL_SALARY_CAP_BY_START_YEAR } from "../src/lib/utils/domain/nhl-salary-caps";
import { nhlProfileContract } from "./lib/nhlProfileContract";
import { writeNhlContracts } from "./nhlContracts";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

async function rosterPlayer(
  ctx: QueryCtx,
  player: Doc<"players">,
  seasonStartYear: number,
  nhlTeam: string[],
  useProfile: boolean,
) {
  const profile = useProfile
    ? nhlProfileContract(player, seasonStartYear)
    : null;
  const history = await ctx.db
    .query("nhlContracts")
    .withIndex("by_playerId_startSeasonStartYear_signingDate", (q) =>
      q.eq("playerId", player._id).lte("startSeasonStartYear", seasonStartYear),
    )
    .order("desc")
    .take(31);
  const contracts = await Promise.all(
    history
      .filter((contract) => contract.expirySeasonStartYear >= seasonStartYear)
      .map(async (contract) => {
        const seasons = await ctx.db
          .query("nhlContractSeasons")
          .withIndex("by_contractId_seasonStartYear", (q) =>
            q.eq("contractId", contract._id),
          )
          .take(31);
        return {
          id: contract._id,
          playerName: player.fullName,
          position: player.posGroup,
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
  return {
    id: player._id,
    playerName: player.fullName,
    position: player.posGroup,
    nhlTeam,
    contracts,
    currentProfileContract: profile
      ? {
          id: `profile:${player._id}`,
          playerName: player.fullName,
          position: player.posGroup,
          signingDate: profile.signingDate,
          startSeasonStartYear: profile.startSeasonStartYear,
          expirySeasonStartYear: profile.expirySeasonStartYear,
          length: profile.length,
          seasons: [
            {
              seasonStartYear: profile.seasonStartYear,
              capHit: profile.capHit,
            },
          ],
        }
      : null,
    historyTruncated: history.length === 31,
  };
}

export const rosterSeasons = query({
  args: {},
  handler: async (ctx) => {
    await requireCommissioner(ctx);
    const seasons = await ctx.db.query("seasons").take(100);
    const available = await Promise.all(
      seasons.map(async (season) => {
        // Stored year is the season's ending year, including the January 2021 start.
        const seasonStartYear = Number(season.year) - 1;
        const row = await ctx.db
          .query("playerNhlStatLines")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
          .first();
        return row &&
          Number.isInteger(seasonStartYear) &&
          seasonStartYear >= 1900
          ? { id: season._id, seasonStartYear }
          : null;
      }),
    );
    return available
      .filter((row) => row !== null)
      .sort((a, b) => a.seasonStartYear - b.seasonStartYear);
  },
});

export const historicalRosterPage = query({
  args: { paginationOpts: paginationOptsValidator, seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const season = await ctx.db.get(args.seasonId);
    const year = Number(season?.year) - 1;
    if (!season || !Number.isInteger(year) || year < 1900 || year > 2200)
      throw new Error("Invalid NHL season");
    const result = await ctx.db
      .query("playerNhlStatLines")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", args.seasonId))
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(Math.max(args.paginationOpts.numItems, 1), 50),
      });
    const page = await Promise.all(
      result.page.map(async (row) => {
        const playerId = ctx.db.normalizeId("players", row.playerId);
        const player = playerId ? await ctx.db.get(playerId) : null;
        return player
          ? rosterPlayer(ctx, player, year, row.nhlTeam ?? [], false)
          : {
              id: row.playerId,
              playerName: "Unlinked historical player",
              position: row.posGroup,
              nhlTeam: row.nhlTeam ?? [],
              contracts: [],
              historyTruncated: false,
              currentProfileContract: null,
            };
      }),
    );
    return { ...result, page };
  },
});

export const rosterTeams = query({
  args: {},
  handler: async (ctx) => {
    await requireCommissioner(ctx);
    return (await ctx.db.query("nhlTeams").take(100)).map((team) => ({
      id: team._id,
      name: team.name,
      abbr: team.abbr,
    }));
  },
});

export const rosterPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    seasonStartYear: v.number(),
  },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    if (
      !Number.isInteger(args.seasonStartYear) ||
      args.seasonStartYear < 1900 ||
      args.seasonStartYear > 2200
    )
      throw new Error("Invalid NHL season");
    const result = await ctx.db
      .query("players")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(Math.max(args.paginationOpts.numItems, 1), 50),
      });
    const page = await Promise.all(
      result.page
        .filter((player) => player.nhlTeam?.some((team) => team.trim()))
        .map((player) =>
          rosterPlayer(
            ctx,
            player,
            args.seasonStartYear,
            player.nhlTeam ?? [],
            true,
          ),
        ),
    );
    return { ...result, page };
  },
});

/** Add missing history from explicit stored profile terms; never replace history. */
export const repairProfileContracts = internalMutation({
  args: {
    playerIds: v.array(v.id("players")),
    seasonStartYear: v.number(),
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!args.playerIds.length || args.playerIds.length > 50)
      throw new Error("Provide 1–50 players");
    const results = [];
    for (const playerId of new Set(args.playerIds)) {
      const player = await ctx.db.get(playerId);
      const row = player && nhlProfileContract(player, args.seasonStartYear);
      if (!row) {
        results.push({ playerId, status: "invalid-profile" });
        continue;
      }
      const existing = await ctx.db
        .query("nhlContracts")
        .withIndex("by_playerId_startSeasonStartYear_signingDate", (q) =>
          q
            .eq("playerId", playerId)
            .eq("startSeasonStartYear", row.startSeasonStartYear)
            .eq("signingDate", row.signingDate),
        )
        .unique();
      if (existing) {
        results.push({ playerId, status: "unchanged" });
        continue;
      }
      const counts = await writeNhlContracts(ctx, [row], args.apply === true);
      results.push({
        playerId,
        name: player.fullName,
        status: args.apply ? "inserted" : "would-insert",
        capHit: row.capHit,
        length: row.length,
        ...counts,
      });
    }
    return { apply: args.apply === true, results };
  },
});

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
