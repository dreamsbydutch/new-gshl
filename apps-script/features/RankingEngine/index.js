// @ts-nocheck

var SeasonType =
  typeof SeasonType !== "undefined"
    ? SeasonType
    : {
        REGULAR_SEASON: "RS",
        PLAYOFFS: "PO",
        LOSERS_TOURNAMENT: "LT",
      };

/**
 * Ranking Engine (Apps Script)
 * ----------------------------
 * Scores a single stat line (player/team; day/week/season) by:
 * - Classifying the line (entity type, aggregation level, season phase)
 * - Converting stat categories into percentiles via trained distributions
 * - Applying an exponential transform to separate elite performances
 * - Weighting by position/category importance
 * - Blending/adjusting based on aggregation behavior profiles
 *
 * Output:
 * - `score`: unbounded (typically ~0–120+), floored at 0
 * - `percentile`: 0–100 reference percentile for the composite
 * - `breakdown`: per-category contribution details
 *
 * Dependencies (globals injected elsewhere in Apps Script):
 * - RankingEngine.RANKING_MODELS (from RankingModels.js)
 * - RankingEngine.PositionGroup, RankingEngine.StatCategory, RankingEngine.ScalingConfig (from RankingConfig.js)
 * - SeasonType constants (RS/PO/LT)
 * - RankingEngine.getRelevantStats, RankingEngine.getScalingConfig, RankingEngine.applyMidpointCompression
 * - RankingEngine.isLowerBetterStat, RankingEngine.getCategoryWeightMultiplier
 * - RankingEngine.getAggregationBlendWeights, RankingEngine.getAggregationBehaviorProfile
 * - RankingEngine.isOutlierPerformance
 * - clip, percentileRank
 *
 * Usage:
 * - `RankingEngine.rankPerformance(statLine)` for a single item
 * - `RankingEngine.rankPerformances(statLines)` for batches
 */

/**
 * Module wrapper
 * --------------
 * Apps Script does not have real ES module boundaries across files. Wrapping
 * the implementation in an IIFE keeps helper functions out of the global
 * namespace while still allowing other files to call the public API.
 */
var RankingEngine = RankingEngine || {};

