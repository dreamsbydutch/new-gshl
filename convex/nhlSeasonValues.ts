import { v, type Infer } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  nhlSeasonValueMetadata,
  nhlSeasonValueResult,
} from "./lib/nhlSeasonValueFields";

export function validateSeasonValue(
  result: Infer<typeof nhlSeasonValueResult>,
  modelVersion = "nhl-season-value-v1",
) {
  const gameModel = modelVersion === "nhl-season-value-v3";
  if (gameModel !== Boolean(result.gameValue))
    throw new Error("Model version and game-value details differ");
  if (gameModel) {
    const detail = result.gameValue!;
    const checkFinite = (value: unknown): void => {
      if (typeof value === "number" && !Number.isFinite(value))
        throw new Error("Non-finite game value");
      if (value && typeof value === "object")
        Object.values(value).forEach(checkFinite);
    };
    checkFinite(detail);
    const { offensiveProcess, defensiveProcess, adjustedProcess } =
      detail.components;
    if (
      (offensiveProcess === undefined) !== (defensiveProcess === undefined) ||
      (offensiveProcess !== undefined &&
        defensiveProcess !== undefined &&
        Math.abs(offensiveProcess + defensiveProcess - adjustedProcess) >
          0.000151)
    )
      throw new Error(
        "Offensive and defensive process must reconcile with adjusted process",
      );
    if (
      detail.revision !== "2026-09-30-partial-games-and-penalty-shots" ||
      result.impactPer60 !== null ||
      !Number.isInteger(detail.includedGames) ||
      detail.includedGames < 0 ||
      detail.includedGames > result.games ||
      !Number.isInteger(detail.verifiedGames) ||
      detail.verifiedGames < 0 ||
      detail.verifiedGames > detail.includedGames ||
      detail.modeledMinutes < 0 ||
      detail.coverage < 0 ||
      Object.values(detail.componentCoverage).some((x) => x < 0)
    )
      throw new Error("Invalid game-value exposure or revision");
    if (
      result.status === "rated" &&
      (detail.abilityPer60 === null ||
        detail.abilityRank === null ||
        !Number.isInteger(detail.abilityRank) ||
        detail.abilityRank < 1)
    )
      throw new Error("Qualified game values require ability rank");
    if (result.status !== "rated" && detail.abilityRank !== null)
      throw new Error("Unqualified game values cannot have ability rank");
    if (
      result.status === "incomplete" &&
      (detail.observedValue !== null || detail.abilityPer60 !== null)
    )
      throw new Error("Incomplete game values cannot have ability scores");
    if (
      detail.samplingInterval &&
      (detail.samplingInterval.low > detail.samplingInterval.high ||
        detail.samplingInterval.bestRank < 1 ||
        detail.samplingInterval.bestRank > detail.samplingInterval.worstRank)
    )
      throw new Error("Invalid sampling interval");
  }
  for (const [name, value] of Object.entries(result)) {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error(`Non-finite ${name}`);
  }
  if (
    !Number.isInteger(result.nhlPlayerId) ||
    result.nhlPlayerId <= 0 ||
    !Number.isInteger(result.games) ||
    result.games <= 0 ||
    result.minutes <= 0
  )
    throw new Error("Invalid NHL identity or exposure");
  if (result.status === "incomplete") {
    if (
      !result.missing.length ||
      [
        result.seasonValue,
        result.seasonRating,
        result.impactPer60,
        result.rank,
      ].some((x) => x !== null)
    )
      throw new Error("Incomplete results must not have scores");
  } else {
    if (
      result.missing.length ||
      result.seasonValue === null ||
      (!gameModel && result.impactPer60 === null)
    )
      throw new Error("Complete results require values");
    if (
      result.status === "rated" &&
      (result.rank === null ||
        !Number.isInteger(result.rank) ||
        result.rank < 1 ||
        result.seasonRating === null)
    )
      throw new Error("Qualified results require rank and percentile");
    if (
      result.status === "provisional" &&
      (result.rank !== null || result.seasonRating !== null)
    )
      throw new Error("Provisional results cannot have official ranks");
  }
  for (const score of [result.seasonRating, result.impactPer60])
    if (score !== null && (score < 0 || score > 100))
      throw new Error("Display rating outside 0–100");
}

