/**
 * Team Rating Updater - Consolidated Version
 * Batch update functions for calculating and updating team ratings across all sheets
 *
 * This file uses utility functions from rating-utils.gs for improved efficiency
 * and maintainability.
 */

// =============================================================================
// BATCH RATING UPDATE FUNCTIONS
// =============================================================================

/**
 * Update all team ratings across all timeframes (daily, weekly, season, YTD, power)
 * @param {number} currentWeek - Current week number for YTD and power rating calculations
 */
function updateAllTeamRatings(currentWeek = 1) {
  console.log("Starting comprehensive team rating update...");

  try {
    updateAllTeamDayRatings();
    updateAllTeamWeekRatings();
    updateAllTeamSeasonRatings();
    updateAllTeamYTDRatings(currentWeek);
    updateAllTeamPowerRatings(currentWeek);

    console.log("All team ratings updated successfully!");
  } catch (error) {
    console.error("Error in comprehensive rating update:", error);
    throw error;
  }
}

/**
 * Update all team daily ratings on TeamDayStatLine sheet
 */
function updateAllTeamDayRatings() {
  console.log("Starting daily rating update...");

  try {
    const workbook = getWorkbook("team stats");
    const sheet = workbook.getSheetByName("TeamDayStatLine");
    if (!sheet) {
      throw new Error("TeamDayStatLine sheet not found");
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const ratingCol = headers.indexOf("Rating") + 1;

    const ratings = [];

    for (let i = 1; i < data.length; i++) {
      const teamDay = createObjectFromRow(data[i], headers);
      const rating = calculateTeamDayRating(teamDay);

      sheet.getRange(i + 1, ratingCol).setValue(rating);

      ratings.push({
        row: i + 1,
        team: teamDay.Team || `Team${i}`,
        rating: rating,
      });
    }

    console.log(`Daily rating update completed for ${ratings.length} teams.`);
  } catch (error) {
    console.error("Error updating daily ratings:", error);
    throw error;
  }
}

/**
 * Update all team weekly ratings on TeamWeekStatLine sheet
 */
function updateAllTeamWeekRatings() {
  console.log("Starting weekly rating update...");

  try {
    const workbook = getWorkbook("team stats");
    const sheet = workbook.getSheetByName("TeamWeekStatLine");
    if (!sheet) {
      throw new Error("TeamWeekStatLine sheet not found");
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const ratingCol = headers.indexOf("Rating") + 1;

    const ratings = [];

    for (let i = 1; i < data.length; i++) {
      const teamWeek = createObjectFromRow(data[i], headers);
      const rating = calculateTeamWeekRating(teamWeek);

      sheet.getRange(i + 1, ratingCol).setValue(rating);

      ratings.push({
        row: i + 1,
        team: teamWeek.Team || `Team${i}`,
        rating: rating,
      });
    }

    console.log(`Weekly rating update completed for ${ratings.length} teams.`);
  } catch (error) {
    console.error("Error updating weekly ratings:", error);
    throw error;
  }
}

/**
 * Update all team season ratings on TeamSeasonStatLine sheet
 */
function updateAllTeamSeasonRatings() {
  console.log("Starting season rating update...");

  try {
    const workbook = getWorkbook("team stats");
    const sheet = workbook.getSheetByName("TeamSeasonStatLine");
    if (!sheet) {
      throw new Error("TeamSeasonStatLine sheet not found");
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const ratingCol = headers.indexOf("Rating") + 1;

    const ratings = [];

    for (let i = 1; i < data.length; i++) {
      const teamSeason = createObjectFromRow(data[i], headers);
      const rating = calculateTeamSeasonRating(teamSeason);

      sheet.getRange(i + 1, ratingCol).setValue(rating);

      ratings.push({
        row: i + 1,
        team: teamSeason.Team || `Team${i}`,
        rating: rating,
      });
    }
    console.log(`Season rating upd
      ate completed for ${ratings.length} teams.`);
  } catch (error) {
    console.error("Error updating season ratings:", error);
    throw error;
  }
}

/**
 * Update all team year-to-date ratings on TeamWeekStatLine sheet
 * @param {number} currentWeek - Current week number (1-based)
 */
function updateAllTeamYTDRatings(currentWeek = 1) {
  console.log(`Starting YTD rating update for week ${currentWeek}...`);

  try {
    const workbook = getWorkbook("team stats");
    const sheet = workbook.getSheetByName("TeamWeekStatLine");
    if (!sheet) {
      throw new Error("TeamWeekStatLine sheet not found");
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const ratingCol = headers.indexOf("yearToDateRating") + 1;

    if (!ratingCol) {
      throw new Error(
        "yearToDateRating column not found in TeamWeekStatLine sheet",
      );
    }

    const ratings = [];

    for (let i = 1; i < data.length; i++) {
      const teamYTD = createObjectFromRow(data[i], headers);
      const rating = calculateTeamYTDRating(teamYTD, currentWeek, 24);

      sheet.getRange(i + 1, ratingCol).setValue(rating);

      ratings.push({
        row: i + 1,
        team: teamYTD.gshlTeamId || teamYTD.Team || `Team${i}`,
        rating: rating,
      });
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
    const workbook = getWorkbook("team stats");
    const weekSheet = workbook.getSheetByName("TeamWeekStatLine");

    if (!weekSheet) {
      throw new Error("TeamWeekStatLine sheet not found");
    }

    const weekData = weekSheet.getDataRange().getValues();
    const weekHeaders = weekData[0];

    const powerRatingCol = weekHeaders.indexOf("powerRating") + 1;
    const powerRankCol = weekHeaders.indexOf("powerRk") + 1;

    if (!powerRatingCol) {
      throw new Error("powerRating column not found in TeamWeekStatLine sheet");
    }

    const powerRatings = [];
    const weekGroups = {}; // Group teams by weekId

    for (let i = 1; i < weekData.length; i++) {
      const teamWeek = createObjectFromRow(weekData[i], weekHeaders);

      // Get recent weeks for trend analysis (simplified - use current week for now)
      const recentWeeks = [teamWeek]; // TODO: Implement proper recent weeks lookup

      const powerRating = calculateTeamPowerRating(
        teamWeek,
        ytdRating,
        recentWeeks,
      );

      weekSheet.getRange(i + 1, powerRatingCol).setValue(powerRating);

      const weekId = teamWeek.weekId || teamWeek.Week || "default";

      const teamRating = {
        row: i + 1,
        team: teamWeek.gshlTeamId || teamWeek.Team || `Team${i}`,
        rating: powerRating,
        weekId: weekId,
      };

      powerRatings.push(teamRating);

      // Group by weekId for separate ranking
      if (!weekGroups[weekId]) {
        weekGroups[weekId] = [];
      }
      weekGroups[weekId].push(teamRating);
    }

    // Update rankings within each week group
    if (powerRankCol) {
      updateWeeklyRankings(weekSheet, weekGroups, powerRankCol);
    }

    console.log(
      `Power rating update completed for ${powerRatings.length} teams.`,
    );
  } catch (error) {
    console.error("Error updating power ratings:", error);
    throw error;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create an object from a spreadsheet row using headers
 * @param {Array} row - Row data array
 * @param {Array} headers - Header names array
 * @returns {Object} Object with header names as keys
 */
function createObjectFromRow(row, headers) {
  const obj = {};
  headers.forEach((header, index) => {
    obj[header] = row[index];
  });
  return obj;
}

/**
 * Update rankings in a sheet based on ratings
 * @param {Sheet} sheet - Google Sheets sheet object
 * @param {Array} ratings - Array of rating objects with row, team, and rating
 * @param {number} rankCol - Column number for rankings (1-based)
 */
function updateRankings(sheet, ratings, rankCol) {
  // Sort by rating (descending)
  ratings.sort((a, b) => b.rating - a.rating);

  // Update rankings
  ratings.forEach((item, index) => {
    const rank = index + 1;
    sheet.getRange(item.row, rankCol).setValue(rank);
  });

  console.log("Rankings updated successfully.");
}

/**
 * Update rankings within each week group
 * @param {Sheet} sheet - Google Sheets sheet object
 * @param {Object} weekGroups - Object with weekId as keys and arrays of team ratings as values
 * @param {number} rankCol - Column number for rankings (1-based)
 */
function updateWeeklyRankings(sheet, weekGroups, rankCol) {
  Object.keys(weekGroups).forEach((weekId) => {
    const weekTeams = weekGroups[weekId];

    // Sort teams within this week by rating (descending)
    weekTeams.sort((a, b) => b.rating - a.rating);

    // Update rankings for this week
    weekTeams.forEach((team, index) => {
      const rank = index + 1;
      sheet.getRange(team.row, rankCol).setValue(rank);
    });

    console.log(`Week ${weekId}: Ranked ${weekTeams.length} teams`);
  });

  console.log("Weekly rankings updated successfully.");
}

// =============================================================================
// TESTING AND VALIDATION FUNCTIONS
// =============================================================================

/**
 * Test function to validate all rating calculations
 */
function testAllRatingCalculations() {
  console.log("Testing all rating calculations...");

  try {
    // Test sample data for each rating type
    const sampleDay = {
      Team: "TEST",
      GP: 2,
      G: 5,
      A: 8,
      P: 13,
      PPP: 3,
      SOG: 25,
      HIT: 15,
      BLK: 8,
      W: 2,
      GAA: 2.5,
      SVP: 0.92,
      TOI: 120,
      MS: 0,
    };

    const sampleWeek = {
      Team: "TEST",
      GS: 4,
      GP: 7,
      G: 12,
      A: 18,
      P: 30,
      PPP: 8,
      SOG: 60,
      HIT: 45,
      BLK: 20,
      W: 4,
      GAA: 2.8,
      SVP: 0.915,
      MS: 1,
      days: 7,
    };

    const sampleSeason = {
      Team: "TEST",
      GP: 82,
      G: 250,
      A: 380,
      P: 630,
      PPP: 120,
      SOG: 2500,
      HIT: 1800,
      BLK: 1200,
      W: 45,
      GAA: 2.75,
      SVP: 0.912,
      MS: 5,
      days: 165,
    };

    console.log("Day Rating:", calculateTeamDayRating(sampleDay));
    console.log("Week Rating:", calculateTeamWeekRating(sampleWeek));
    console.log("Season Rating:", calculateTeamSeasonRating(sampleSeason));
    console.log("YTD Rating:", calculateTeamYTDRating(sampleWeek, 5, 24));
    console.log(
      "Power Rating:",
      calculateTeamPowerRating(sampleWeek, 65.5, [sampleWeek]),
    );

    console.log("All rating calculations tested successfully!");
  } catch (error) {
    console.error("Error in rating calculation tests:", error);
    throw error;
  }
}
