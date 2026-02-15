// @ts-nocheck

var RankingEngine = RankingEngine || {};

(function (ns) {
  "use strict";

  /**
   * Ranking Configuration
   * =====================
   * Contains all configuration, constants, and thresholds for the player ranking system.
   * This file holds position-specific weights, stat distributions, and scaling parameters.
   */

  // ===== POSITION GROUPS =====

  const PositionGroup = {
    F: "F", // Forwards
    D: "D", // Defense
    G: "G", // Goalies
    TEAM: "TEAM", // Teams (aggregate of all players)
  };

  // ===== STAT CATEGORIES =====

  const StatCategory = {
    // Offensive stats
    G: "G", // Goals
    A: "A", // Assists
    P: "P", // Points
    PM: "PM", // Plus/Minus (seasons 1-6 only)
    PPP: "PPP", // Power Play Points
    SOG: "SOG", // Shots on Goal
    HIT: "HIT", // Hits
    BLK: "BLK", // Blocked Shots

    // Goalie stats
    W: "W", // Wins
    GAA: "GAA", // Goals Against Average (lower is better)
    SVP: "SVP", // Save Percentage
    GA: "GA", // Goals Against (lower is better)
    SA: "SA", // Shots Against
    SV: "SV", // Saves
    SO: "SO", // Shutouts
    TOI: "TOI", // Time on Ice / Minutes played
  };

  // ===== SCALING PARAMETERS =====

  /**
   * Position-specific scaling configuration
   * These parameters control the rating distribution and range
   */
  const ScalingConfig = {
    // Curve strength: Controls distribution shape
    // Higher = more linear (more spread), Lower = more compressed
    curveStrength: {
      F: 0.5, // Forwards: Parabolic curve (sqrt)
      D: 0.5, // Defense: Parabolic curve (sqrt)
      G: 0.825, // Goalies: Nearly linear for maximum spread
      TEAM: 0.5, // Teams: Same as players
    },

    // Scale factor: Maximum theoretical rating
    scaleFactor: {
      F: 117, // Forwards max ~117 for elite performances
      D: 117, // Defense max ~117 for elite performances
      G: 130, // Goalies higher base due to gentler curve
      TEAM: 117, // Teams: Same as players
    },

    // Position multipliers: Final adjustment
    multiplier: {
      F: 1.05, // Forwards: No adjustment
      D: 1.0, // Defense: No adjustment
      G: 1.01, // Goalies: Boost to reach ~100-105 for shutouts
      GDay: 0.9, // Goalies: Boost to reach ~100-105 for shutouts
      TEAM: 1.0, // Teams: No adjustment
    },

    // Midpoint compression: Dampens bloated mid-percentiles without touching the top end
    midpointCompression: {
      F: 0.6,
      D: 0.5,
      G: 0.35,
      TEAM: 0.45,
    },

    // Exponential transformation for percentiles
    // Creates separation between top performers
    percentileTransform: 1.8, // Power applied to percentiles (higher = more spread at top)
  };

  // ===== AGGREGATION BLEND WEIGHTS =====

  /**
   * Controls how much we value consistency (all stats) vs spike performances (top-N stats)
   * for each aggregation level. The weights should add up to 1.
   */
  const FallbackAggregationBlendWeights = {
    default: {
      DEFAULT: { all: 1, top5: 0, top3: 0, top2: 0 },
    },
    playerDay: {
      DEFAULT: { all: 0.2, top5: 0.25, top3: 0.25, top2: 0.3 },
      TEAM: { all: 0.25, top5: 0.25, top3: 0.25, top2: 0.25 },
    },
    teamDay: {
      DEFAULT: { all: 0.25, top5: 0.25, top3: 0.25, top2: 0.25 },
    },
    playerWeek: {
      DEFAULT: { all: 0.4, top5: 0.25, top3: 0.2, top2: 0.15 },
    },
    teamWeek: {
      DEFAULT: { all: 0.45, top5: 0.25, top3: 0.15, top2: 0.15 },
    },
    playerSplit: {
      DEFAULT: { all: 0.6, top5: 0.2, top3: 0.15, top2: 0.05 },
    },
    playerTotal: {
      DEFAULT: { all: 0.6, top5: 0.2, top3: 0.15, top2: 0.05 },
    },
    playerNhl: {
      DEFAULT: { all: 0.65, top5: 0.2, top3: 0.1, top2: 0.05 },
    },
    teamSeason: {
      DEFAULT: { all: 0.65, top5: 0.2, top3: 0.1, top2: 0.05 },
    },
  };

  // ===== CATEGORY WEIGHT MULTIPLIERS =====

  const CategoryAggregationWeightMultipliers = {
    playerDay: {
      [PositionGroup.G]: {
        [StatCategory.W]: 0.25,
      },
    },
  };

  // ===== PERCENTILE THRESHOLDS =====

  /**
   * Known percentile points for interpolation
   * These define the lookup table for estimating percentiles
   */
  const PercentilePoints = [0, 10, 25, 50, 75, 90, 95, 99, 100];

  // ===== AGGREGATION BEHAVIOR PROFILES =====

  const AggregationBehaviorProfiles = {
    default: {
      spikeWeight: 0.1,
      spikeCap: 10,
      consistencyWeight: 0.12,
      consistencyMaxPenalty: 12,
    },
    playerDay: {
      spikeWeight: 0.45,
      spikeCap: 18,
      consistencyWeight: 0.05,
      consistencyMaxPenalty: 6,
    },
    teamDay: {
      spikeWeight: 0.35,
      spikeCap: 15,
      consistencyWeight: 0.08,
      consistencyMaxPenalty: 8,
    },
    playerWeek: {
      spikeWeight: 0.25,
      spikeCap: 13,
      consistencyWeight: 0.18,
      consistencyMaxPenalty: 12,
    },
    teamWeek: {
      spikeWeight: 0.15,
      spikeCap: 10,
      consistencyWeight: 0.22,
      consistencyMaxPenalty: 14,
    },
    playerSplit: {
      spikeWeight: 0.12,
      spikeCap: 9,
      consistencyWeight: 0.3,
      consistencyMaxPenalty: 16,
    },
    playerTotal: {
      spikeWeight: 0.1,
      spikeCap: 8,
      consistencyWeight: 0.32,
      consistencyMaxPenalty: 18,
    },
    playerNhl: {
      spikeWeight: 0.08,
      spikeCap: 8,
      consistencyWeight: 0.35,
      consistencyMaxPenalty: 18,
    },
    teamSeason: {
      spikeWeight: 0.08,
      spikeCap: 10,
      consistencyWeight: 0.3,
      consistencyMaxPenalty: 18,
    },
  };

  // ===== OUTLIER DETECTION =====

  /**
   * Thresholds for detecting exceptional performances
   */
  const OutlierThresholds = {
    highPercentile: 99, // Composite score above this is an outlier
    lowPercentile: 10, // Composite score below this is an outlier
  };

  // ===== PERFORMANCE GRADES =====

  /**
   * Performance grade thresholds and labels
   * Maps rating scores to descriptive performance levels
   */
  const PerformanceGrades = [
    { threshold: 100, label: "Legendary", description: "Extreme outliers" },
    { threshold: 95, label: "Spectacular", description: "Top 1-2%" },
    { threshold: 90, label: "Elite", description: "Top 5%" },
    { threshold: 80, label: "Excellent", description: "Top 10-15%" },
    { threshold: 70, label: "Great", description: "Top 25%" },
    { threshold: 60, label: "Good", description: "Above median" },
    { threshold: 50, label: "Average", description: "Near median" },
    { threshold: 40, label: "Below Average", description: "Below median" },
    { threshold: 25, label: "Poor", description: "Bottom 25%" },
    { threshold: 10, label: "Very Poor", description: "Bottom 10%" },
    { threshold: 5, label: "Minimal", description: "Bottom 5%" },
  ];

  // ===== HELPER FUNCTIONS =====

  /**
   * Get relevant stat categories for a position group
   * @param {string} posGroup - Position group ("F", "D", "G", or "TEAM")
   * @param {string} seasonId - Season ID (optional, used to determine if PM is used)
   * @returns {string[]} Array of relevant stat categories
   */
  function getRelevantStats(posGroup, seasonId) {
    // Check if this is a season that used PM (seasons 1-6)
    const usesPM =
      seasonId && parseInt(seasonId) >= 1 && parseInt(seasonId) <= 6;

    switch (posGroup) {
      case PositionGroup.F:
      case PositionGroup.D:
        const skaterStats = [
          StatCategory.G,
          StatCategory.A,
          StatCategory.P,
          StatCategory.PPP,
          StatCategory.SOG,
          StatCategory.HIT,
          StatCategory.BLK,
          StatCategory.TOI,
        ];
        if (usesPM) {
          skaterStats.splice(3, 0, StatCategory.PM);
        }
        return skaterStats;
      case PositionGroup.G:
        return [
          StatCategory.W,
          StatCategory.GAA,
          StatCategory.SVP,
          StatCategory.GA,
          StatCategory.SA,
          StatCategory.SV,
          StatCategory.SO,
          StatCategory.TOI,
        ];
      case PositionGroup.TEAM:
        const teamStats = [
          StatCategory.G,
          StatCategory.A,
          StatCategory.P,
          StatCategory.PPP,
          StatCategory.SOG,
          StatCategory.HIT,
          StatCategory.BLK,
          StatCategory.W,
          StatCategory.GAA,
          StatCategory.SVP,
          StatCategory.GA,
          StatCategory.SA,
          StatCategory.SV,
          StatCategory.SO,
          StatCategory.TOI,
        ];
        if (usesPM) {
          teamStats.splice(3, 0, StatCategory.PM);
        }
        return teamStats;
      default:
        return [];
    }
  }

  function getAggregationBehaviorProfile(aggregationLevel) {
    return (
      AggregationBehaviorProfiles[aggregationLevel] ||
      AggregationBehaviorProfiles.default
    );
  }

  /**
   * Get performance grade based on score
   * @param {number} score - Player rating score
   * @returns {string} Performance grade label
   */
  function getPerformanceGrade(score) {
    for (const grade of PerformanceGrades) {
      if (score >= grade.threshold) {
        return grade.label;
      }
    }
    return "Minimal";
  }

  /**
   * Get scaling configuration for a position
   * @param {string} posGroup - Position group ("F", "D", "G", or "TEAM")
   * @returns {Object} Scaling parameters for the position
   */
  function getScalingConfig(posGroup) {
    return {
      curveStrength: ScalingConfig.curveStrength[posGroup] || 0.5,
      scaleFactor: ScalingConfig.scaleFactor[posGroup] || 117,
      multiplier: ScalingConfig.multiplier[posGroup] || 1.0,
      midpointCompression: ScalingConfig.midpointCompression[posGroup] || 0,
    };
  }

  /**
   * Get aggregation-level blend weights for spike vs consistency scoring
   * @param {string} aggregationLevel
   * @param {string} posGroup
   * @returns {{all:number, top5:number, top3:number, top2:number}}
   */
  function getAggregationBlendWeights(aggregationLevel, posGroup) {
    const rankingModels = ns.RANKING_MODELS;
    const trainedConfig =
      rankingModels &&
      rankingModels.aggregationBlendWeights &&
      rankingModels.aggregationBlendWeights[aggregationLevel];

    if (trainedConfig) {
      const trainedWeights = trainedConfig[posGroup] || trainedConfig.DEFAULT;
      if (trainedWeights) {
        return trainedWeights;
      }
    }

    const fallbackConfig =
      FallbackAggregationBlendWeights[aggregationLevel] ||
      FallbackAggregationBlendWeights.default;
    if (!fallbackConfig) {
      return FallbackAggregationBlendWeights.default.DEFAULT;
    }

    return (
      fallbackConfig[posGroup] ||
      fallbackConfig.DEFAULT ||
      FallbackAggregationBlendWeights.default.DEFAULT
    );
  }

  const LowerBetterStats = new Set([StatCategory.GAA, StatCategory.GA]);

  function isLowerBetterStat(category) {
    return LowerBetterStats.has(category);
  }

  function getCategoryWeightMultiplier(aggregationLevel, posGroup, category) {
    const aggConfig =
      CategoryAggregationWeightMultipliers[aggregationLevel] ||
      CategoryAggregationWeightMultipliers.default;
    if (!aggConfig) return 1;

    const posConfig = aggConfig[posGroup] || aggConfig.DEFAULT;
    if (!posConfig) return 1;

    const multiplier = posConfig[category];
    return typeof multiplier === "number" ? multiplier : 1;
  }

  /**
   * Check if a performance is an outlier
   * @param {number} compositeScore - Composite percentile score (0-100)
   * @returns {boolean} True if outlier
   */
  function isOutlierPerformance(compositeScore) {
    return (
      compositeScore > OutlierThresholds.highPercentile ||
      compositeScore < OutlierThresholds.lowPercentile
    );
  }

  function applyMidpointCompression(value, compression) {
    if (!compression || compression <= 0) return value;
    if (value <= 0 || value >= 1) return value;
    const exponent = 1 + compression * (1 - value);
    return Math.pow(value, exponent);
  }

  // Attach to the single global export object.
  ns.PositionGroup = PositionGroup;
  ns.StatCategory = StatCategory;
  ns.ScalingConfig = ScalingConfig;
  ns.FallbackAggregationBlendWeights = FallbackAggregationBlendWeights;
  ns.CategoryAggregationWeightMultipliers =
    CategoryAggregationWeightMultipliers;
  ns.PercentilePoints = PercentilePoints;
  ns.AggregationBehaviorProfiles = AggregationBehaviorProfiles;
  ns.OutlierThresholds = OutlierThresholds;
  ns.PerformanceGrades = PerformanceGrades;

  ns.getRelevantStats = getRelevantStats;
  ns.getAggregationBehaviorProfile = getAggregationBehaviorProfile;
  ns.getPerformanceGrade = getPerformanceGrade;
  ns.getScalingConfig = getScalingConfig;
  ns.getAggregationBlendWeights = getAggregationBlendWeights;
  ns.isLowerBetterStat = isLowerBetterStat;
  ns.getCategoryWeightMultiplier = getCategoryWeightMultiplier;
  ns.isOutlierPerformance = isOutlierPerformance;
  ns.applyMidpointCompression = applyMidpointCompression;
})(RankingEngine);
