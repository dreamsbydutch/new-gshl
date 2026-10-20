import { v } from "convex/values";

const nullableNumber = v.union(v.number(), v.null());
/** A stat-line association to the authoritative, separately versioned hockey value. */
export const nhlStatLineHockeyRating = v.object({
  sourceId: v.optional(v.id("nhlSeasonValues")),
  modelVersion: v.literal("nhl-hockey-overall-reviewed-v1"),
  units: v.literal("goals-above-same-position-reference"),
  seasonValue: nullableNumber,
  rank: nullableNumber,
  qualification: v.union(
    v.literal("ranked"),
    v.literal("provisional"),
    v.literal("incomplete"),
    v.literal("insufficient-reference"),
    v.literal("no-nhl-games"),
    v.literal("missing-source"),
    v.literal("unresolved-player"),
    v.literal("source-stat-mismatch"),
  ),
  sourceFetchedAt: v.optional(v.number()),
  nhlPlayerId: v.optional(v.number()),
  sourceGames: v.optional(v.number()),
  sourcePosition: v.optional(
    v.union(v.literal("F"), v.literal("D"), v.literal("G")),
  ),
  identityResolution: v.optional(
    v.union(v.literal("canonical"), v.literal("reviewed-source")),
  ),
  identityReviewHash: v.optional(v.string()),
  reasons: v.array(v.string()),
});
export const nhlSeasonFinalization = v.object({
  state: v.literal("final-with-limitations"),
  reviewHash: v.string(),
  reviewedAt: v.number(),
  reason: v.string(),
  backupSha256: v.string(),
  reportSha256: v.string(),
  failedGates: v.array(v.string()),
  processCoverage: v.number(),
  shotCoverage: v.number(),
});
export const nhlGameValueDetails = v.object({
  finalization: v.optional(nhlSeasonFinalization),
  revision: v.string(),
  verifiedGames: v.number(),
  includedGames: v.number(),
  modeledMinutes: v.number(),
  coverage: v.number(),
  componentCoverage: v.object({
    officialMinutes: v.number(),
    processMinutes: v.number(),
    individualShots: v.number(),
    missingGoals: v.number(),
  }),
  observedValue: nullableNumber,
  abilityPer60: nullableNumber,
  abilityRank: nullableNumber,
  components: v.object({
    adjustedProcess: v.number(),
    offensiveProcess: v.optional(v.number()),
    defensiveProcess: v.optional(v.number()),
    observedProcess: v.number(),
    finishing: v.number(),
    penalties: v.number(),
    saving: v.number(),
  }),
  situations: v.record(v.string(), v.number()),
  samplingInterval: v.union(
    v.null(),
    v.object({
      low: v.number(),
      high: v.number(),
      bestRank: v.number(),
      worstRank: v.number(),
    }),
  ),
  warnings: v.array(v.string()),
});
export const nhlSeasonValueResult = v.object({
  nhlPlayerId: v.number(),
  name: v.string(),
  team: v.string(),
  position: v.union(v.literal("F"), v.literal("D"), v.literal("G")),
  games: v.number(),
  minutes: v.number(),
  status: v.union(
    v.literal("rated"),
    v.literal("provisional"),
    v.literal("incomplete"),
  ),
  missing: v.array(v.string()),
  seasonValue: nullableNumber,
  seasonRating: nullableNumber,
  impactPer60: nullableNumber,
  rank: nullableNumber,
  gameValue: v.optional(nhlGameValueDetails),
  hockeyOverall: v.optional(
    v.object({
      revision: v.literal("2026-10-19-reviewed-annual-crossfit"),
      method: v.literal("nhl-hockey-overall-reviewed-v1"),
      units: v.literal("goals-above-same-position-reference"),
      reference: v.literal("annual-depth-proxy"),
      qualification: v.union(
        v.literal("ranked"),
        v.literal("provisional"),
        v.literal("incomplete"),
        v.literal("insufficient-reference"),
      ),
      sourceStatus: v.union(
        v.literal("rated"),
        v.literal("provisional"),
        v.literal("incomplete"),
      ),
      components: v.union(
        v.null(),
        v.object({
          offensiveProcess: v.number(),
          defensiveProcess: v.number(),
          finishing: v.number(),
          penalties: v.number(),
          saving: v.number(),
        }),
      ),
      abilityPer60: nullableNumber,
      abilityPositionRank: nullableNumber,
      coverage: v.object({
        officialMinutes: v.number(),
        processMinutes: v.number(),
        individualShots: v.number(),
        missingGoals: v.number(),
      }),
      modeledMinutes: v.number(),
      includedGames: v.number(),
      verifiedGames: v.number(),
      sourceArtifactHash: v.string(),
      rawValueArtifactHash: v.string(),
      referenceArtifactHash: v.string(),
      warnings: v.array(v.string()),
      depthSensitivity: v.object({
        narrower: v.object({ value: nullableNumber, rank: nullableNumber }),
        wider: v.object({ value: nullableNumber, rank: nullableNumber }),
      }),
    }),
  ),
});

export const nhlSeasonValueMetadata = {
  nhlSeason: v.number(),
  gameType: v.union(v.literal(2), v.literal(3)),
  profile: v.union(v.literal("core"), v.literal("edge")),
  modelVersion: v.string(),
  sourceFetchedAt: v.number(),
  sourceHash: v.string(),
};
