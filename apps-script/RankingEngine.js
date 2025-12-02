// @ts-nocheck

/**
 * Ranking Engine
 * ==============
 * Core ranking algorithm that scores stat line performances from 0-120+ using
 * percentile-based normalization with exponential scaling at the top end.
 *
 * SUPPORTS ALL AGGREGATION LEVELS:
 *
 * Player Stats:
 * - Daily: Individual game performances (date field present)
 * - Weekly: Week aggregations (weekId field, no seasonType)
 * - Season: Full season totals (seasonType field or just seasonId)
 *
 * Team Stats (sum of all players on team):
 * - Daily: Team performance for a specific date
 * - Weekly: Team performance for a week
 * - Season: Team performance for entire season
 *
 * HOW IT WORKS:
 *
 * 1. Auto-detects aggregation type from fields (date/weekId/seasonType)
 * 2. Uses raw cumulative stats for weekly/season aggregates (daily already per-game)
 * 3. Converts stats to percentiles using historical distributions
 * 4. Applies exponential transformation (power 1.8) to spread top performers
 * 5. Weights stats by position-specific importance
 * 6. Applies position-specific curve and scaling
 * 7. Returns rating from ~0-120 with no artificial ceiling
 *
 * IMPORTANT: All aggregation levels use the SAME baseline distributions
 * (trained on daily performances). Weekly/season stats are normalized to
 * per-game averages first, so they can be compared on the same scale.
 *
 * USAGE EXAMPLES:
 *
 * // Player daily - model auto-selected based on seasonId and posGroup
 * rankPerformance({
 *   playerId: "123",
 *   seasonId: "10",
 *   posGroup: "F",
 *   date: new Date(),
 *   GS: 1,
 *   G: 2, A: 1, P: 3, SOG: 5, ...
 * });
 *
 * // Player weekly - model auto-selected
 * rankPerformance({
 *   playerId: "123",
 *   seasonId: "10",
 *   posGroup: "F",
 *   weekId: "10-01",
 *   GS: 3,  // Started 3 games this week
 *   G: 4, A: 3, P: 7, SOG: 15, ...  // Totals for week
 * });
 *
 * // Team weekly - model auto-selected
 * rankPerformance({
 *   gshlTeamId: "team1",
 *   seasonId: "10",
 *   posGroup: "F",
 *   weekId: "10-01",
 *   GS: 45,  // Total GS across all forwards
 *   G: 25, A: 30, P: 55, ...  // Team totals
 * });
 */ // ===== UTILITY FUNCTIONS =====

/**
 * Clip a value between min and max
 * @param {number} value - Value to clip
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clipped value
 */
