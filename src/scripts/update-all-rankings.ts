/**
 * Update All Player Day Rankings
 * ===============================
 * Calculates performance rankings for all PlayerDay records and updates Google Sheets in bulk.
 *
 * @description
 * This script loads a trained ranking model, fetches all PlayerDay data from partitioned
 * Google Sheets, calculates performance scores for players who played (GP=1), and
 * writes the ratings back to the sheets.
 *
 * @usage
 * ```sh
 * npm run ranking:update-all
 * tsx src/scripts/update-all-rankings.ts
 * ```
 *
 * @requirements
 * - ranking-model.json must exist (run `npm run ranking:train` first)
 * - GOOGLE_SERVICE_ACCOUNT_KEY configured in .env.local
 *
 * @output
 * - Updates "Rating" column in all PlayerDayStatLine sheets
 */

import dotenv from "dotenv";
import * as fs from "fs";

dotenv.config({ path: ".env.local" });

// Dynamic imports to ensure env vars are loaded first
const [{ rankPerformance }] = await Promise.all([
  import("../lib/ranking/index.js"),
]);

import type { RankingModel, PlayerStatLine } from "../lib/ranking/types";

// ============================================================================
// Configuration
// ============================================================================

/** Path to the trained ranking model */
const MODEL_PATH = "./ranking-model.json";

/** PlayerDay workbook IDs partitioned by season ranges */
const PLAYERDAY_WORKBOOKS = {
  PLAYERDAYS_1_5: "1ny8gEOotQCbG3uvr29JgX5iRjCS_2Pt44eF4f4l3f1g",
  PLAYERDAYS_6_10: "14XZoxMbcmWh0-XmYOu16Ur0HNOFP9UttHbiMMut_PJ0",
  PLAYERDAYS_11_15: "18IqgstBaBIAfM08w7ddzjF2JTrAqZUjAvsbyZxgHiag",
} as const;

/** Sheet range to fetch */
const FETCH_RANGE = "PlayerDayStatLine!A:AZ";

/** Progress update interval (rows) */
const PROGRESS_INTERVAL = 10000;

// ============================================================================
// Type Definitions
// ============================================================================

interface PlayerDayRow {
  row: number;
  data: Record<string, unknown>;
  ranking?: number;
}

interface WorkbookData {
  spreadsheetId: string;
  rows: PlayerDayRow[];
  headers: string[];
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log("🔄 Update All Player Day Rankings");
  console.log("=" + "=".repeat(79) + "\n");

  try {
    // Step 1: Load ranking model
    const model = loadRankingModel();

    // Step 2: Fetch all PlayerDay data
    const { sheets, workbookData } = await fetchAllPlayerDays();

    // Step 3: Calculate rankings
    await calculateRankings(model, workbookData);

    // Step 4: Update sheets with new rankings
    await updateRankingsInSheets(sheets, workbookData);

    console.log("✅ All player day rankings updated successfully!\n");
  } catch (error) {
    console.error("\n❌ Update failed:");
    console.error(error);
    process.exitCode = 1;
  }
}

// ============================================================================
// Model Loading
// ============================================================================

/**
 * Loads and validates the trained ranking model from disk.
 */
function loadRankingModel(): RankingModel {
  console.log("📖 Loading ranking model...");

  if (!fs.existsSync(MODEL_PATH)) {
    throw new Error(
      `Model file not found at ${MODEL_PATH}. Run 'npm run ranking:train' first.`,
    );
  }

  const modelData = JSON.parse(
    fs.readFileSync(MODEL_PATH, "utf-8"),
  ) as RankingModel & { trainedAt: string };
  const model: RankingModel = {
    ...modelData,
    trainedAt: new Date(modelData.trainedAt),
  };

  console.log(`✓ Model loaded (version ${model.version})\n`);

  return model;
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Fetches all PlayerDay data from partitioned Google Sheets workbooks.
 */
async function fetchAllPlayerDays(): Promise<{
  sheets: ReturnType<typeof import("googleapis").google.sheets>;
  workbookData: Map<string, WorkbookData>;
}> {
  console.log("📥 Fetching PlayerDay data from Google Sheets...\n");

  const { google } = await import("googleapis");
  const { env } = await import("../env.js");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY) as Record<
      string,
      unknown
    >,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const workbookData = new Map<string, WorkbookData>();

  for (const [name, spreadsheetId] of Object.entries(PLAYERDAY_WORKBOOKS)) {
    try {
      console.log(`   Fetching ${name}...`);

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: FETCH_RANGE,
      });

      const rows = response.data.values as unknown[][] | undefined;
      if (!rows || rows.length < 2) {
        console.log(`   ⚠️  ${name}: No data found`);
        continue;
      }

      const headers = rows[0] as string[];
      const playerDayRows = parsePlayerDayRows(rows.slice(1), headers);

      workbookData.set(name, {
        spreadsheetId,
        rows: playerDayRows,
        headers,
      });

      console.log(
        `   ✓ ${name}: ${playerDayRows.length.toLocaleString()} player days`,
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error ?? "Unknown");
      console.log(`   ⚠️  ${name}: Error fetching - ${errorMsg}`);
    }
  }

  const totalRows = Array.from(workbookData.values()).reduce(
    (sum, wb) => sum + wb.rows.length,
    0,
  );

  console.log(`\n✓ Total: ${totalRows.toLocaleString()} player days\n`);

  return { sheets, workbookData };
}

/**
 * Parses raw sheet rows into PlayerDayRow objects with row numbers.
 */
