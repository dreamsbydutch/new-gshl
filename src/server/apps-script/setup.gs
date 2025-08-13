/**
 * GSHL Apps Script - Essential Setup
 * Lightweight setup for essential workbooks only
 */

/**
 * Initialize only the essential GSHL workbooks for development
 * Skips archived data workbooks to improve setup speed
 */
function initializeGSHLDatabase() {
  console.log("Starting GSHL database initialization (essential workbooks only)...");

  const essentialWorkbooks = ["GENERAL", "PLAYERDAYS", "PLAYERSTATS", "TEAMSTATS"];
  const results = {
    workbooksProcessed: 0,
    sheetsCreated: 0,
    errors: []
  };

  try {
    // Validate configurations are available
    if (typeof getWorkbook !== "function") {
      throw new Error("getWorkbook function not found. Make sure config/config.gs is loaded.");
    }

    // Process only essential workbooks
    for (const workbookKey of essentialWorkbooks) {
      try {
        console.log(`Processing workbook: ${workbookKey}`);
        const workbook = getWorkbook(workbookKey);
        
        // Basic validation - ensure workbook is accessible
        const sheets = workbook.getSheets();
        console.log(`✅ ${workbookKey}: ${sheets.length} sheets found`);
        
        results.workbooksProcessed++;
      } catch (error) {
        console.error(`❌ Error processing ${workbookKey}:`, error.message);
        results.errors.push(`${workbookKey}: ${error.message}`);
      }
    }

    console.log(`✅ Setup complete: ${results.workbooksProcessed}/${essentialWorkbooks.length} workbooks processed`);
    if (results.errors.length > 0) {
      console.log(`⚠️ Errors encountered: ${results.errors.length}`);
      results.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    return results;
  } catch (error) {
    console.error("❌ Setup failed:", error.message);
    return { success: false, error: error.message, results };
  }
}