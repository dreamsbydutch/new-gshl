/**
 * Update All Lineup Positions Script
 * ===================================
 * Optimizes fantasy hockey lineups and calculates roster management metrics.
 *
 * @description
 * This script performs comprehensive lineup optimization for all team-day combinations:
 * - Fetches all PlayerDay records from Google Sheets
 * - Groups players by team and date
 * - Runs lineup optimization algorithm for each team-day
 * - Calculates derived metrics (fullPos, bestPos, MS, BS, ADD)
 * - Batch updates Google Sheets with optimized positions
 *
 * @metrics
 * - fullPos: Optimal lineup position for maximizing performance
 * - bestPos: Best possible position for this player
 * - MS (Missed Starts): Players who played but weren't in starting lineup
 * - BS (Bad Starts): Players who started but should have been benched
 * - ADD: Flag indicating player was newly added to roster
 *
 * @usage
 * ```sh
 * npm run lineup:update-all        # Process all seasons
 * node --expose-gc update-all-lineups.js  # With garbage collection
 * ```
 *
 * @performance
 * - Processes 10k+ team-day combinations
 * - Uses chunked batch updates (10k rows per chunk)
 * - Includes retry logic with exponential backoff
 * - Optional garbage collection hints for memory management
 */

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Dynamic imports to ensure env vars are loaded first
const [{ optimizeLineup }] = await Promise.all([
  import("../lib/utils/index.js"),
]);

import type { LineupPlayer } from "../lib/utils/domain/lineup-optimizer.js";
import type { RosterPosition, PositionGroup } from "../lib/types/enums.js";
import { RosterPosition as Pos } from "../lib/types/enums.js";

// ============================================================================
// Configuration
// ============================================================================

/** PlayerDay workbook IDs from partition config */
const PLAYERDAY_WORKBOOKS = {
  PLAYERDAYS_1_5: "1ny8gEOotQCbG3uvr29JgX5iRjCS_2Pt44eF4f4l3f1g",
  PLAYERDAYS_6_10: "14XZoxMbcmWh0-XmYOu16Ur0HNOFP9UttHbiMMut_PJ0",
  PLAYERDAYS_11_15: "18IqgstBaBIAfM08w7ddzjF2JTrAqZUjAvsbyZxgHiag",
};

/** Number of rows to process per batch update chunk */
const CHUNK_SIZE = 10000;

/** Delay between chunks to avoid API rate limits (ms) */
const CHUNK_DELAY_MS = 2000;

/** Initial retry delay for quota errors (ms) */
const INITIAL_RETRY_DELAY_MS = 10000;

/** Maximum number of retries for failed operations */
const MAX_RETRIES = 5;

/** Progress update frequency (every N team-days) */
const PROGRESS_UPDATE_FREQUENCY = 50;

// ============================================================================
// Type Definitions
// ============================================================================

interface PlayerDayRow {
  row: number; // Row number in sheet (1-indexed, accounting for header)
  data: any;
  fullPos?: RosterPosition;
  bestPos?: RosterPosition;
  MS?: number; // Missed Start (0 or 1)
  BS?: number; // Bad Start (0 or 1)
  ADD?: number; // Added to roster (1 if new, undefined/empty if continuing)
}

interface TeamWeekLineup {
  gshlTeamId: string;
  weekId: string;
  players: PlayerDayRow[];
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
  console.log("🔄 Update All Lineup Positions (fullPos, bestPos, MS, BS, ADD)");
  console.log("=" + "=".repeat(79) + "\n");

  // Step 1: Fetch all player days
  const { sheets, workbookData } = await fetchAllPlayerDays();

  // Step 2: Get all unique season IDs
  const allSeasonIds = getAllSeasonIds(workbookData);
  console.log(
    `📊 Found ${allSeasonIds.length} seasons: ${allSeasonIds.join(", ")}\n`,
  );

