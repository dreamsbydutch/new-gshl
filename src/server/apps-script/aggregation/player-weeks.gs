/**
 * Player Weekly Aggregation Functions
 * Handles aggregation of player daily statistics into weekly summaries
 */

/**
 * Aggregate player daily statistics into weekly summaries
 * Run this to process player days into weekly stats
 */
function aggregatePlayerWeeks() {
  try {
    console.log("Starting player weeks aggregation...");

    // Load player daily data with type-safe reading
    const workbook = getWorkbook("player stats");
    const readResult = readTypedSheet(workbook, "PlayerDayStatLine");

    if (!readResult.success) {
      return { success: false, error: readResult.error };
    }

    const playerDays = readResult.data;
    if (playerDays.length === 0) {
      console.log("No player days found to aggregate");
      return { success: false, error: "No data found" };
    }

    console.log(`Found ${playerDays.length} player days to aggregate`);

    // Group by playerId + weekId combination
    const weekGroups = {};
    playerDays.forEach((day) => {
      const key = `${day.playerId}_${day.weekId}`;
      if (!weekGroups[key]) {
        weekGroups[key] = [];
      }
      weekGroups[key].push(day);
    });

    // Create aggregator for player daily stats
    const aggregator = createAggregator("PlayerDayStatLine");
    const createPlayerWeek = createTypedObjectFactory("PlayerWeekStatLine");

    // Aggregate each group into weekly stats
    const playerWeeks = Object.values(weekGroups).map((days, index) => {
      const firstDay = days[0];

      // Get summed stats using type-safe aggregation
      const summedStats = aggregator.sum(days, [
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
      const firstValues = aggregator.first(days, [
        "seasonId",
        "gshlTeamId",
        "playerId",
        "weekId",
        "nhlPos",
        "posGroup",
        "nhlTeam",
      ]);

      return createPlayerWeek({
        id: index + 1,
        ...firstValues,
        days: days.length,
        ...summedStats,
        ...computedStats,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    // Write to destination with type-safe writing
    const writeResult = writeTypedSheet(
      workbook,
      "PlayerWeekStatLine",
      playerWeeks,
      {
        chunkSize: 100,
        clearFirst: true,
      },
    );

    if (writeResult.success) {
      console.log(
        `✅ Aggregated ${writeResult.rowsWritten} player weeks successfully`,
      );
    } else {
      console.error(`❌ Player weeks aggregation failed: ${writeResult.error}`);
    }

    return writeResult;
  } catch (error) {
    console.error("❌ Player weeks aggregation failed:", error.message);
    return { success: false, error: error.message };
  }
}
