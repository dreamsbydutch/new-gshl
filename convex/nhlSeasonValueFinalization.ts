import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { nhlSeasonFinalization } from "./lib/nhlSeasonValueFields";
import { validateSeasonValue } from "./nhlSeasonValues";

/** Narrow reviewed closure of the already-published 2019-20 snapshot; no score replacement. */
export const finalize2019 = internalMutation({
  args: {
    seasonId: v.id("seasons"),
    expectedSourceHash: v.string(),
    qualifiedPlayerIds: v.array(v.number()),
    review: nhlSeasonFinalization,
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season || String(season.year) !== "2020")
      throw new Error("Finalization is restricted to 2019-20");
    const r = args.review;
    if (
      [
        args.expectedSourceHash,
        r.reviewHash,
        r.backupSha256,
        r.reportSha256,
      ].some((s) => !/^[a-f0-9]{64}$/.test(s)) ||
      ![r.reviewedAt, r.processCoverage, r.shotCoverage].every(
        Number.isFinite,
      ) ||
      r.reviewedAt <= 0 ||
      r.reason.trim().length < 40 ||
      r.processCoverage < 0.95 ||
      r.processCoverage > 1 ||
      r.shotCoverage < 0.98 ||
      r.shotCoverage > 1 ||
      new Set(r.failedGates).size !== r.failedGates.length ||
      r.failedGates.some(
        (g) =>
          ![
            "improvesHeldOutXg",
            "improvesHeldOutGoals",
            "atLeast98PercentProcessExposureVerified",
          ].includes(g),
      )
    )
      throw new Error("Invalid finalization review/provenance");
    const rows = await ctx.db
      .query("nhlSeasonValues")
      .withIndex("by_identity", (q) =>
        q
          .eq("seasonId", args.seasonId)
          .eq("gameType", 2)
          .eq("profile", "core")
          .eq("modelVersion", "nhl-season-value-v3"),
      )
      .take(1001);
    if (
      rows.length !== 970 ||
      new Set(rows.map((p) => p.nhlPlayerId)).size !== 970 ||
      rows.some(
        (p) =>
          p.nhlSeason !== 20192020 ||
          p.sourceHash !== args.expectedSourceHash ||
          !p.gameValue ||
          p.seasonValue === null ||
          p.games !== p.gameValue.includedGames,
      )
    )
      throw new Error("2019-20 snapshot changed or is incomplete");
    const qualified = new Set(args.qualifiedPlayerIds);
    if (
      !qualified.size ||
      qualified.size !== args.qualifiedPlayerIds.length ||
      args.qualifiedPlayerIds.some(
        (id) => !rows.some((p) => p.nhlPlayerId === id),
      )
    )
      throw new Error("Invalid qualification population");
    const round = (n: number) => Math.round(n * 10000) / 10000;
    const plans = rows.map((p) => {
      const detail = p.gameValue!,
        coverage = detail.componentCoverage;
      if (
        qualified.has(p.nhlPlayerId) &&
        (p.minutes < (p.position === "G" ? 300 : 200) ||
          detail.abilityPer60 === null ||
          coverage.officialMinutes < 0.95 ||
          coverage.officialMinutes > 1.03 ||
          detail.coverage < 0.95 ||
          detail.coverage > 1.03 ||
          coverage.individualShots < 0.95 ||
          coverage.missingGoals > 0)
      )
        throw new Error(`Individual qualification failed for ${p.nhlPlayerId}`);
      const pool = rows.filter(
        (q) => q.position === p.position && qualified.has(q.nhlPlayerId),
      );
      const better = pool.filter((q) => q.seasonValue! > p.seasonValue!).length,
        equal = pool.filter((q) => q.seasonValue === p.seasonValue).length;
      const patch = {
        status: qualified.has(p.nhlPlayerId)
          ? ("rated" as const)
          : ("provisional" as const),
        rank: qualified.has(p.nhlPlayerId) ? better + 1 : null,
        seasonRating: qualified.has(p.nhlPlayerId)
          ? pool.length > 1
            ? round(
                (100 * (pool.length - better - (equal + 1) / 2)) /
                  (pool.length - 1),
              )
            : 50
          : null,
        gameValue: {
          ...detail,
          abilityRank: qualified.has(p.nhlPlayerId)
            ? pool.filter(
                (q) => q.gameValue!.abilityPer60! > detail.abilityPer60!,
              ).length + 1
            : null,
          finalization: r,
          warnings: [
            ...detail.warnings.filter(
              (w) =>
                !w.startsWith("Provisional season publication:") &&
                !w.startsWith("Finalized season with limitations:"),
            ),
            `Finalized season with limitations: ${r.reason.trim()}`,
          ],
        },
      };
      validateSeasonValue({ ...p, ...patch }, p.modelVersion);
      const same =
        p.status === patch.status &&
        p.rank === patch.rank &&
        p.seasonRating === patch.seasonRating &&
        detail.abilityRank === patch.gameValue.abilityRank &&
        detail.finalization !== undefined &&
        Object.entries(r).every(
          ([key, value]) =>
            JSON.stringify(detail.finalization![key as keyof typeof r]) ===
            JSON.stringify(value),
        );
      if (detail.finalization && !same)
        throw new Error(
          "Finalized snapshot cannot be changed by this operation",
        );
      return { id: p._id, patch, same };
    });
    if (args.apply)
      for (const plan of plans)
        if (!plan.same)
          await ctx.db.patch(plan.id, { ...plan.patch, updatedAt: Date.now() });
    return {
      season: 20192020,
      players: rows.length,
      rated: qualified.size,
      individualProvisional: rows.length - qualified.size,
      updated: plans.filter((p) => !p.same).length,
      unchanged: plans.filter((p) => p.same).length,
      applied: Boolean(args.apply),
      reviewHash: r.reviewHash,
    };
  },
});
