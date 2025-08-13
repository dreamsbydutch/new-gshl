/**
 * Hockey Team Rating Statistical Baselines
 *
 * These baselines are calculated from actual GSHL team performance data
 * and are used for z-score calculations in team rating systems.
 *
 * Data Sources:
 * - Team Day Baselines: From TeamDayStatLine sheet (active game days only)
 * - Team Week Baselines: From TeamWeekStatLine sheet (weeks with GP > 0)
 * - Team Season Baselines: From TeamSeasonStatLine sheet (regular season only)
 *
 * Filtering Logic:
 * - Only includes rows where teams actually played (GP > 0)
 * - Ratio stats (GAA, SVP) only include values > 0
 * - Counting stats include zeros only when teams had offensive activity
 * - Season data excludes playoff and loser tournament games
 */

// =============================================================================
// TEAM DAY BASELINES
// =============================================================================

/**
 * Statistical baselines for team daily performance
 * Based on analysis of 14,146 team-days where GP > 0 and teams had meaningful activity
 * Source: TeamDayStatLine sheet analysis
 */
const TEAM_DAY_BASELINES = {
  // Games and basic stats
  GP: { mean: 6.586, std: 3.613 },
  G: { mean: 1.52, std: 1.485 },
  A: { mean: 2.527, std: 2.098 },
  P: { mean: 4.047, std: 2.988 },

  // Special teams and shots
  PPP: { mean: 1.194, std: 1.34 },
  SOG: { mean: 13.742, std: 8.29 },

  // Physical stats
  HIT: { mean: 6.305, std: 4.624 },
  BLK: { mean: 4.529, std: 3.387 },

  // Goalie stats
  W: { mean: 0.201, std: 0.401 },
  GAA: { mean: 2.566, std: 1.121, inverse: true },
  SVP: { mean: 0.933, std: 0.035 },
};

// =============================================================================
// TEAM WEEK BASELINES
// =============================================================================

/**
 * Statistical baselines for team weekly performance
 * Based on analysis of 2,046 team-weeks where GP > 0 and teams had meaningful activity
 * Source: TeamWeekStatLine sheet analysis
 */
const TEAM_WEEK_BASELINES = {
  // Games and basic stats
  GP: { mean: 45.534, std: 8.106 },
  G: { mean: 10.353, std: 4.246 },
  A: { mean: 17.214, std: 6.085 },
  P: { mean: 27.567, std: 8.914 },

  // Special teams and shots
  PPP: { mean: 8.13, std: 3.922 },
  SOG: { mean: 93.601, std: 24.162 },

  // Physical stats
  HIT: { mean: 43.147, std: 15.001 },
  BLK: { mean: 30.968, std: 9.439 },

  // Goalie stats
  W: { mean: 1.373, std: 0.95 },
  GAA: { mean: 2.625, std: 0.968, inverse: true },
  SVP: { mean: 0.921, std: 0.027 },
};

// =============================================================================
// TEAM SEASON BASELINES
// =============================================================================

/**
 * Statistical baselines for team season performance
 * Based on analysis of 96 regular season team performances only
 * Source: TeamSeasonStatLine sheet analysis (excludes playoff and loser tournament)
 */
const TEAM_SEASON_BASELINES = {
  // Games and basic stats
  GP: { mean: 917.208, std: 136.976 },
  G: { mean: 207.146, std: 50.317 },
  A: { mean: 345.417, std: 79.046 },
  P: { mean: 552.563, std: 126.05 },

  // Special teams and shots
  PPP: { mean: 163.479, std: 46.896 },
  SOG: { mean: 1879.781, std: 388.139 },

  // Physical stats
  HIT: { mean: 864.823, std: 188.489 },
  BLK: { mean: 622.896, std: 140.132 },

  // Goalie stats
  W: { mean: 27.521, std: 6.782 },
  GAA: { mean: 2.722, std: 0.262, inverse: true },
  SVP: { mean: 0.91, std: 0.009 },
};

// =============================================================================
// BASELINE SELECTION UTILITIES
// =============================================================================

/**
 * Get the appropriate baseline for a given time period
 * @param {string} period - 'day', 'week', or 'season'
 * @returns {Object} The baseline constants for that period
 */
function getRatingBaseline(period) {
  switch (period.toLowerCase()) {
    case "day":
    case "daily":
      return TEAM_DAY_BASELINES;
    case "week":
    case "weekly":
      return TEAM_WEEK_BASELINES;
    case "season":
    case "seasonal":
      return TEAM_SEASON_BASELINES;
    default:
      throw new Error(
        `Unknown period: ${period}. Use 'day', 'week', or 'season'.`,
      );
  }
}

/**
 * Get baseline statistics for a specific stat and period
 * @param {string} stat - The statistic name (e.g., 'G', 'A', 'GAA')
 * @param {string} period - 'day', 'week', or 'season'
 * @returns {Object} Object with mean, std, and inverse properties
 */
function getStatBaseline(stat, period) {
  const baseline = getRatingBaseline(period);

  if (!baseline[stat]) {
    throw new Error(`Stat '${stat}' not found in ${period} baselines`);
  }

  return baseline[stat];
}

// =============================================================================
// BASELINE VALIDATION
// =============================================================================

/**
 * Validate that all required stats have baselines for all periods
 * @returns {boolean} True if all baselines are present
 */
function validateBaselines() {
  const requiredStats = [
    "GP",
    "G",
    "A",
    "P",
    "PPP",
    "SOG",
    "HIT",
    "BLK",
    "W",
    "GAA",
    "SVP",
  ];
  const periods = ["day", "week", "season"];

  let isValid = true;

  periods.forEach((period) => {
    const baseline = getRatingBaseline(period);

    requiredStats.forEach((stat) => {
      if (!baseline[stat]) {
        console.error(`Missing baseline for ${stat} in ${period} period`);
        isValid = false;
      } else if (
        baseline[stat].mean === undefined ||
        baseline[stat].std === undefined
      ) {
        console.error(`Incomplete baseline for ${stat} in ${period} period`);
        isValid = false;
      }
    });
  });

  return isValid;
}

/**
 * Display summary of all baselines
 */
function displayBaselineSummary() {
  console.log("HOCKEY RATING BASELINES SUMMARY");
  console.log("===============================");

  const periods = ["day", "week", "season"];
  const stats = [
    "GP",
    "G",
    "A",
    "P",
    "PPP",
    "SOG",
    "HIT",
    "BLK",
    "W",
    "GAA",
    "SVP",
  ];

  periods.forEach((period) => {
    console.log(`\n${period.toUpperCase()} BASELINES:`);
    const baseline = getRatingBaseline(period);

    stats.forEach((stat) => {
      if (baseline[stat]) {
        const inverse = baseline[stat].inverse ? " (inverse)" : "";
        console.log(
          `  ${stat}: mean=${baseline[stat].mean}, std=${baseline[stat].std}${inverse}`,
        );
      }
    });
  });
}
