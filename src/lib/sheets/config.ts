// Configuration for mapping database models to Google Sheets
import { safeParseSheetDate } from "../utils/date";

// Multi-workbook configuration matching your Apps Script setup
export const WORKBOOKS = {
  GENERAL: "1I6kmnnL6rSAWLOG12Ixr89g4W-ZQ0weGbfETKDTrvH8",
  PLAYERDAYS: "1aFCl4Zep_t09emxMf8aesAvCYxQGrbmcNEshjRD_J_w",
  PLAYERSTATS: "1qkyxmx8gC-xs8niDrmlB9Jv6qXhRmAWjFCq8ECEr-Cg",
  TEAMSTATS: "1X2pvw18aYEekdNApyJMqijOZL1Bl0e3Azlkg-eb2X54",
};

// Model to workbook mapping
export const MODEL_TO_WORKBOOK: Record<string, keyof typeof WORKBOOKS> = {
  // GENERAL workbook
  Season: "GENERAL",
  Conference: "GENERAL",
  Week: "GENERAL",
  Matchup: "GENERAL",
  Event: "GENERAL",
  Owner: "GENERAL",
  Franchise: "GENERAL",
  Team: "GENERAL",
  Player: "GENERAL",
  Contract: "GENERAL",
  Awards: "GENERAL",
  DraftPick: "GENERAL",
  nhlTeam: "GENERAL", // legacy/lowercase model key
  NHLTeam: "GENERAL", // alias for actual sheet named 'NHLTeam'

  // PLAYERDAYS workbook
  PlayerDayStatLine: "PLAYERDAYS",
  TeamDayStatLine: "TEAMSTATS",
  TeamWeekStatLine: "TEAMSTATS",
  TeamSeasonStatLine: "TEAMSTATS",
};

