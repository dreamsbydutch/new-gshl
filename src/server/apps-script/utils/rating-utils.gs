/**
 * Rating Utilities
 * Helper functions for team rating calculations
 */

// =============================================================================
// STATISTICAL UTILITIES
// =============================================================================

/**
 * Convert z-score to rating scale (0-100+, uncapped)
 * @param {number} zScore - The z-score value
 * @returns {number} Rating with 2 decimal places (can exceed 100)
 */
function zScoreToRating(zScore) {
  // Convert to 0-100 base scale where:
  // z = -3 → rating = 0
  // z = 0  → rating = 50
  // z = +3 → rating = 100
  // z > +3 → rating > 100 (uncapped for exceptional performance)
  return Math.round(((zScore + 3) / 6) * 100 * 100) / 100;
}

/**
 * Calculate variance for volatility analysis
 * @param {Array<number>} values - Array of numeric values
 * @returns {number} Variance of the values
 */
function calculateVariance(values) {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate efficiency factor based on games played
 * @param {number} gp - Games played
 * @param {Object} baseline - GP baseline with mean and std
 * @param {number} maxFactor - Maximum efficiency factor (default 0.15)
 * @param {number} rate - Rate per z-score (default 0.05)
 * @returns {number} Efficiency factor between -maxFactor and +maxFactor
 */
function calculateEfficiencyFactor(
  gp,
  baseline,
  maxFactor = 0.15,
  rate = 0.05,
) {
  const gpZScore = (gp - baseline.mean) / baseline.std;
  return Math.max(-maxFactor, Math.min(maxFactor, -gpZScore * rate));
}

/**
 * Apply missed starts penalty
 * @param {number} missedStarts - Number of missed starts
 * @param {number} penaltyRate - Penalty per missed start
 * @returns {number} Penalty amount (negative value)
 */
function calculateMissedStartsPenalty(missedStarts, penaltyRate) {
  return (missedStarts || 0) * penaltyRate;
}

// =============================================================================
// NORMALIZATION UTILITIES
// =============================================================================

/**
 * Calculate days normalization factor for time period adjustments
 * @param {number} standardDays - Standard number of days
 * @param {number} actualDays - Actual number of days
 * @param {number} adjustmentRate - Rate of adjustment (default 0.5 for seasons, 0.4 for weeks)
 * @returns {number} Normalization factor
 */
function calculateDaysNormalizationFactor(
  standardDays,
  actualDays,
  adjustmentRate = 0.5,
) {
  return (standardDays / actualDays - 1) * adjustmentRate + 1;
}

/**
 * Get season days with fallback logic
 * @param {Object} teamData - Team data object
 * @param {number} standardDays - Standard season length
 * @returns {number} Season days to use
 */
function getSeasonDays(teamData, standardDays = 165) {
  // Try different field names for season days
  let seasonDays =
    teamData.days ||
    teamData.Days ||
    teamData.SeasonDays ||
    teamData.seasonDays ||
    teamData.Length ||
    teamData.duration;

  // If no days field found, use season type to estimate
  if (!seasonDays) {
    const seasonType = teamData.seasonType || teamData.SeasonType || "regular";
    if (seasonType === "regular") {
      seasonDays = standardDays;
    } else if (seasonType === "playoff" || seasonType === "loser") {
      seasonDays = 30; // Typical playoff/loser tournament length
    } else {
      seasonDays = standardDays; // Default fallback
    }
  }

  return seasonDays;
}

/**
 * Get week days with fallback logic
 * @param {Object} teamData - Team data object
 * @param {number} standardDays - Standard week length
 * @returns {number} Week days to use
 */
function getWeekDays(teamData, standardDays = 7) {
  return (
    teamData.days ||
    teamData.Days ||
    teamData.WeekDays ||
    teamData.weekDays ||
    teamData.Length ||
    teamData.duration ||
    standardDays
  );
}

// =============================================================================
// RATING COMPONENT UTILITIES
// =============================================================================

/**
 * Calculate weighted z-scores for multiple statistics
 * @param {Object} teamData - Team statistics data
 * @param {Array<string>} statCategories - Array of stat category names
 * @param {Object} baselines - Baseline data for each stat
 * @param {Function} weightFunction - Optional function to calculate custom weights
 * @returns {Object} Object with weightedZScore and valid stat count
 */
function calculateWeightedZScores(
  teamData,
  statCategories,
  baselines,
  weightFunction = null,
) {
  const zScores = [];
  const weights = [];

  statCategories.forEach((stat) => {
    const baseline = baselines[stat];
    if (!baseline) return;

    let value = teamData[stat] || 0;

    // Skip invalid values for ratio stats
    if ((stat === "GAA" || stat === "SVP") && value <= 0) return;

    // Calculate z-score
    let zScore = (value - baseline.mean) / baseline.std;

    // Inverse for GAA (lower is better)
    if (baseline.inverse) {
      zScore = -zScore;
    }

    // Calculate weight
    let weight = 0.1; // Default 10% weight
    if (weightFunction) {
      weight = weightFunction(stat, teamData);
    }

    zScores.push(zScore);
    weights.push(weight);
  });

  // Ensure we have valid stats to work with
  if (zScores.length === 0) {
    return { weightedZScore: 0, validStats: 0 };
  }

  // Normalize weights
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const normalizedWeights = weights.map((w) => w / totalWeight);

  // Calculate weighted average z-score
  const weightedZScore = zScores.reduce(
    (sum, zScore, i) => sum + zScore * normalizedWeights[i],
    0,
  );

  return { weightedZScore, validStats: zScores.length };
}

/**
 * Apply engagement adjustments for power ratings
 * @param {Object} teamData - Team data containing ADD, MS, BS
 * @returns {number} Total engagement adjustment
 */
function calculateEngagementAdjustment(teamData) {
  const adds = Math.min(teamData.ADD || 0, 4); // Cap at 4
  const missedStarts = teamData.MS || 0;
  const badStarts = teamData.BS || 0;

  // Engagement bonus: ADD is good (up to +3 points for max 4 adds)
  const engagementBonus = adds * 0.75;

  // Missed starts penalty: MS is bad (-1 point per missed start)
  const missedStartsPenalty = missedStarts * -1.0;

  // Bad starts penalty: BS is kind of bad (-0.3 per bad start)
  const badStartsPenalty = badStarts * -0.3;

  return engagementBonus + missedStartsPenalty + badStartsPenalty;
}

/**
 * Apply games played adjustments for power ratings
 * @param {number} gp - Games played
 * @param {number} baseRating - Base rating to adjust
 * @returns {number} Adjusted rating
 */
function applyGamesPlayedAdjustment(gp, baseRating) {
  if (gp === 0) {
    return baseRating * 0.7; // 30% reduction for no games
  } else if (gp < 3) {
    return baseRating * 0.85; // 15% reduction for very few games
  }
  return baseRating;
}

// =============================================================================
// RANKING UTILITIES
// =============================================================================

/**
 * Calculate rankings for teams within the same week
 * @param {Array} teams - Array of team objects with _powerRating property
 * @returns {Array} Array of teams with rankings assigned
 */
function calculateWeeklyRankings(teams) {
  // Sort teams by power rating (descending - highest rating = rank 1)
  teams.sort((a, b) => (b._powerRating || 0) - (a._powerRating || 0));

  // Assign rankings
  teams.forEach((team, index) => {
    team._rank = index + 1;
  });

  return teams;
}
