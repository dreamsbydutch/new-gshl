/**
 * GSHL Apps Script - Core Initialization Functions
 * Essential system functions for workbook connectivity and setup
 */

/**
 * Initialize essential GSHL workbooks
 * Run this to verify workbook connectivity
 */
function initializeWorkbooks() {
  try {
    console.log("Initializing GSHL workbooks...");

    const workbooks = ["GENERAL", "PLAYERDAYS", "PLAYERSTATS", "TEAMSTATS"];
    const results = {
      workbooksProcessed: 0,
      errors: [],
    };

    for (const workbookKey of workbooks) {
      try {
        const workbook = getWorkbook(workbookKey);
        const sheets = workbook.getSheets();
        console.log(`✅ ${workbookKey}: ${sheets.length} sheets found`);
        results.workbooksProcessed++;
      } catch (error) {
        console.error(`❌ Error accessing ${workbookKey}:`, error.message);
        results.errors.push(`${workbookKey}: ${error.message}`);
      }
    }

    console.log(
      `✅ Initialization complete: ${results.workbooksProcessed} workbooks accessible`,
    );
    return results;
  } catch (error) {
    console.error("❌ Initialization failed:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Run all aggregation functions in sequence
 * This ensures proper data flow from daily -> weekly -> seasonal
 */
function runFullAggregation() {
  console.log("🚀 Starting full GSHL aggregation pipeline...");

  const results = {
    teamWeeks: null,
    teamSeasons: null,
    playerWeeks: null,
    success: true,
    errors: [],
  };

  try {
    // Step 1: Aggregate team weeks
    console.log("Step 1: Aggregating team weekly stats...");
    results.teamWeeks = aggregateTeamWeeks();
    if (!results.teamWeeks.success) {
      results.errors.push(`Team weeks: ${results.teamWeeks.error}`);
      results.success = false;
    }

    // Step 2: Aggregate team seasons
    console.log("Step 2: Aggregating team seasonal stats...");
    results.teamSeasons = aggregateTeamSeasons();
    if (!results.teamSeasons.success) {
      results.errors.push(`Team seasons: ${results.teamSeasons.error}`);
      results.success = false;
    }

    // Step 3: Aggregate player weeks
    console.log("Step 3: Aggregating player weekly stats...");
    results.playerWeeks = aggregatePlayerWeeks();
    if (!results.playerWeeks.success) {
      results.errors.push(`Player weeks: ${results.playerWeeks.error}`);
      results.success = false;
    }

    if (results.success) {
      console.log("✅ Full aggregation pipeline completed successfully!");
      console.log(`📊 Summary:
        - Team weeks: ${results.teamWeeks.rowsWritten || 0} records
        - Team seasons: ${results.teamSeasons.rowsWritten || 0} records  
        - Player weeks: ${results.playerWeeks.rowsWritten || 0} records`);
    } else {
      console.error(
        "❌ Aggregation pipeline completed with errors:",
        results.errors,
      );
    }

    return results;
  } catch (error) {
    console.error("❌ Full aggregation pipeline failed:", error.message);
    return {
      success: false,
      error: error.message,
      results,
    };
  }
}
