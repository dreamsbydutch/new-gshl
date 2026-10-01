import { v } from "convex/values";

const nullableNumber = v.union(v.number(), v.null());
export const nhlGameValueDetails = v.object({
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
});

export const nhlSeasonValueMetadata = {
  nhlSeason: v.number(),
  gameType: v.union(v.literal(2), v.literal(3)),
  profile: v.union(v.literal("core"), v.literal("edge")),
  modelVersion: v.string(),
  sourceFetchedAt: v.number(),
  sourceHash: v.string(),
};
