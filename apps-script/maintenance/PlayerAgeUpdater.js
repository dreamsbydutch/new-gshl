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
    var idCol = headers.indexOf("id");
    var nhlPosCol = headers.indexOf("nhlPos");
    var nhlTeamCol = headers.indexOf("nhlTeam");
    var gshlTeamIdCol = headers.indexOf("gshlTeamId");
    if (gshlTeamIdCol === -1) gshlTeamIdCol = headers.indexOf("gshlTeamID");

    var lineupPosCol = headers.indexOf("lineupPos");
    if (lineupPosCol === -1) lineupPosCol = headers.indexOf("lineupPOS");
    if (lineupPosCol === -1) lineupPosCol = headers.indexOf("dailyPos");

    var overallRatingCol = headers.indexOf("overallRating");
    if (overallRatingCol === -1)
      overallRatingCol = headers.indexOf("overallRating");

    var birthdayCol = headers.indexOf("birthday");
    var ageCol = headers.indexOf("age");
    var shouldUpdateAges = birthdayCol !== -1 && ageCol !== -1;

    if (idCol === -1) {
      Logger.log("❌ ERROR: 'id' column not found in Player sheet");
      return {
        success: false,
        error: "id column not found",
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

    if (gshlTeamIdCol === -1) {
      Logger.log("❌ ERROR: 'gshlTeamId' column not found in Player sheet");
      return {
        success: false,
        error: "gshlTeamId column not found",
      };
    }

    if (lineupPosCol === -1) {
      Logger.log(
        "❌ ERROR: 'lineupPos' column not found in Player sheet (also tried dailyPos)",
      );
      return {
        success: false,
        error: "lineupPos column not found",
      };
    }

    if (overallRatingCol === -1) {
      Logger.log(
        "❌ ERROR: 'overallRating' column not found in Player sheet (also tried overallRating)",
      );
      return {
        success: false,
        error: "overallRating column not found",
      };
    }

    if (!shouldUpdateAges) {
      Logger.log(
        "⚠️  birthday/age columns missing; skipping age updates this run",
      );
    } else {
      Logger.log("✅ Found birthday column at index: " + birthdayCol);
      Logger.log("✅ Found age column at index: " + ageCol);
    }

    Logger.log("✅ Found id column at index: " + idCol);
    Logger.log("✅ Found nhlPos column at index: " + nhlPosCol);
    Logger.log("✅ Found nhlTeam column at index: " + nhlTeamCol);
    Logger.log("✅ Found gshlTeamId column at index: " + gshlTeamIdCol);
    Logger.log("✅ Found lineupPos column at index: " + lineupPosCol);
    Logger.log("✅ Found overallRating column at index: " + overallRatingCol);

    // Step 3b: Get PlayerDayStatLine data
    Logger.log("\n📊 Step 3b: Reading PlayerDayStatLine data...");
    var playerDayResult = getMostRecentPlayerDayStats();
    var playerDayData = playerDayResult.playerMap;
    var mostRecentDayKey = playerDayResult.mostRecentDayKey;
    if (mostRecentDayKey) {
      Logger.log(
        "   ✅ Most recent PlayerDayStatLine day: " + mostRecentDayKey,
      );
    }

    // Step 4: Calculate and update ages, positions, teams, and GSHL team
    Logger.log("\n🔄 Step 4: Calculating ages and updating player info...");
    var currentDate = new Date();

    // We store franchiseId (not teamId) in the Player.gshlTeamId column.
    // PlayerDayStatLine.gshlTeamId refers to the season's Team.id, so we map Team.id -> Team.franchiseId.
    var season = null;
    var seasonTeams = [];
    var teamIdToFranchiseId = {};
    var inRange =
      typeof isDateInRange === "function"
        ? isDateInRange
        : function (date, startDate, endDate) {
            try {
              var d = date instanceof Date ? date : new Date(date);
              var s =
                startDate instanceof Date ? startDate : new Date(startDate);
              var e = endDate instanceof Date ? endDate : new Date(endDate);
              if (!d || !s || !e) return false;
              if (
                isNaN(d.getTime()) ||
                isNaN(s.getTime()) ||
                isNaN(e.getTime())
              )
                return false;
              return d >= s && d <= e;
            } catch (err) {
              return false;
            }
          };

    try {
      var seasons = fetchSheetAsObjects(SPREADSHEET_ID, "Season");
      season = seasons.find((s) =>
        inRange(currentDate, s.startDate, s.endDate),
      );
      if (!season && seasons.length > 0) {
        seasons.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
        season = seasons[0];
      }

      if (season) {
        seasonTeams = fetchSheetAsObjects(SPREADSHEET_ID, "Team").filter(
          (t) => String(t.seasonId) === String(season.id),
        );
        seasonTeams.forEach((t) => {
          if (t && t.id !== undefined && t.franchiseId !== undefined) {
            teamIdToFranchiseId[String(t.id)] = String(t.franchiseId);
          }
        });
      }
    } catch (eSeason) {
      Logger.log(
        "⚠️  Unable to load Season/Team sheets for franchise mapping: " +
          eSeason.message,
      );
      season = null;
      seasonTeams = [];
      teamIdToFranchiseId = {};
    }
    var updatedCount = 0;
    var skippedBirthdayCount = 0;
    var invalidBirthdayCount = 0;
    var ageUpdates = [];
    var nhlPosUpdates = [];
    var nhlTeamUpdates = [];
    var gshlTeamIdUpdates = [];
    var lineupPosClearUpdates = [];
    var lineupPosUpdates = [];
    var gshlTeamIdSetCount = 0;
    var gshlTeamIdClearedCount = 0;

    var playerRowIndexById = {};
    var rosterByFranchiseId = {};

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var playerId = row[idCol];
      var playerKey = String(playerId);

      playerRowIndexById[playerKey] = i + 1;

      // Clear lineupPos for everyone (we'll rebuild for active rosters later)
      lineupPosClearUpdates.push({
        rowIndex: i + 1,
        value: "",
        playerId: playerKey,
      });

      // Age update is optional; don't block other updates.
      if (shouldUpdateAges) {
        var birthday = row[birthdayCol];
        if (birthday) {
          var age = calculateAgeWithDecimal(birthday, currentDate);
          if (age !== null) {
            ageUpdates.push({
              rowIndex: i + 1, // 1-based including header row
              value: age,
              playerId: playerKey,
            });
          } else {
            Logger.log("⚠️  Invalid birthday for player: " + playerKey);
            invalidBirthdayCount++;
          }
        } else {
          skippedBirthdayCount++;
        }
      }

      // Get most recent player day data for this player
      var playerDayInfo = playerDayData[playerKey];

      if (playerDayInfo) {
        // Always sync nhlPos/nhlTeam from the most recent stat line (even if blank)
        nhlPosUpdates.push({
          rowIndex: i + 1,
          value: playerDayInfo.nhlPos || "",
          playerId: playerKey,
        });

        nhlTeamUpdates.push({
          rowIndex: i + 1,
          value: playerDayInfo.nhlTeam || "",
          playerId: playerKey,
        });

        // gshlTeamId: only keep if player's latest stat line is from the most recent day
        var shouldKeepTeam =
          mostRecentDayKey && playerDayInfo.dateKey === mostRecentDayKey;
        var nextGshlTeamId = "";
        if (shouldKeepTeam) {
          var statTeamId = playerDayInfo.gshlTeamId || "";
          if (statTeamId) {
            nextGshlTeamId = teamIdToFranchiseId[String(statTeamId)] || "";
          }
        }

        gshlTeamIdUpdates.push({
          rowIndex: i + 1,
          value: nextGshlTeamId,
          playerId: playerKey,
        });

        if (nextGshlTeamId) gshlTeamIdSetCount++;
        else gshlTeamIdClearedCount++;

        // Build roster groups for lineup rebuild (based on Player sheet overallRating)
        if (nextGshlTeamId) {
          var rawPos = playerDayInfo.nhlPos || "";
          var nhlPosList = Array.isArray(rawPos)
            ? rawPos
            : String(rawPos)
                .split(",")
                .map((p) => String(p).trim())
                .filter((p) => p);

          var overallRating = row[overallRatingCol];
          var ratingNumber = 0;
          if (
            overallRating !== null &&
            overallRating !== undefined &&
            overallRating !== ""
          ) {
            ratingNumber = Number(overallRating);
            if (isNaN(ratingNumber)) ratingNumber = 0;
          }

          if (!rosterByFranchiseId[nextGshlTeamId])
            rosterByFranchiseId[nextGshlTeamId] = [];
          rosterByFranchiseId[nextGshlTeamId].push({
            playerId: playerKey,
            nhlPos: nhlPosList,
            Rating: ratingNumber,
          });
        }
      } else {
        // No stat line found: wipe gshlTeamId (player not currently active on a roster)
        gshlTeamIdUpdates.push({
          rowIndex: i + 1,
          value: "",
          playerId: playerKey,
        });
        gshlTeamIdClearedCount++;
      }

      updatedCount++;
    }

    // Step 5: Write updates back to sheet
    Logger.log("\n💾 Step 5: Writing updates to Player sheet...");

    if (ageUpdates.length > 0 && shouldUpdateAges) {
      groupAndApplyColumnUpdates(sheet, ageCol + 1, ageUpdates);
      Logger.log("✅ Updated ages for " + ageUpdates.length + " players");
    }

    if (nhlPosUpdates.length > 0) {
      groupAndApplyColumnUpdates(sheet, nhlPosCol + 1, nhlPosUpdates);
      Logger.log("✅ Updated nhlPos for " + nhlPosUpdates.length + " players");
    }

    if (nhlTeamUpdates.length > 0) {
      groupAndApplyColumnUpdates(sheet, nhlTeamCol + 1, nhlTeamUpdates);
      Logger.log(
        "✅ Updated nhlTeam for " + nhlTeamUpdates.length + " players",
      );
    }

    if (gshlTeamIdUpdates.length > 0) {
      groupAndApplyColumnUpdates(sheet, gshlTeamIdCol + 1, gshlTeamIdUpdates);
      Logger.log(
        "✅ Updated gshlTeamId for " +
          gshlTeamIdUpdates.length +
          " players (set: " +
          gshlTeamIdSetCount +
          ", cleared: " +
          gshlTeamIdClearedCount +
          ")",
      );
    }

    if (lineupPosClearUpdates.length > 0) {
      groupAndApplyColumnUpdates(
        sheet,
        lineupPosCol + 1,
        lineupPosClearUpdates,
      );
      Logger.log(
        "✅ Cleared lineupPos for " + lineupPosClearUpdates.length + " players",
      );
    }

    // Step 5b: Rebuild lineupPos for each team in the current season
    Logger.log("\n🏒 Step 5b: Building lineupPos for active rosters...");
    var lineupTeamsProcessed = 0;
    var lineupPlayersProcessed = 0;

    if (!season) {
      Logger.log("⚠️  No season found; skipping lineupPos rebuild");
    } else {
      seasonTeams.forEach((team) => {
        var franchiseId =
          team && team.franchiseId ? String(team.franchiseId) : "";
        if (!franchiseId) return;

        var roster = rosterByFranchiseId[franchiseId] || [];
        if (roster.length === 0) return;

        // Assign lineup slots purely by season rating + eligibility
        var assignments = findBestLineup(roster, false);
        roster.forEach((p) => {
          lineupPosUpdates.push({
            rowIndex: playerRowIndexById[p.playerId],
            value: assignments[p.playerId] || "BN",
            playerId: p.playerId,
          });
        });

        lineupTeamsProcessed++;
        lineupPlayersProcessed += roster.length;
      });

      if (lineupPosUpdates.length > 0) {
        groupAndApplyColumnUpdates(sheet, lineupPosCol + 1, lineupPosUpdates);
        Logger.log(
          "✅ Built lineupPos for " +
            lineupTeamsProcessed +
            " team(s) (" +
            lineupPlayersProcessed +
            " rostered players)",
        );
      } else {
        Logger.log("⚠️  No rostered players found; lineupPos not updated");
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
    Logger.log("   - GSHL Teams: " + gshlTeamIdUpdates.length);
    Logger.log("   - LineupPos cleared: " + lineupPosClearUpdates.length);
    Logger.log("   - LineupPos rebuilt: " + lineupPosUpdates.length);
    Logger.log(
      "⏭️  Skipped birthdays: " + skippedBirthdayCount + " (no birthday)",
    );
    Logger.log("⚠️  Invalid birthdays: " + invalidBirthdayCount);
    Logger.log("📅 Update date: " + formatDate(currentDate));
    Logger.log("═".repeat(60));

    return {
      success: true,
      updated: updatedCount,
      skippedBirthdays: skippedBirthdayCount,
      invalidBirthdays: invalidBirthdayCount,
      gshlTeamIdSet: gshlTeamIdSetCount,
      gshlTeamIdCleared: gshlTeamIdClearedCount,
      mostRecentPlayerDayKey: mostRecentDayKey || null,
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
      return { playerMap: {}, mostRecentDayKey: null };
    }

    var data = sheet.getDataRange().getValues();

    if (!data || data.length <= 1) {
      Logger.log("   ⚠️  No PlayerDayStatLine data found");
      return { playerMap: {}, mostRecentDayKey: null };
    }

    var headers = data[0];
    var playerIdCol = headers.indexOf("playerId");
    var dateCol = headers.indexOf("date");
    var nhlPosCol = headers.indexOf("nhlPos");
    var nhlTeamCol = headers.indexOf("nhlTeam");
    var gshlTeamIdCol = headers.indexOf("gshlTeamId");

    if (
      playerIdCol === -1 ||
      dateCol === -1 ||
      nhlPosCol === -1 ||
      nhlTeamCol === -1
    ) {
      Logger.log("   ⚠️  Required columns not found in PlayerDayStatLine");
      return { playerMap: {}, mostRecentDayKey: null };
    }

    function getDayKey(dateValue) {
      try {
        var d = dateValue instanceof Date ? dateValue : new Date(dateValue);
        if (!d || isNaN(d.getTime())) return null;
        return Utilities.formatDate(
          d,
          Session.getScriptTimeZone(),
          "yyyy-MM-dd",
        );
      } catch (e) {
        return null;
      }
    }

    // Build a map of playerId -> most recent record
    var playerMap = {};
    var debugCount = 0;
    var mostRecentDate = null;

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var playerId = row[playerIdCol];
      var date = row[dateCol];
      var nhlPos = row[nhlPosCol];
      var nhlTeam = row[nhlTeamCol];
      var gshlTeamId = gshlTeamIdCol !== -1 ? row[gshlTeamIdCol] : "";

      if (!playerId || !date) {
        continue;
      }

      // Convert date to comparable format
      var recordDate = date instanceof Date ? date : new Date(date);
      if (!recordDate || isNaN(recordDate.getTime())) continue;

      if (!mostRecentDate || recordDate > mostRecentDate) {
        mostRecentDate = recordDate;
      }

      // If we haven't seen this player yet, or this record is more recent
      var playerKey = String(playerId);

      if (!playerMap[playerKey] || recordDate > playerMap[playerKey].date) {
        playerMap[playerKey] = {
          date: recordDate,
          dateKey: getDayKey(recordDate),
          gshlTeamId: gshlTeamId ? String(gshlTeamId) : "",
          nhlPos: nhlPos ? nhlPos : "",
          nhlTeam: nhlTeam ? nhlTeam : "",
        };

        // Debug logging for first few updates
        if (debugCount < 5) {
          Logger.log(
            "   🔍 Player " +
              playerKey +
              ": gshlTeamId=" +
              gshlTeamId +
              ", nhlTeam=" +
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

    var mostRecentDayKey = mostRecentDate ? getDayKey(mostRecentDate) : null;

    Logger.log(
      "   ✅ Found most recent data for " +
        Object.keys(playerMap).length +
        " players",
    );
    return { playerMap: playerMap, mostRecentDayKey: mostRecentDayKey };
  } catch (error) {
    Logger.log("   ❌ Error fetching PlayerDayStatLine data: " + error.message);
    return { playerMap: {}, mostRecentDayKey: null };
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