function clip(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate percentile rank of a value in a sorted array
 * @param {number} value - Value to rank
 * @param {number[]} sortedValues - Array sorted in ascending order
 * @returns {number} Percentile (0-100)
 */
function percentileRank(value, sortedValues) {
  if (sortedValues.length === 0) return 0;

  let rank = 0;
  for (const val of sortedValues) {
    if (val <= value) rank++;
    else break;
  }

  return (rank / sortedValues.length) * 100;
}

/**
 * Normalize value to 0-100 scale based on min/max
 * @param {number} value - Value to normalize
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Normalized value (0-100)
 */
function normalizeToScale(value, min, max) {
  if (max === min) return 50; // If no range, return middle
  return ((value - min) / (max - min)) * 100;
}

/**
 * Sort array in ascending order
 * @param {number[]} arr - Array to sort
 * @returns {number[]} Sorted array
 */
function sortAscending(arr) {
  return arr.slice().sort((a, b) => a - b);
}

// ===== CLASSIFICATION HELPERS =====

const SEASON_PHASE_REGULAR =
  typeof SeasonType !== "undefined" && SeasonType.REGULAR_SEASON
    ? SeasonType.REGULAR_SEASON
    : "RS";
const SEASON_PHASE_PLAYOFF =
  typeof SeasonType !== "undefined" && SeasonType.PLAYOFFS
    ? SeasonType.PLAYOFFS
    : "PO";
const SEASON_PHASE_LOSERS =
  typeof SeasonType !== "undefined" && SeasonType.LOSERS_TOURNAMENT
    ? SeasonType.LOSERS_TOURNAMENT
    : "LT";

function normalizeSeasonPhase(value, fallbackPhase) {
  if (!value || typeof value !== "string") return fallbackPhase;
  const upper = value.toUpperCase();
  if (upper === "PO" || upper === "PLAYOFFS") return SEASON_PHASE_PLAYOFF;
  if (upper === "LT" || upper === "LOSERS_TOURNAMENT")
    return SEASON_PHASE_LOSERS;
  return SEASON_PHASE_REGULAR;
}

function detectEntityType(line) {
  if (line.entityType === "team") return "team";
  if (line.entityType === "player") return "player";
  if (line.playerId) return "player";
  if (line.gshlTeamId || line.teamId) return "team";
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

function detectAggregationLevel(line, entityType) {
  const hasDate = Boolean(line.date);
  const hasWeekId = Boolean(line.weekId);
  const hasDaysField = line.days !== undefined && line.days !== null;
  const hasSeasonType =
    typeof line.seasonType === "string" && line.seasonType !== "";
  const hasTeamList =
    line.gshlTeamIds !== undefined && line.gshlTeamIds !== null;
  const hasNhlSeasonFields =
    line.seasonRating !== undefined ||
    line.overallRating !== undefined ||
    line.salary !== undefined ||
    line.QS !== undefined ||
    line.RBS !== undefined;

  if (entityType === "player") {
    if (hasNhlSeasonFields) return "playerNhl";
    if (hasDate) return "playerDay";
    if (hasWeekId && hasDaysField) return "playerWeek";
    if (hasSeasonType && line.gshlTeamId) return "playerSplit";
    if (hasTeamList) return "playerTotal";
    if (hasSeasonType) return "playerTotal";
    return hasWeekId ? "playerWeek" : "playerDay";
  }

  if (hasDate) return "teamDay";
  if (hasWeekId) return "teamWeek";
  return "teamSeason";
}

function resolveSeasonPhase(line, fallbackPhase) {
  if (line.seasonPhase) {
    return normalizeSeasonPhase(line.seasonPhase, fallbackPhase);
  }
  if (line.seasonType) {
    return normalizeSeasonPhase(line.seasonType, fallbackPhase);
  }
  return fallbackPhase;
}

function classifyStatLine(line) {
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

  const seasonPhase = resolveSeasonPhase(line, SEASON_PHASE_REGULAR);

  return {
    seasonId: seasonId,
    posGroup: posGroup,
    aggregationLevel: aggregationLevel,
    entityType: entityType,
    seasonPhase: seasonPhase,
  };
}

function buildModelKey(meta) {
  return [
    meta.seasonPhase || SEASON_PHASE_REGULAR,
    meta.seasonId,
    meta.aggregationLevel || "playerDay",
    meta.posGroup,
  ].join(":");
}

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
    seasonPhase: SEASON_PHASE_REGULAR,
  };
}

// ===== CORE RANKING FUNCTIONS =====

/**
 * Estimate percentile from distribution using interpolation
 * @param {number} value - Stat value
 * @param {Object} distribution - Distribution object with min, max, and percentiles
 * @returns {number} Estimated percentile (0-100)
 */
function estimatePercentileFromDistribution(value, distribution) {
  const min = distribution.min;
  const max = distribution.max;
  const percentiles = distribution.percentiles;

  // Handle edge cases
  if (value <= min) return 0;
  if (value >= max) return 100;

  // Build lookup table from percentile values
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

  // Find which two percentiles the value falls between
  for (let i = 0; i < lookup.length - 1; i++) {
    const pct1 = lookup[i][0];
    const val1 = lookup[i][1];
    const pct2 = lookup[i + 1][0];
    const val2 = lookup[i + 1][1];

    if (value >= val1 && value <= val2) {
      // Linear interpolation
      if (val2 === val1) return pct1; // Avoid division by zero
      const ratio = (value - val1) / (val2 - val1);
      return pct1 + ratio * (pct2 - pct1);
    }
  }

  return 50; // Fallback to median
}