export const SHEETS_CONFIG = {
  // Sheet names for each model
  SHEETS: {
    Season: "Season",
    Conference: "Conference",
    Franchise: "Franchise",
    Team: "Team",
    Player: "Player",
    Contract: "Contract",
    Week: "Week",
    PlayerDayStatLine: "PlayerDayStatLine",
    PlayerWeekStatLine: "PlayerWeekStatLine",
    PlayerSplitStatLine: "PlayerSplitStatLine",
    PlayerTotalStatLine: "PlayerTotalStatLine",
    PlayerNHLStatLine: "PlayerNHLStatLine",
    TeamDayStatLine: "TeamDayStatLine",
    TeamWeekStatLine: "TeamWeekStatLine",
    TeamSeasonStatLine: "TeamSeasonStatLine",
    Event: "Event",
    Matchup: "Matchup",
    Owner: "Owner",
    Awards: "Awards",
    DraftPick: "DraftPick",
    nhlTeam: "nhlTeam", // legacy
    NHLTeam: "NHLTeam", // actual sheet name as provided
    // ArchivedSkaterDayStatLine: "ArchivedSkaterDayStatLine", // Disabled for performance
    // ArchivedGoalieDayStatLine: "ArchivedGoalieDayStatLine", // Disabled for performance
  },

  // Column mappings for each model (these match our database schema)
  COLUMNS: {
    NHLTeam: [
      "id",
      "fullName",
      "abbreviation",
      "logoUrl",
      "createdAt",
      "updatedAt",
    ],
    PlayerDayStatLine: [
      "id",
      "seasonId",
      "gshlTeamId",
      "playerId",
      "weekId",
      "date",
      "nhlPos",
      "posGroup",
      "nhlTeam",
      "dailyPos",
      "bestPos",
      "fullPos",
      "opp",
      "score",
      "GP",
      "MG",
      "IR",
      "IRplus",
      "GS",
      "G",
      "A",
      "P",
      "PM",
      "PIM",
      "PPP",
      "SOG",
      "HIT",
      "BLK",
      "W",
      "GA",
      "GAA",
      "SV",
      "SA",
      "SVP",
      "SO",
      "TOI",
      "Rating",
      "ADD",
      "MS",
      "BS",
      "createdAt",
      "updatedAt",
    ],
    PlayerWeekStatLine: [
      "id",
      "seasonId",
      "gshlTeamId",
      "playerId",
      "weekId",
      "nhlPos",
      "posGroup",
      "nhlTeam",
      "days",
      "GP",
      "MG",
      "IR",
      "IRPlus",
      "GS",
      "G",
      "A",
      "P",
      "PM",
      "PIM",
      "PPP",
      "SOG",
      "HIT",
      "BLK",
      "W",
      "GA",
      "GAA",
      "SV",
      "SA",
      "SVP",
      "SO",
      "TOI",
      "Rating",
      "ADD",
      "MS",
      "BS",
      "createdAt",
      "updatedAt",
    ],
    Season: [
      "id",
      "year",
      "name",
      "categories",
      "rosterSpots",
      "startDate",
      "endDate",
      "isActive",
      "signingEndDate",
      "createdAt",
      "updatedAt",
    ],
    Team: ["id", "seasonId", "franchiseId", "confId", "createdAt", "updatedAt"],
    Player: [
      "id",
      "firstName",
      "lastName",
      "fullName",
      "nhlPos",
      "posGroup",
      "nhlTeam",
      "isActive",
      "isSignable",
      "isResignable",
      "preDraftRk",
      "seasonRk",
      "seasonRating",
      "overallRk",
      "overallRating",
      "salary",
      "age",
      "birthday",
      "country",
      "handedness",
      "jerseyNum",
      "weight",
      "height",
      "lineupPos",
      "gshlTeamId",
      "createdAt",
      "updatedAt",
    ],
    Week: [
      "id",
      "seasonId",
      "weekNum",
      "weekType",
      "gameDays",
      "startDate",
      "endDate",
      "isActive",
      "isPlayoffs",
      "createdAt",
      "updatedAt",
    ],
    Conference: ["id", "name", "logoUrl", "abbr", "createdAt", "updatedAt"],
    Owner: [
      "id",
      "firstName",
      "lastName",
      "nickName",
      "email",
      "owing",
      "isActive",
      "createdAt",
      "updatedAt",
    ],
    Contract: [
      "id",
      "playerId",
      "signingFranchiseId",
      "currentFranchiseId",
      "seasonId",
      "contractType",
      "contractLength",
      "contractSalary",
      "signingDate",
      "startDate",
      "signingStatus",
      "expiryStatus",
      "expiryDate",
      "capHit",
      "capHitEndDate",
      "createdAt",
      "updatedAt",
    ],
    Franchise: [
      "id",
      "ownerId",
      "name",
      "abbr",
      "logoUrl",
      "confId",
      "isActive",
      "createdAt",
      "updatedAt",
    ],
    PlayerSplitStatLine: [
      "id",
      "seasonId",
      "gshlTeamId",
      "playerId",
      "nhlPos",
      "posGroup",
      "nhlTeam",
      "seasonType",
      "days",
      "GP",
      "MG",
      "IR",
      "IRplus",
      "GS",
      "G",
      "A",
      "P",
      "PM",
      "PIM",
      "PPP",
      "SOG",
      "HIT",
      "BLK",
      "W",
      "GA",
      "GAA",
      "SV",
      "SA",
      "SVP",
      "SO",
      "TOI",
      "Rating",
      "ADD",
      "MS",
      "BS",
      "createdAt",
      "updatedAt",
    ],
    PlayerTotalStatLine: [
      "id",
      "seasonId",
      "gshlTeamIds",
      "playerId",
      "nhlPos",
      "posGroup",
      "nhlTeam",
      "seasonType",
      "days",
      "GP",
      "MG",
      "IR",
      "IRplus",
      "GS",
      "G",
      "A",
      "P",
      "PM",
      "PIM",
      "PPP",
      "SOG",
      "HIT",
      "BLK",
      "W",
      "GA",
      "GAA",
      "SV",
      "SA",
      "SVP",
      "SO",
      "TOI",
      "Rating",
      "ADD",
      "MS",
      "BS",
      "createdAt",
      "updatedAt",
    ],
    PlayerNHLStatLine: [
      "id",
      "seasonId",
      "playerId",
      "nhlPos",
      "posGroup",
      "nhlTeam",
      "age",
      "GP",
      "G",
      "A",
      "P",
      "PM",
      "PIM",
      "PPP",
      "SOG",
      "HIT",
      "BLK",
      "W",
      "GA",
      "GAA",
      "SV",
      "SA",
      "SVP",
      "SO",
      "QS",
      "RBS",
      "TOI",
      "seasonRating",
      "overallRating",
      "salary",
      "createdAt",
      "updatedAt",
    ],
    TeamDayStatLine: [
      "id",
      "seasonId",
      "gshlTeamId",
      "weekId",
      "date",
      "GP",
      "MG",
      "IR",
      "IRplus",
      "GS",
      "G",
      "A",
      "P",
      "PM",
      "PIM",
      "PPP",
      "SOG",
      "HIT",
      "BLK",
      "W",
      "GA",
      "GAA",
      "SV",
      "SA",
      "SVP",
      "SO",
      "TOI",
      "Rating",
      "ADD",
      "MS",
      "BS",
      "createdAt",
      "updatedAt",
    ],
    TeamWeekStatLine: [
      "id",
      "seasonId",
      "gshlTeamId",
      "weekId",
      "days",
      "GP",
      "MG",
      "IR",
      "IRplus",
      "GS",
      "G",
      "A",
      "P",
      "PM",
      "PIM",
      "PPP",
      "SOG",
      "HIT",
      "BLK",
      "W",
      "GA",
      "GAA",
      "SV",
      "SA",
      "SVP",
      "SO",
      "TOI",
      "Rating",
      "yearToDateRating",
      "powerRating",
      "powerRk",
      "ADD",
      "MS",
      "BS",
      "createdAt",
      "updatedAt",
    ],
    TeamSeasonStatLine: [
      "id",
      "seasonId",
      "seasonType",
      "gshlTeamId",
      "days",
      "GP",
      "MG",
      "IR",
      "IRplus",
      "GS",
      "G",
      "A",
      "P",
      "PM",
      "PIM",
      "PPP",
      "SOG",
      "HIT",
      "BLK",
      "W",
      "GA",
      "GAA",
      "SV",
      "SA",
      "SVP",
      "SO",
      "TOI",
      "Rating",
      "ADD",
      "MS",
      "BS",
      "streak",
      "powerRk",
      "powerRating",
      "prevPowerRk",
      "prevPowerRating",
      "teamW",
      "teamHW",
      "teamHL",
      "teamL",
      "overallRk",
      "conferenceRk",
      "wildcardRk",
      "losersTournRk",
      "playersUsed",
      "norrisRating",
      "norrisRk",
      "vezinaRating",
      "vezinaRk",
      "calderRating",
      "calderRk",
      "jackAdamsRating",
      "jackAdamsRk",
      "GMOYRating",
      "GMOYRk",
      "createdAt",
      "updatedAt",
    ],
    Event: [
      "id",
      "seasonId",
      "name",
      "description",
      "date",
      "type",
      "createdAt",
      "updatedAt",
    ],
    Matchup: [
      "id",
      "seasonId",
      "weekId",
      "homeTeamId",
      "awayTeamId",
      "gameType",
      "homeRank",
      "awayRank",
      "homeScore",
      "awayScore",
      "homeWin",
      "awayWin",
      "tie",
      "isCompleted",
      "rating",
      "createdAt",
      "updatedAt",
    ],
    Awards: [
      "id",
      "seasonId",
      "winnerId",
      "nomineeIds",
      "award",
      "createdAt",
      "updatedAt",
    ],
    DraftPick: [
      "id",
      "seasonId",
      "gshlTeamId",
      "originalTeamId",
      "round",
      "pick",
      "playerId",
      "isTraded",
      "isSigning",
      "createdAt",
      "updatedAt",
    ],
    nhlTeam: [
      "id",
      "fullName",
      "abbreviation",
      "logoUrl",
      "createdAt",
      "updatedAt",
    ],
    // ArchivedSkaterDayStatLine: [  // Disabled for performance
    //   "id",
    //   "originalId",
    //   "seasonId",
    //   "gshlTeamId",
    //   "playerId",
    //   "weekId",
    //   "date",
    //   "nhlPos",
    //   "posGroup",
    //   "nhlTeam",
    //   "fullPos",
    //   "bestPos",
    //   "dailyPos",
    //   "opp",
    //   "score",
    //   "IR",
    //   "IRplus",
    //   "GP",
    //   "MG",
    //   "GS",
    //   "G",
    //   "A",
    //   "P",
    //   "PM",
    //   "PIM",
    //   "PPP",
    //   "SOG",
    //   "HIT",
    //   "BLK",
    //   "TOI",
    //   "ADD",
    //   "Rating",
    //   "MS",
    //   "BS",
    //   "archivedDate",
    //   "archiveReason",
    //   "originalCreatedAt",
    //   "originalUpdatedAt",
    //   "createdAt",    //   "updatedAt",
    // ],
    // ArchivedGoalieDayStatLine: [  // Disabled for performance
    //   "id",
    //   "originalId",
    //   "seasonId",
    //   "gshlTeamId",
    //   "playerId",
    //   "weekId",
    //   "date",
    //   "nhlPos",
    //   "posGroup",
    //   "nhlTeam",
    //   "fullPos",
    //   "bestPos",
    //   "dailyPos",
    //   "opp",
    //   "score",
    //   "IR",
    //   "IRplus",
    //   "GP",
    //   "MG",
    //   "GS",
    //   "W",
    //   "GA",
    //   "GAA",
    //   "SV",
    //   "SA",
    //   "SVP",
    //   "SO",
    //   "TOI",
    //   "ADD",
    //   "Rating",
    //   "MS",
    //   "BS",
    //   "archivedDate",
    //   "archiveReason",
    //   "originalCreatedAt",
    //   "originalUpdatedAt",
    //   "createdAt",
    //   "updatedAt",
    // ],
  } as const,
};

