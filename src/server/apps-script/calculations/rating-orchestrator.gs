/**
 * Rating System Orchestrator
 * Master file that coordinates all team rating calculations and updates
 *
 * This file serves as the main entry point for the consolidated rating system,
 * providing a clean API for all rating operations.
 */

// =============================================================================
// MAIN RATING API
// =============================================================================

/**
 * Main function to update all team ratings across the entire system
 * @param {number} currentWeek - Current week number for YTD and power calculations
 * @param {string} ratingType - Specific rating type to update ('all', 'daily', 'weekly', 'season', 'ytd', 'power')
 */
function updateTeamRatings(currentWeek = 1, ratingType = "all") {
  console.log(`Starting rating update: ${ratingType}, Week: ${currentWeek}`);

  try {
    switch (ratingType.toLowerCase()) {
      case "all":
        updateAllTeamRatings(currentWeek);
        break;
      case "daily":
        updateAllTeamDayRatings();
        break;
      case "weekly":
        updateAllTeamWeekRatings();
        break;
      case "season":
        updateAllTeamSeasonRatings();
        break;
      case "ytd":
        updateAllTeamYTDRatings(currentWeek);
        break;
      case "power":
        updateAllTeamPowerRatings(currentWeek);
        break;
      default:
        throw new Error(`Unknown rating type: ${ratingType}`);
    }

    console.log(`Rating update completed successfully: ${ratingType}`);
  } catch (error) {
    console.error(`Error updating ${ratingType} ratings:`, error);
    throw error;
  }
}

/**
 * Calculate a single team's rating for any timeframe
 * @param {Object} teamData - Team statistics object
 * @param {string} ratingType - Type of rating ('daily', 'weekly', 'season', 'ytd', 'power')
 * @param {Object} options - Additional options (currentWeek, ytdRating, recentWeeks, etc.)
 * @returns {number} Calculated rating
 */
function calculateSingleTeamRating(teamData, ratingType, options = {}) {
  try {
    switch (ratingType.toLowerCase()) {
      case "daily":
        return calculateTeamDayRating(teamData);
      case "weekly":
        return calculateTeamWeekRating(teamData);
      case "season":
        return calculateTeamSeasonRating(teamData);
      case "ytd":
        const currentWeek = options.currentWeek || 1;
        const totalWeeks = options.totalWeeks || 24;
        return calculateTeamYTDRating(teamData, currentWeek, totalWeeks);
      case "power":
        const ytdRating = options.ytdRating || 50.0;
        const recentWeeks = options.recentWeeks || [];
        return calculateTeamPowerRating(teamData, ytdRating, recentWeeks);
      default:
        throw new Error(`Unknown rating type: ${ratingType}`);
    }
  } catch (error) {
    console.error(`Error calculating ${ratingType} rating:`, error);
    throw error;
  }
}

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Update ratings for multiple teams at once
 * @param {Array} teamsData - Array of team data objects
 * @param {string} ratingType - Type of rating to calculate
 * @param {Object} options - Additional options
 * @returns {Array} Array of results with team and rating
 */
function calculateMultipleTeamRatings(teamsData, ratingType, options = {}) {
  const results = [];

  try {
    teamsData.forEach((teamData, index) => {
      const rating = calculateSingleTeamRating(teamData, ratingType, options);
      results.push({
        team: teamData.Team || `Team${index + 1}`,
        rating: rating,
        data: teamData,
      });
    });

    return results;
  } catch (error) {
    console.error("Error calculating multiple team ratings:", error);
    throw error;
  }
}

/**
 * Get team rankings based on current ratings
 * @param {string} sheetName - Name of the sheet to get rankings from
 * @param {string} ratingColumn - Name of the rating column
 * @param {number} weekId - Optional week ID to filter rankings by week
 * @returns {Array} Array of team rankings
 */
function getTeamRankings(sheetName, ratingColumn = "Rating", weekId = null) {
  try {
    const workbook = getWorkbook("team stats");
    const sheet = workbook.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(`Sheet ${sheetName} not found`);
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const teamCol =
      headers.indexOf("Team") !== -1
        ? headers.indexOf("Team")
        : headers.indexOf("gshlTeamId");
    const ratingCol = headers.indexOf(ratingColumn);
    const weekCol = headers.indexOf("weekId");

    if (teamCol === -1 || ratingCol === -1) {
      throw new Error("Required columns not found");
    }

    const rankings = [];

    for (let i = 1; i < data.length; i++) {
      const rowWeekId = weekCol !== -1 ? data[i][weekCol] : null;

      // If weekId filter is specified, only include teams from that week
      if (weekId !== null && rowWeekId !== weekId) {
        continue;
      }

      rankings.push({
        team: data[i][teamCol],
        rating: data[i][ratingCol] || 0,
        weekId: rowWeekId,
      });
    }

    // Sort by rating (descending)
    rankings.sort((a, b) => b.rating - a.rating);

    // Add rank numbers
    rankings.forEach((team, index) => {
      team.rank = index + 1;
    });

    return rankings;
  } catch (error) {
    console.error("Error getting team rankings:", error);
    throw error;
  }
}

