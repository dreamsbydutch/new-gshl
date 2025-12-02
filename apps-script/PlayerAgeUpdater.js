/**
 * GSHL Player Age Updater
 * ========================
 * Updates player ages to one decimal place based on their birth dates
 * Also updates player nhlPos and nhlTeam from most recent PlayerDayStatLine
 */

// @ts-nocheck

/**
 * MASTER FUNCTION: Update all player information
 *
 * This is a convenience function that runs all player update operations:
 * - Updates ages from birthdays
 * - Updates nhlPos from most recent PlayerDayStatLine
 * - Updates nhlTeam from most recent PlayerDayStatLine
 *
 * Usage: Run this function to perform a complete player data refresh
 */
function updateAllPlayerInfo() {
  Logger.log("╔═══════════════════════════════════════════════════════════╗");
  Logger.log("║          COMPLETE PLAYER INFO UPDATE                      ║");
  Logger.log("╚═══════════════════════════════════════════════════════════╝");

  var startTime = new Date();
  var result = updateAllPlayerAges();

  var endTime = new Date();
  var duration = (endTime - startTime) / 1000;

  Logger.log("\n╔═══════════════════════════════════════════════════════════╗");
  Logger.log("║          COMPLETE UPDATE FINISHED                         ║");
  Logger.log("╚═══════════════════════════════════════════════════════════╝");
  Logger.log("⏱️  Total duration: " + duration + " seconds");

  return result;
}

/**
 * MAIN FUNCTION: Update all player ages, positions, and teams
 *
 * This function:
 * 1. Reads all players from the Player sheet
 * 2. Calculates age from birthday field to one decimal place
 * 3. Gets the most recent PlayerDayStatLine for each player
 * 4. Updates age, nhlPos, and nhlTeam in the Player sheet
 *
 * Usage: Run this function manually or set up a trigger to run it periodically
 */