/** Internal-only: invoked by the authenticated deployment operator, never browsers. */
export const importBatch = internalMutation({
  args: {
    seasonId: v.id("seasons"),
    ...nhlSeasonValueMetadata,
    results: v.array(nhlSeasonValueResult),
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.results.length > 250)
      throw new Error("Import batches are limited to 250 players");
    if (
      !["nhl-season-value-v1", "nhl-season-value-v3"].includes(
        args.modelVersion,
      )
    )
      throw new Error("Unsupported NHL rating version");
    if (
      !/^[a-f0-9]{64}$/.test(args.sourceHash) ||
      !Number.isFinite(args.sourceFetchedAt) ||
      args.sourceFetchedAt <= 0
    )
      throw new Error("Invalid source provenance");
    const season = await ctx.db.get(args.seasonId);
    if (
      !season ||
      args.nhlSeason !== Number(`${Number(season.year) - 1}${season.year}`)
    )
      throw new Error("NHL and database seasons differ");
    const identities = new Set<number>();
    let inserted = 0,
      updated = 0,
      unchanged = 0,
      linked = 0;
    const unlinked: number[] = [];
    for (const result of args.results) {
      validateSeasonValue(result, args.modelVersion);
      if (identities.has(result.nhlPlayerId))
        throw new Error("Duplicate player in batch");
      identities.add(result.nhlPlayerId);
      const players = await ctx.db
        .query("players")
        .withIndex("by_nhlApiId", (q) =>
          q.eq("nhlApiId", String(result.nhlPlayerId)),
        )
        .take(2);
      if (players.length > 1)
        throw new Error(`Ambiguous NHL identity ${result.nhlPlayerId}`);
      const playerId = players[0]?._id;
      if (playerId) linked++;
      else unlinked.push(result.nhlPlayerId);
      const existing = await ctx.db
        .query("nhlSeasonValues")
        .withIndex("by_identity", (q) =>
          q
            .eq("seasonId", args.seasonId)
            .eq("gameType", args.gameType)
            .eq("profile", args.profile)
            .eq("modelVersion", args.modelVersion)
            .eq("nhlPlayerId", result.nhlPlayerId),
        )
        .unique();
      const document = {
        seasonId: args.seasonId,
        playerId,
        nhlSeason: args.nhlSeason,
        gameType: args.gameType,
        profile: args.profile,
        modelVersion: args.modelVersion,
        sourceFetchedAt: args.sourceFetchedAt,
        sourceHash: args.sourceHash,
        ...result,
      };
      const equalResult =
        existing &&
        Object.entries(result).every(
          ([key, value]) =>
            JSON.stringify(existing[key as keyof typeof result]) ===
            JSON.stringify(value),
        );
      if (
        equalResult &&
        existing.playerId === playerId &&
        existing.sourceHash === args.sourceHash &&
        existing.sourceFetchedAt === args.sourceFetchedAt
      ) {
        unchanged++;
        continue;
      }
      if (existing?.gameValue?.finalization)
        throw new Error(
          "Finalized NHL season values are locked against routine imports",
        );
      // Updating another snapshot/version requires a separately reviewed workflow.
      if (existing && existing.sourceHash !== args.sourceHash)
        throw new Error(
          "A different source snapshot already exists for this identity",
        );
      if (existing) {
        updated++;
        if (args.apply)
          await ctx.db.patch(existing._id, {
            ...document,
            updatedAt: Date.now(),
          });
      } else {
        inserted++;
        if (args.apply)
          await ctx.db.insert("nhlSeasonValues", {
            ...document,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
      }
    }
    return { inserted, updated, unchanged, linked, unlinked };
  },
});
