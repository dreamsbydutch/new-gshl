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

import {
  deriveAggregationBlendWeights,
  type AggregationBlendWeightsMap,
} from "./utils/aggregation-blend-calculator";
import { tuneGoalieWinWeights } from "./utils/goalie-weight-tuner";

dotenv.config({ path: ".env.local" });

// Dynamic imports to ensure env vars are loaded first
const [{ trainRankingModel, serializeModel }, { PositionGroup, SeasonType }] =
  await Promise.all([
    import("../lib/ranking/index"),
    import("../lib/types/enums"),
  ]);

import type {
  PlayerStatLine,
  TeamStatLine,
  RankingModel,
} from "../lib/ranking/index";
import type { SeasonType as SeasonTypeEnum } from "../lib/types/enums";

type EnhancedRankingModel = RankingModel & {
  aggregationBlendWeights: AggregationBlendWeightsMap;
};

// ============================================================================
// Configuration
// ============================================================================

/** PlayerDay workbook IDs partitioned by season ranges */
const PLAYERDAY_WORKBOOKS = {
  PLAYERDAYS_1_5: "1ny8gEOotQCbG3uvr29JgX5iRjCS_2Pt44eF4f4l3f1g",
  PLAYERDAYS_6_10: "14XZoxMbcmWh0-XmYOu16Ur0HNOFP9UttHbiMMut_PJ0",
  PLAYERDAYS_11_15: "18IqgstBaBIAfM08w7ddzjF2JTrAqZUjAvsbyZxgHiag",
} as const;

/** General workbook (Week metadata, etc.) */
const GENERAL_WORKBOOK = "1I6kmnnL6rSAWLOG12Ixr89g4W-ZQ0weGbfETKDTrvH8";

/** PlayerStats workbook ID (contains PlayerWeek, PlayerSplit, PlayerTotal) */
const PLAYERSTATS_WORKBOOK = "1qkyxmx8gC-xs8niDrmlB9Jv6qXhRmAWjFCq8ECEr-Cg";

/** TeamStats workbook ID (contains TeamWeekStatLine for scarcity analysis) */
const TEAMSTATS_WORKBOOK = "1X2pvw18aYEekdNApyJMqijOZL1Bl0e3Azlkg-eb2X54";

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

const normalizeStringInput = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }
  return null;
};

const normalizeUppercaseInput = (value: unknown): string | null => {
  const normalized = normalizeStringInput(value);
  return normalized ? normalized.toUpperCase() : null;
};