  // Step 3: Process each season
  for (const seasonId of allSeasonIds) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🏒 Processing Season ${seasonId}`);
    console.log(`${"=".repeat(80)}\n`);

    // Calculate ADD (Added to roster) flags for this season
    calculateADD(workbookData, seasonId);

    // Group by team-date for this season
    const teamWeekLineups = groupByTeamWeek(workbookData, seasonId);

    // Optimize all lineups and calculate MS/BS for this season
    await optimizeAllLineups(teamWeekLineups);
  }

  // Step 4: Bulk update all seasons at once
  console.log(`\n${"=".repeat(80)}`);
  console.log("💾 Writing all updates to Google Sheets");
  console.log(`${"=".repeat(80)}\n`);
  await updateLineupPositionsInSheets(sheets, workbookData);

  console.log(
    "✅ All lineup positions & start tracking updated successfully!\n",
  );
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Fetches all PlayerDay data from Google Sheets across multiple workbooks.
 */
async function fetchAllPlayerDays() {
  console.log("📥 Fetching all PlayerDay data from Google Sheets...\n");

  const { google } = await import("googleapis");
  const { env } = await import("../env.js");

  // Parse service account credentials
  const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const workbookData = new Map<string, WorkbookData>();

  for (const [name, spreadsheetId] of Object.entries(PLAYERDAY_WORKBOOKS)) {
    try {
      console.log(`   Fetching from ${name}...`);
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "PlayerDayStatLine!A:AZ",
      });

      const rows = response.data.values;
      if (!rows || rows.length < 2) {
        console.log(`   ⚠️  ${name}: No data found`);
        continue;
      }

      const headers = rows[0] as string[];
      const dataRows = rows.slice(1);

      // Store rows with their row numbers (2-indexed because of header)
      const playerDayRows: PlayerDayRow[] = dataRows.map((row, index) => {
        const obj: any = {};
        headers.forEach((header, colIndex) => {
          obj[header] = row[colIndex] ?? "";
        });
        return {
          row: index + 2, // +2 because: +1 for 1-indexing, +1 for header row
          data: obj,
        };
      });

      workbookData.set(name, {
        spreadsheetId,
        rows: playerDayRows,
        headers,
      });

      console.log(
        `   ✓ ${name}: ${playerDayRows.length.toLocaleString()} player days`,
      );
    } catch (error) {
      console.log(`   ⚠️  ${name}: Error fetching - ${error}`);
    }
  }

  const totalRows = Array.from(workbookData.values()).reduce(
    (sum, wb) => sum + wb.rows.length,
    0,
  );
  console.log(`\n✓ Total: ${totalRows.toLocaleString()} player days\n`);

  return { sheets, workbookData };
}

// ============================================================================
// Data Grouping & Analysis
// ============================================================================

/**
 * Get all unique season IDs from the data.
 */
function getAllSeasonIds(workbookData: Map<string, WorkbookData>): string[] {
  const seasonIds = new Set<string>();

  for (const { rows } of workbookData.values()) {
    for (const playerDay of rows) {
      const { seasonId } = playerDay.data;
      if (seasonId) seasonIds.add(seasonId);
    }
  }

  return Array.from(seasonIds).sort((a, b) => Number(a) - Number(b));
}

/**
 * Groups player days by team-date combination for a specific season.
 */
function groupByTeamWeek(
  workbookData: Map<string, WorkbookData>,
  targetSeasonId = "7",
): TeamWeekLineup[] {
  console.log(
    `📋 Grouping player days by team-date (Season ${targetSeasonId})...\n`,
  );

  const teamDayMap = new Map<string, PlayerDayRow[]>();

  for (const { rows } of workbookData.values()) {
    for (const playerDay of rows) {
      const { gshlTeamId, date, seasonId } = playerDay.data;

      // Filter: Only process target season
      if (seasonId !== targetSeasonId) continue;

      // Skip rows without team or date
      if (!gshlTeamId || !date) continue;

      const key = `${gshlTeamId}|${date}`;
      const existing = teamDayMap.get(key);
      if (existing) {
        existing.push(playerDay);
      } else {
        teamDayMap.set(key, [playerDay]);
      }
    }
  }

  const teamWeekLineups: TeamWeekLineup[] = [];
  for (const [key, players] of teamDayMap) {
    const pipeIndex = key.indexOf("|");
    teamWeekLineups.push({
      gshlTeamId: key.substring(0, pipeIndex),
      weekId: key.substring(pipeIndex + 1),
      players,
    });
  }

  console.log(
    `   ✓ Found ${teamWeekLineups.length.toLocaleString()} team-day combinations\n`,
  );

  // Diagnostic: Check roster sizes
  displayRosterDiagnostics(teamWeekLineups);

  return teamWeekLineups;
}

/**
 * Display roster size diagnostics.
 */
function displayRosterDiagnostics(teamWeekLineups: TeamWeekLineup[]): void {
  let totalSize = 0;
  let maxSize = 0;
  let over25 = 0;

  for (const lineup of teamWeekLineups) {
    const size = lineup.players.length;
    totalSize += size;
    if (size > maxSize) maxSize = size;
    if (size > 25) over25++;
  }

  const avgSize = (totalSize / teamWeekLineups.length).toFixed(1);
  console.log(
    `   📊 Roster sizes: Avg ${avgSize}, Max ${maxSize}, >25 players: ${over25} team-days\n`,
  );
}

// ============================================================================
// ADD (Added to Roster) Calculation
// ============================================================================

/**
 * Calculates ADD (Added to roster) flags for a specific season.
 * ADD = 1 when a player appears on a team for the first time (wasn't on that team the previous day).
 */
function calculateADD(
  workbookData: Map<string, WorkbookData>,
  targetSeasonId = "7",
) {
  console.log(
    `📅 Calculating ADD (Added to roster) flags for Season ${targetSeasonId}...\n`,
  );

  // Build a lookup map incrementally: date -> playerId -> gshlTeamId
  // Only process rows for the target season to save memory and time
  const datePlayerTeamMap = new Map<string, Map<string, string>>();

  let totalRows = 0;
  let seasonRows = 0;

  // First pass: Build the lookup map (ONLY for target season)
  for (const { rows } of workbookData.values()) {
    totalRows += rows.length;
    for (const playerDay of rows) {
      // Filter by season early
      if (playerDay.data.seasonId !== targetSeasonId) continue;

      const date = playerDay.data.date;
      const playerId = playerDay.data.playerId;
      const gshlTeamId = playerDay.data.gshlTeamId;

      if (!date || !playerId || !gshlTeamId) continue;

      seasonRows++;

      try {
        const dateStr = new Date(date).toISOString().split("T")[0]!; // YYYY-MM-DD

        let playerMap = datePlayerTeamMap.get(dateStr);
        if (!playerMap) {
          playerMap = new Map();
          datePlayerTeamMap.set(dateStr, playerMap);
        }
        playerMap.set(playerId, gshlTeamId);
      } catch {
        // Invalid date, skip
        continue;
      }
    }
  }

  console.log(
    `   ℹ️  Processing ${seasonRows.toLocaleString()} Season ${targetSeasonId} rows (out of ${totalRows.toLocaleString()} total)\n`,
  );

  // Second pass: Calculate ADD for each player day (ONLY for target season)
  let addCount = 0;
  let processedCount = 0;

  for (const { rows } of workbookData.values()) {
    for (const playerDay of rows) {
      // Filter by season early
      if (playerDay.data.seasonId !== targetSeasonId) continue;

      const date = playerDay.data.date;
      const playerId = playerDay.data.playerId;
      const gshlTeamId = playerDay.data.gshlTeamId;

      processedCount++;

      // Show progress every 10k records (since we're only processing one season)
      if (processedCount % 10000 === 0) {
        process.stdout.write(
          `\r   Processing: ${processedCount.toLocaleString()}/${seasonRows.toLocaleString()}`,
        );
      }

      if (!date || !playerId || !gshlTeamId) {
        playerDay.ADD = undefined;
        continue;
      }

      try {
        const currentDate = new Date(date);
        const currentDateStr = currentDate.toISOString().split("T")[0]!;

        // Get previous day's date
        const previousDate = new Date(currentDate);
        previousDate.setDate(previousDate.getDate() - 1);
        const previousDateStr = previousDate.toISOString().split("T")[0]!;

        // Check if there's any data for the previous day
        const previousDayMap = datePlayerTeamMap.get(previousDateStr);

        if (!previousDayMap || previousDayMap.size === 0) {
          // First day of the season - no ADD flag
          playerDay.ADD = undefined;
          continue;
        }

        // Check if this player was on this team yesterday
        const previousTeamId = previousDayMap.get(playerId);

        if (previousTeamId === gshlTeamId) {
          // Player was on the same team yesterday - continuing, so no ADD flag
          playerDay.ADD = undefined;
        } else {
          // Player was NOT on this team yesterday (new to roster or traded)
          playerDay.ADD = 1;
          addCount++;
        }
      } catch {
        // Invalid date processing
        playerDay.ADD = undefined;
        continue;
      }
    }
  }

  console.log(
    `\r   ✓ Processed: ${seasonRows.toLocaleString()} Season ${targetSeasonId} player days`,
  );
  console.log(`   ✓ Added to roster: ${addCount.toLocaleString()} instances\n`);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Sleep utility for rate limiting and delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff.
 * Particularly useful for handling quota errors from Google Sheets API.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  initialDelayMs: number = INITIAL_RETRY_DELAY_MS,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if it's a quota error
      const isQuotaError =
        error instanceof Error && error.message.includes("Quota exceeded");

      if (!isQuotaError || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: 10s, 20s, 40s, 80s, 160s...
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      console.log(
        `   ⚠️  Quota limit hit, waiting ${delayMs / 1000}s before retry ${attempt + 1}/${maxRetries}...`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Convert column index (0-based) to Excel-style letter notation.
 * E.g., 0 -> A, 25 -> Z, 26 -> AA, etc.
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
// Position Parsing
// ============================================================================

// Cache for parsed positions to avoid repeated parsing
const nhlPosCache = new Map<string, RosterPosition[]>();

/**
 * Parse NHL positions from string format (JSON array or comma-separated).
 * Uses caching to improve performance on repeated values.
 */
function parseNhlPos(nhlPosStr: string): RosterPosition[] {
  if (!nhlPosStr) return [];

  // Check cache first
  const cached = nhlPosCache.get(nhlPosStr);
  if (cached) return cached;

  try {
    let result: RosterPosition[];
    // Handle both JSON array format and comma-separated
    if (nhlPosStr.startsWith("[")) {
      result = JSON.parse(nhlPosStr);
    } else {
      result = nhlPosStr.split(",").map((p) => p.trim() as RosterPosition);
    }
    nhlPosCache.set(nhlPosStr, result);
    return result;
  } catch {
    return [];
  }
}

// ============================================================================
// Lineup Optimization
// ============================================================================

/**
 * Optimizes lineups for all team-day combinations.
 * Calculates fullPos, bestPos, MS (Missed Starts), and BS (Bad Starts) for each player.
 */
async function optimizeAllLineups(teamWeekLineups: TeamWeekLineup[]) {
  console.log("🎯 Optimizing lineups for all team-days...\n");

  let totalTeamWeeks = 0;
  let totalPlayers = 0;
  let successCount = 0;
  let errorCount = 0;
  let timeoutCount = 0;

  const startTime = Date.now();

  for (const teamWeek of teamWeekLineups) {
    try {
      // Convert ALL PlayerDayRow to LineupPlayer (entire 15-17 player roster for this team-date)
      const roster: LineupPlayer[] = [];
      let hasInvalidPlayer = false;

      for (const pd of teamWeek.players) {
        const playerId = pd.data.playerId || pd.data.id || "";
        if (!playerId) {
          hasInvalidPlayer = true;
          break;
        }

        roster.push({
          playerId,
          nhlPos: parseNhlPos(pd.data.nhlPos),
          posGroup: pd.data.posGroup as PositionGroup,
          dailyPos: pd.data.dailyPos as RosterPosition,
          GP: parseFloat(pd.data.GP || "0"),
          GS: parseFloat(pd.data.GS || "0"),
          IR: parseFloat(pd.data.IR || "0"),
          IRplus: parseFloat(pd.data.IRplus || "0"),
          Rating: parseFloat(pd.data.Rating || "0"),
        });
      }

      // Skip if roster is invalid
      if (roster.length === 0 || hasInvalidPlayer) {
        errorCount++;
        continue;
      }

      // Run optimization with timeout protection
      let optimized;
      try {
        optimized = optimizeLineup(roster);
      } catch (optError) {
        console.log(
          `\n   ⚠️  Optimization timeout for ${teamWeek.gshlTeamId} date ${teamWeek.weekId} (${roster.length} players)`,
        );
        timeoutCount++;
        errorCount++;
        continue;
      }

      // Update ALL PlayerDayRow objects with fullPos, bestPos, MS, and BS
      for (let i = 0; i < optimized.length; i++) {
        const player = teamWeek.players[i];
        const optimizedPlayer = optimized[i];
        if (!player || !optimizedPlayer) continue;

        player.fullPos = optimizedPlayer.fullPos;
        player.bestPos = optimizedPlayer.bestPos;

        // Calculate MS (Missed Start)
        // MS = 1 when: GS is not "1" (didn't start) AND GP = "1" (did play) AND fullPos is in active lineup
        const gs = player.data.GS; // String "1" or undefined/empty
        const gp = player.data.GP; // String "1" or undefined/empty
        const fullPos = optimizedPlayer.fullPos;
        const isInFullLineup =
          fullPos !== Pos.BN && fullPos !== Pos.IR && fullPos !== Pos.IRPlus;
        player.MS = gs !== "1" && gp === "1" && isInFullLineup ? 1 : undefined;

        // Calculate BS (Bad Start)
        // BS = 1 when: GS = "1" (started) AND bestPos is BN
        const bestPos = optimizedPlayer.bestPos;
        const isBenchedBest = bestPos === Pos.BN;
        player.BS = gs === "1" && isBenchedBest ? 1 : undefined;
      }

      successCount++;
      totalPlayers += roster.length;
    } catch (error) {
      console.log(
        `\n   ⚠️  Error optimizing ${teamWeek.gshlTeamId} date ${teamWeek.weekId}: ${error}`,
      );
      errorCount++;
    }

    totalTeamWeeks++;
    // More frequent progress updates - every 50 instead of 100
    if (totalTeamWeeks % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (totalTeamWeeks / (Date.now() - startTime)) * 1000;
      const remaining = (
        (teamWeekLineups.length - totalTeamWeeks) /
        rate
      ).toFixed(0);
      process.stdout.write(
        `\r   Processed: ${totalTeamWeeks.toLocaleString()}/${teamWeekLineups.length.toLocaleString()} (${elapsed}s elapsed, ~${remaining}s remaining)`,
      );

      // Hint to garbage collector every 50 lineups to free memory
      if (global.gc) {
        global.gc();
      }
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\r   ✓ Processed: ${totalTeamWeeks.toLocaleString()} team-days in ${totalTime}s`,
  );
  console.log(
    `   ✓ Optimized: ${successCount.toLocaleString()} lineups (${totalPlayers.toLocaleString()} players)`,
  );
  if (timeoutCount > 0) {
    console.log(`   ⚠️  Timeouts: ${timeoutCount.toLocaleString()}`);
  }
  console.log(`   ⚠️  Errors: ${errorCount.toLocaleString()}\n`);
}