function updateAllPlayerAges() {
  Logger.log("═══════════════════════════════════════════════════════════");
  Logger.log("👤 PLAYER AGE & INFO UPDATER");
  Logger.log("═══════════════════════════════════════════════════════════");

  try {
    // Step 1: Get the Player sheet
    Logger.log("\n📊 Step 1: Opening Player sheet...");
    // Use shared sheet helper
    var sheet = getSheetByName(SPREADSHEET_ID, "Player", true);

    if (!sheet) {
      Logger.log("❌ ERROR: Player sheet not found");
      return {
        success: false,
        error: "Player sheet not found",
      };
    }

    // Step 2: Get all data
    Logger.log("📥 Step 2: Reading player data...");
    var data = sheet.getDataRange().getValues();

    if (!data || data.length <= 1) {
      Logger.log("⚠️  No player data found");
      return {
        success: true,
        updated: 0,
        skipped: 0,
        message: "No players to update",
      };
    }

    // Step 3: Find column indices
    var headers = data[0];
    var birthdayCol = headers.indexOf("birthday");
    var ageCol = headers.indexOf("age");
    var idCol = headers.indexOf("id");
    var nhlPosCol = headers.indexOf("nhlPos");
    var nhlTeamCol = headers.indexOf("nhlTeam");

    if (birthdayCol === -1) {
      Logger.log("❌ ERROR: 'birthday' column not found in Player sheet");
      return {
        success: false,
        error: "birthday column not found",
      };
    }

    if (ageCol === -1) {
      Logger.log("❌ ERROR: 'age' column not found in Player sheet");
      return {
        success: false,
        error: "age column not found",
      };
    }

    if (nhlPosCol === -1) {
      Logger.log("❌ ERROR: 'nhlPos' column not found in Player sheet");
      return {
        success: false,
        error: "nhlPos column not found",
      };
    }

    if (nhlTeamCol === -1) {
      Logger.log("❌ ERROR: 'nhlTeam' column not found in Player sheet");
      return {
        success: false,
        error: "nhlTeam column not found",
      };
    }

    Logger.log("✅ Found birthday column at index: " + birthdayCol);
    Logger.log("✅ Found age column at index: " + ageCol);
    Logger.log("✅ Found nhlPos column at index: " + nhlPosCol);
    Logger.log("✅ Found nhlTeam column at index: " + nhlTeamCol);

    // Step 3b: Get PlayerDayStatLine data
    Logger.log("\n📊 Step 3b: Reading PlayerDayStatLine data...");
    var playerDayData = getMostRecentPlayerDayStats();

    // Step 4: Calculate and update ages, positions, and teams
    Logger.log("\n🔄 Step 4: Calculating ages and updating player info...");
    var currentDate = new Date();
    var updatedCount = 0;
    var skippedCount = 0;
    var ageUpdates = [];
    var nhlPosUpdates = [];
    var nhlTeamUpdates = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var birthday = row[birthdayCol];
      var playerId = idCol !== -1 ? row[idCol] : "Row " + (i + 1);

      // Skip if no birthday
      if (!birthday) {
        skippedCount++;
        continue;
      }

      // Calculate age to one decimal place
      var age = calculateAgeWithDecimal(birthday, currentDate);

      if (age !== null) {
        // Store the age update
        ageUpdates.push({
          rowIndex: i + 1, // 1-based including header row
          value: age,
          playerId: playerId,
        });

        // Get most recent player day data for this player
        var playerDayInfo = playerDayData[playerId];
        if (playerDayInfo) {
          // Store nhlPos update if available
          if (playerDayInfo.nhlPos) {
            nhlPosUpdates.push({
              rowIndex: i + 1,
              value: playerDayInfo.nhlPos,
              playerId: playerId,
            });
          }

          // Store nhlTeam update if available
          if (playerDayInfo.nhlTeam) {
            nhlTeamUpdates.push({
              rowIndex: i + 1,
              value: playerDayInfo.nhlTeam,
              playerId: playerId,
            });
          }
        }

        updatedCount++;
      } else {
        Logger.log("⚠️  Invalid birthday for player: " + playerId);
        skippedCount++;
      }
    }

    // Step 5: Write updates back to sheet
    if (ageUpdates.length > 0) {
      Logger.log(
        "\n💾 Step 5: Writing " + ageUpdates.length + " updates to sheet...",
      );

      // Batch write ages
      groupAndApplyColumnUpdates(sheet, ageCol + 1, ageUpdates);
      Logger.log("✅ Successfully updated " + updatedCount + " player ages");

      // Batch write nhlPos
      if (nhlPosUpdates.length > 0) {
        groupAndApplyColumnUpdates(sheet, nhlPosCol + 1, nhlPosUpdates);
        Logger.log(
          "✅ Successfully updated " +
            nhlPosUpdates.length +
            " player positions",
        );
      }

      // Batch write nhlTeam
      if (nhlTeamUpdates.length > 0) {
        groupAndApplyColumnUpdates(sheet, nhlTeamCol + 1, nhlTeamUpdates);
        Logger.log(
          "✅ Successfully updated " + nhlTeamUpdates.length + " player teams",
        );
      }
    }

    // Step 6: Summary
    Logger.log("\n" + "═".repeat(60));
    Logger.log("📊 SUMMARY");
    Logger.log("═".repeat(60));
    Logger.log("✅ Updated: " + updatedCount);
    Logger.log("   - Ages: " + ageUpdates.length);
    Logger.log("   - Positions: " + nhlPosUpdates.length);
    Logger.log("   - Teams: " + nhlTeamUpdates.length);
    Logger.log("⏭️  Skipped: " + skippedCount + " (no birthday)");
    Logger.log("📅 Update date: " + formatDate(currentDate));
    Logger.log("═".repeat(60));

    return {
      success: true,
      updated: updatedCount,
      skipped: skippedCount,
      timestamp: currentDate,
    };
  } catch (error) {
    Logger.log("\n❌ ERROR: " + error.message);
    Logger.log(error.stack);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Test function to check age calculation for specific players
 *
 * Usage: Update the test cases and run this function to verify calculations
 */
function testAgeCalculation() {
  Logger.log("🧪 Testing Age Calculation");
  Logger.log("═".repeat(60));

  var currentDate = new Date();

  // Test cases - update these with real dates to test
  var testCases = [
    { name: "Test Player 1", birthday: "1995-06-15" },
    { name: "Test Player 2", birthday: "2000-12-25" },
    { name: "Test Player 3", birthday: "1988-03-10" },
  ];

  for (var i = 0; i < testCases.length; i++) {
    var test = testCases[i];
    var age = calculateAgeWithDecimal(test.birthday, currentDate);
    Logger.log(
      test.name + " (born " + test.birthday + "): " + age + " years old",
    );
  }

  Logger.log("═".repeat(60));
}

/**
 * Update a single player's age by player ID
 *
 * @param {string} playerId - The player's ID
 * @returns {Object} Result of the update
 */
function updatePlayerAgeById(playerId) {
  try {
    var sheet =
      SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Player");

    if (!sheet) {
      return { success: false, error: "Player sheet not found" };
    }

    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    var idCol = headers.indexOf("id");
    var birthdayCol = headers.indexOf("birthday");
    var ageCol = headers.indexOf("age");

    if (idCol === -1 || birthdayCol === -1 || ageCol === -1) {
      return { success: false, error: "Required columns not found" };
    }

    // Find the player
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(playerId)) {
        var birthday = data[i][birthdayCol];

        if (!birthday) {
          return { success: false, error: "Player has no birthday set" };
        }

        var age = calculateAgeWithDecimal(birthday);

        if (age !== null) {
          sheet.getRange(i + 1, ageCol + 1).setValue(age);
          Logger.log("✅ Updated player " + playerId + " age to " + age);
          return { success: true, playerId: playerId, age: age };
        } else {
          return { success: false, error: "Invalid birthday format" };
        }
      }
    }

    return { success: false, error: "Player not found" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get the most recent PlayerDayStatLine data for all players
 *
 * @returns {Object} Object keyed by playerId with nhlPos and nhlTeam values
 */
function getMostRecentPlayerDayStats() {
  Logger.log("   📊 Fetching most recent PlayerDayStatLine data...");

  try {
    var sheet = getSheetByName(
      CURRENT_PLAYERDAY_SPREADSHEET_ID,
      "PlayerDayStatLine",
      false,
    );

    if (!sheet) {
      Logger.log(
        "   ⚠️  PlayerDayStatLine sheet not found, position/team updates skipped",
      );
      return {};
    }

    var data = sheet.getDataRange().getValues();

    if (!data || data.length <= 1) {
      Logger.log("   ⚠️  No PlayerDayStatLine data found");
      return {};
    }

    var headers = data[0];
    var playerIdCol = headers.indexOf("playerId");
    var dateCol = headers.indexOf("date");
    var nhlPosCol = headers.indexOf("nhlPos");
    var nhlTeamCol = headers.indexOf("nhlTeam");

    if (
      playerIdCol === -1 ||
      dateCol === -1 ||
      nhlPosCol === -1 ||
      nhlTeamCol === -1
    ) {
      Logger.log("   ⚠️  Required columns not found in PlayerDayStatLine");
      return {};
    }

    // Build a map of playerId -> most recent record
    var playerMap = {};
    var debugCount = 0;

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var playerId = row[playerIdCol];
      var date = row[dateCol];
      var nhlPos = row[nhlPosCol];
      var nhlTeam = row[nhlTeamCol];

      if (!playerId || !date) {
        continue;
      }

      // Convert date to comparable format
      var recordDate = new Date(date);

      // If we haven't seen this player yet, or this record is more recent
      if (!playerMap[playerId] || recordDate > playerMap[playerId].date) {
        playerMap[playerId] = {
          date: recordDate,
          nhlPos: nhlPos ? nhlPos : "",
          nhlTeam: nhlTeam ? nhlTeam : "",
        };

        // Debug logging for first few updates
        if (debugCount < 5) {
          Logger.log(
            "   🔍 Player " +
              playerId +
              ": nhlTeam=" +
              nhlTeam +
              ", nhlPos=" +
              nhlPos +
              ", date=" +
              recordDate,
          );
          debugCount++;
        }
      }
    }

    Logger.log(
      "   ✅ Found most recent data for " +
        Object.keys(playerMap).length +
        " players",
    );
    return playerMap;
  } catch (error) {
    Logger.log("   ❌ Error fetching PlayerDayStatLine data: " + error.message);
    return {};
  }
}

/**
 * Debug function to check a specific player's data
 *
 * @param {string} playerId - The player's ID to debug
 */
function debugPlayerData(playerId) {
  Logger.log("═══════════════════════════════════════════════════════════");
  Logger.log("🔍 DEBUGGING PLAYER: " + playerId);
  Logger.log("═══════════════════════════════════════════════════════════");

  try {
    // Check Player sheet
    Logger.log("\n📊 Checking Player sheet...");
    var playerSheet = getSheetByName(SPREADSHEET_ID, "Player", true);
    var playerData = playerSheet.getDataRange().getValues();
    var playerHeaders = playerData[0];
    var playerIdCol = playerHeaders.indexOf("id");
    var nhlTeamCol = playerHeaders.indexOf("nhlTeam");
    var nhlPosCol = playerHeaders.indexOf("nhlPos");

    for (var i = 1; i < playerData.length; i++) {
      if (String(playerData[i][playerIdCol]) === String(playerId)) {
        Logger.log("   ✅ Found in Player sheet:");
        Logger.log("      Current nhlTeam: " + playerData[i][nhlTeamCol]);
        Logger.log("      Current nhlPos: " + playerData[i][nhlPosCol]);
        break;
      }
    }

    // Check PlayerDayStatLine sheet
    Logger.log("\n📊 Checking PlayerDayStatLine sheet...");
    var statSheet = getSheetByName(
      CURRENT_PLAYERDAY_SPREADSHEET_ID,
      "PlayerDayStatLine",
      false,
    );

    if (statSheet) {
      var statData = statSheet.getDataRange().getValues();
      var statHeaders = statData[0];
      var statPlayerIdCol = statHeaders.indexOf("playerId");
      var statDateCol = statHeaders.indexOf("date");
      var statNhlTeamCol = statHeaders.indexOf("nhlTeam");
      var statNhlPosCol = statHeaders.indexOf("nhlPos");

      var playerRecords = [];

      for (var j = 1; j < statData.length; j++) {
        if (String(statData[j][statPlayerIdCol]) === String(playerId)) {
          playerRecords.push({
            date: new Date(statData[j][statDateCol]),
            nhlTeam: statData[j][statNhlTeamCol],
            nhlPos: statData[j][statNhlPosCol],
            row: j + 1,
          });
        }
      }

      if (playerRecords.length > 0) {
        // Sort by date descending
        playerRecords.sort(function (a, b) {
          return b.date - a.date;
        });

        Logger.log(
          "   ✅ Found " +
            playerRecords.length +
            " records in PlayerDayStatLine",
        );
        Logger.log("\n   📅 Most recent 5 records:");
        for (var k = 0; k < Math.min(5, playerRecords.length); k++) {
          var rec = playerRecords[k];
          Logger.log(
            "      " +
              (k + 1) +
              ". Date: " +
              formatDate(rec.date) +
              " | nhlTeam: '" +
              rec.nhlTeam +
              "' | nhlPos: '" +
              rec.nhlPos +
              "' | Row: " +
              rec.row,
          );
        }

        Logger.log("\n   🎯 Most recent record:");
        var mostRecent = playerRecords[0];
        Logger.log("      Date: " + formatDate(mostRecent.date));
        Logger.log("      nhlTeam: '" + mostRecent.nhlTeam + "'");
        Logger.log("      nhlPos: '" + mostRecent.nhlPos + "'");
        Logger.log(
          "      nhlTeam is empty: " + (mostRecent.nhlTeam ? "No" : "Yes"),
        );
        Logger.log(
          "      nhlPos is empty: " + (mostRecent.nhlPos ? "No" : "Yes"),
        );
      } else {
        Logger.log("   ⚠️  No records found in PlayerDayStatLine");
      }
    } else {
      Logger.log("   ❌ PlayerDayStatLine sheet not found");
    }
  } catch (error) {
    Logger.log("❌ Error: " + error.message);
    Logger.log(error.stack);
  }

  Logger.log("═══════════════════════════════════════════════════════════");
}
