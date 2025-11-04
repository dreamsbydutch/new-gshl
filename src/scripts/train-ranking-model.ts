/**
 * Ranking Model Training Script
 * ===============================
 * Trains the player performance ranking model on historical PlayerDay data
 * and exports it to a JSON file for production use.
 *
 * @description
 * This script fetches all PlayerDay stat lines from partitioned Google Sheets,
 * trains position-specific ranking models using statistical analysis, and
 * serializes the trained model to `ranking-model.json`.
 *
 * @usage
 * ```sh
 * npm run ranking:train
 * tsx src/scripts/train-ranking-model.ts
 * ```
 *
 * @output
 * - `ranking-model.json` - Serialized model with weights and distributions
 */

import dotenv from "dotenv";
import { writeFile } from "fs/promises";

dotenv.config({ path: ".env.local" });

// Dynamic imports to ensure env vars are loaded first
const [
  { optimizedSheetsAdapter },
  { trainRankingModel, serializeModel },
  { PositionGroup },
] = await Promise.all([
  import("../lib/sheets/index.js"),
  import("../lib/ranking/index.js"),
  import("../lib/types/enums.js"),
]);

import type { PlayerStatLine } from "../lib/ranking/index.js";

// ============================================================================
// Configuration
// ============================================================================

/** PlayerDay workbook IDs partitioned by season ranges */
const PLAYERDAY_WORKBOOKS = {
  PLAYERDAYS_1_5: "1ny8gEOotQCbG3uvr29JgX5iRjCS_2Pt44eF4f4l3f1g",
  PLAYERDAYS_6_10: "14XZoxMbcmWh0-XmYOu16Ur0HNOFP9UttHbiMMut_PJ0",
  PLAYERDAYS_11_15: "18IqgstBaBIAfM08w7ddzjF2JTrAqZUjAvsbyZxgHiag",
} as const;

/** Training configuration */
const TRAINING_CONFIG = {
  minSampleSize: 50,
  outlierThreshold: 4,
  smoothingFactor: 0.3,
  useAdaptiveWeights: false,
} as const;

/** Output file path */
const MODEL_OUTPUT_PATH = "./ranking-model.json";

/** Required fields for validation */
const REQUIRED_FIELDS = [
  "seasonId",
  "posGroup",
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
] as const;

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log("🚀 Ranking Model Training");
  console.log("=========================\n");

  try {
    // Step 1: Fetch all PlayerDay stat lines
    const allStatLines = await fetchAllPlayerDays();

    // Step 2: Validate data structure
    validateDataStructure(allStatLines);

    // Step 3: Analyze dataset
    displayDatasetAnalysis(allStatLines);

    // Step 4: Train the model
    const model = trainModel(allStatLines);

    // Step 5: Display model summary
    displayModelSummary(model);

    // Step 6: Save model to file
    await saveModelToFile(model);

    // Step 7: Display validation metrics
    displayValidationMetrics(model, allStatLines);

    console.log("🎉 Training Complete!\n");
    displayNextSteps();
  } catch (error) {
    console.error("\n❌ Training failed:");
    console.error(error);
    process.exitCode = 1;
  }
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Fetches all PlayerDay stat lines from all partitioned workbooks.
 */