(function (ns) {
  "use strict";

  function clip(value, min, max) {
    var v = Number(value);
    if (!isFinite(v)) return min;
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }

  /**
   * Percentile rank (0..100) against a sorted ascending array.
   * Uses linear interpolation within the nearest bracket.
   */
  function percentileRank(value, sortedValues) {
    if (!sortedValues || sortedValues.length === 0) return 50;
    var v = Number(value);
    if (!isFinite(v)) return 50;

    var arr = sortedValues;
    var n = arr.length;
    if (n === 1) return v >= Number(arr[0]) ? 100 : 0;

    var min = Number(arr[0]);
    var max = Number(arr[n - 1]);
    if (!isFinite(min) || !isFinite(max)) return 50;
    if (v <= min) return 0;
    if (v >= max) return 100;

    // Find the upper bound index.
    var hi = 1;
    while (hi < n && Number(arr[hi]) < v) hi++;
    if (hi >= n) return 100;
    var lo = hi - 1;
    var a = Number(arr[lo]);
    var b = Number(arr[hi]);
    if (!isFinite(a) || !isFinite(b) || b === a) {
      return clip((lo / (n - 1)) * 100, 0, 100);
    }
    var t = (v - a) / (b - a);
    return clip(((lo + t) / (n - 1)) * 100, 0, 100);
  }

  // Lazy-loaded references to config helpers/consts attached by RankingConfig.js.
  // We load on first call to keep initialization order flexible.
  var PositionGroup;
  var StatCategory;
  var ScalingConfig;
  var getRelevantStats;
  var getScalingConfig;
  var applyMidpointCompression;
  var isLowerBetterStat;
  var getCategoryWeightMultiplier;
  var getAggregationBlendWeights;
  var getAggregationBehaviorProfile;
  var isOutlierPerformance;

  function loadConfig() {
    if (PositionGroup) return;

    PositionGroup = ns.PositionGroup;
    StatCategory = ns.StatCategory;
    ScalingConfig = ns.ScalingConfig;
    getRelevantStats = ns.getRelevantStats;
    getScalingConfig = ns.getScalingConfig;
    applyMidpointCompression = ns.applyMidpointCompression;
    isLowerBetterStat = ns.isLowerBetterStat;
    getCategoryWeightMultiplier = ns.getCategoryWeightMultiplier;
    getAggregationBlendWeights = ns.getAggregationBlendWeights;
    getAggregationBehaviorProfile = ns.getAggregationBehaviorProfile;
    isOutlierPerformance = ns.isOutlierPerformance;

    if (!ScalingConfig) {
      // Fallback so rankPerformance never crashes if config order is wrong.
      ScalingConfig = { percentileTransform: 1.8 };
    }

    if (!PositionGroup || !StatCategory) {
      throw new Error(
        "RankingEngine config missing. Ensure RankingConfig.js attaches config to RankingEngine.",
      );
    }
  }

  // =============================================================================
  // Classification & keys
  // =============================================================================

  /**
   * Classify a stat line into the metadata needed to pick a ranking model.
   *
   * This keeps model selection consistent across player/team and day/week/season
   * inputs (and handles older/partial inputs with safe fallbacks).
   *
   * @param {Object} line
   * @returns {{seasonId:string,posGroup:string,aggregationLevel:string,entityType:string,seasonPhase:string}|null}
   */
  function classifyStatLine(line) {
    function detectEntityType(input) {
      if (input.entityType === "team") return "team";
      if (input.entityType === "player") return "player";
      if (input.playerId) return "player";
      if (input.gshlTeamId || input.teamId) return "team";
      return "player";
    }

    function normalizePosGroup(raw, entityType) {
      if (entityType === "team") return PositionGroup.TEAM;
      if (!raw) return null;
      const str = String(raw).toUpperCase();
      if (str === PositionGroup.F) return PositionGroup.F;
      if (str === PositionGroup.D) return PositionGroup.D;
      if (str === PositionGroup.G) return PositionGroup.G;
      return null;
    }

    function detectAggregationLevel(input, entityType) {
      const hasDate = Boolean(input.date);
      const hasWeekId = Boolean(input.weekId);
      const hasDaysField = input.days !== undefined && input.days !== null;
      const hasSeasonType =
        typeof input.seasonType === "string" && input.seasonType !== "";
      const hasTeamList =
        input.gshlTeamIds !== undefined && input.gshlTeamIds !== null;
      const hasNhlSeasonFields =
        input.seasonRating !== undefined ||
        input.overallRating !== undefined ||
        input.salary !== undefined ||
        input.QS !== undefined ||
        input.RBS !== undefined;

      if (entityType === "player") {
        if (hasNhlSeasonFields) return "playerNhl";
        if (hasDate) return "playerDay";
        if (hasWeekId && hasDaysField) return "playerWeek";
        if (hasSeasonType && input.gshlTeamId) return "playerSplit";
        if (hasTeamList) return "playerTotal";
        if (hasSeasonType) return "playerTotal";
        return hasWeekId ? "playerWeek" : "playerDay";
      }

      if (hasDate) return "teamDay";
      if (hasWeekId) return "teamWeek";
      return "teamSeason";
    }
    function normalizeSeasonPhase(value, fallbackPhase) {
      if (!value || typeof value !== "string") return fallbackPhase;
      const upper = value.toUpperCase();
      if (upper === "PO" || upper === "PLAYOFFS") return SeasonType.PLAYOFFS;
      if (
        upper === "LT" ||
        upper === "LOSERS" ||
        upper === "LOSERS_TOURNAMENT" ||
        upper === "LOSERS TOURNAMENT"
      )
        return SeasonType.LOSERS_TOURNAMENT;
      if (upper === "RS" || upper === "REGULAR" || upper === "REGULAR_SEASON")
        return SeasonType.REGULAR_SEASON;
      return fallbackPhase;
    }

    function resolveSeasonPhase(input, fallbackPhase) {
      if (input.seasonPhase) {
        return normalizeSeasonPhase(input.seasonPhase, fallbackPhase);
      }
      if (input.seasonType) {
        return normalizeSeasonPhase(input.seasonType, fallbackPhase);
      }
      return fallbackPhase;
    }
    const seasonId = line.seasonId ? String(line.seasonId) : "";
    if (!seasonId) return null;

    const entityType = detectEntityType(line);
    const aggregationLevel = detectAggregationLevel(line, entityType);
    const rawPosGroup =
      line.posGroup ||
      line.positionGroup ||
      line.PositionGroup ||
      line.POSITION_GROUP;
    const posGroup = normalizePosGroup(rawPosGroup, entityType);
    if (!posGroup) return null;

    const seasonPhase = resolveSeasonPhase(line, SeasonType.REGULAR_SEASON);

    return {
      seasonId: seasonId,
      posGroup: posGroup,
      aggregationLevel: aggregationLevel,
      entityType: entityType,
      seasonPhase: seasonPhase,
    };
  }

  /**
   * Build the primary lookup key for a model.
   *
   * Keys are intentionally stable and explicit so that the training/export
   * pipeline can generate deterministic names.
   *
   * @param {{seasonPhase?:string,seasonId:string,aggregationLevel?:string,posGroup:string}} meta
   * @returns {string}
   */
  function buildModelKey(meta) {
    return [
      meta.seasonPhase || SeasonType.REGULAR_SEASON,
      meta.seasonId,
      meta.aggregationLevel || "playerDay",
      meta.posGroup,
    ].join(":");
  }

  /**
   * Fallback classification for partial inputs.
   *
   * This should be rare in normal operation. It exists so callers can pass
   * minimally-shaped stat lines without crashing the ranking engine.
   *
   * @param {Object} statLine
   * @returns {{seasonId:string,posGroup:string,aggregationLevel:string,entityType:string,seasonPhase:string}}
   */
  function buildFallbackClassification(statLine) {
    const seasonId = statLine.seasonId ? String(statLine.seasonId) : "unknown";
    const entityType = statLine.playerId ? "player" : "team";
    const posGroup =
      statLine.posGroup ||
      (entityType === "team" ? PositionGroup.TEAM : PositionGroup.F);
    let aggregationLevel;
    if (entityType === "team") {
      if (statLine.date) aggregationLevel = "teamDay";
      else if (statLine.weekId) aggregationLevel = "teamWeek";
      else aggregationLevel = "teamSeason";
    } else {
      if (statLine.date) aggregationLevel = "playerDay";
      else if (statLine.weekId) aggregationLevel = "playerWeek";
      else aggregationLevel = "playerDay";
    }

    return {
      seasonId: seasonId,
      posGroup: posGroup,
      aggregationLevel: aggregationLevel,
      entityType: entityType,
      seasonPhase: SeasonType.REGULAR_SEASON,
    };
  }

  // =============================================================================
  // Percentiles, parsing, and base utilities
  // =============================================================================

  /**
   * Estimate percentile from a distribution (min/max + key percentile markers).
   *
   * Uses piecewise linear interpolation between anchors.
   *
   * @param {number} value
   * @param {{min:number,max:number,percentiles:{p10:number,p25:number,p50:number,p75:number,p90:number,p95:number,p99:number}}} distribution
   * @returns {number} percentile in [0, 100]
   */
  function estimatePercentileFromDistribution(value, distribution) {
    const min = distribution.min;
    const max = distribution.max;
    const percentiles = distribution.percentiles;

    if (value <= min) return 0;
    if (value >= max) return 100;

    const lookup = [
      [0, min],
      [10, percentiles.p10],
      [25, percentiles.p25],
      [50, percentiles.p50],
      [75, percentiles.p75],
      [90, percentiles.p90],
      [95, percentiles.p95],
      [99, percentiles.p99],
      [100, max],
    ];

    for (let i = 0; i < lookup.length - 1; i++) {
      const pct1 = lookup[i][0];
      const val1 = lookup[i][1];
      const pct2 = lookup[i + 1][0];
      const val2 = lookup[i + 1][1];

      if (value >= val1 && value <= val2) {
        if (val2 === val1) return pct1;
        const ratio = (value - val1) / (val2 - val1);
        return pct1 + ratio * (pct2 - pct1);
      }
    }

    return 50;
  }

  /**
   * Determine aggregation type from stat line
   * @param {Object} statLine - Stat line to analyze
   * @returns {string} One of: 'daily', 'weekly', 'season'
   */
  function detectAggregationType(statLine) {
    // date => daily
    if (statLine.date) return "daily";
    // weekId without seasonType => weekly
    if (statLine.weekId && !statLine.seasonType) return "weekly";
    // seasonType (or just seasonId) => season
    return "season";
  }

  /**
   * Convert a raw category value into a safe percentile (0..100) using the
   * model's distribution for that category.
   *
   * Lower-is-better categories (e.g., GAA) are flipped if `isLowerBetterStat`
   * exists in the global environment.
   *
   * @param {string} category
   * @param {number} value
   * @param {Object|null|undefined} distribution
   * @returns {number}
   */
  function computeCategoryPercentile(category, value, distribution) {
    if (!distribution) return 0;
    const rawPercentile = estimatePercentileFromDistribution(
      value,
      distribution,
    );
    const safePercentile = isNaN(rawPercentile) ? 0 : rawPercentile;
    if (isLowerBetterStat && isLowerBetterStat(category)) {
      return 100 - safePercentile;
    }
    return safePercentile;
  }

  /**
   * Normalize raw stat line values into a consistent numeric shape.
   *
   * Note: weekly/season values are expected to be totals; daily is per-game.
   * Model training/distributions handle any needed per-game normalization.
   *
   * @param {Object} statLine
   * @returns {{stats:Object,aggType:string,gamesPlayed:number}}
   */
  function parseStats(statLine) {
    const aggType = detectAggregationType(statLine);

    // Raw numeric stats (defensive parsing: treat missing/blank as 0)
    const raw = {
      G: Number(statLine.G) || 0,
      A: Number(statLine.A) || 0,
      P: Number(statLine.P) || 0,
      PM: Number(statLine.PM) || 0,
      PPP: Number(statLine.PPP) || 0,
      SOG: Number(statLine.SOG) || 0,
      HIT: Number(statLine.HIT) || 0,
      BLK: Number(statLine.BLK) || 0,
      W: Number(statLine.W) || 0,
      GA: Number(statLine.GA) || 0,
      GAA: Number(statLine.GAA) || 0,
      SA: Number(statLine.SA) || 0,
      SV: Number(statLine.SV) || 0,
      SVP: Number(statLine.SVP) || 0,
      SO: Number(statLine.SO) || 0,
      TOI: Number(statLine.TOI) || 0,
    };

    // Games started/played (GS is used for skaters and goalies in this system)
    const gamesPlayed = Number(statLine.GS) || 0;

    return {
      stats: raw,
      aggType: aggType,
      gamesPlayed: gamesPlayed,
    };
  }

  /**
   * Determine whether a stat line represents a "did not play" performance.
   *
   * This is used to short-circuit scoring so we don't inflate zeros via
   * percentile transforms.
   *
   * @param {Object} stats
   * @param {{posGroup:string}} classification
   * @returns {boolean}
   */
  function isZeroPerformance(stats, classification) {
    if (classification.posGroup === PositionGroup.G) {
      return stats.W === 0 && stats.GAA === 0 && stats.SVP === 0;
    }

    if (classification.posGroup === PositionGroup.TEAM) {
      const skaterZero =
        stats.G === 0 &&
        stats.A === 0 &&
        stats.P === 0 &&
        stats.SOG === 0 &&
        stats.HIT === 0 &&
        stats.BLK === 0;
      const goalieZero = stats.W === 0 && stats.GAA === 0 && stats.SVP === 0;
      return skaterZero && goalieZero;
    }

    return (
      stats.G === 0 &&
      stats.A === 0 &&
      stats.P === 0 &&
      stats.SOG === 0 &&
      stats.HIT === 0 &&
      stats.BLK === 0
    );
  }

  // =============================================================================
  // Public ranking API
  // =============================================================================

  /**
   * Rank a single stat line.
   *
   * This is the primary entry point used by other Apps Script modules.
   *
   * @param {Object} statLine
   * @returns {Object} ranking result (score/percentile/breakdown + metadata)
   */
  function rankPerformance(statLine) {
    loadConfig();
    const classification =
      classifyStatLine(statLine) || buildFallbackClassification(statLine);

    if (!classification) {
      return {
        score: null,
        percentile: 0,
        breakdown: [],
        seasonId: statLine.seasonId || "unknown",
        posGroup: statLine.posGroup || PositionGroup.F,
        isOutlier: false,
        aggType: detectAggregationType(statLine),
        gamesPlayed: Number(statLine.GS) || 0,
        aggregationLevel: "playerDay",
        seasonPhase: SeasonType.REGULAR_SEASON,
        entityType: statLine.playerId ? "player" : "team",
        entityId: statLine.playerId || statLine.gshlTeamId,
      };
    }

    const seasonModel = resolveSeasonModel(classification);

    if (!seasonModel) {
      const entityName =
        statLine.playerName ||
        statLine.gshlTeamId ||
        statLine.playerId ||
        "Unknown";
      Logger.log(
        "No model found for " +
          buildModelKey(classification) +
          " (entity: " +
          entityName +
          "), falling back to global weights",
      );
      return rankWithGlobalWeights(statLine, classification);
    }

    const parseResult = parseStats(statLine);
    const stats = parseResult.stats;
    const aggType = parseResult.aggType;
    const gamesPlayed = parseResult.gamesPlayed;
    const entityId = statLine.playerId || statLine.gshlTeamId;
    const statsToRank = getRelevantStats(
      classification.posGroup,
      classification.seasonId,
    );

    if (isZeroPerformance(stats, classification)) {
      return {
        score: Number.NaN,
        percentile: 0,
        breakdown: statsToRank.map(function (stat) {
          const baseWeight = seasonModel.weights[stat] || 1;
          const weightMultiplier = getCategoryWeightMultiplier(
            classification.aggregationLevel,
            classification.posGroup,
            stat,
          );
          const adjustedWeight = baseWeight * weightMultiplier;
          return {
            category: stat,
            value: stats[stat],
            percentile: 0,
            weight: adjustedWeight,
            contribution: 0,
          };
        }),
        seasonId: classification.seasonId,
        posGroup: classification.posGroup,
        isOutlier: false,
        aggType: aggType,
        gamesPlayed: gamesPlayed,
        entityType: classification.entityType,
        entityId: entityId,
        aggregationLevel: classification.aggregationLevel,
        seasonPhase: classification.seasonPhase,
      };
    }

    // Composite percentile (0..100) from weighted category percentiles
    let weightedSum = 0;
    let totalWeight = 0;
    const statStrengths = [];

    for (const stat of statsToRank) {
      const value = stats[stat];
      const distribution = seasonModel.distributions[stat];
      if (!distribution) continue;

      // Percentile rank (0..100) for this stat
      const percentile = computeCategoryPercentile(stat, value, distribution);

      // Exponential transform to create separation in the top tail
      const transformedPercentile =
        Math.pow(percentile / 100, ScalingConfig.percentileTransform) * 100;

      const baseWeight = seasonModel.weights[stat] || 1;
      const weightMultiplier = getCategoryWeightMultiplier(
        classification.aggregationLevel,
        classification.posGroup,
        stat,
      );
      const weight = baseWeight * weightMultiplier;
      weightedSum += transformedPercentile * weight;
      totalWeight += weight;
      statStrengths.push({
        category: stat,
        percentile: transformedPercentile,
        weight: weight,
      });
    }

    // Weighted average (still 0..100 scale)
    const compositeScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    const subsetScores = computeSubsetScores(statStrengths);
    const blendWeights = getAggregationBlendWeights(
      classification.aggregationLevel,
      classification.posGroup,
    );
    const blendedCompositeScore = blendCompositeScore(
      compositeScore,
      subsetScores,
      blendWeights,
    );

    const behaviorProfile = getAggregationBehaviorProfile(
      classification.aggregationLevel,
    );
    const behaviorAdjustedComposite = applyAggregationBehaviorAdjustments(
      blendedCompositeScore,
      statStrengths,
      behaviorProfile,
    );

    // Normalize to 0..1 for curve/scaling steps
    const normalized = behaviorAdjustedComposite / 100;

    // Position-specific scaling
    const config = getScalingConfig(
      classification.posGroup === "G" &&
        classification.aggregationLevel === "playerDay"
        ? "GDay"
        : classification.posGroup,
    );

    // Shape the curve (compress mid, then apply power curve)
    const midCompressed = applyMidpointCompression(
      normalized,
      config.midpointCompression,
    );
    const curved = Math.pow(midCompressed, config.curveStrength);

    // Final score (floored at 0; intentionally no ceiling)
    let score = curved * config.scaleFactor * config.multiplier;

    // Only floor at 0, no ceiling - extreme outliers can exceed typical max
    score = Math.max(0, score);

    // Reference percentile (composite is on a 0..100 scale)
    const percentile = Math.min(100, behaviorAdjustedComposite);

    // Check if outlier
    const isOutlier = isOutlierPerformance(behaviorAdjustedComposite);

    // Per-category breakdown (raw percentiles; weights applied)
    const breakdown = statsToRank.map((category) => {
      const value = stats[category];
      const distribution = seasonModel.distributions[category];
      const baseWeight = seasonModel.weights[category] || 0;
      const weightMultiplier = getCategoryWeightMultiplier(
        classification.aggregationLevel,
        classification.posGroup,
        category,
      );
      const adjustedWeight = baseWeight * weightMultiplier;
      if (!distribution) {
        return {
          category: category,
          value: value,
          percentile: 0,
          weight: adjustedWeight,
          contribution: 0,
        };
      }

      const statPercentile = computeCategoryPercentile(
        category,
        value,
        distribution,
      );

      const contribution =
        (statPercentile * adjustedWeight) / statsToRank.length;

      return {
        category: category,
        value: value,
        percentile: statPercentile,
        weight: adjustedWeight,
        contribution: contribution,
      };
    });

    return {
      score: score,
      percentile: percentile,
      breakdown: breakdown,
      seasonId: classification.seasonId,
      posGroup: classification.posGroup,
      isOutlier: isOutlier,
      aggType: aggType,
      gamesPlayed: gamesPlayed,
      entityType: classification.entityType,
      entityId: entityId,
      aggregationLevel: classification.aggregationLevel,
      seasonPhase: classification.seasonPhase,
    };
  }

  /**
   * Rank many stat lines.
   *
   * @param {Array<Object>} statLines
   * @returns {Array<Object>}
   */
  function rankPerformances(statLines) {
    loadConfig();
    return statLines.map(function (statLine) {
      return rankPerformance(statLine);
    });
  }

  // =============================================================================
  // Fallback scoring (global weights)
  // =============================================================================

  /**
   * Fallback path when a season-specific model cannot be resolved.
   *
   * Uses `RANKING_MODELS.globalWeights[posGroup]` and a coarse percentile
   * estimate when possible.
   *
   * @param {Object} statLine
   * @param {Object} classification
   * @returns {Object}
   */
  function rankWithGlobalWeights(statLine, classification) {
    loadConfig();
    function calculateWeightedScore(
      stats,
      weights,
      posGroup,
      aggregationLevel,
    ) {
      if (!weights) return 0;
      let score = 0;
      const gaaValue = posGroup === PositionGroup.G ? -stats.GAA : 0;

      function adjustedWeight(category) {
        const baseWeight = weights[category] || 0;
        const aggregation = aggregationLevel || "playerDay";
        return (
          baseWeight *
          getCategoryWeightMultiplier(
            aggregation,
            posGroup,
            StatCategory[category] || category,
          )
        );
      }

      score += stats.G * adjustedWeight("G");
      score += stats.A * adjustedWeight("A");
      score += stats.P * adjustedWeight("P");
      score += stats.PM * adjustedWeight("PM");
      score += stats.PPP * adjustedWeight("PPP");
      score += stats.SOG * adjustedWeight("SOG");
      score += stats.HIT * adjustedWeight("HIT");
      score += stats.BLK * adjustedWeight("BLK");
      score += stats.W * adjustedWeight("W");
      score += gaaValue * adjustedWeight("GAA");
      score += stats.SVP * adjustedWeight("SVP");

      return score;
    }
    if (!ns.RANKING_MODELS) {
      return {
        score: null,
        percentile: 0,
        breakdown: [],
        seasonId: classification.seasonId,
        posGroup: classification.posGroup,
        isOutlier: false,
        aggType: detectAggregationType(statLine),
        gamesPlayed: Number(statLine.GS) || 0,
        entityType: classification.entityType,
        entityId: statLine.playerId || statLine.gshlTeamId,
        aggregationLevel: classification.aggregationLevel,
        seasonPhase: classification.seasonPhase,
      };
    }

    const globalWeights =
      ns.RANKING_MODELS.globalWeights &&
      ns.RANKING_MODELS.globalWeights[classification.posGroup];

    const parseResult = parseStats(statLine);
    const stats = parseResult.stats;
    const aggType = parseResult.aggType;
    const gamesPlayed = parseResult.gamesPlayed;

    if (!globalWeights) {
      return {
        score: null,
        percentile: 0,
        breakdown: [],
        seasonId: classification.seasonId,
        posGroup: classification.posGroup,
        isOutlier: false,
        aggType: aggType,
        gamesPlayed: gamesPlayed,
        entityType: classification.entityType,
        entityId: statLine.playerId || statLine.gshlTeamId,
        aggregationLevel: classification.aggregationLevel,
        seasonPhase: classification.seasonPhase,
      };
    }

    const compositeScore = calculateWeightedScore(
      stats,
      globalWeights,
      classification.posGroup,
      classification.aggregationLevel,
    );

    let percentile = 50;
    if (
      ns.RANKING_MODELS.models &&
      Object.keys(ns.RANKING_MODELS.models).length > 0
    ) {
      const candidates = Object.values(ns.RANKING_MODELS.models).filter(
        function (model) {
          const candidateAgg = model.aggregationLevel || "playerDay";
          return (
            model.posGroup === classification.posGroup &&
            candidateAgg === classification.aggregationLevel
          );
        },
      );

      const distributionScores = [];
      candidates.forEach(function (model) {
        if (!model.compositeDistribution) return;
        const dist = model.compositeDistribution;
        distributionScores.push(
          dist.min,
          dist.percentiles.p25,
          dist.percentiles.p50,
          dist.percentiles.p75,
          dist.max,
        );
      });

      if (distributionScores.length > 0) {
        percentile = percentileRank(
          compositeScore,
          distributionScores.sort((a, b) => a - b),
        );
      }
    }

    const relevantStats = getRelevantStats(
      classification.posGroup,
      classification.seasonId,
    );
    const breakdown = relevantStats.map(function (category) {
      return {
        category: category,
        value: stats[category],
        percentile: 50,
        weight: globalWeights[category] || 0,
        contribution: 0,
      };
    });

    return {
      score: clip(percentile, 0, 100),
      percentile: percentile,
      breakdown: breakdown,
      seasonId: classification.seasonId,
      posGroup: classification.posGroup,
      isOutlier: false,
      aggType: aggType,
      gamesPlayed: gamesPlayed,
      entityType: classification.entityType,
      entityId: statLine.playerId || statLine.gshlTeamId,
      aggregationLevel: classification.aggregationLevel,
      seasonPhase: classification.seasonPhase,
    };
  }

  // =============================================================================
  // Model resolution
  // =============================================================================

  /**
   * Find the best season model for a classification.
   *
   * Resolution order:
   * 1) Exact key match (phase + seasonId + aggregation + posGroup)
   * 2) Legacy key match (seasonId + posGroup)
   * 3) Same aggregation/posGroup, closest seasonId, same phase
   * 4) Same aggregation/posGroup, closest seasonId, alternate phase
   *
   * @param {Object} classification
   * @returns {Object|null}
   */
  function resolveSeasonModel(classification) {
    function getPhaseFallbackOrder(phase) {
      if (phase === SeasonType.PLAYOFFS) {
        return [SeasonType.PLAYOFFS, SeasonType.REGULAR_SEASON];
      }
      if (phase === SeasonType.LOSERS_TOURNAMENT) {
        return [SeasonType.LOSERS_TOURNAMENT, SeasonType.REGULAR_SEASON];
      }
      return [SeasonType.REGULAR_SEASON, SeasonType.PLAYOFFS];
    }
    function compareSeasonDistance(seasonA, seasonB, target) {
      const aNum = parseInt(seasonA, 10);
      const bNum = parseInt(seasonB, 10);
      if (isNaN(target)) {
        return (aNum || 0) - (bNum || 0);
      }
      const aDistance = isNaN(aNum)
        ? Number.MAX_SAFE_INTEGER
        : Math.abs(aNum - target);
      const bDistance = isNaN(bNum)
        ? Number.MAX_SAFE_INTEGER
        : Math.abs(bNum - target);
      return aDistance - bDistance;
    }
    if (!ns.RANKING_MODELS) return null;
    const models = ns.RANKING_MODELS.models || {};

    const directKey = buildModelKey(classification);
    if (models[directKey]) {
      return models[directKey];
    }

    const legacyKey = classification.seasonId + ":" + classification.posGroup;
    if (models[legacyKey]) {
      return models[legacyKey];
    }

    const alternatePhases = getPhaseFallbackOrder(
      classification.seasonPhase,
    ).filter(function (phase) {
      return phase !== classification.seasonPhase;
    });

    for (let i = 0; i < alternatePhases.length; i++) {
      const phase = alternatePhases[i];
      const key = buildModelKey({
        seasonPhase: phase,
        seasonId: classification.seasonId,
        aggregationLevel: classification.aggregationLevel,
        posGroup: classification.posGroup,
      });
      if (models[key]) {
        return models[key];
      }
    }

    const targetSeasonNum = parseInt(classification.seasonId, 10);
    const candidates = Object.keys(models)
      .map(function (key) {
        return models[key];
      })
      .filter(function (candidate) {
        const candidateAgg = candidate.aggregationLevel || "playerDay";
        return (
          candidate.posGroup === classification.posGroup &&
          candidateAgg === classification.aggregationLevel
        );
      });

    const samePhaseCandidates = candidates
      .filter(function (candidate) {
        const candidatePhase =
          candidate.seasonPhase || SeasonType.REGULAR_SEASON;
        return candidatePhase === classification.seasonPhase;
      })
      .sort(function (a, b) {
        return compareSeasonDistance(a.seasonId, b.seasonId, targetSeasonNum);
      });

    if (samePhaseCandidates.length > 0) {
      return samePhaseCandidates[0];
    }

    for (let i = 0; i < alternatePhases.length; i++) {
      const phase = alternatePhases[i];
      const phaseCandidates = candidates
        .filter(function (candidate) {
          const candidatePhase =
            candidate.seasonPhase || SeasonType.REGULAR_SEASON;
          return candidatePhase === phase;
        })
        .sort(function (a, b) {
          return compareSeasonDistance(a.seasonId, b.seasonId, targetSeasonNum);
        });
      if (phaseCandidates.length > 0) {
        return phaseCandidates[0];
      }
    }

    return null;
  }

  // =============================================================================
  // Composite blending & behavior adjustments
  // =============================================================================

  /**
   * Compute the weighted average percentile of the top-N category strengths.
   *
   * @param {Array<{percentile:number,weight:number}>} entries
   * @param {number} size
   * @returns {number}
   */
  function computeTopSubsetAverage(entries, size) {
    if (!entries || entries.length === 0) return 0;
    const effectiveSize = Math.min(size, entries.length);
    const sorted = entries.slice().sort(function (a, b) {
      const aScore = (a.percentile || 0) * (a.weight || 1);
      const bScore = (b.percentile || 0) * (b.weight || 1);
      return bScore - aScore;
    });
    const selected = sorted.slice(0, effectiveSize);
    let weightSum = 0;
    let total = 0;
    selected.forEach(function (entry) {
      const w = entry.weight || 1;
      weightSum += w;
      total += (entry.percentile || 0) * w;
    });
    return weightSum > 0 ? total / weightSum : 0;
  }

  /**
   * Compute subset scores used by the blend function.
   *
   * @param {Array<{percentile:number,weight:number}>} entries
   * @returns {{top2:number,top3:number,top5:number}}
   */
  function computeSubsetScores(entries) {
    if (!entries || entries.length === 0) {
      return { top2: 0, top3: 0, top5: 0 };
    }
    return {
      top2: computeTopSubsetAverage(entries, 2),
      top3: computeTopSubsetAverage(entries, 3),
      top5: computeTopSubsetAverage(entries, 5),
    };
  }

  /**
   * Blend composite score with subset scores (top-2/3/5) using configured weights.
   *
   * @param {number} baseScore
   * @param {{top2:number,top3:number,top5:number}} subsetScores
   * @param {{all?:number,top2?:number,top3?:number,top5?:number}|null|undefined} weights
   * @returns {number}
   */
  function blendCompositeScore(baseScore, subsetScores, weights) {
    if (!weights) return baseScore;
    const contributions = [
      { value: baseScore, weight: weights.all || 0 },
      { value: subsetScores.top5 || 0, weight: weights.top5 || 0 },
      { value: subsetScores.top3 || 0, weight: weights.top3 || 0 },
      { value: subsetScores.top2 || 0, weight: weights.top2 || 0 },
    ];
    const totalWeight = contributions.reduce(function (sum, entry) {
      return sum + entry.weight;
    }, 0);
    if (totalWeight <= 0) return baseScore;
    const weightedSum = contributions.reduce(function (sum, entry) {
      return sum + entry.value * entry.weight;
    }, 0);
    return weightedSum / totalWeight;
  }

  /**
   * Apply behavior adjustments to composite score.
   *
   * These adjustments are designed to make weekly/season aggregates behave
   * more intuitively (reward spikes, penalize inconsistency, etc) without
   * changing the underlying distributions.
   *
   * @param {number} baseScore
   * @param {Array<{percentile:number}>} entries
   * @param {{spikeWeight?:number,spikeCap?:number,consistencyWeight?:number,consistencyMaxPenalty?:number}|null|undefined} behavior
   * @returns {number}
   */
  function applyAggregationBehaviorAdjustments(baseScore, entries, behavior) {
    function computeSpikeBoost(baseScore, percentiles, behavior) {
      if (!percentiles || percentiles.length === 0) {
        return 0;
      }
      const maxPercentile = percentiles.reduce(function (max, value) {
        return value > max ? value : max;
      }, 0);
      const delta = Math.max(0, maxPercentile - baseScore);
      const rawBoost = delta * behavior.spikeWeight;
      const cap = behavior.spikeCap || 0;
      return cap > 0 ? Math.min(rawBoost, cap) : rawBoost;
    }
    function computeConsistencyPenalty(percentiles, behavior) {
      if (!percentiles || percentiles.length <= 1) {
        return 0;
      }
      const mean =
        percentiles.reduce(function (sum, value) {
          return sum + value;
        }, 0) / percentiles.length;
      const variance =
        percentiles.reduce(function (sum, value) {
          const diff = value - mean;
          return sum + diff * diff;
        }, 0) / percentiles.length;
      const stdDev = Math.sqrt(variance);
      const normalizedStd = stdDev / 100;
      const rawPenalty = normalizedStd * behavior.consistencyWeight * 100;
      const cap = behavior.consistencyMaxPenalty || 0;
      return cap > 0 ? Math.min(rawPenalty, cap) : rawPenalty;
    }
    if (!behavior || !entries || entries.length === 0) {
      return baseScore;
    }
    const percentiles = entries.map(function (entry) {
      return clip(Number(entry.percentile) || 0, 0, 100);
    });
    const spikeBoost = behavior.spikeWeight
      ? computeSpikeBoost(baseScore, percentiles, behavior)
      : 0;
    const consistencyPenalty = behavior.consistencyWeight
      ? computeConsistencyPenalty(percentiles, behavior)
      : 0;
    const adjusted = baseScore + spikeBoost - consistencyPenalty;
    return clip(adjusted, 0, 100);
  }

  // Attach public API to the single export object.
  ns.rankPerformance = rankPerformance;
  ns.rankPerformances = rankPerformances;
})(RankingEngine);
