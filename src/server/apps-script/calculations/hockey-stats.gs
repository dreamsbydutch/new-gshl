/**
 * Hockey Team Rating Calculator - Consolidated Version
 * Core rating calculation functions for team daily, weekly, and season performance
 *
 * This file uses utility functions from rating-utils.gs for improved efficiency
 * and maintainability.
 *
 * Rating Methodology:
 * - Uses 10 stat categories weighted evenly (10% each)
 * - Goalie stats (GAA/SVP) dynamically weighted by TOI/150 for realistic impact
 * - GP factor: Lower games played = better efficiency bonus
 * - MS penalty: Missed starts dock rating for missed opportunities
 * - Week normalization: Volume stats adjusted based on week length (7-day standard)
 * - Season normalization: Volume stats adjusted based on season length (165-day standard)
 * - YTD projection: Accumulated stats projected to full season with confidence adjustment
 * - Power rating: Current form with engagement and trend analysis
 * - Scale: 0-100+ (uncapped for exceptional performance)
 */

// =============================================================================
// RATING CALCULATION FUNCTIONS
// =============================================================================

/**
 * Calculate team daily rating
 * @param {Object} teamDay - Team daily statistics object
 * @returns {number} Overall rating from 0-100+ with 2 decimal places
 */
function calculateTeamDayRating(teamDay) {
  // Check if this is a meaningful performance day
  const gp = teamDay.GP || 0;
  if (gp <= 0) {
    return 0.0; // No games = no rating
  }

  // 10 main statistical categories
  const statCategories = [
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

  // Weight function for goalie stats based on TOI
  const weightFunction = (stat, data) => {
    if (stat === "GAA" || stat === "SVP") {
      const toi = data.TOI || 0;
      return Math.min(0.1, Math.max(0, toi / 600)); // Cap at 10%, minimum 0
    }
    return 0.1; // Regular stats get standard 10% weight
  };

  // Calculate weighted z-scores
  const { weightedZScore, validStats } = calculateWeightedZScores(
    teamDay,
    statCategories,
    TEAM_DAY_BASELINES,
    weightFunction,
  );

  if (validStats === 0) return 50.0; // Neutral if no valid stats

  // Convert to base rating
  let baseRating = zScoreToRating(weightedZScore);

  // Apply efficiency factor
  const efficiencyFactor = calculateEfficiencyFactor(gp, TEAM_DAY_BASELINES.GP);
  baseRating = baseRating * (1 + efficiencyFactor);

  // Apply missed starts penalty
  const msPenalty = calculateMissedStartsPenalty(teamDay.MS, -0.5);
  const finalRating = baseRating + msPenalty;

  // Ensure minimum of 0
  return Math.round(finalRating * 125) / 100;
}

/**
 * Calculate team weekly rating
 * @param {Object} teamWeek - Team weekly statistics object
 * @returns {number} Overall rating from 0-100+ with 2 decimal places
 */
function calculateTeamWeekRating(teamWeek) {
  // Check if this is a meaningful performance week
  const gs = teamWeek.GS || 0;
  if (gs <= 0) {
    return 0.0; // No games = no rating
  }

  // Week length normalization
  const standardWeekDays = 7;
  const weekDays = getWeekDays(teamWeek, standardWeekDays);
  const daysNormalizationFactor = calculateDaysNormalizationFactor(
    standardWeekDays,
    weekDays,
    0.4,
  );

  // 10 main statistical categories
  const statCategories = [
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

  // Apply normalization to volume stats
  const normalizedTeamWeek = { ...teamWeek };
  statCategories.forEach((stat) => {
    if (stat !== "GAA" && stat !== "SVP") {
      normalizedTeamWeek[stat] =
        (teamWeek[stat] || 0) * daysNormalizationFactor;
    }
  });

  // Calculate weighted z-scores
  const { weightedZScore, validStats } = calculateWeightedZScores(
    normalizedTeamWeek,
    statCategories,
    TEAM_WEEK_BASELINES,
  );

  if (validStats === 0) return 50.0;

  // Convert to base rating
  let baseRating = zScoreToRating(weightedZScore);

  // Apply efficiency factor
  const efficiencyFactor = calculateEfficiencyFactor(
    teamWeek.GP,
    TEAM_WEEK_BASELINES.GP,
  );
  baseRating = baseRating * (1 + efficiencyFactor);

  // Apply missed starts penalty
  const msPenalty = calculateMissedStartsPenalty(teamWeek.MS, -0.25);
  const finalRating = baseRating + msPenalty;

  return Math.round(finalRating * 125) / 100;
}

/**
 * Calculate team season rating
 * @param {Object} teamSeason - Team season statistics object
 * @returns {number} Overall rating from 0-100+ with 2 decimal places
 */
function calculateTeamSeasonRating(teamSeason) {
  // Season length normalization
  const standardSeasonDays = 165;
  const seasonDays = getSeasonDays(teamSeason, standardSeasonDays);
  const daysNormalizationFactor = calculateDaysNormalizationFactor(
    standardSeasonDays,
    seasonDays,
    0.5,
  );

  // 10 main statistical categories
  const statCategories = [
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

  // Apply normalization to volume stats
  const normalizedTeamSeason = { ...teamSeason };
  statCategories.forEach((stat) => {
    if (stat !== "GAA" && stat !== "SVP") {
      normalizedTeamSeason[stat] =
        (teamSeason[stat] || 0) * daysNormalizationFactor;
    }
  });

  // Calculate weighted z-scores
  const { weightedZScore, validStats } = calculateWeightedZScores(
    normalizedTeamSeason,
    statCategories,
    TEAM_SEASON_BASELINES,
  );

  if (validStats === 0) return 50.0;

  // Convert to base rating
  let baseRating = zScoreToRating(weightedZScore);

  // Apply efficiency factor
  const efficiencyFactor = calculateEfficiencyFactor(
    teamSeason.GP,
    TEAM_SEASON_BASELINES.GP,
  );
  baseRating = baseRating * (1 + efficiencyFactor);

  // Apply missed starts penalty
  const msPenalty = calculateMissedStartsPenalty(teamSeason.MS, -0.025);
  const finalRating = baseRating + msPenalty;

  return Math.round((finalRating + 30) * 100) / 100;
}

/**
 * Calculate team year-to-date rating
 * @param {Object} teamYTD - Team year-to-date statistics object
 * @param {number} weeksPlayed - Number of weeks played so far
 * @param {number} totalSeasonWeeks - Total weeks in the season (defaults to 24)
 * @returns {number} Overall YTD rating from 0-100+ with 2 decimal places
 */
function calculateTeamYTDRating(teamYTD, weeksPlayed, totalSeasonWeeks = 24) {
  if (!weeksPlayed || weeksPlayed <= 0) {
    return 0.0;
  }

  // Season projection factor
  const seasonProjectionFactor = totalSeasonWeeks / weeksPlayed;

  // 10 main statistical categories
  const statCategories = [
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

  // Project volume stats to full season
  const projectedTeamYTD = { ...teamYTD };
  statCategories.forEach((stat) => {
    if (stat !== "GAA" && stat !== "SVP") {
      projectedTeamYTD[stat] = (teamYTD[stat] || 0) * seasonProjectionFactor;
    }
  });

  // Calculate weighted z-scores using season baselines
  const { weightedZScore, validStats } = calculateWeightedZScores(
    projectedTeamYTD,
    statCategories,
    TEAM_SEASON_BASELINES,
  );

  if (validStats === 0) return 50.0;

  // Convert to base rating
  let baseRating = zScoreToRating(weightedZScore);

  // Apply reduced efficiency factor for YTD (more uncertainty)
  const projectedGP = (teamYTD.GP || 0) * seasonProjectionFactor;
  const efficiencyFactor = calculateEfficiencyFactor(
    projectedGP,
    TEAM_SEASON_BASELINES.GP,
    0.1,
    0.03,
  );
  baseRating = baseRating * (1 + efficiencyFactor);

  // Apply missed starts penalty
  const projectedMS = (teamYTD.MS || 0) * seasonProjectionFactor;
  const msPenalty = projectedMS * -0.025;
  const finalRating = baseRating + msPenalty;

  // Early season confidence adjustment
  const confidenceFactor = Math.min(1.0, 0.5 + (weeksPlayed - 1) * 0.0625);
  const adjustedRating =
    finalRating * confidenceFactor + 50.0 * (1 - confidenceFactor);

  return Math.round(adjustedRating * 100) / 100;
}

/**
 * Calculate team power rating
 * @param {Object} teamWeek - Team weekly statistics object
 * @param {number} ytdRating - Year-to-date rating for context
 * @param {Array} recentWeeks - Array of recent team weeks for trend analysis
 * @returns {number} Power rating from 0-100+ with 2 decimal places
 */
function calculateTeamPowerRating(teamWeek, ytdRating, recentWeeks = []) {
  // Base on current week's rating (60% weight)
  const currentWeekRating = teamWeek.Rating || 50.0;
  let powerRating = currentWeekRating * 0.6;

  // Add year-to-date rating for season context (25% weight)
  const seasonContext = (ytdRating || 50.0) * 0.25;
  powerRating += seasonContext;

  // Recent form trend analysis (15% weight)
  let trendComponent = 50.0;
  if (recentWeeks && recentWeeks.length > 0) {
    let weightedSum = 0;
    let totalWeight = 0;

    recentWeeks.forEach((week, index) => {
      const weight = index + 1; // More recent weeks get higher weight
      const rating = week.Rating || 50.0;
      weightedSum += rating * weight;
      totalWeight += weight;
    });

    if (totalWeight > 0) {
      const recentAvg = weightedSum / totalWeight;
      const seasonAvg = ytdRating || 50.0;
      const trendMultiplier = recentAvg / Math.max(seasonAvg, 25);
      trendComponent = Math.min(100, Math.max(0, 50 * trendMultiplier));
    }
  }
  powerRating += trendComponent * 0.15;

  // Apply engagement adjustments
  powerRating += calculateEngagementAdjustment(teamWeek);

  // Apply games played factor
  powerRating = applyGamesPlayedAdjustment(teamWeek.GP || 0, powerRating);

  // Volatility adjustment
  if (recentWeeks && recentWeeks.length >= 2) {
    const recentRatings = recentWeeks.map((w) => w.Rating || 50.0);
    const variance = calculateVariance(recentRatings);
    const volatilityPenalty = Math.min(3, variance / 50);
    powerRating -= volatilityPenalty;
  }

  // Ensure reasonable bounds
  powerRating = Math.max(0, Math.min(120, powerRating));

  return Math.round(powerRating * 100) / 100;
}

// =============================================================================
// BATCH RATING UPDATE FUNCTIONS
// =============================================================================

/**
 * Update all team year-to-date ratings on TeamYTDStatLine sheet
 * @param {number} currentWeek - Current week number (1-based)
 */
function updateAllTeamYTDRatings(currentWeek = 1) {
  console.log(`Starting YTD rating update for week ${currentWeek}...`);

  try {
    const sheet =
      SpreadsheetApp.openById(GSHL_SHEET_ID).getSheetByName("TeamYTDStatLine");
    if (!sheet) {
      throw new Error("TeamYTDStatLine sheet not found");
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Find column indices
    const ratingCol = headers.indexOf("Rating") + 1;
    const rankCol = headers.indexOf("Rank") + 1;

    if (!ratingCol) {
      throw new Error("Rating column not found in TeamYTDStatLine sheet");
    }

    const ratings = [];

    // Process each team row (skip header)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const teamYTD = {};

      // Map row data to object
      headers.forEach((header, index) => {
        teamYTD[header] = row[index];
      });

      // Calculate YTD rating
      const ytdRating = calculateTeamYTDRating(teamYTD, currentWeek, 24);

      // Update rating in sheet
      sheet.getRange(i + 1, ratingCol).setValue(ytdRating);

      ratings.push({
        row: i + 1,
        team: teamYTD.Team || `Team${i}`,
        rating: ytdRating,
      });

      console.log(`Team ${teamYTD.Team || i}: YTD Rating = ${ytdRating}`);
    }

    // Calculate and update rankings if rank column exists
    if (rankCol) {
      updateRankings(sheet, ratings, rankCol);
    }

    console.log(`YTD rating update completed for ${ratings.length} teams.`);
  } catch (error) {
    console.error("Error updating YTD ratings:", error);
    throw error;
  }
}

/**
 * Update all team power ratings on TeamWeekStatLine sheet
 * @param {number} currentWeek - Current week number (1-based)
 */
function updateAllTeamPowerRatings(currentWeek = 1) {
  console.log(`Starting power rating update for week ${currentWeek}...`);

  try {
    const weekSheet =
      SpreadsheetApp.openById(GSHL_SHEET_ID).getSheetByName("TeamWeekStatLine");
    const ytdSheet =
      SpreadsheetApp.openById(GSHL_SHEET_ID).getSheetByName("TeamYTDStatLine");

    if (!weekSheet) {
      throw new Error("TeamWeekStatLine sheet not found");
    }

    const weekData = weekSheet.getDataRange().getValues();
    const weekHeaders = weekData[0];

    // Get YTD data for context
    const ytdData = ytdSheet ? ytdSheet.getDataRange().getValues() : [];
    const ytdHeaders = ytdData.length > 0 ? ytdData[0] : [];

    // Find column indices
    const powerRatingCol = weekHeaders.indexOf("PowerRating") + 1;
    const powerRankCol = weekHeaders.indexOf("PowerRank") + 1;

    if (!powerRatingCol) {
      throw new Error("PowerRating column not found in TeamWeekStatLine sheet");
    }

    const powerRatings = [];

    // Process each team week (skip header)
    for (let i = 1; i < weekData.length; i++) {
      const row = weekData[i];
      const teamWeek = {};

      // Map row data to object
      weekHeaders.forEach((header, index) => {
        teamWeek[header] = row[index];
      });

      // Get YTD rating for this team
      let ytdRating = 50.0; // Default
      if (ytdData.length > 0) {
        const ytdRow = ytdData.find(
          (row) => row[ytdHeaders.indexOf("Team")] === teamWeek.Team,
        );
        if (ytdRow) {
          ytdRating = ytdRow[ytdHeaders.indexOf("Rating")] || 50.0;
        }
      }

      // Get recent weeks for trend analysis (simplified - just use current week for now)
      const recentWeeks = [teamWeek]; // TODO: Implement proper recent weeks lookup

      // Calculate power rating
      const powerRating = calculateTeamPowerRating(
        teamWeek,
        ytdRating,
        recentWeeks,
      );

      // Update power rating in sheet
      weekSheet.getRange(i + 1, powerRatingCol).setValue(powerRating);

      powerRatings.push({
        row: i + 1,
        team: teamWeek.Team || `Team${i}`,
        rating: powerRating,
      });

      console.log(`Team ${teamWeek.Team || i}: Power Rating = ${powerRating}`);
    }

    // Calculate and update power rankings if column exists
    if (powerRankCol) {
      updateRankings(weekSheet, powerRatings, powerRankCol);
    }

    console.log(
      `Power rating update completed for ${powerRatings.length} teams.`,
    );
  } catch (error) {
    console.error("Error updating power ratings:", error);
    throw error;
  }
}