function parsePlayerDayRows(
  dataRows: unknown[][],
  headers: string[],
): PlayerDayRow[] {
  return dataRows.map((row, index) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, colIndex) => {
      obj[header] = row[colIndex] ?? "";
    });
    return {
      row: index + 2, // +2 for header row and 1-indexing
      data: obj,
    };
  });
}

// ============================================================================
// Ranking Calculation
// ============================================================================

/**
 * Calculates performance rankings for all player days using the trained model.
 */
async function calculateRankings(
  model: RankingModel,
  workbookData: Map<string, WorkbookData>,
): Promise<void> {
  console.log("📊 Calculating rankings for all player days...\n");

  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalErrors = 0;

  for (const [name, { rows }] of workbookData) {
    console.log(`\n   Processing ${name}...`);

    const stats = processWorkbookRankings(rows, model);

    totalProcessed += stats.processed;
    totalSuccess += stats.success;
    totalErrors += stats.errors;

    console.log(
      `\r   ✓ Processed: ${stats.processed.toLocaleString()} (${stats.success.toLocaleString()} success, ${stats.errors.toLocaleString()} errors)`,
    );
  }

  console.log(
    `\n✓ Total: ${totalProcessed.toLocaleString()} processed (${totalSuccess.toLocaleString()} success, ${totalErrors.toLocaleString()} errors)\n`,
  );
}

/**
 * Processes rankings for a single workbook's player days.
 */
function processWorkbookRankings(
  rows: PlayerDayRow[],
  model: RankingModel,
): { processed: number; success: number; errors: number } {
  let processed = 0;
  let success = 0;
  let errors = 0;

  for (const playerDay of rows) {
    try {
      // Only calculate rating if the player actually played (GP=1)
      const gp = (playerDay.data.GP ?? playerDay.data.gp ?? "0") as string;

      if (gp !== "1") {
        // Player didn't play, leave rating undefined
        playerDay.ranking = undefined;
        processed++;
        continue;
      }

      const statLine = buildStatLine(playerDay.data);
      const result = rankPerformance(statLine, model);

      // Round to 3 decimal places, handle NaN as 0
      playerDay.ranking = isNaN(result.score)
        ? 0
        : Math.round(result.score * 1000) / 1000;

      success++;
    } catch {
      // Skip invalid rows
      playerDay.ranking = undefined;
      errors++;
    }

    processed++;

    if (processed % PROGRESS_INTERVAL === 0) {
      process.stdout.write(
        `\r   Processed: ${processed.toLocaleString()}/${rows.length.toLocaleString()}`,
      );
    }
  }

  return { processed, success, errors };
}

/**
 * Builds a stat line object from raw player day data.
 */
function buildStatLine(data: Record<string, unknown>): PlayerStatLine {
  return {
    posGroup: data.posGroup as PlayerStatLine["posGroup"],
    seasonId: data.seasonId as string,
    G: (data.G ?? "0") as string,
    A: (data.A ?? "0") as string,
    P: (data.P ?? "0") as string,
    PM: (data.PM ?? "0") as string,
    PPP: (data.PPP ?? "0") as string,
    SOG: (data.SOG ?? "0") as string,
    HIT: (data.HIT ?? "0") as string,
    BLK: (data.BLK ?? "0") as string,
    W: (data.W ?? "0") as string,
    GAA: (data.GAA ?? "0") as string,
    SVP: (data.SVP ?? "0") as string,
  };
}

// ============================================================================
// Sheet Updates
// ============================================================================

/**
 * Updates the Rating column in all Google Sheets workbooks.
 */
async function updateRankingsInSheets(
  sheets: ReturnType<typeof import("googleapis").google.sheets>,
  workbookData: Map<string, WorkbookData>,
): Promise<void> {
  console.log("💾 Updating rankings in Google Sheets...\n");

  for (const [name, data] of workbookData) {
    console.log(`\n   Processing ${name}...`);

    try {
      await updateWorkbookRankings(sheets, name, data);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error ?? "Unknown");
      console.log(`   ❌ ${name}: Error updating - ${errorMsg}`);
    }
  }

  console.log("\n✓ All updates complete!\n");
}

/**
 * Updates rankings for a single workbook.
 */
async function updateWorkbookRankings(
  sheets: ReturnType<typeof import("googleapis").google.sheets>,
  name: string,
  { spreadsheetId, rows, headers }: WorkbookData,
): Promise<void> {
  // Find the Rating column
  const rankingColIndex = headers.findIndex(
    (h) => h.toLowerCase() === "rating",
  );

  if (rankingColIndex === -1) {
    console.log(`   ⚠️  ${name}: No 'Rating' column found, skipping`);
    console.log(`      Available columns: ${headers.join(", ")}`);
    return;
  }

  const columnLetter = columnIndexToLetter(rankingColIndex);
  console.log(
    `   Found 'Rating' at column ${columnLetter} (index ${rankingColIndex})`,
  );

  // Build update data
  const updateData = rows.map((playerDay) => [playerDay.ranking ?? ""]);

  // Update the sheet
  const startRow = 2;
  const endRow = startRow + rows.length - 1;
  const range = `PlayerDayStatLine!${columnLetter}${startRow}:${columnLetter}${endRow}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: {
      values: updateData,
    },
  });

  console.log(
    `   ✓ ${name}: Updated ${rows.length.toLocaleString()} rankings in column ${columnLetter}`,
  );
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Converts a column index to Excel-style letter notation (A, B, ..., Z, AA, AB, ...).
 */
function columnIndexToLetter(index: number): string {
  let letter = "";
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

// ============================================================================
// Script Entry Point
// ============================================================================

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exitCode = 1;
});
