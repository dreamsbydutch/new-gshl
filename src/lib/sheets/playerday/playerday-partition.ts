/**
 * PlayerDay Partition Logic
 * ==========================
 * Handles routing PlayerDay queries to the correct sheet based on season ranges.
 * 
 * Partition Strategy:
 * - Seasons 1-5   → PLAYERDAYS_1_5
 * - Seasons 6-10  → PLAYERDAYS_6_10
 * - Seasons 11-15 → PLAYERDAYS_11_15
 * - Seasons 16-20 → PLAYERDAYS_16_20
 * - etc.
 */

export const PLAYERDAY_WORKBOOKS = {
  PLAYERDAYS_1_5: "1ny8gEOotQCbG3uvr29JgX5iRjCS_2Pt44eF4f4l3f1g",
  PLAYERDAYS_6_10: "14XZoxMbcmWh0-XmYOu16Ur0HNOFP9UttHbiMMut_PJ0",
  PLAYERDAYS_11_15: "18IqgstBaBIAfM08w7ddzjF2JTrAqZUjAvsbyZxgHiag",
} as const;

export type PlayerDayWorkbookKey = keyof typeof PLAYERDAY_WORKBOOKS;

/**
 * Determine which PlayerDay workbook to use based on season ID
 */
export function getPlayerDayWorkbook(seasonId: string): PlayerDayWorkbookKey {
  // Extract numeric season number from ID (e.g., "season-12" → 12)
  const match = /(\d+)/.exec(seasonId);
  const seasonNum = match?.[1] ? parseInt(match[1], 10) : 0;

  if (seasonNum >= 1 && seasonNum <= 5) {
    return "PLAYERDAYS_1_5";
  } else if (seasonNum >= 6 && seasonNum <= 10) {
    return "PLAYERDAYS_6_10";
  } else if (seasonNum >= 11 && seasonNum <= 15) {
    return "PLAYERDAYS_11_15";
  } else if (seasonNum >= 16 && seasonNum <= 20) {
    // Future seasons
    throw new Error(
      `PlayerDay workbook for seasons 16-20 not yet configured. Create the sheet and update PLAYERDAY_WORKBOOKS.`,
    );
  }

  throw new Error(
    `Invalid season ID: ${seasonId}. Cannot determine PlayerDay workbook.`,
  );
}

/**
 * Get the spreadsheet ID for a given season's PlayerDay data
 */
export function getPlayerDaySpreadsheetId(seasonId: string): string {
  const workbookKey = getPlayerDayWorkbook(seasonId);
  return PLAYERDAY_WORKBOOKS[workbookKey];
}

/**
 * Extract season ID from a PlayerDayStatLine record (if available)
 */
export function extractSeasonIdFromPlayerDay(
  record: Record<string, unknown>,
): string | null {
  // Check common field names that might contain season info
  if (typeof record.seasonId === "string") {
    return record.seasonId;
  }
  if (typeof record.season === "string") {
    return record.season;
  }
  return null;
}

/**
 * Group PlayerDay records by their workbook partition
 */
export function groupPlayerDaysByWorkbook(
  records: Array<Record<string, unknown>>,
): Map<PlayerDayWorkbookKey, Array<Record<string, unknown>>> {
  const groups = new Map<PlayerDayWorkbookKey, Array<Record<string, unknown>>>();

  for (const record of records) {
    const seasonId = extractSeasonIdFromPlayerDay(record);
    if (!seasonId) {
      console.warn(
        "PlayerDay record missing seasonId, skipping:",
        record.id ?? "unknown",
      );
      continue;
    }

    const workbookKey = getPlayerDayWorkbook(seasonId);
    if (!groups.has(workbookKey)) {
      groups.set(workbookKey, []);
    }
    groups.get(workbookKey)!.push(record);
  }

  return groups;
}