/**
 * Determine aggregation type from stat line
 * @param {Object} statLine - Stat line to analyze
 * @returns {string} One of: 'daily', 'weekly', 'season'
 */
function detectAggregationType(statLine) {
  // Has 'date' field = daily
  if (statLine.date) return "daily";
  // Has 'weekId' but not 'seasonType' = weekly
  if (statLine.weekId && !statLine.seasonType) return "weekly";
  // Has 'seasonType' or just 'seasonId' = season
  return "season";
}

/**
 * Preserve cumulative stats (no per-game normalization)
 * @param {Object} stats - Raw stat values
 * @returns {Object} Stats for ranking
 */
function normalizeStats(stats) {
  return stats;
}

/**
 * Parse stats from stat line (daily/weekly/season)
 * @param {Object} statLine - Stat line with raw stat values
 * @returns {Object} Object with parsed stats, aggregation type, and games played
 */
function parseStats(statLine) {
  const aggType = detectAggregationType(statLine);

  // Extract raw stats (handle both number and string types)
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

  // Determine games played (GS for both skaters and goalies)
  const gamesPlayed = Number(statLine.GS) || 0;

  // Normalize stats based on aggregation type
  const normalized = normalizeStats(raw, aggType, gamesPlayed);

  return {
    stats: normalized,
    aggType: aggType,
    gamesPlayed: gamesPlayed,
  };
}

function calculateWeightedScore(stats, weights, posGroup) {
  if (!weights) return 0;
  let score = 0;
  const gaaValue = posGroup === PositionGroup.G ? -stats.GAA : 0;

  score += stats.G * (weights.G || 0);
  score += stats.A * (weights.A || 0);
  score += stats.P * (weights.P || 0);
  score += stats.PM * (weights.PM || 0);
  score += stats.PPP * (weights.PPP || 0);
  score += stats.SOG * (weights.SOG || 0);
  score += stats.HIT * (weights.HIT || 0);
  score += stats.BLK * (weights.BLK || 0);
  score += stats.W * (weights.W || 0);
  score += gaaValue * (weights.GAA || 0);
  score += stats.SVP * (weights.SVP || 0);

  return score;
}

/**
 * Check if a performance has zero stats (didn't play)
 * @param {Object} stats - Parsed/normalized stats
 * @param {string} posGroup - Position group
 * @param {number} gamesPlayed - Number of games played
 * @returns {boolean} True if zero performance
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

/**
 * Rank a single stat line performance (player or team, daily/weekly/season)
 * Automatically finds the correct model based on seasonId and posGroup
 * Auto-detects posGroup as "TEAM" if teamId/gshlTeamId is present instead of playerId
 * @param {Object} statLine - Stat line with stats and metadata
 *   Required fields: seasonId, posGroup (or auto-detected as TEAM), and stat values (G, A, P, etc.)
 *   Optional fields: playerId (for player), gshlTeamId/teamId (for team), date/weekId/seasonType
 * @returns {Object} Ranking result with score, percentile, breakdown, and metadata
 */
