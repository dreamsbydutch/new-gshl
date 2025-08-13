/**
 * Team Weekly Aggregation Functions
 * Handles aggregation of team daily statistics into weekly summaries
 */

/**
 * Aggregate team daily statistics into weekly summaries
 * Run this to process team days into weekly stats
 */
function aggregateTeamWeeks() {
  try {
    console.log("Starting team weeks aggregation...");

    // Load team daily data with type-safe reading
    const workbook = getWorkbook("team stats");
    const readResult = readTypedSheet(workbook, "TeamDayStatLine");

    if (!readResult.success) {
      return { success: false, error: readResult.error };
    }

    const teamDays = readResult.data;
    if (teamDays.length === 0) {
      console.log("No team days found to aggregate");
      return { success: false, error: "No data found" };
    }

    console.log(`Found ${teamDays.length} team days to aggregate`);

    // Group by teamId + weekId combination
    const weekGroups = {};
    teamDays.forEach((day) => {
      const key = `${day.gshlTeamId}_${day.weekId}`;
      if (!weekGroups[key]) {
        weekGroups[key] = [];
      }
      weekGroups[key].push(day);
    });

    // Create aggregator for team weekly stats
    const aggregator = createAggregator("TeamDayStatLine");
    const createTeamWeek = createTypedObjectFactory("TeamWeekStatLine");

    // Aggregate each group into weekly stats
    const teamWeeks = Object.values(weekGroups).map((days, index) => {
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
        "weekId",
      ]);

      return createTeamWeek({
        id: index + 1,
        ...firstValues,
        days: days.length,
        ...summedStats,
        ...computedStats,
        yearToDateRating: 0, // Will be calculated later
        powerRating: 0, // Will be calculated later
        powerRk: 0, // Will be calculated later
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    // Write to destination with type-safe writing
    const writeResult = writeTypedSheet(
      workbook,
      "TeamWeekStatLine",
      teamWeeks,
      {
        chunkSize: 100,
        clearFirst: true,
      },
    );

    if (writeResult.success) {
      console.log(
        `✅ Aggregated ${writeResult.rowsWritten} team weeks successfully`,
      );
    } else {
      console.error(`❌ Team weeks aggregation failed: ${writeResult.error}`);
    }

    return writeResult;
  } catch (error) {
    console.error("❌ Team weeks aggregation failed:", error.message);
    return { success: false, error: error.message };
  }
}
