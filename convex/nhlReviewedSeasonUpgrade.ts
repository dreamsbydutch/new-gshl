import { v, type Infer } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  nhlSeasonValueMetadata,
  nhlSeasonValueResult,
  type nhlStatLineHockeyRating,
} from "./lib/nhlSeasonValueFields";
import { validateSeasonValue } from "./nhlSeasonValues";
import type { Doc } from "./_generated/dataModel";

const MODEL = "nhl-hockey-overall-reviewed-v1";
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function same(a: unknown, b: unknown) {
  return canonical(a) === canonical(b);
}
function rows(
  value: unknown[],
  label: string,
): Map<string, Record<string, unknown>> {
  if (!value.length || value.length > 1200)
    throw Error(`Invalid ${label} bound`);
  const result = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw Error(`Invalid ${label} preimage`);
    const row = item as Record<string, unknown>;
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      typeof row._id !== "string" ||
      result.has(row._id)
    )
      throw Error(`Invalid ${label} preimage`);
    result.set(row._id, row);
  }
  return result;
}

/** Explicit atomic source upgrade, separate from immutable additive importBatch. Never inserts/deletes or edits native statistics. */
function reviewedUpgradeForSeason(
  nhlSeason: 20102011 | 20112012 | 20122013 | 20142015 | 20192020,
) {
  return internalMutation({
    args: {
      seasonId: v.id("seasons"),
      ...nhlSeasonValueMetadata,
      results: v.array(nhlSeasonValueResult),
      expectedValues: v.array(v.any()),
      expectedStats: v.array(v.any()),
      reviewHash: v.string(),
      backupSha256: v.string(),
      reviewedAt: v.number(),
      apply: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
      if (
        args.nhlSeason !== nhlSeason ||
        args.modelVersion !== MODEL ||
        args.profile !== "core" ||
        args.gameType !== 2 ||
        ![args.reviewHash, args.backupSha256, args.sourceHash].every((x) =>
          /^[a-f0-9]{64}$/.test(x),
        ) ||
        !Number.isFinite(args.reviewedAt) ||
        args.reviewedAt <= 0 ||
        !Number.isFinite(args.sourceFetchedAt) ||
        args.sourceFetchedAt <= 0
      )
        throw Error("Invalid pinned reviewed source-upgrade scope/provenance");
      if (
        new TextEncoder().encode(JSON.stringify(args)).byteLength >
        8 * 1024 * 1024
      )
        throw Error(
          "Atomic reviewed upgrade exceeds conservative 8MiB argument budget",
        );
      const season = await ctx.db.get(args.seasonId);
      if (!season || Number(season.year) !== nhlSeason % 10000)
        throw Error("Reviewed upgrade database season differs");
      const oldValues = rows(args.expectedValues, "reviewed values"),
        oldStats = rows(args.expectedStats, "native stats");
      if (
        args.results.length !== oldValues.size ||
        args.results.length !== oldStats.size
      )
        throw Error("Complete equal source/native populations required");
      const [liveValues, liveStats] = await Promise.all([
        ctx.db
          .query("nhlSeasonValues")
          .withIndex("by_identity", (q) =>
            q
              .eq("seasonId", args.seasonId)
              .eq("gameType", 2)
              .eq("profile", "core")
              .eq("modelVersion", MODEL),
          )
          .take(1201),
        ctx.db
          .query("playerNhlStatLines")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", args.seasonId))
          .take(1201),
      ]);
      if (
        liveValues.length !== oldValues.size ||
        liveStats.length !== oldStats.size ||
        liveValues.some((r) => !oldValues.has(r._id)) ||
        liveStats.some((r) => !oldStats.has(r._id))
      )
        throw Error("Reviewed upgrade population changed");
      const liveById = new Map(liveValues.map((r) => [r._id, r]));
      const oldByNhl = new Map<number, Record<string, unknown>>();
      const newByNhl = new Map<number, Infer<typeof nhlSeasonValueResult>>();
      const byPlayer = new Map<string, Doc<"nhlSeasonValues">>();
      for (const old of oldValues.values()) {
        if (
          old.seasonId !== args.seasonId ||
          old.nhlSeason !== nhlSeason ||
          old.modelVersion !== MODEL ||
          old.profile !== "core" ||
          old.gameType !== 2 ||
          typeof old.nhlPlayerId !== "number" ||
          oldByNhl.has(old.nhlPlayerId) ||
          typeof old.playerId !== "string" ||
          byPlayer.has(old.playerId) ||
          !liveById.has(old._id as Doc<"nhlSeasonValues">["_id"])
        )
          throw Error("Invalid reviewed source identity preimage");
        oldByNhl.set(old.nhlPlayerId, old);
        byPlayer.set(
          old.playerId,
          liveById.get(old._id as Doc<"nhlSeasonValues">["_id"])!,
        );
      }
      const sourcePlans: Array<{
        id: Doc<"nhlSeasonValues">["_id"];
        patch: Record<string, unknown>;
        before: Record<string, unknown>;
        after: Record<string, unknown>;
        live: Doc<"nhlSeasonValues">;
      }> = [];
      if (
        new Set([...oldValues.values()].map((row) => row.sourceHash)).size !== 1
      )
        throw Error("Original reviewed cohort contains mixed source snapshots");
      for (const result of args.results) {
        validateSeasonValue(result, MODEL);
        const old = oldByNhl.get(result.nhlPlayerId);
        if (
          !old ||
          newByNhl.has(result.nhlPlayerId) ||
          old.games !== result.games ||
          old.minutes !== result.minutes ||
          old.position !== result.position ||
          old.name !== result.name ||
          old.team !== result.team ||
          old.sourceHash === args.sourceHash ||
          !result.hockeyOverall ||
          result.hockeyOverall.sourceArtifactHash !==
            (old.hockeyOverall as Record<string, unknown>)?.sourceArtifactHash
        )
          throw Error(
            "Reviewed upgrade must preserve official cohort, GP, role, minutes and canonical source",
          );
        const live = liveById.get(old._id as Doc<"nhlSeasonValues">["_id"])!;
        const patch = {
          nhlSeason: args.nhlSeason,
          gameType: args.gameType,
          profile: args.profile,
          modelVersion: args.modelVersion,
          sourceFetchedAt: args.sourceFetchedAt,
          sourceHash: args.sourceHash,
          ...result,
          updatedAt: args.reviewedAt,
        };
        const after = { ...old, ...patch };
        sourcePlans.push({ id: live._id, patch, before: old, after, live });
        newByNhl.set(result.nhlPlayerId, result);
      }
      const statPlans: Array<{
        id: Doc<"playerNhlStatLines">["_id"];
        hockeyRating: Infer<typeof nhlStatLineHockeyRating>;
        before: Record<string, unknown>;
        after: Record<string, unknown>;
        live: Doc<"playerNhlStatLines">;
      }> = [];
      const seenPlayers = new Set<string>();
      for (const live of liveStats) {
        const old = oldStats.get(live._id)!,
          source = byPlayer.get(String(old.playerId));
        const link = old.hockeyRating as
          | Infer<typeof nhlStatLineHockeyRating>
          | undefined;
        const oldSource = source ? oldByNhl.get(source.nhlPlayerId) : undefined;
        const next = source ? newByNhl.get(source.nhlPlayerId) : undefined;
        if (
          old.seasonId !== args.seasonId ||
          !source ||
          !oldSource ||
          !next ||
          link?.sourceId !== source._id ||
          link.nhlPlayerId !== source.nhlPlayerId ||
          link.seasonValue !== oldSource.seasonValue ||
          link.rank !== oldSource.rank ||
          link.qualification !==
            (oldSource.hockeyOverall as { qualification: string })
              .qualification ||
          Number(old.GP) !== next.games ||
          !Number.isInteger(Number(old.GP)) ||
          Number(old.GP) <= 0 ||
          (old.posGroup === "G") !== (next.position === "G") ||
          seenPlayers.has(String(old.playerId))
        )
          throw Error(
            "Native reviewed association/official appearance differs",
          );
        seenPlayers.add(String(old.playerId));
        const personId = ctx.db.normalizeId("players", String(old.playerId));
        const person = personId ? await ctx.db.get(personId) : null;
        if (person?.nhlApiId !== String(next.nhlPlayerId))
          throw Error("Canonical NHL player identity changed");
        const oldWarnings = new Set([
          ...(oldSource.missing as string[]),
          ...(oldSource.hockeyOverall as { warnings: string[] }).warnings,
        ]);
        const hockeyRating: Infer<typeof nhlStatLineHockeyRating> = {
          ...link,
          modelVersion: MODEL,
          units: "goals-above-same-position-reference",
          sourceId: source._id,
          sourceFetchedAt: args.sourceFetchedAt,
          nhlPlayerId: next.nhlPlayerId,
          sourceGames: next.games,
          sourcePosition: next.position,
          seasonValue: next.seasonValue,
          rank: next.rank,
          qualification: next.hockeyOverall!.qualification,
          reasons: [
            ...new Set([
              ...next.missing,
              ...next.hockeyOverall!.warnings,
              ...link.reasons.filter((r) => !oldWarnings.has(r)),
            ]),
          ],
        };
        statPlans.push({
          id: live._id,
          hockeyRating,
          before: old,
          after: { ...old, hockeyRating },
          live,
        });
      }
      // A mixed old/new cohort is never accepted. Every source and native row must
      // match one entire reviewed preimage or one entire exact postimage.
      const before =
        sourcePlans.every((p) => same(p.live, p.before)) &&
        statPlans.every((p) => same(p.live, p.before));
      const after =
        sourcePlans.every((p) => same(p.live, p.after)) &&
        statPlans.every((p) => same(p.live, p.after));
      if (!before && !after)
        throw Error(
          "Reviewed source/native cohort changed or is partially upgraded",
        );
      if (args.apply && !after) {
        for (const p of sourcePlans) await ctx.db.patch(p.id, p.patch);
        for (const p of statPlans)
          await ctx.db.patch(p.id, { hockeyRating: p.hockeyRating });
      }
      return {
        nhlSeason,
        modelVersion: MODEL,
        apply: args.apply ?? false,
        sourceRows: sourcePlans.length,
        nativeRows: statPlans.length,
        wouldUpdate: !args.apply && !after ? sourcePlans.length : 0,
        updated: args.apply && !after ? sourcePlans.length : 0,
        already: after,
        sourceHash: args.sourceHash,
        reviewHash: args.reviewHash,
        backupSha256: args.backupSha256,
      };
    },
  });
}

/** Retains the original, separately pinned 2019 endpoint and argument contract. */
export const upgradeReviewed2019Season = reviewedUpgradeForSeason(20192020);
/** The additional endpoint cannot operate on any season except 2014-15. */
export const upgradeReviewed2014Season = reviewedUpgradeForSeason(20142015);

/** Separate exact-season scopes for refreshed historical source audits. */
export const upgradeReviewed2010Season = reviewedUpgradeForSeason(20102011);
export const upgradeReviewed2011Season = reviewedUpgradeForSeason(20112012);
export const upgradeReviewed2012Season = reviewedUpgradeForSeason(20122013);
