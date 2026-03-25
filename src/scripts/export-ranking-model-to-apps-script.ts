/**
 * Export Ranking Model to Apps Script
 * ===================================
 * Converts ranking-model.json into Apps Script-compatible JavaScript files.
 *
 * Output:
 * - apps-script/features/RankingEngine/models.js
 */

import { readFile, writeFile } from "fs/promises";
import type { RankingModel } from "@gshl-ranking/types";

const MODEL_INPUT_PATH = "./ranking-model.json";
const APPS_SCRIPT_OUTPUT_PATH = "./apps-script/features/RankingEngine/models.js";

async function main() {
  console.log("Exporting Ranking Model to Apps Script");
  console.log("=======================================\n");

  try {
    console.log("Reading ranking model from:", MODEL_INPUT_PATH);
    const modelJson = await readFile(MODEL_INPUT_PATH, "utf-8");
    const model = JSON.parse(modelJson) as RankingModel;

    console.log(
      `Loaded model (${model.totalSamples.toLocaleString()} samples)`,
    );
    console.log(`Trained at: ${new Date(model.trainedAt).toLocaleString()}`);
    console.log(`Models: ${Object.keys(model.models).length}\n`);

    console.log("Generating Apps Script JavaScript...");
    const jsContent = generateAppsScriptFile(model);

    console.log(`Writing to: ${APPS_SCRIPT_OUTPUT_PATH}`);
    await writeFile(APPS_SCRIPT_OUTPUT_PATH, jsContent, "utf-8");

    const fileSizeKb = (Buffer.byteLength(jsContent, "utf-8") / 1024).toFixed(
      1,
    );
    console.log(`File written (${fileSizeKb} KB)\n`);

    displaySummary(model);

    console.log("Export complete.\n");
  } catch (error) {
    console.error("\nExport failed:");
    console.error(error);
    process.exitCode = 1;
  }
}

function generateAppsScriptFile(model: RankingModel): string {
  const models = model.models;
  const seasons = getUniqueSeasonsFromModels(models);

  return `// @ts-nocheck

var RankingEngine = RankingEngine || {};

(function (ns) {
  "use strict";

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

  function createLookupKey(
    metaOrSeasonId,
    posGroup,
    aggregationLevel,
    seasonPhase,
  ) {
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
  function getRankingModel(
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
   * @returns {string[]}
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
        seasons,
        modelCount: Object.keys(models).length,
        seasonRange: model.seasonRange,
      },
      models,
    },
    null,
    2,
  )};

  ns.RANKING_MODELS = RANKING_MODELS;
  ns.models = ns.models || {};
  ns.models.buildModelKey = buildModelKey;
  ns.models.parseModelKey = parseModelKey;
  ns.models.createLookupKey = createLookupKey;
  ns.models.getRankingModel = getRankingModel;
  ns.models.hasRankingModel = hasRankingModel;
  ns.models.getAvailableSeasons = getAvailableSeasons;
})(RankingEngine);
`;
}

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

function displaySummary(model: RankingModel): void {
  const tallies: Record<"F" | "D" | "G", number> = {
    F: 0,
    D: 0,
    G: 0,
  };

  for (const key of Object.keys(model.models)) {
    const parts = key.split(":");
    const posGroup = parts.length >= 4 ? parts[3] : parts[1];
    if (posGroup === "F" || posGroup === "D" || posGroup === "G") {
      tallies[posGroup] += 1;
    }
  }

  console.log("Model Summary:");
  console.log(`Forwards (F): ${tallies.F} seasons`);
  console.log(`Defensemen (D): ${tallies.D} seasons`);
  console.log(`Goalies (G): ${tallies.G} seasons`);
  console.log(`Total models: ${Object.keys(model.models).length}\n`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
