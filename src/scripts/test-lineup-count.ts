/**
 * Team-Week Lineup Count Test
 * ============================
 * Analyzes team-week combinations to determine lineup processing requirements.
 * Provides statistics on roster sizes across all PlayerDay data.
 *
 * @description
 * This script scans all PlayerDay workbooks to count unique team-week combinations
 * and analyze roster size distributions. Helps estimate computational requirements
 * for batch processing operations.
 *
 * @usage
 * ```sh
 * npm run test:lineup-count
 * tsx src/scripts/test-lineup-count.ts
 * ```
 */

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// ============================================================================
// Configuration
// ============================================================================

/** PlayerDay workbook IDs partitioned by season ranges */
const PLAYERDAY_WORKBOOKS = {
  PLAYERDAYS_1_5: "1ny8gEOotQCbG3uvr29JgX5iRjCS_2Pt44eF4f4l3f1g",
  PLAYERDAYS_6_10: "14XZoxMbcmWh0-XmYOu16Ur0HNOFP9UttHbiMMut_PJ0",
  PLAYERDAYS_11_15: "18IqgstBaBIAfM08w7ddzjF2JTrAqZUjAvsbyZxgHiag",
} as const;

/** Sheet range to fetch (only need team and week columns) */
const FETCH_RANGE = "PlayerDayStatLine!A:E";

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log("📊 Team-Week Lineup Analysis");
  console.log("============================\n");

  const { teamWeekCount, rosterSizes } = await analyzeTeamWeeks();

  displayResults(teamWeekCount, rosterSizes);
}

/**
 * Analyzes all PlayerDay data to count team-weeks and roster sizes.
 */
async function analyzeTeamWeeks(): Promise<{
  teamWeekCount: number;
  rosterSizes: number[];
}> {
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
  const teamWeekSet = new Set<string>();
  const rosterSizes: number[] = [];

  console.log("📥 Fetching PlayerDay data...\n");

  for (const [name, spreadsheetId] of Object.entries(PLAYERDAY_WORKBOOKS)) {
    console.log(`   Fetching ${name}...`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: FETCH_RANGE,
    });

    const rows = response.data.values as string[][] | undefined;
    if (!rows || rows.length < 2) {
      console.log(`   ⚠️  ${name}: No data found`);
      continue;
    }

    const { teamWeekMap } = processWorkbookRows(rows);

    // Record roster sizes for this workbook
    for (const size of teamWeekMap.values()) {
      rosterSizes.push(size);
    }

    // Add to global set
    for (const key of teamWeekMap.keys()) {
      teamWeekSet.add(key);
    }

    console.log(`   ✓ ${name}: ${teamWeekMap.size} team-weeks`);
  }

  console.log();

  return {
    teamWeekCount: teamWeekSet.size,
    rosterSizes: rosterSizes.sort((a, b) => a - b),
  };
}

/**
 * Processes rows from a workbook to extract team-week combinations.
 */
function processWorkbookRows(rows: string[][]): {
  teamWeekMap: Map<string, number>;
} {
  const headers = rows[0]!;
  const teamIdx = headers.findIndex((h) => h.toLowerCase() === "gshlteamid");
  const weekIdx = headers.findIndex((h) => h.toLowerCase() === "weekid");

  const teamWeekMap = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const teamId = row[teamIdx];
    const weekId = row[weekIdx];

    if (teamId && weekId) {
      const key = `${teamId}|${weekId}`;
      teamWeekMap.set(key, (teamWeekMap.get(key) ?? 0) + 1);
    }
  }

  return { teamWeekMap };
}

/**
 * Displays analysis results with formatted statistics.
 */
function displayResults(teamWeekCount: number, rosterSizes: number[]): void {
  console.log("✅ Analysis Complete");
  console.log("===================\n");

  console.log(`Total unique team-weeks: ${teamWeekCount.toLocaleString()}\n`);

  if (rosterSizes.length === 0) {
    console.log("⚠️  No roster data found");
    return;
  }

  const stats = calculateRosterStats(rosterSizes);

  console.log("Roster size statistics:");
  console.log(`  Min: ${stats.min}`);
  console.log(`  Median: ${stats.median}`);
  console.log(`  Max: ${stats.max}`);
  console.log(`  Average: ${stats.average}`);

  console.log(`\nRoster size distribution:`);
  console.log(
    `  > 25 players: ${stats.largeRosterCount} team-weeks (${stats.largeRosterPercent}%)`,
  );
}

/**
 * Calculates statistical measures for roster sizes.
 */
function calculateRosterStats(sortedSizes: number[]): {
  min: number;
  median: number;
  max: number;
  average: string;
  largeRosterCount: number;
  largeRosterPercent: string;
} {
  const min = sortedSizes[0]!;
  const median = sortedSizes[Math.floor(sortedSizes.length / 2)]!;
  const max = sortedSizes[sortedSizes.length - 1]!;
  const average = (
    sortedSizes.reduce((sum, size) => sum + size, 0) / sortedSizes.length
  ).toFixed(1);

  const largeRosterCount = sortedSizes.filter((s) => s > 25).length;
  const largeRosterPercent = (
    (largeRosterCount / sortedSizes.length) *
    100
  ).toFixed(1);

  return {
    min,
    median,
    max,
    average,
    largeRosterCount,
    largeRosterPercent,
  };
}

// ============================================================================
// Script Entry Point
// ============================================================================

main().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exitCode = 1;
});