const SEASON_TYPE_ALIASES: Record<string, SeasonTypeEnum> = {
  REGULAR_SEASON: SeasonType.REGULAR_SEASON,
  RS: SeasonType.REGULAR_SEASON,
  PLAYOFFS: SeasonType.PLAYOFFS,
  PO: SeasonType.PLAYOFFS,
  LOSERS_TOURNAMENT: SeasonType.LOSERS_TOURNAMENT,
  LOSERS: SeasonType.LOSERS_TOURNAMENT,
  LT: SeasonType.LOSERS_TOURNAMENT,
};

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log("🚀 Ranking Model Training");
  console.log("=========================\n");

  try {
    // Step 1: Fetch all PlayerDay stat lines
    const allPlayerStatLines = await fetchAllPlayerDays();

    // Step 2: Fetch all TeamDay stat lines
    const allTeamStatLines = await fetchAllTeamDays();

    // Step 3: Combine player and team stat lines
    const allStatLines = [...allPlayerStatLines, ...allTeamStatLines] as (
      | PlayerStatLine
      | TeamStatLine
    )[];

    // Step 4: Fetch team-level data for scarcity analysis
    const teamWeekStats = await fetchTeamWeekStats();

    // Step 5: Fetch week metadata (season phases)
    const weekTypeLookup = await fetchWeekTypeMap();

    // Step 6: Validate data structure
    validateDataStructure(allPlayerStatLines);

    // Step 7: Analyze dataset
    displayDatasetAnalysis(allStatLines);

    // Step 8: Analyze team-level scarcity
    const scarcityWeights = analyzeTeamScarcity(teamWeekStats);

    // Step 9: Compute scoreboard-aware category impact
    const categoryImpactWeights = calculateCategoryImpactWeights(teamWeekStats);

    // Step 10: Train the model with advanced weighting inputs
    const model = trainModel(
      allStatLines,
      scarcityWeights,
      categoryImpactWeights,
      weekTypeLookup,
    );

    // Step 11: Display model summary
    displayModelSummary(model);

    // Step 12: Save model to file
    await saveModelToFile(model);

    // Step 13: Display validation metrics
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
async function fetchAllPlayerDays(): Promise<PlayerStatLine[]> {
  console.log("📥 Fetching PlayerDay data from Google Sheets...");
  console.log("   Querying all PlayerDay workbooks (seasons 1-15)");
  console.log("   This may take several minutes.\n");

  const startTime = Date.now();
  const { google } = await import("googleapis");
  const { env } = await import("../env.js");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY) as Record<
      string,
      unknown
    >,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const allStatLines: PlayerStatLine[] = [];

  // Fetch daily stat lines
  for (const [name, spreadsheetId] of Object.entries(PLAYERDAY_WORKBOOKS)) {
    console.log(`   Fetching ${name} (daily)...`);

    try {
      // Try multiple possible sheet names
      const possibleSheetNames = [
        "PlayerDayStatLine",
        "PlayerDay",
        "StatLines",
      ];
      let rows: unknown[][] | undefined;
      let sheetName = "";

      for (const trySheetName of possibleSheetNames) {
        try {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${trySheetName}!A:AZ`,
          });
          rows = response.data.values as unknown[][] | undefined;
          if (rows && rows.length >= 2) {
            sheetName = trySheetName;
            break;
          }
        } catch {
          // Try next sheet name
          continue;
        }
      }

      if (!rows || rows.length < 2) {
        console.log(
          `   ⚠️  ${name}: No data found (tried: ${possibleSheetNames.join(", ")})`,
        );
        continue;
      }

      // Parse in batches to avoid stack overflow
      const dataRows = parseWorkbookRows(rows);
      const batchSize = 10000;
      for (let i = 0; i < dataRows.length; i += batchSize) {
        const batch = dataRows.slice(i, i + batchSize);
        for (const row of batch) {
          allStatLines.push(row);
        }
      }

      console.log(
        `   ✓ ${name} [${sheetName}]: ${dataRows.length.toLocaleString()} daily stat lines`,
      );
    } catch (error) {
      console.log(
        `   ❌ ${name}: Error -`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // Fetch weekly stat lines
  console.log(`\n   Fetching PlayerWeek (weekly)...`);
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: PLAYERSTATS_WORKBOOK,
      range: "PlayerWeekStatLine!A:AZ",
    });

    const rows = response.data.values as unknown[][] | undefined;
    if (rows && rows.length >= 2) {
      const dataRows = parseWorkbookRows(rows);
      for (const row of dataRows) {
        allStatLines.push(row);
      }
      console.log(
        `   ✓ PlayerWeek: ${dataRows.length.toLocaleString()} weekly stat lines`,
      );
    } else {
      console.log(`   ⚠️  PlayerWeek: No data found`);
    }
  } catch (error) {
    console.log(
      `   ❌ PlayerWeek: Error -`,
      error instanceof Error ? error.message : error,
    );
  }

  // Fetch season stat lines (PlayerSplit aggregates by season)
  console.log(`\n   Fetching PlayerSplit (season)...`);
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: PLAYERSTATS_WORKBOOK,
      range: "PlayerSplitStatLine!A:AZ",
    });

    const rows = response.data.values as unknown[][] | undefined;
    if (rows && rows.length >= 2) {
      const dataRows = parseWorkbookRows(rows);
      for (const row of dataRows) {
        allStatLines.push(row);
      }
      console.log(
        `   ✓ PlayerSplit: ${dataRows.length.toLocaleString()} season stat lines`,
      );
    } else {
      console.log(`   ⚠️  PlayerSplit: No data found`);
    }
  } catch (error) {
    console.log(
      `   ❌ PlayerSplit: Error -`,
      error instanceof Error ? error.message : error,
    );
  }

  // Fetch player totals (season aggregates across teams)
  console.log(`\n   Fetching PlayerTotal (season totals)...`);
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: PLAYERSTATS_WORKBOOK,
      range: "PlayerTotalStatLine!A:AZ",
    });

    const rows = response.data.values as unknown[][] | undefined;
    if (rows && rows.length >= 2) {
      const dataRows = parseWorkbookRows(rows);
      for (const row of dataRows) {
        allStatLines.push(row);
      }
      console.log(
        `   ✓ PlayerTotal: ${dataRows.length.toLocaleString()} cumulative stat lines`,
      );
    } else {
      console.log(`   ⚠️  PlayerTotal: No data found`);
    }
  } catch (error) {
    console.log(
      `   ❌ PlayerTotal: Error -`,
      error instanceof Error ? error.message : error,
    );
  }

  // Fetch NHL data (league context for scarcity + priors)
  console.log(`\n   Fetching PlayerNHL (NHL season)...`);
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: PLAYERSTATS_WORKBOOK,
      range: "PlayerNHLStatLine!A:AZ",
    });

    const rows = response.data.values as unknown[][] | undefined;
    if (rows && rows.length >= 2) {
      const dataRows = parseWorkbookRows(rows);
      for (const row of dataRows) {
        allStatLines.push(row);
      }
      console.log(
        `   ✓ PlayerNHL: ${dataRows.length.toLocaleString()} NHL season stat lines`,
      );
    } else {
      console.log(`   ⚠️  PlayerNHL: No data found`);
    }
  } catch (error) {
    console.log(
      `   ❌ PlayerNHL: Error -`,
      error instanceof Error ? error.message : error,
    );
  }

  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\n✓ Fetched ${allStatLines.length.toLocaleString()} total stat lines (daily + weekly + splits + totals + NHL) in ${elapsedTime}s\n`,
  );

  if (allStatLines.length === 0) {
    throw new Error("No stat lines found. Cannot train model.");
  }

  // Filter out empty stat lines (GP === 0 or GP === "0")
  const beforeFilter = allStatLines.length;
  const filteredStatLines = allStatLines.filter((line) => {
    // GP field exists in raw data but not in type definition
    const rawLine = line as unknown as Record<string, unknown>;
    const gp = rawLine.GP;
    const gpNum = typeof gp === "string" ? parseFloat(gp) : (gp as number);
    return gpNum > 0;
  });

  const filtered = beforeFilter - filteredStatLines.length;
  console.log(
    `🧹 Filtered out ${filtered.toLocaleString()} empty stat lines (GP = 0)`,
  );
  console.log(
    `   Remaining: ${filteredStatLines.length.toLocaleString()} active stat lines\n`,
  );

  return filteredStatLines;
}

/**
 * Fetches all TeamDay stat lines from the TeamStats workbook.
 */
async function fetchAllTeamDays(): Promise<TeamStatLine[]> {
  console.log("📥 Fetching TeamDay data from Google Sheets...");
  console.log("   Querying TeamStats workbook for team performance data");
  console.log("   This may take a few minutes.\n");

  const startTime = Date.now();
  const { google } = await import("googleapis");
  const { env } = await import("../env.js");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY) as Record<
      string,
      unknown
    >,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const allTeamStatLines: TeamStatLine[] = [];

  // Fetch daily team stat lines
  console.log(`   Fetching TeamDay (daily)...`);
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: TEAMSTATS_WORKBOOK,
      range: "TeamDayStatLine!A:AZ",
    });

    const rows = response.data.values as unknown[][] | undefined;
    if (rows && rows.length >= 2) {
      const dataRows = parseTeamWorkbookRows(rows);
      for (const row of dataRows) {
        allTeamStatLines.push(row);
      }
      console.log(
        `   ✓ TeamDay: ${dataRows.length.toLocaleString()} daily team stat lines`,
      );
    } else {
      console.log(`   ⚠️  TeamDay: No data found`);
    }
  } catch (error) {
    console.log(
      `   ❌ TeamDay: Error -`,
      error instanceof Error ? error.message : error,
    );
  }

  // Fetch weekly team stat lines
  console.log(`\n   Fetching TeamWeek (weekly)...`);
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: TEAMSTATS_WORKBOOK,
      range: "TeamWeekStatLine!A:AZ",
    });

    const rows = response.data.values as unknown[][] | undefined;
    if (rows && rows.length >= 2) {
      const dataRows = parseTeamWorkbookRows(rows);
      for (const row of dataRows) {
        allTeamStatLines.push(row);
      }
      console.log(
        `   ✓ TeamWeek: ${dataRows.length.toLocaleString()} weekly team stat lines`,
      );
    } else {
      console.log(`   ⚠️  TeamWeek: No data found`);
    }
  } catch (error) {
    console.log(
      `   ❌ TeamWeek: Error -`,
      error instanceof Error ? error.message : error,
    );
  }

  // Fetch season team stat lines
  console.log(`\n   Fetching TeamSeason (season)...`);
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: TEAMSTATS_WORKBOOK,
      range: "TeamSeasonStatLine!A:AZ",
    });

    const rows = response.data.values as unknown[][] | undefined;
    if (rows && rows.length >= 2) {
      const dataRows = parseTeamWorkbookRows(rows);
      for (const row of dataRows) {
        allTeamStatLines.push(row);
      }
      console.log(
        `   ✓ TeamSeason: ${dataRows.length.toLocaleString()} season team stat lines`,
      );
    } else {
      console.log(`   ⚠️  TeamSeason: No data found`);
    }
  } catch (error) {
    console.log(
      `   ❌ TeamSeason: Error -`,
      error instanceof Error ? error.message : error,
    );
  }

  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\n✓ Fetched ${allTeamStatLines.length.toLocaleString()} total team stat lines (daily + weekly + season) in ${elapsedTime}s\n`,
  );

  // Filter out empty stat lines (GP === 0 or GP === "0")
  const beforeFilter = allTeamStatLines.length;
  const filteredStatLines = allTeamStatLines.filter((line) => {
    const rawLine = line as unknown as Record<string, unknown>;
    const gp = rawLine.GP;
    const gpNum = typeof gp === "string" ? parseFloat(gp) : (gp as number);
    return gpNum > 0;
  });

  const filtered = beforeFilter - filteredStatLines.length;
  if (filtered > 0) {
    console.log(
      `🧹 Filtered out ${filtered.toLocaleString()} empty team stat lines (GP = 0)`,
    );
    console.log(
      `   Remaining: ${filteredStatLines.length.toLocaleString()} active team stat lines\n`,
    );
  }

  return filteredStatLines;
}

/**
 * Parses team workbook rows into TeamStatLine objects with TEAM position group.
 */
function parseTeamWorkbookRows(rows: unknown[][]): TeamStatLine[] {
  const headers = rows[0] as string[];
  const dataRows = rows.slice(1);

  return dataRows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? "";
    });
    // Add posGroup: "TEAM" to all team stat lines
    obj.posGroup = "TEAM";
    return obj as unknown as TeamStatLine;
  });
}

/**
 * Parses workbook rows into stat line objects.
 */
function parseWorkbookRows(rows: unknown[][]): PlayerStatLine[] {
  const headers = rows[0] as string[];
  const dataRows = rows.slice(1);

  return dataRows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? "";
    });
    return obj as unknown as PlayerStatLine;
  });
}

/**
 * Fetches TeamWeekStatLine data for scarcity analysis
 */
async function fetchTeamWeekStats(): Promise<Record<string, unknown>[]> {
  console.log("📊 Fetching TeamWeek data for scarcity analysis...");

  const { google } = await import("googleapis");
  const { env } = await import("../env.js");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY) as Record<
      string,
      unknown
    >,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: TEAMSTATS_WORKBOOK,
      range: "TeamWeekStatLine!A:AZ",
    });

    const rows = response.data.values as unknown[][] | undefined;
    if (!rows || rows.length < 2) {
      console.log("   ⚠️  No TeamWeek data found\n");
      return [];
    }

    const teamStats = parseWorkbookRows(rows) as unknown as Record<
      string,
      unknown
    >[];
    console.log(
      `   ✓ Loaded ${teamStats.length.toLocaleString()} team-week records\n`,
    );

    return teamStats;
  } catch (error) {
    console.log(
      "   ❌ Error fetching TeamWeek:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

async function fetchWeekTypeMap(): Promise<Record<string, SeasonTypeEnum>> {
  console.log("📅 Fetching week metadata (season phases)...");

  const { google } = await import("googleapis");
  const { env } = await import("../env.js");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY) as Record<
      string,
      unknown
    >,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GENERAL_WORKBOOK,
      range: "Week!A:AZ",
    });

    const rows = response.data.values as unknown[][] | undefined;
    if (!rows || rows.length < 2) {
      console.log("   ⚠️  No week metadata found");
      return {};
    }

    const headers = rows[0] as string[];
    const idIndex = headers.findIndex((h) => h === "id");
    const typeIndex = headers.findIndex((h) => h === "weekType");
    if (idIndex === -1 || typeIndex === -1) {
      console.log("   ⚠️  Week sheet missing id/weekType columns");
      return {};
    }

    const map: Record<string, SeasonTypeEnum> = {};
    for (const row of rows.slice(1)) {
      const normalizedId = normalizeStringInput(row[idIndex]);
      if (!normalizedId) continue;
      const phase = normalizeWeekType(row[typeIndex]);
      map[normalizedId] = phase;
    }

    console.log(
      `   ✓ Loaded week metadata for ${Object.keys(map).length} weeks`,
    );
    return map;
  } catch (error) {
    console.log(
      "   ❌ Error fetching Week metadata:",
      error instanceof Error ? error.message : error,
    );
    return {};
  }
}

/**
 * Analyzes team-level stat variance to determine scarcity weights
 * Stats with higher variance between teams are more valuable
 */
function analyzeTeamScarcity(
  teamStats: Record<string, unknown>[],
): Record<string, number> {
  console.log("🔬 Analyzing team-level stat scarcity...");

  if (teamStats.length === 0) {
    console.log("   ⚠️  No team data - using equal scarcity weights\n");
    return {};
  }

  const statCategories = [
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
  ];
  const scarcityWeights: Record<string, number> = {};

  for (const stat of statCategories) {
    // Extract stat values from team data
    const values: number[] = [];
    for (const team of teamStats) {
      const val = team[stat];
      const num = typeof val === "string" ? parseFloat(val) : (val as number);
      if (!isNaN(num) && num > 0) {
        values.push(num);
      }
    }

    if (values.length === 0) continue;

    // Calculate coefficient of variation (stdDev / mean)
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;

    // Higher CV = more variance between teams = more valuable stat
    scarcityWeights[stat] = coefficientOfVariation;
  }

  // Normalize weights to 0.5 - 1.5 range
  const maxWeight = Math.max(...Object.values(scarcityWeights));
  if (maxWeight > 0) {
    for (const stat of statCategories) {
      const currentWeight = scarcityWeights[stat];
      if (currentWeight) {
        scarcityWeights[stat] = 0.5 + currentWeight / maxWeight;
      }
    }
  }

  console.log("   Scarcity Multipliers (team-level variance):");
  for (const stat of statCategories) {
    const weight = scarcityWeights[stat];
    if (weight) {
      console.log(`     ${stat.padEnd(4)}: ${weight.toFixed(3)}x`);
    }
  }
  console.log();

  return scarcityWeights;
}

function calculateCategoryImpactWeights(
  teamStats: Record<string, unknown>[],
): Record<string, number> {
  const categories = [
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
  ];

  const averages: Record<string, number> = {};

  for (const stat of categories) {
    const values: number[] = [];
    for (const team of teamStats) {
      const raw = team[stat];
      const value = typeof raw === "string" ? parseFloat(raw) : (raw as number);
      if (!Number.isFinite(value)) continue;
      if (stat === "GAA" && value <= 0) continue;
      values.push(Math.abs(value));
    }

    if (values.length === 0) continue;
    const sum = values.reduce((acc, val) => acc + val, 0);
    averages[stat] = sum / values.length;
  }

  const averageValues = Object.values(averages).filter((val) => val > 0);
  if (averageValues.length === 0) return {};

  const globalMean =
    averageValues.reduce((acc, val) => acc + val, 0) / averageValues.length;

  const clamp = (val: number, min: number, max: number) =>
    Math.min(max, Math.max(min, val));

  const impactWeights: Record<string, number> = {};
  for (const stat of categories) {
    const statMean = averages[stat];
    if (!statMean || statMean <= 0) continue;
    const ratio = globalMean / statMean;
    impactWeights[stat] = clamp(ratio, 0.35, 3.0);
  }

  console.log("   Scoreboard impact multipliers:");
  for (const stat of categories) {
    const impact = impactWeights[stat];
    const average = averages[stat];
    if (impact && average) {
      console.log(
        `     ${stat.padEnd(4)}: ${impact.toFixed(3)}x (avg ${average.toFixed(2)})`,
      );
    }
  }
  console.log();

  return impactWeights;
}

function normalizeWeekType(value: unknown): SeasonTypeEnum {
  const normalized = normalizeUppercaseInput(value);
  if (!normalized) return SeasonType.REGULAR_SEASON;
  return SEASON_TYPE_ALIASES[normalized] ?? SeasonType.REGULAR_SEASON;
}

// ============================================================================
// Validation & Analysis
// ============================================================================

/**
 * Validates that the dataset contains all required fields.
 */
function validateDataStructure(statLines: PlayerStatLine[]): void {
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
function displayDatasetAnalysis(
  statLines: (PlayerStatLine | TeamStatLine)[],
): void {
  console.log("📊 Dataset Analysis:");

  const seasons = new Set(statLines.map((s) => s.seasonId));
  console.log(`   Seasons: ${seasons.size}`);
  console.log(`   Season range: ${Array.from(seasons).sort().join(", ")}`);

  const playerLines = statLines.filter(
    (s): s is PlayerStatLine => "playerId" in s,
  );
  const teamLines = statLines.filter(
    (s): s is TeamStatLine => !("playerId" in s),
  );

  const positionCounts = {
    [PositionGroup.F]: playerLines.filter((s) => s.posGroup === PositionGroup.F)
      .length,
    [PositionGroup.D]: playerLines.filter((s) => s.posGroup === PositionGroup.D)
      .length,
    [PositionGroup.G]: playerLines.filter((s) => s.posGroup === PositionGroup.G)
      .length,
    [PositionGroup.TEAM]: teamLines.length,
  };

  console.log(`   Forwards: ${positionCounts.F.toLocaleString()}`);
  console.log(`   Defense: ${positionCounts.D.toLocaleString()}`);
  console.log(`   Goalies: ${positionCounts.G.toLocaleString()}`);
  console.log(`   Teams: ${positionCounts.TEAM.toLocaleString()}\n`);
}

// ============================================================================
// Model Training
// ============================================================================

/**
 * Trains the ranking model on the provided stat lines.
 */
function trainModel(
  statLines: (PlayerStatLine | TeamStatLine)[],
  scarcityWeights: Record<string, number>,
  categoryImpactWeights: Record<string, number>,
  weekTypeLookup: Record<string, SeasonTypeEnum>,
): EnhancedRankingModel {
  console.log("🎓 Training Ranking Model...");
  console.log("   Analyzing distributions and calculating optimal weights.\n");

  const startTime = Date.now();
  const config = {
    ...TRAINING_CONFIG,
    scarcityWeights,
    categoryImpactWeights,
    weekTypeLookup,
  };
  const model = trainRankingModel(statLines, config);
  const aggregationBlendWeights = deriveAggregationBlendWeights(model);
  const enhancedModel: EnhancedRankingModel = tuneGoalieWinWeights({
    ...model,
    aggregationBlendWeights,
  });
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`✓ Training completed in ${elapsedTime}s\n`);

  return enhancedModel;
}

// ============================================================================
// Model Summary & Output
// ============================================================================

/**
 * Displays a summary of the trained model.
 */
function displayModelSummary(model: EnhancedRankingModel): void {
  console.log("📦 Model Summary:");
  console.log(`   Version: ${model.version}`);
  console.log(`   Total samples: ${model.totalSamples.toLocaleString()}`);
  console.log(
    `   Season range: ${model.seasonRange.earliest} to ${model.seasonRange.latest}`,
  );
  console.log(`   Models trained: ${Object.keys(model.models).length}\n`);

  displayPositionWeights(model);
  displayBlendWeightSummary(model.aggregationBlendWeights);
}

/**
 * Displays position-specific weights from the trained model.
 */
function displayPositionWeights(model: RankingModel): void {
  console.log("⚖️  Position Weights:");

  for (const pos of [
    PositionGroup.F,
    PositionGroup.D,
    PositionGroup.G,
    PositionGroup.TEAM,
  ]) {
    const weights = model.globalWeights[pos];
    console.log(`\n   ${pos}:`);

    const relevantStats =
      pos === PositionGroup.G
        ? ["W", "GA", "GAA", "SA", "SV", "SVP", "SO", "TOI"]
        : pos === PositionGroup.TEAM
          ? ["G", "A", "P", "PPP", "SOG", "HIT", "BLK", "W", "GA", "GAA"]
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

function displayBlendWeightSummary(weights: AggregationBlendWeightsMap): void {
  console.log("🎚 Aggregation Blend Weights:");

  const aggregationLevels = Object.keys(weights);
  if (!aggregationLevels.length) {
    console.log("   No aggregation-specific blends were generated.\n");
    return;
  }

  for (const aggregationLevel of aggregationLevels) {
    console.log(`\n   ${aggregationLevel}:`);
    const config = weights[aggregationLevel];
    if (!config) {
      console.log("      (no data)");
      continue;
    }

    const entries = Object.entries(config);
    for (const [posGroup, blend] of entries) {
      console.log(
        `      ${posGroup.padEnd(7)} all:${blend.all.toFixed(2)} top5:${blend.top5.toFixed(2)} top3:${blend.top3.toFixed(2)} top2:${blend.top2.toFixed(2)}`,
      );
    }
  }

  console.log();
}

/**
 * Saves the trained model to a JSON file.
 */
async function saveModelToFile(model: EnhancedRankingModel): Promise<void> {
  console.log("💾 Saving model to file...");

  const modelJson = serializeModel(model);
  await writeFile(MODEL_OUTPUT_PATH, modelJson, "utf-8");

  const fileSizeKb = (Buffer.byteLength(modelJson, "utf-8") / 1024).toFixed(1);
  console.log(`✓ Model saved to ${MODEL_OUTPUT_PATH} (${fileSizeKb} KB)\n`);
}

/**
 * Displays validation metrics showing model coverage.
 */
function displayValidationMetrics(
  model: RankingModel,
  statLines: (PlayerStatLine | TeamStatLine)[],
): void {
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
    const expectedPositions = 4; // F, D, G, TEAM
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