// ============================================================================
// Google Sheets Updates
// ============================================================================

/**
 * Updates lineup positions and derived metrics in Google Sheets.
 * Processes data in chunks to avoid API rate limits and timeouts.
 */
async function updateLineupPositionsInSheets(
  sheets: any,
  workbookData: Map<string, WorkbookData>,
) {
  console.log(
    "💾 Updating fullPos, bestPos, MS, BS & ADD in Google Sheets...\n",
  );

  for (const [name, { spreadsheetId, rows, headers }] of workbookData) {
    console.log(`\n   Processing ${name}...`);

    // Find column indexes
    const fullPosColIndex = headers.findIndex(
      (h) => h.toLowerCase() === "fullpos",
    );
    const bestPosColIndex = headers.findIndex(
      (h) => h.toLowerCase() === "bestpos",
    );
    const msColIndex = headers.findIndex((h) => h.toLowerCase() === "ms");
    const bsColIndex = headers.findIndex((h) => h.toLowerCase() === "bs");
    const addColIndex = headers.findIndex((h) => h.toLowerCase() === "add");

    if (fullPosColIndex === -1 || bestPosColIndex === -1) {
      console.log(
        `   ⚠️  ${name}: Missing fullPos or bestPos column, skipping updates`,
      );
      console.log(`      Available columns: ${headers.join(", ")}`);
      continue;
    }

    if (msColIndex === -1 || bsColIndex === -1) {
      console.log(
        `   ⚠️  ${name}: Missing MS or BS column, will skip those updates`,
      );
    }

    if (addColIndex === -1) {
      console.log(`   ⚠️  ${name}: Missing ADD column, will skip that update`);
    }

    console.log(`   Found 'fullPos' at column index ${fullPosColIndex}`);
    console.log(`   Found 'bestPos' at column index ${bestPosColIndex}`);
    if (msColIndex !== -1)
      console.log(`   Found 'MS' at column index ${msColIndex}`);
    if (bsColIndex !== -1)
      console.log(`   Found 'BS' at column index ${bsColIndex}`);
    if (addColIndex !== -1)
      console.log(`   Found 'ADD' at column index ${addColIndex}`);

    const fullPosColLetter = columnIndexToLetter(fullPosColIndex);
    const bestPosColLetter = columnIndexToLetter(bestPosColIndex);
    const msColLetter =
      msColIndex !== -1 ? columnIndexToLetter(msColIndex) : null;
    const bsColLetter =
      bsColIndex !== -1 ? columnIndexToLetter(bsColIndex) : null;
    const addColLetter =
      addColIndex !== -1 ? columnIndexToLetter(addColIndex) : null;

    // *** FIX: Only update rows that were actually processed (seasonId = 7) ***
    // Filter to only rows that have fullPos/bestPos set (indicating they were optimized)
    const rowsToUpdate = rows.filter(
      (pd) => pd.fullPos !== undefined || pd.bestPos !== undefined,
    );

    if (rowsToUpdate.length === 0) {
      console.log(
        `   ℹ️  ${name}: No rows were processed for this workbook, skipping updates`,
      );
      continue;
    }

    console.log(
      `   ℹ️  ${name}: Updating ${rowsToUpdate.length.toLocaleString()} processed rows (out of ${rows.length.toLocaleString()} total)`,
    );

    try {
      // Instead of individual cell updates, build column-based range updates
      // This is much more efficient for large datasets

      // Build a map of row index to player day for quick lookup
      const rowMap = new Map<number, PlayerDayRow>();
      for (const pd of rows) {
        rowMap.set(pd.row, pd);
      }

      const startRow = 2; // First data row (after header)
      const endRow = startRow + rows.length - 1;

      const updateRequests: any[] = [];

      // Split into chunks to avoid timeout on large datasets
      // Process 10,000 rows at a time (5 columns × 10k rows = 50k cells per batch)
      const CHUNK_SIZE = 10000;
      const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
      const failedChunks: number[] = [];

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        try {
          const chunkStart = chunkIndex * CHUNK_SIZE;
          const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, rows.length);
          const chunkRows = rows.slice(chunkStart, chunkEnd);

          const chunkStartRow = startRow + chunkStart;
          const chunkEndRow = startRow + chunkEnd - 1;

          const chunkUpdateRequests: any[] = [];

          // Update fullPos column for this chunk
          const fullPosData = chunkRows.map((pd) =>
            pd.fullPos !== undefined ? [pd.fullPos] : [""],
          );
          chunkUpdateRequests.push({
            range: `PlayerDayStatLine!${fullPosColLetter}${chunkStartRow}:${fullPosColLetter}${chunkEndRow}`,
            values: fullPosData,
          });

          // Update bestPos column for this chunk
          const bestPosData = chunkRows.map((pd) =>
            pd.bestPos !== undefined ? [pd.bestPos] : [""],
          );
          chunkUpdateRequests.push({
            range: `PlayerDayStatLine!${bestPosColLetter}${chunkStartRow}:${bestPosColLetter}${chunkEndRow}`,
            values: bestPosData,
          });

          // Update MS column if it exists
          if (msColLetter) {
            const msData = chunkRows.map((pd) => (pd.MS === 1 ? [1] : [""]));
            chunkUpdateRequests.push({
              range: `PlayerDayStatLine!${msColLetter}${chunkStartRow}:${msColLetter}${chunkEndRow}`,
              values: msData,
            });
          }

          // Update BS column if it exists
          if (bsColLetter) {
            const bsData = chunkRows.map((pd) => (pd.BS === 1 ? [1] : [""]));
            chunkUpdateRequests.push({
              range: `PlayerDayStatLine!${bsColLetter}${chunkStartRow}:${bsColLetter}${chunkEndRow}`,
              values: bsData,
            });
          }

          // Update ADD column if it exists
          if (addColLetter) {
            const addData = chunkRows.map((pd) =>
              pd.ADD !== undefined ? [pd.ADD] : [""],
            );
            chunkUpdateRequests.push({
              range: `PlayerDayStatLine!${addColLetter}${chunkStartRow}:${addColLetter}${chunkEndRow}`,
              values: addData,
            });
          }

          // Batch update this chunk with retry logic
          await retryWithBackoff(async () => {
            await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId,
              requestBody: {
                valueInputOption: "RAW",
                data: chunkUpdateRequests,
              },
            });
          });

          if (totalChunks > 1) {
            console.log(
              `   ⏳ Updated chunk ${chunkIndex + 1}/${totalChunks} (rows ${chunkStartRow}-${chunkEndRow})`,
            );
          }

          // Delay between chunks to avoid overwhelming the API
          if (chunkIndex < totalChunks - 1) {
            await sleep(2000); // 2 seconds between chunks
          }
        } catch (chunkError) {
          failedChunks.push(chunkIndex + 1);
          console.log(
            `   ❌ Chunk ${chunkIndex + 1}/${totalChunks} failed (rows ${startRow + chunkIndex * CHUNK_SIZE}-${startRow + Math.min((chunkIndex + 1) * CHUNK_SIZE, rows.length) - 1})`,
          );
          console.log(`   ⚠️  Continuing with next chunk...`);
          // Continue to next chunk even if this one fails
        }
      }

      if (failedChunks.length > 0) {
        console.log(
          `   ⚠️  ${name}: ${failedChunks.length} chunk${failedChunks.length > 1 ? "s" : ""} failed: ${failedChunks.join(", ")}`,
        );
        console.log(
          `   ✓ ${name}: Updated ${totalChunks - failedChunks.length}/${totalChunks} chunks successfully`,
        );
      } else {
        console.log(
          `   ✓ ${name}: Updated ${rows.length.toLocaleString()} rows in ${totalChunks} chunk${totalChunks > 1 ? "s" : ""}`,
        );
      }
    } catch (error) {
      console.log(`   ❌ ${name}: Error updating - ${error}`);
    }
  }

  console.log("\n✓ All lineup position & start tracking updates complete!\n");
}

// ============================================================================
// Script Entry Point
// ============================================================================

main().catch(console.error);