// =============================================================================
// ANALYTICS AND REPORTING
// =============================================================================

/**
 * Generate a comprehensive rating report for all teams
 * @param {number} currentWeek - Current week number
 * @returns {Object} Comprehensive rating report
 */
function generateRatingReport(currentWeek = 1) {
  try {
    console.log("Generating comprehensive rating report...");

    const report = {
      metadata: {
        generatedAt: new Date(),
        currentWeek: currentWeek,
        season: "2024-25", // TODO: Make this dynamic
      },
      rankings: {},
      statistics: {},
    };

    // Get rankings from each timeframe
    const sheets = [
      { name: "TeamDayStatLine", type: "daily", ratingCol: "Rating" },
      { name: "TeamWeekStatLine", type: "weekly", ratingCol: "Rating" },
      { name: "TeamSeasonStatLine", type: "season", ratingCol: "Rating" },
      { name: "TeamWeekStatLine", type: "ytd", ratingCol: "yearToDateRating" },
      { name: "TeamWeekStatLine", type: "power", ratingCol: "powerRating" },
    ];

    sheets.forEach((sheetInfo) => {
      try {
        report.rankings[sheetInfo.type] = getTeamRankings(
          sheetInfo.name,
          sheetInfo.ratingCol,
        );

        // Calculate basic statistics
        const ratings = report.rankings[sheetInfo.type].map(
          (team) => team.rating,
        );
        report.statistics[sheetInfo.type] = calculateRatingStatistics(ratings);
      } catch (error) {
        console.warn(
          `Could not generate ${sheetInfo.type} rankings:`,
          error.message,
        );
        report.rankings[sheetInfo.type] = [];
        report.statistics[sheetInfo.type] = {};
      }
    });

    console.log("Rating report generated successfully");
    return report;
  } catch (error) {
    console.error("Error generating rating report:", error);
    throw error;
  }
}

/**
 * Calculate basic statistics for a set of ratings
 * @param {Array} ratings - Array of rating values
 * @returns {Object} Statistics object
 */
function calculateRatingStatistics(ratings) {
  if (ratings.length === 0) return {};

  const validRatings = ratings.filter(
    (r) => typeof r === "number" && !isNaN(r),
  );
  if (validRatings.length === 0) return {};

  const sum = validRatings.reduce((a, b) => a + b, 0);
  const mean = sum / validRatings.length;
  const sorted = [...validRatings].sort((a, b) => a - b);

  return {
    count: validRatings.length,
    mean: Math.round(mean * 100) / 100,
    median:
      validRatings.length % 2 === 0
        ? (sorted[validRatings.length / 2 - 1] +
            sorted[validRatings.length / 2]) /
          2
        : sorted[Math.floor(validRatings.length / 2)],
    min: Math.min(...validRatings),
    max: Math.max(...validRatings),
    range: Math.max(...validRatings) - Math.min(...validRatings),
  };
}

// =============================================================================
// TESTING AND VALIDATION
// =============================================================================

/**
 * Run comprehensive tests on the rating system
 */
function runRatingSystemTests() {
  console.log("Running comprehensive rating system tests...");

  try {
    // Test individual calculations
    testAllRatingCalculations();

    // Test batch operations
    testBatchOperations();

    // Test utility functions
    testUtilityFunctions();

    console.log("All rating system tests passed!");
  } catch (error) {
    console.error("Rating system tests failed:", error);
    throw error;
  }
}

/**
 * Test batch operations
 */
function testBatchOperations() {
  console.log("Testing batch operations...");

  const sampleTeams = [
    { Team: "Team1", GP: 5, G: 10, A: 15, P: 25, Rating: 60.5 },
    { Team: "Team2", GP: 4, G: 8, A: 12, P: 20, Rating: 55.2 },
    { Team: "Team3", GP: 6, G: 12, A: 18, P: 30, Rating: 70.1 },
  ];

  const results = calculateMultipleTeamRatings(sampleTeams, "daily");

  if (results.length !== sampleTeams.length) {
    throw new Error("Batch calculation count mismatch");
  }

  console.log("Batch operations test passed");
}

/**
 * Test function to validate workbook and sheet access
 */
