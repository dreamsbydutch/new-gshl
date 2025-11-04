/**
 * Team-Date Roster Size Analysis
 * ===============================
 * Analyzes roster sizes per team-date combination to understand daily lineup distribution.
 * Provides insights into active vs inactive player counts.
 *
 * @description
 * This script examines PlayerDay data to determine how many players each team
 * has on specific dates, categorizing them by activity status (GP=1 or GS=1).
 * Useful for understanding daily roster management patterns.
 *
 * @usage
 * ```sh
 * npm run test:team-date-sizes
 * tsx src/scripts/test-team-date-sizes.ts
 * ```
 */

import { google } from "googleapis";
import { config } from "dotenv";

config({ path: ".env.local" });

// ============================================================================
// Type Definitions
// ============================================================================

interface PlayerDayData {
  gshlTeamId?: string;
  date?: string;
  playerId?: string;
  GP?: string;
  GS?: string;
}

interface RosterStats {
  active: number;
  inactive: number;
}

interface WorkbookConfig {
  name: string;
  id: string | undefined;
}

// ============================================================================
// Configuration
// ============================================================================

/** Sample size for detailed active/inactive tracking */
const SAMPLE_SIZE = 10;

/** Sheet range to fetch */
const FETCH_RANGE = "PlayerDayStatLine!A1:ZZ";

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log("📊 Team-Date Roster Size Analysis");
  console.log("=================================\n");

  try {
    const sheets = await initializeSheetsClient();
    const workbooks = getWorkbookConfig();

    const { teamDateSizes, sampleDetails } = await analyzeTeamDates(
      sheets,
      workbooks,
    );

    displayResults(teamDateSizes, sampleDetails);
  } catch (error) {
    console.error("❌ Analysis failed:", error);
    process.exitCode = 1;
  }
}

/**
 * Initializes the Google Sheets API client with authentication.
 */
async function initializeSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "{}",
    ) as Record<string, unknown>,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
}

/**
 * Retrieves workbook configuration from environment variables.
 */
function getWorkbookConfig(): WorkbookConfig[] {
  return [
    { name: "PLAYERDAYS_6_10", id: process.env.PLAYERDAYS_6_10_ID },
    { name: "PLAYERDAYS_11_15", id: process.env.PLAYERDAYS_11_15_ID },
  ];
}

/**
 * Analyzes team-date combinations across all configured workbooks.
 */
async function analyzeTeamDates(
  sheets: ReturnType<typeof google.sheets>,
  workbooks: WorkbookConfig[],
): Promise<{
  teamDateSizes: Map<string, number>;
  sampleDetails: Map<string, RosterStats>;
}> {
  const teamDateSizes = new Map<string, number>();
  const sampleDetails = new Map<string, RosterStats>();

  console.log("📥 Fetching PlayerDay data...\n");

  for (const workbook of workbooks) {
    if (!workbook.id) {
      console.log(`   ⚠️  ${workbook.name}: Skipping (no ID configured)`);
      continue;
    }

    console.log(`   Fetching ${workbook.name}...`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: workbook.id,
      range: FETCH_RANGE,
    });

    const rows = response.data.values ?? [];
    if (rows.length === 0) {
      console.log(`   ⚠️  ${workbook.name}: No data found`);
      continue;
    }

    processWorkbookData(rows, teamDateSizes, sampleDetails);
    console.log(`   ✓ ${workbook.name}: Processed`);
  }

  console.log();

  return { teamDateSizes, sampleDetails };
}

/**
 * Processes workbook data to extract team-date roster information.
 */
