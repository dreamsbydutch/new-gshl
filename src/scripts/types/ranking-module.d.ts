declare module "../lib/ranking/index.js" {
  export type PlayerStatLine = Record<string, unknown>;
  export type TeamStatLine = Record<string, unknown>;

  export type RankingModel = {
    version: string;
    trainedAt: string;
    totalSamples: number;
    seasonRange: { earliest: string; latest: string };
    models: Record<
      string,
      {
        aggregationLevel?: string;
        seasonPhase?: string;
        seasonId?: string;
        posGroup?: string;
        sampleSize?: number;
        weights: Record<string, number>;
        distributions: Record<string, unknown>;
        compositeDistribution?: { mean?: number; stdDev?: number };
      }
    >;
    globalWeights: Record<string, Record<string, number>>;
    aggregationBlendWeights?: Record<string, Record<string, unknown>>;
  };

  export const PositionGroup: Record<string, string>;
  export const SeasonType: Record<string, string>;

  export function trainRankingModel(
    statLines: Array<PlayerStatLine | TeamStatLine>,
    config?: Record<string, unknown>,
  ): RankingModel;

  export function serializeModel(model: RankingModel): string;
}