function testWorkbookAccess() {
  console.log("Testing workbook and sheet access...");

  try {
    const workbook = getWorkbook("team stats");
    console.log("✓ Successfully connected to team stats workbook");

    const sheets = [
      "TeamDayStatLine",
      "TeamWeekStatLine",
      "TeamSeasonStatLine",
    ];

    sheets.forEach((sheetName) => {
      const sheet = workbook.getSheetByName(sheetName);
      if (sheet) {
        console.log(`✓ Found sheet: ${sheetName}`);
        const headers = sheet
          .getRange(1, 1, 1, sheet.getLastColumn())
          .getValues()[0];
        console.log(`  Headers: ${headers.slice(0, 10).join(", ")}...`);

        // Check for specific rating columns
        if (sheetName === "TeamWeekStatLine") {
          const ytdCol = headers.indexOf("yearToDateRating");
          const powerCol = headers.indexOf("powerRating");
          const powerRkCol = headers.indexOf("powerRk");

          console.log(
            `  yearToDateRating column: ${ytdCol !== -1 ? ytdCol : "NOT FOUND"}`,
          );
          console.log(
            `  powerRating column: ${powerCol !== -1 ? powerCol : "NOT FOUND"}`,
          );
          console.log(
            `  powerRk column: ${powerRkCol !== -1 ? powerRkCol : "NOT FOUND"}`,
          );
        }
      } else {
        console.log(`✗ Sheet not found: ${sheetName}`);
      }
    });

    console.log("Workbook access test completed!");
  } catch (error) {
    console.error("Error in workbook access test:", error);
    throw error;
  }
}

/**
 * Test utility functions
 */
function testUtilityFunctions() {
  console.log("Testing utility functions...");

  // Test z-score to rating conversion
  const testZScore = 1.5;
  const rating = zScoreToRating(testZScore);
  if (typeof rating !== "number" || isNaN(rating)) {
    throw new Error("Z-score to rating conversion failed");
  }

  // Test variance calculation
  const testValues = [10, 20, 30, 40, 50];
  const variance = calculateVariance(testValues);
  if (typeof variance !== "number" || isNaN(variance)) {
    throw new Error("Variance calculation failed");
  }

  console.log("Utility functions test passed");
}

/**
 * Get power rankings for a specific week
 * @param {number} weekId - Week ID to get rankings for
 * @returns {Array} Array of team power rankings for the specified week
 */
function getPowerRankingsForWeek(weekId) {
  return getTeamRankings("TeamWeekStatLine", "powerRating", weekId);
}

/**
 * Get all power rankings grouped by week
 * @returns {Object} Object with weekId as keys and rankings arrays as values
 */
function getAllPowerRankingsByWeek() {
  try {
    const workbook = getWorkbook("team stats");
    const sheet = workbook.getSheetByName("TeamWeekStatLine");
    if (!sheet) {
      throw new Error("TeamWeekStatLine sheet not found");
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const teamCol =
      headers.indexOf("Team") !== -1
        ? headers.indexOf("Team")
        : headers.indexOf("gshlTeamId");
    const ratingCol = headers.indexOf("powerRating");
    const weekCol = headers.indexOf("weekId");

    if (teamCol === -1 || ratingCol === -1 || weekCol === -1) {
      throw new Error("Required columns not found");
    }

    const weekGroups = {};

    for (let i = 1; i < data.length; i++) {
      const weekId = data[i][weekCol];
      const team = data[i][teamCol];
      const rating = data[i][ratingCol] || 0;

      if (!weekGroups[weekId]) {
        weekGroups[weekId] = [];
      }

      weekGroups[weekId].push({
        team: team,
        rating: rating,
        weekId: weekId,
      });
    }

    // Sort each week's rankings
    Object.keys(weekGroups).forEach((weekId) => {
      weekGroups[weekId].sort((a, b) => b.rating - a.rating);
      weekGroups[weekId].forEach((team, index) => {
        team.rank = index + 1;
      });
    });

    return weekGroups;
  } catch (error) {
    console.error("Error getting power rankings by week:", error);
    throw error;
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick update for current week ratings (YTD and Power)
 * @param {number} currentWeek - Current week number
 */
function quickWeekUpdate(currentWeek) {
  console.log(`Quick update for week ${currentWeek}...`);
  updateTeamRatings(currentWeek, "ytd");
  updateTeamRatings(currentWeek, "power");
  console.log("Quick week update completed");
}

/**
 * Full system refresh - recalculate everything
 * @param {number} currentWeek - Current week number
 */
function fullSystemRefresh(currentWeek = 1) {
  console.log("Full system refresh initiated...");
  updateTeamRatings(currentWeek, "all");
  console.log("Full system refresh completed");
}