function processWorkbookData(
  rows: unknown[][],
  teamDateSizes: Map<string, number>,
  sampleDetails: Map<string, RosterStats>,
): void {
  const headers = rows[0] as string[];
  const dataRows = rows.slice(1);

  for (const row of dataRows) {
    const data = parsePlayerDayRow(headers, row);
    const { gshlTeamId, date, GP, GS } = data;

    if (!gshlTeamId || !date) continue;

    const key = `${gshlTeamId}|${date}`;
    teamDateSizes.set(key, (teamDateSizes.get(key) ?? 0) + 1);

    // Track detailed stats for first N samples
    if (sampleDetails.size < SAMPLE_SIZE) {
      updateSampleDetails(key, GP, GS, sampleDetails);
    }
  }
}

/**
 * Parses a row into a PlayerDayData object.
 */
function parsePlayerDayRow(headers: string[], row: unknown[]): PlayerDayData {
  const data: PlayerDayData = {};
  headers.forEach((header, idx) => {
    data[header as keyof PlayerDayData] = row[idx] as string | undefined;
  });
  return data;
}

/**
 * Updates sample details with active/inactive player counts.
 */
function updateSampleDetails(
  key: string,
  GP: string | undefined,
  GS: string | undefined,
  sampleDetails: Map<string, RosterStats>,
): void {
  if (!sampleDetails.has(key)) {
    sampleDetails.set(key, { active: 0, inactive: 0 });
  }

  const stats = sampleDetails.get(key)!;
  const gp = parseFloat(GP ?? "0");
  const gs = parseFloat(GS ?? "0");

  if (gp === 1 || gs === 1) {
    stats.active++;
  } else {
    stats.inactive++;
  }
}

/**
 * Displays analysis results with formatted statistics.
 */
function displayResults(
  teamDateSizes: Map<string, number>,
  sampleDetails: Map<string, RosterStats>,
): void {
  console.log("✅ Analysis Complete");
  console.log("===================\n");

  const sizes = Array.from(teamDateSizes.values()).sort((a, b) => a - b);

  console.log(
    `Total unique team-dates: ${teamDateSizes.size.toLocaleString()}\n`,
  );

  displaySizeStatistics(sizes);
  displayDistribution(sizes);
  displaySampleDetails(sampleDetails);
}

/**
 * Displays basic roster size statistics.
 */
function displaySizeStatistics(sizes: number[]): void {
  if (sizes.length === 0) {
    console.log("⚠️  No roster data found");
    return;
  }

  const min = sizes[0]!;
  const median = sizes[Math.floor(sizes.length / 2)]!;
  const max = sizes[sizes.length - 1]!;
  const avg = (sizes.reduce((sum, s) => sum + s, 0) / sizes.length).toFixed(1);

  console.log("Roster size statistics:");
  console.log(`  Min: ${min}`);
  console.log(`  Median: ${median}`);
  console.log(`  Max: ${max}`);
  console.log(`  Average: ${avg}\n`);
}

/**
 * Displays roster size distribution by ranges.
 */
function displayDistribution(sizes: number[]): void {
  const under15 = sizes.filter((s) => s < 15).length;
  const normal = sizes.filter((s) => s >= 15 && s <= 25).length;
  const over25 = sizes.filter((s) => s > 25).length;
  const total = sizes.length;

  console.log("Roster size distribution:");
  console.log(
    `  < 15 players: ${under15.toLocaleString()} team-dates (${((under15 / total) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  15-25 players: ${normal.toLocaleString()} team-dates (${((normal / total) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  > 25 players: ${over25.toLocaleString()} team-dates (${((over25 / total) * 100).toFixed(1)}%)\n`,
  );
}

/**
 * Displays sample details showing active vs inactive players.
 */
function displaySampleDetails(sampleDetails: Map<string, RosterStats>): void {
  if (sampleDetails.size === 0) return;

  console.log(`Sample team-dates (active vs inactive players):`);
  for (const [key, stats] of sampleDetails.entries()) {
    const [team, date] = key.split("|");
    const total = stats.active + stats.inactive;
    console.log(
      `  ${team} on ${date}: ${stats.active} active, ${stats.inactive} inactive (${total} total)`,
    );
  }
}

// ============================================================================
// Script Entry Point
// ============================================================================

main().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exitCode = 1;
});