// Type definitions
type DatabaseValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | unknown[]
  | Record<string, unknown>;

export type DatabaseRecord = Record<string, DatabaseValue>;

const BOOLEAN_COLUMNS = new Set([
  "isActive",
  "isSignable",
  "isPlayoffs",
  "ownerIsActive",
  "isCompleted",
  "isTraded",
  "isSigning",
]);

const BOOLEAN_TRUE_VALUES = new Set(["true", "1", "yes", "y", "on"]);
const BOOLEAN_FALSE_VALUES = new Set(["false", "0", "no", "n", "off"]);

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (BOOLEAN_TRUE_VALUES.has(normalized)) {
      return true;
    }
    if (BOOLEAN_FALSE_VALUES.has(normalized)) {
      return false;
    }
  }

  return null;
}

// Type-safe helper to convert database data to sheet row
export function convertModelToRow<T extends DatabaseRecord>(
  data: T,
  columns: readonly string[],
): (string | number | boolean)[] {
  return columns.map((column) => {
    const value = data[column];

    // Handle special data types
    if (value === null || value === undefined) {
      return "";
    }

    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }

    if (value instanceof Date) {
      // Check if the date is valid before converting to ISO string
      if (isNaN(value.getTime())) {
        return "";
      }
      return value.toISOString();
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value);
    }

    return String(value);
  });
}