async function fetchAllPlayerDays(): Promise<any[]> {
  console.log("📥 Fetching PlayerDay data from Google Sheets...");
  console.log("   Querying all PlayerDay workbooks (seasons 1-15)");
  console.log("   This may take several minutes.\n");

  const startTime = Date.now();
  const { google } = await import("googleapis");
  const { env } = await import("../env.js");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const allStatLines: any[] = [];

  for (const [name, spreadsheetId] of Object.entries(PLAYERDAY_WORKBOOKS)) {
    console.log(`   Fetching ${name}...`);

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "PlayerDayStatLine!A:AZ",
      });

      const rows = response.data.values;
      if (!rows || rows.length < 2) {
        console.log(`   ⚠️  ${name}: No data found`);
        continue;
      }

      const dataRows = parseWorkbookRows(rows);
      allStatLines.push(...dataRows);

      console.log(
        `   ✓ ${name}: ${dataRows.length.toLocaleString()} stat lines`,
      );
    } catch (error) {
      console.log(
        `   ❌ ${name}: Error -`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\n✓ Fetched ${allStatLines.length.toLocaleString()} total stat lines in ${elapsedTime}s\n`,
  );

  if (allStatLines.length === 0) {
    throw new Error("No stat lines found. Cannot train model.");
  }

  return allStatLines;
}

/**
 * Parses workbook rows into stat line objects.
 */
function parseWorkbookRows(rows: any[][]): any[] {
  const headers = rows[0] as string[];
  const dataRows = rows.slice(1);

  return dataRows.map((row) => {
    const obj: any = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? "";
    });
    return obj;
  });
}

// ============================================================================
// Validation & Analysis
// ============================================================================

/**
 * Validates that the dataset contains all required fields.
 */
function validateDataStructure(statLines: any[]): void {
  console.log("🔍 Validating data structure...");

  const sample = statLines[0];
  if (!sample) {
    throw new Error("Empty dataset");
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in sample)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  console.log("✓ Data structure validated\n");
}

/**
 * Displays dataset analysis statistics.
 */
function displayDatasetAnalysis(statLines: any[]): void {
  console.log("📊 Dataset Analysis:");

  const seasons = new Set(statLines.map((s) => s.seasonId));
  console.log(`   Seasons: ${seasons.size}`);
  console.log(`   Season range: ${Array.from(seasons).sort().join(", ")}`);

  const positionCounts = {
    [PositionGroup.F]: statLines.filter((s) => s.posGroup === PositionGroup.F)
      .length,
    [PositionGroup.D]: statLines.filter((s) => s.posGroup === PositionGroup.D)
      .length,
    [PositionGroup.G]: statLines.filter((s) => s.posGroup === PositionGroup.G)
      .length,
  };

  console.log(`   Forwards: ${positionCounts.F.toLocaleString()}`);
  console.log(`   Defense: ${positionCounts.D.toLocaleString()}`);
  console.log(`   Goalies: ${positionCounts.G.toLocaleString()}\n`);
}

// ============================================================================
// Model Training
// ============================================================================

/**
 * Trains the ranking model on the provided stat lines.
 */
function trainModel(statLines: any[]) {
  console.log("🎓 Training Ranking Model...");
  console.log("   Analyzing distributions and calculating optimal weights.\n");

  const startTime = Date.now();
  const model = trainRankingModel(
    statLines as PlayerStatLine[],
    TRAINING_CONFIG,
  );
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`✓ Training completed in ${elapsedTime}s\n`);

  return model;
}

// ============================================================================
// Model Summary & Output
// ============================================================================

/**
 * Displays a summary of the trained model.
 */
function displayModelSummary(model: any): void {
  console.log("📦 Model Summary:");
  console.log(`   Version: ${model.version}`);
  console.log(`   Total samples: ${model.totalSamples.toLocaleString()}`);
  console.log(
    `   Season range: ${model.seasonRange.earliest} to ${model.seasonRange.latest}`,
  );
  console.log(`   Models trained: ${Object.keys(model.models).length}\n`);

  displayPositionWeights(model);
}

/**
 * Displays position-specific weights from the trained model.
 */
function displayPositionWeights(model: any): void {
  console.log("⚖️  Position Weights:");

  for (const pos of [PositionGroup.F, PositionGroup.D, PositionGroup.G]) {
    const weights = model.globalWeights[pos];
    console.log(`\n   ${pos}:`);

    const relevantStats =
      pos === PositionGroup.G
        ? ["W", "GAA", "SVP"]
        : ["G", "A", "P", "PPP", "SOG", "HIT", "BLK"];

    for (const stat of relevantStats) {
      const weight = weights[stat as keyof typeof weights];
      if (weight !== undefined) {
        console.log(`     ${stat.padEnd(5)}: ${weight.toFixed(3)}`);
      }
    }
  }

  console.log();
}

/**
 * Saves the trained model to a JSON file.
 */
async function saveModelToFile(model: any): Promise<void> {
  console.log("💾 Saving model to file...");

  const modelJson = serializeModel(model);
  await writeFile(MODEL_OUTPUT_PATH, modelJson, "utf-8");

  const fileSizeKb = (Buffer.byteLength(modelJson, "utf-8") / 1024).toFixed(1);
  console.log(`✓ Model saved to ${MODEL_OUTPUT_PATH} (${fileSizeKb} KB)\n`);
}

/**
 * Displays validation metrics showing model coverage.
 */
function displayValidationMetrics(model: any, statLines: any[]): void {
  console.log("✅ Validation:");

  const seasons = new Set(statLines.map((s) => s.seasonId));
  const modelKeys = Object.keys(model.models);
  const seasonModelCounts = new Map<string, number>();

  for (const key of modelKeys) {
    const seasonId = key.split(":")[0]!;
    seasonModelCounts.set(seasonId, (seasonModelCounts.get(seasonId) ?? 0) + 1);
  }

  console.log(
    `   Coverage: ${seasonModelCounts.size}/${seasons.size} seasons have trained models`,
  );

  for (const [seasonId, count] of seasonModelCounts.entries()) {
    const expectedPositions = 3; // F, D, G
    const coverage = (count / expectedPositions) * 100;
    const status = count === expectedPositions ? "✓" : "⚠";
    console.log(
      `   ${status} ${seasonId}: ${count}/${expectedPositions} positions (${coverage.toFixed(0)}%)`,
    );
  }

  console.log();
}

/**
 * Displays next steps for the user after training completes.
 */
function displayNextSteps(): void {
  console.log("Next steps:");
  console.log(`  1. Review the model file: ${MODEL_OUTPUT_PATH}`);
  console.log("  2. Test rankings with: npm run test:ranking");
  console.log("  3. Integrate into tRPC router for production use\n");
}

// ============================================================================
// Script Entry Point
// ============================================================================

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exitCode = 1;
});
