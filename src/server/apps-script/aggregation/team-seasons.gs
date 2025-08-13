/**
 * Team Seasonal Aggregation Functions
 * Handles aggregation of team weekly statistics into seasonal summaries
 */

/**
 * Aggregate team weekly statistics into seasonal summaries
 * Run this to process team weeks into seasonal stats
 */
function aggregateTeamSeasons() {
  try {
    console.log("Starting team seasons aggregation...");

    // Load team weekly data with type-safe reading
    const workbook = getWorkbook("team stats");
    const teamWeeksResult = readTypedSheet(workbook, "TeamWeekStatLine");

    if (!teamWeeksResult.success) {
      return { success: false, error: teamWeeksResult.error };
    }

    const teamWeeks = teamWeeksResult.data;
    if (teamWeeks.length === 0) {
      console.log("No team weeks found to aggregate");
      return { success: false, error: "No data found" };
    }

    // Load week metadata to determine season type
    const generalWorkbook = getWorkbook("general");
    const weekResult = readTypedSheet(generalWorkbook, "Week");

    if (!weekResult.success) {
      return {
        success: false,
        error: `Failed to load week data: ${weekResult.error}`,
      };
    }

    // Load matchup data to calculate team wins/losses
    const matchupResult = readTypedSheet(generalWorkbook, "Matchup");

    if (!matchupResult.success) {
      return {
        success: false,
        error: `Failed to load matchup data: ${matchupResult.error}`,
      };
    }

    // Create week type lookup
    const weekTypeLookup = {};
    weekResult.data.forEach((week) => {
      weekTypeLookup[week.id] = {
        weekType: week.weekType,
        isPlayoffs: week.isPlayoffs,
      };
    });

    // Create matchup lookup by team and season type
    const teamMatchups = {};

    matchupResult.data.forEach((matchup) => {
      if (!matchup.isComplete) return; // Only count completed games

      const weekInfo = weekTypeLookup[matchup.weekId];
      if (!weekInfo) return;

      // Determine season type based on matchup gameType
      let seasonType;
      if (["RS", "CC", "NC"].includes(matchup.gameType)) {
        seasonType = "regular";
      } else if (["QF", "SF", "F", "PO"].includes(matchup.gameType)) {
        seasonType = "playoff";
      } else if (matchup.gameType === "LT") {
        seasonType = "loser";
      } else {
        return; // Skip unknown game types
      }

      // Process home team
      const homeKey = `${matchup.homeTeamId}_${matchup.seasonId}_${seasonType}`;
      if (!teamMatchups[homeKey]) {
        teamMatchups[homeKey] = { teamW: 0, teamL: 0, teamHW: 0, teamHL: 0 };
      }

      // Process away team
      const awayKey = `${matchup.awayTeamId}_${matchup.seasonId}_${seasonType}`;
      if (!teamMatchups[awayKey]) {
        teamMatchups[awayKey] = { teamW: 0, teamL: 0, teamHW: 0, teamHL: 0 };
      }

      // Check if it's a tie game by comparing scores
      const isTie = matchup.homeScore === matchup.awayScore;

      if (matchup.tie) {
        teamMatchups[homeKey].tie++;
        teamMatchups[awayKey].tie++;
      } else if (isTie) {
        // Tie game - goes to home team, counts as home win/loss
        teamMatchups[homeKey].teamW++;
        teamMatchups[homeKey].teamHW++; // Home win only for ties
        teamMatchups[awayKey].teamL++;
        teamMatchups[awayKey].teamHL++; // Home loss only for ties (away team loses tie)
      } else if (matchup.homeWin) {
        // Regular home team win (not a tie)
        teamMatchups[homeKey].teamW++;
        teamMatchups[awayKey].teamL++;
      } else if (matchup.awayWin) {
        // Regular away team win
        teamMatchups[awayKey].teamW++;
        teamMatchups[homeKey].teamL++;
      }
    });

    console.log(`Found ${teamWeeks.length} team weeks to aggregate`);

    // Debug: Check what week types exist in team weeks data
    const weekTypesInTeamWeeks = new Set();
    teamWeeks.forEach((week) => {
      const weekInfo = weekTypeLookup[week.weekId];
      if (weekInfo) {
        weekTypesInTeamWeeks.add(weekInfo.weekType);
      }
    });
    console.log(
      `Week types in team weeks: [${Array.from(weekTypesInTeamWeeks).sort().join(", ")}]`,
    );

    // Debug: Check what game types exist in matchups
    const gameTypesInMatchups = new Set();
    matchupResult.data.forEach((matchup) => {
      if (matchup.isComplete && matchup.gameType) {
        gameTypesInMatchups.add(matchup.gameType);
      }
    });
    console.log(
      `Game types in completed matchups: [${Array.from(gameTypesInMatchups).sort().join(", ")}]`,
    );

    // Group by teamId + seasonId + seasonType combination
    const seasonGroups = {};
    teamWeeks.forEach((week) => {
      const weekInfo = weekTypeLookup[week.weekId];
      if (!weekInfo) {
        console.warn(`No week metadata found for weekId: ${week.weekId}`);
        return;
      }

      let seasonType;

      // For regular season weeks, use week type
      if (["RS", "CC", "NC"].includes(weekInfo.weekType)) {
        seasonType = "regular";
      } else {
        // For playoff weeks, we need to check the actual matchup gameType for this team
        // Find a matchup for this team in this week to determine the actual game type
        const teamMatchup = matchupResult.data.find(
          (matchup) =>
            matchup.weekId === week.weekId &&
            (matchup.homeTeamId === week.gshlTeamId ||
              matchup.awayTeamId === week.gshlTeamId),
        );

        if (teamMatchup && teamMatchup.gameType) {
          if (["QF", "SF", "F", "PO"].includes(teamMatchup.gameType)) {
            seasonType = "playoff";
          } else if (teamMatchup.gameType === "LT") {
            seasonType = "loser";
          } else {
            // Fallback to week type logic for unknown game types
            seasonType = weekInfo.weekType === "LT" ? "loser" : "playoff";
          }
        } else {
          // Fallback to week type logic if no matchup found
          seasonType = weekInfo.weekType === "LT" ? "loser" : "playoff";
        }
      }

      const key = `${week.gshlTeamId}_${week.seasonId}_${seasonType}`;

      if (!seasonGroups[key]) {
        seasonGroups[key] = [];
      }
      seasonGroups[key].push(week);
    });

    // Create aggregator for team weekly stats
    const aggregator = createAggregator("TeamWeekStatLine");
    const createTeamSeason = createTypedObjectFactory("TeamSeasonStatLine");

    // Aggregate each group into seasonal stats
    const teamSeasons = Object.values(seasonGroups).map((weeks, index) => {
      const firstWeek = weeks[0];
      const weekInfo = weekTypeLookup[firstWeek.weekId];

      // Determine season type using the same logic as grouping
      let seasonType;
      if (["RS", "CC", "NC"].includes(weekInfo.weekType)) {
        seasonType = "regular";
      } else {
        // For playoff weeks, check the actual matchup gameType
        const teamMatchup = matchupResult.data.find(
          (matchup) =>
            matchup.weekId === firstWeek.weekId &&
            (matchup.homeTeamId === firstWeek.gshlTeamId ||
              matchup.awayTeamId === firstWeek.gshlTeamId),
        );

        if (teamMatchup && teamMatchup.gameType) {
          if (["QF", "SF", "F", "PO"].includes(teamMatchup.gameType)) {
            seasonType = "playoff";
          } else if (teamMatchup.gameType === "LT") {
            seasonType = "loser";
          } else {
            seasonType = weekInfo.weekType === "LT" ? "loser" : "playoff";
          }
        } else {
          seasonType = weekInfo.weekType === "LT" ? "loser" : "playoff";
        }
      }

      // Get summed stats using type-safe aggregation
      const summedStats = aggregator.sum(weeks, [
        "days",
        "GP",
        "MG",
        "IR",
        "IRplus",
        "GS",
        "G",
        "A",
        "P",
        "PM",
        "PIM",
        "PPP",
        "SOG",
        "HIT",
        "BLK",
        "W",
        "GA",
        "SV",
        "SA",
        "SO",
        "TOI",
        "ADD",
        "MS",
        "BS",
      ]);

      // Calculate computed stats (not simple averages)
      const computedStats = {
        GAA: summedStats.TOI > 0 ? (summedStats.GA / summedStats.TOI) * 60 : 0,
        SVP: summedStats.SA > 0 ? summedStats.SV / summedStats.SA : 0,
        Rating: 0, // Will be calculated later with rating function
      };

      // Get first values for metadata
      const firstValues = aggregator.first(weeks, ["seasonId", "gshlTeamId"]);

      // Get team matchup record for this season type
      const matchupKey = `${firstValues.gshlTeamId}_${firstValues.seasonId}_${seasonType}`;
      const teamRecord = teamMatchups[matchupKey] || {
        teamW: 0,
        teamL: 0,
        teamHW: 0,
        teamHL: 0,
      };

      return createTeamSeason({
        id: index + 1,
        ...firstValues,
        seasonType: seasonType, // Now properly set based on week data
        ...summedStats,
        ...computedStats,
        ...teamRecord, // Add team wins/losses from matchups
        streak: "", // Will be calculated based on recent performance
        powerRk: 0, // Will be calculated relative to other teams
        powerRating: 0, // Will be calculated based on performance
        prevPowerRk: 0,
        prevPowerRating: 0,
        overallRk: 0,
        conferenceRk: 0,
        wildcardRk: 0,
        losersTournRk: 0,
        playersUsed: 0, // Will be calculated from roster data
        // Trophy ratings (initialized to 0, calculated elsewhere)
        norrisRating: 0,
        norrisRk: 0,
        vezinaRating: 0,
        vezinaRk: 0,
        calderRating: 0,
        calderRk: 0,
        jackAdamsRating: 0,
        jackAdamsRk: 0,
        GMOYRating: 0,
        GMOYRk: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    console.log(`Created ${teamSeasons.length} team season records:`);
    const regularCount = teamSeasons.filter(
      (ts) => ts.seasonType === "regular",
    ).length;
    const playoffCount = teamSeasons.filter(
      (ts) => ts.seasonType === "playoff",
    ).length;
    const loserCount = teamSeasons.filter(
      (ts) => ts.seasonType === "loser",
    ).length;
    console.log(`  - Regular season: ${regularCount} records`);
    console.log(`  - Playoff: ${playoffCount} records`);
    console.log(`  - Loser tournament: ${loserCount} records`);

    // Write to destination with type-safe writing
    const writeResult = writeTypedSheet(
      workbook,
      "TeamSeasonStatLine",
      teamSeasons,
      {
        chunkSize: 100,
        clearFirst: true,
      },
    );

    if (writeResult.success) {
      console.log(
        `✅ Aggregated ${writeResult.rowsWritten} team seasons successfully`,
      );
    } else {
      console.error(`❌ Team seasons aggregation failed: ${writeResult.error}`);
    }

    return writeResult;
  } catch (error) {
    console.error("❌ Team seasons aggregation failed:", error.message);
    return { success: false, error: error.message };
  }
}
