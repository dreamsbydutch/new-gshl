/**
 * Export Ranking Model to Apps Script
 * ====================================
 * Converts ranking-model.json into Apps Script-compatible JavaScript files.
 *
 * @description
 * This script reads the trained ranking model JSON file and converts it into
 * JavaScript files that can be deployed to Google Apps Script. It splits the
 * model into separate files by season to keep file sizes manageable.
 *
 * @usage
 * ```sh
 * npm run ranking:export-to-apps-script
 * tsx src/scripts/export-ranking-model-to-apps-script.ts
 * ```
 *
 * @output
 * - apps-script/RankingModels.js - Main model file with all seasons
 */

import { readFile, writeFile } from "fs/promises";
import type { RankingModel } from "@gshl-ranking/types";

// ============================================================================
// Configuration
// ============================================================================

const MODEL_INPUT_PATH = "./ranking-model.json";
const APPS_SCRIPT_OUTPUT_PATH = "./apps-script/RankingModels.js";

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log("🔄 Exporting Ranking Model to Apps Script");
  console.log("==========================================\n");

  try {
    // Step 1: Read the ranking model
    console.log("📖 Reading ranking model from:", MODEL_INPUT_PATH);
    const modelJson = await readFile(MODEL_INPUT_PATH, "utf-8");
    const model = JSON.parse(modelJson) as RankingModel;

    console.log(
      `   ✓ Loaded model (${model.totalSamples.toLocaleString()} samples)`,
    );
    console.log(
      `   ✓ Trained at: ${new Date(model.trainedAt).toLocaleString()}`,
    );
    console.log(`   ✓ Models: ${Object.keys(model.models).length}\n`);

    // Step 2: Generate Apps Script JavaScript
    console.log("🔧 Generating Apps Script JavaScript...");
    const jsContent = generateAppsScriptFile(model);

    // Step 3: Write to Apps Script folder
    console.log(`💾 Writing to: ${APPS_SCRIPT_OUTPUT_PATH}`);
    await writeFile(APPS_SCRIPT_OUTPUT_PATH, jsContent, "utf-8");

    const fileSizeKb = (Buffer.byteLength(jsContent, "utf-8") / 1024).toFixed(
      1,
    );
    console.log(`   ✓ File written (${fileSizeKb} KB)\n`);

    // Step 4: Display summary
    displaySummary(model);

    console.log("✅ Export Complete!\n");
    console.log("Next steps:");
    console.log("  1. Deploy to Apps Script: npm run deploy:apps-script");
    console.log("  2. Use in your ranking functions:");
    console.log('     const model = RANKING_MODELS.models["10:F"];');
    console.log("     const result = rankPerformance(statLine, model);\n");
  } catch (error) {
    console.error("\n❌ Export failed:");
    console.error(error);
    process.exitCode = 1;
  }
}

// ============================================================================
// Generation Functions
// ============================================================================

/**
 * Generates the Apps Script JavaScript file content
 * Generates the Apps Script JavaScript file content
 */