function rankPerformance(statLine) {
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
      seasonPhase: SEASON_PHASE_REGULAR,
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
        return {
          category: stat,
          value: stats[stat],
          percentile: 0,
          weight: seasonModel.weights[stat] || 1,
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

  // Calculate percentile-based composite score
  let weightedSum = 0;
  let totalWeight = 0;
  const statStrengths = [];

  for (const stat of statsToRank) {
    // For GAA and GA, invert value (lower is better)
    const value =
      stat === "GAA" && classification.posGroup === PositionGroup.G
        ? -stats[stat]
        : stats[stat];

    const distribution = seasonModel.distributions[stat];
    if (!distribution) continue;

    // Get percentile rank (0-100) for this stat
    const percentile = estimatePercentileFromDistribution(value, distribution);

    // Apply exponential transformation to spread out the top end
    // This creates significant separation between 95th, 99th, and 99.9th percentiles
    const transformedPercentile =
      Math.pow(percentile / 100, ScalingConfig.percentileTransform) * 100;

    const weight = seasonModel.weights[stat] || 1;
    weightedSum += transformedPercentile * weight;
    totalWeight += weight;
    statStrengths.push({
      category: stat,
      percentile: transformedPercentile,
      weight: weight,
    });
  }

  // Composite score: weighted average of transformed percentiles (0-100 scale)
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

  // Normalize to 0-1 range
  const normalized = blendedCompositeScore / 100;

  // Get position-specific scaling configuration
  const config = getScalingConfig(classification.posGroup);

  // Apply position-specific curve
  const midCompressed = applyMidpointCompression(
    normalized,
    config.midpointCompression,
  );
  const curved = Math.pow(midCompressed, config.curveStrength);

  // Calculate final score with position-specific scaling
  let score = curved * config.scaleFactor * config.multiplier;

  // Only floor at 0, no ceiling - extreme outliers can exceed typical max
  score = Math.max(0, score);

  // Percentile for reference (the composite score is our percentile)
  const percentile = Math.min(100, blendedCompositeScore);

  // Check if outlier
  const isOutlier = isOutlierPerformance(blendedCompositeScore);

  // Calculate per-stat breakdown
  const breakdown = statsToRank.map((category) => {
    const value = stats[category];
    const distribution = seasonModel.distributions[category];

    // For GAA, invert the percentile calculation (lower is better)
    let statPercentile;
    if (category === "GAA" && classification.posGroup === PositionGroup.G) {
      statPercentile = normalizeToScale(
        -value,
        -distribution.max,
        -distribution.min,
      );
    } else {
      statPercentile = normalizeToScale(
        value,
        distribution.min,
        distribution.max,
      );
    }

    const weight = seasonModel.weights[category];
    const contribution = (statPercentile * weight) / statsToRank.length;

    return {
      category: category,
      value: value,
      percentile: statPercentile,
      weight: weight,
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
 * Rank multiple stat line performances in batch
 * @param {Array} statLines - Array of stat lines (player or team, any aggregation level)
 * @returns {Array} Array of ranking results
 */
function rankPerformances(statLines) {
  return statLines.map(function (statLine) {
    return rankPerformance(statLine);
  });
}

function rankWithGlobalWeights(statLine, classification) {
  if (typeof RANKING_MODELS === "undefined") {
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
    RANKING_MODELS.globalWeights &&
    RANKING_MODELS.globalWeights[classification.posGroup];

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
  );

  let percentile = 50;
  if (RANKING_MODELS.models && Object.keys(RANKING_MODELS.models).length > 0) {
    const candidates = Object.values(RANKING_MODELS.models).filter(
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
        sortAscending(distributionScores),
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

function resolveSeasonModel(classification) {
  if (typeof RANKING_MODELS === "undefined") return null;
  const models = RANKING_MODELS.models || {};

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
      const candidatePhase = candidate.seasonPhase || SEASON_PHASE_REGULAR;
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
        const candidatePhase = candidate.seasonPhase || SEASON_PHASE_REGULAR;
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

function getPhaseFallbackOrder(phase) {
  if (phase === SEASON_PHASE_PLAYOFF) {
    return [SEASON_PHASE_PLAYOFF, SEASON_PHASE_REGULAR];
  }
  if (phase === SEASON_PHASE_LOSERS) {
    return [SEASON_PHASE_LOSERS, SEASON_PHASE_REGULAR];
  }
  return [SEASON_PHASE_REGULAR, SEASON_PHASE_PLAYOFF];
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
 * Example usage function for testing
 * Shows how to use the ranking engine with sample data
 * NOTE: This assumes RankingConfig.js and RankingModels.js are loaded
 */
function testRankingEngine() {
  // Use the actual trained models from RankingModels.js
  if (typeof RANKING_MODELS === "undefined") {
    Logger.log("❌ ERROR: RANKING_MODELS not found.");
    Logger.log("   Make sure RankingModels.js is deployed to Apps Script.");
    return;
  }

  Logger.log("=== Testing Ranking Engine ===");
  Logger.log("Available seasons: " + getAvailableSeasons().join(", "));
  Logger.log("");

  // Example 1: Daily player performances
  const dailyPlayers = [
    {
      playerId: "player1",
      playerName: "Elite Player",
      seasonId: "10",
      posGroup: "F",
      date: new Date("2024-01-15"),
      GS: 1,
      G: 2,
      A: 2,
      P: 4,
      PPP: 1,
      SOG: 6,
      HIT: 3,
      BLK: 2,
    },
    {
      playerId: "player2",
      playerName: "Average Player",
      seasonId: "10",
      posGroup: "F",
      date: new Date("2024-01-15"),
      GS: 1,
      G: 0,
      A: 1,
      P: 1,
      PPP: 0,
      SOG: 2,
      HIT: 1,
      BLK: 1,
    },
  ];

  // Example 2: Weekly player aggregation
  const weeklyPlayers = [
    {
      playerId: "player1",
      playerName: "Elite Player",
      seasonId: "10",
      posGroup: "F",
      weekId: "10-01",
      GS: 3, // 3 games started
      G: 4, // Total goals in week
      A: 5,
      P: 9,
      PPP: 2,
      SOG: 15,
      HIT: 8,
      BLK: 6,
    },
  ];

  // Example 3: Team weekly aggregation
  const teamWeeks = [
    {
      gshlTeamId: "team1",
      seasonId: "10",
      posGroup: "F", // Team's forward performance
      weekId: "10-01",
      GS: 45, // Total GS across all forwards
      G: 25,
      A: 35,
      P: 60,
      PPP: 15,
      SOG: 180,
      HIT: 95,
      BLK: 70,
    },
  ];

  Logger.log("=== Daily Player Rankings ===");
  const dailyResults = rankPerformances(dailyPlayers);
  dailyResults.forEach(function (result, index) {
    Logger.log("");
    Logger.log("Player: " + dailyPlayers[index].playerName);
    Logger.log(
      "Type: " + result.entityType + " (aggType: " + result.aggType + ")",
    );
    Logger.log("Score: " + (result.score ? result.score.toFixed(2) : "DNP"));
    Logger.log("Percentile: " + result.percentile.toFixed(2));
  });

  Logger.log("");
  Logger.log("=== Weekly Player Rankings ===");
  const weeklyResults = rankPerformances(weeklyPlayers);
  weeklyResults.forEach(function (result, index) {
    Logger.log("");
    Logger.log("Player: " + weeklyPlayers[index].playerName);
    Logger.log(
      "Games: " + result.gamesPlayed + " (aggType: " + result.aggType + ")",
    );
    Logger.log("Score: " + (result.score ? result.score.toFixed(2) : "DNP"));
    Logger.log("Percentile: " + result.percentile.toFixed(2));
  });

  Logger.log("");
  Logger.log("=== Team Weekly Rankings ===");
  const teamResults = rankPerformances(teamWeeks);
  teamResults.forEach(function (result, index) {
    Logger.log("");
    Logger.log("Team: " + teamWeeks[index].gshlTeamId);
    Logger.log(
      "Type: " + result.entityType + " (aggType: " + result.aggType + ")",
    );
    Logger.log("Total GS: " + result.gamesPlayed);
    Logger.log(
      "Score: " + (result.score ? result.score.toFixed(2) : "No games"),
    );
  });
}