// Type-safe helper to convert sheet row to database data
export function convertRowToModel<T extends DatabaseRecord>(
  row: (string | number | boolean | null)[],
  columns: readonly string[],
): T {
  const result: Record<string, DatabaseValue> = {};

  columns.forEach((column, index) => {
    const value = row[index];

    if (value === "" || value === null || value === undefined) {
      result[column] = null;
      return;
    }

    // Handle special conversions based on column name patterns
    // Keep everything as strings for consistency with Google Sheets
    if (column.endsWith("At") || column.endsWith("Date")) {
      const stringValue = String(value).trim();
      if (
        stringValue === "" ||
        stringValue === "null" ||
        stringValue === "undefined"
      ) {
        result[column] = null;
      } else {
        // Try to parse the date smartly
        let dateValue: Date | null = null;

        // If it's a number and looks like an Excel serial date (> 30000, which is roughly 1982)
        if (typeof value === "number" && value > 30000) {
          dateValue = safeParseSheetDate(value);
        }
        // If it's a string that could be an Excel serial number (large number as string)
        else if (typeof value === "string") {
          const asNumber = parseFloat(stringValue);
          if (!isNaN(asNumber) && asNumber > 30000) {
            // Likely an Excel serial date
            dateValue = safeParseSheetDate(asNumber);
          } else {
            // Try as regular date string first
            const asDate = new Date(stringValue);
            dateValue = !isNaN(asDate.getTime()) ? asDate : null;
          }
        }
        // Fallback to regular date parsing
        else {
          const asDate = new Date(stringValue);
          dateValue = !isNaN(asDate.getTime()) ? asDate : null;
        }

        result[column] = dateValue;
      }
    } else if (
      column === "nhlPos" ||
      column === "nhlTeam" ||
      column === "categories" ||
      column === "rosterSpots"
    ) {
      try {
        result[column] = JSON.parse(String(value)) as unknown[];
      } catch {
        result[column] = [String(value)];
      }
    } else if (BOOLEAN_COLUMNS.has(column)) {
      const booleanValue = coerceBoolean(value);
      if (booleanValue !== null) {
        result[column] = booleanValue;
      } else {
        const normalized = String(value).trim();
        const normalizedLower = normalized.toLowerCase();
        if (BOOLEAN_TRUE_VALUES.has(normalizedLower)) {
          result[column] = true;
        } else if (BOOLEAN_FALSE_VALUES.has(normalizedLower)) {
          result[column] = false;
        } else {
          result[column] = normalized === "" ? null : normalized;
        }
      }
    } else if (typeof value === "boolean") {
      result[column] = value;
    } else if (typeof value === "string" && value.toLowerCase() === "true") {
      result[column] = true;
    } else if (typeof value === "string" && value.toLowerCase() === "false") {
      result[column] = false;
    } else {
      // Keep all other values as strings for consistency
      result[column] = String(value);
    }
  });

  return result as T;
}