function generateAppsScriptFile(model: RankingModel): string {
  const models = model.models;
  const seasons = getUniqueSeasonsFromModels(models);

  const content = `// @ts-nocheck
/**
 * Ranking Models
 * ==============
 * Trained ranking models for player performance evaluation.
 * 
 * Auto-generated from ranking-model.json
 * DO NOT EDIT MANUALLY - Run 'npm run ranking:export-to-apps-script' to regenerate
 * 
 * Training Info:
 * - Version: ${model.version}
 * - Trained: ${new Date(model.trainedAt).toLocaleString()}
 * - Total Samples: ${model.totalSamples.toLocaleString()}
 * - Seasons: ${seasons.join(", ")}
 * - Models: ${Object.keys(models).length} (season:position combinations)
 */

/**
 * Build canonical model key
 * @param {{seasonPhase?: string, seasonId: string|number, aggregationLevel?: string, posGroup?: string}} meta
 * @returns {string}
 */
function buildModelKey(meta) {
  if (!meta || !meta.seasonId || !meta.posGroup) return "";
  const seasonPhase = meta.seasonPhase || "REGULAR_SEASON";
  const aggregationLevel = meta.aggregationLevel || "playerDay";
  return [
    String(seasonPhase),
    String(meta.seasonId),
    String(aggregationLevel),
    String(meta.posGroup),
  ].join(":");
}

function parseModelKey(key) {
  const parts = key.split(":");
  if (parts.length === 4) {
    return {
      seasonPhase: parts[0],
      seasonId: parts[1],
      aggregationLevel: parts[2],
      posGroup: parts[3],
    };
  }
  if (parts.length === 2) {
    return {
      seasonPhase: "REGULAR_SEASON",
      seasonId: parts[0],
      aggregationLevel: "playerDay",
      posGroup: parts[1],
    };
  }
  return {
    seasonPhase: "REGULAR_SEASON",
    seasonId: key,
    aggregationLevel: "playerDay",
    posGroup: "F",
  };
}

function createLookupKey(metaOrSeasonId, posGroup, aggregationLevel, seasonPhase) {
  if (metaOrSeasonId && typeof metaOrSeasonId === "object") {
    return buildModelKey(metaOrSeasonId);
  }

  const hasFullMeta = aggregationLevel && seasonPhase;
  if (hasFullMeta) {
    return buildModelKey({
      seasonPhase: seasonPhase,
      seasonId: metaOrSeasonId,
      aggregationLevel,
      posGroup,
    });
  }

  if (metaOrSeasonId && posGroup) {
    return String(metaOrSeasonId) + ":" + String(posGroup);
  }

  return "";
}

/**
 * Get a specific model by metadata
 * @param {object|string} metaOrSeasonId - Classification meta or legacy seasonId
 * @param {string} [posGroup]
 * @param {string} [aggregationLevel]
 * @param {string} [seasonPhase]
 * @returns {Object|null}
 */
function getRankingModel(metaOrSeasonId, posGroup, aggregationLevel, seasonPhase) {
  const key = createLookupKey(
    metaOrSeasonId,
    posGroup,
    aggregationLevel,
    seasonPhase,
  );
  return key ? RANKING_MODELS.models[key] || null : null;
}

function hasRankingModel(
  metaOrSeasonId,
  posGroup,
  aggregationLevel,
  seasonPhase,
) {
  const key = createLookupKey(
    metaOrSeasonId,
    posGroup,
    aggregationLevel,
    seasonPhase,
  );
  return key ? RANKING_MODELS.models.hasOwnProperty(key) : false;
}

/**
 * Get all available seasons
 * @returns {string[]} Array of season IDs
 */
function getAvailableSeasons() {
  return RANKING_MODELS.metadata.seasons;
}

/**
 * Main ranking models object
 * Access models via: RANKING_MODELS.models["seasonPhase:seasonId:aggregationLevel:posGroup"]
 */
var RANKING_MODELS = ${JSON.stringify(
    {
      version: model.version,
      trainedAt: model.trainedAt,
      totalSamples: model.totalSamples,
      metadata: {
        seasons: seasons,
        modelCount: Object.keys(models).length,
        seasonRange: model.seasonRange,
      },
      models: models,
      globalWeights: model.globalWeights,
      aggregationBlendWeights: model.aggregationBlendWeights,
    },
    null,
    2,
  )};
`;

  return content;
}

/**
 * Extract unique season IDs from model keys
 */
function getUniqueSeasonsFromModels(models: RankingModel["models"]): string[] {
  const seasons = new Set<string>();
  for (const key of Object.keys(models)) {
    const parts = key.split(":");
    const seasonId = parts.length >= 4 ? parts[1] : parts[0];
    if (seasonId) seasons.add(seasonId);
  }
  return Array.from(seasons).sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    return numA - numB;
  });
}

/**
 * Display summary of the export
 */
function displaySummary(model: RankingModel): void {
  const models = model.models;
  const tallies: Record<"F" | "D" | "G", number> = {
    F: 0,
    D: 0,
    G: 0,
  };

  for (const key of Object.keys(models)) {
    const parts = key.split(":");
    const posGroup = parts.length >= 4 ? parts[3] : parts[1];
    switch (posGroup) {
      case "F":
      case "D":
      case "G":
        tallies[posGroup] += 1;
        break;
      default:
        break;
    }
  }

  console.log("📊 Model Summary:");
  console.log(`   Forwards (F): ${tallies.F} seasons`);
  console.log(`   Defensemen (D): ${tallies.D} seasons`);
  console.log(`   Goalies (G): ${tallies.G} seasons`);
  console.log(`   Total models: ${Object.keys(models).length}\n`);
}

// ============================================================================
// Script Entry Point
// ============================================================================

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exitCode = 1;
});
