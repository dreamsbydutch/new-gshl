// Configuration for mapping database models to Google Sheets
import {
  normalizeDateOnlyValue,
  safeParseSheetDate,
} from "../../../utils/date";

const NHL_TEAM_COLUMNS = [
  "id",
  "name",
  "abbr",
  "logoUrl",
  "createdAt",
  "updatedAt",
] as const;

// Multi-workbook configuration matching your Apps Script setup.
export const WORKBOOKS = {
  GENERAL: "1I6kmnnL6rSAWLOG12Ixr89g4W-ZQ0weGbfETKDTrvH8",
  // PlayerDay workbooks partitioned by season: PlayerDays-01, PlayerDays-02, etc.
  PLAYERDAYS_01: "1L0lqm3DDXv92hml67aGgJ2AYT49hitMl0GX16VZOCrg",
  PLAYERDAYS_02: "1M-YNvrUtfLKqv0b5MJ6HWErMvL9pTm6_TRrb6-1Dz0Y",
  PLAYERDAYS_03: "1-qtE0DSueGi47h-l5pBSJik4Y8knDq8r64zH94FYdXU",
  PLAYERDAYS_04: "1G7wBlYgSliyzh1N2U6sqOeDfiDeNcT7cDY9OUkWxDn4",
  PLAYERDAYS_05: "1ny8gEOotQCbG3uvr29JgX5iRjCS_2Pt44eF4f4l3f1g",
  PLAYERDAYS_06: "1nOp4mi_0kskY5etY70ErpSGYcKevouEwhe3Nh3VwZ_8",
  PLAYERDAYS_07: "1spmkDwfKOiMZBQt4-roOeIuL88m457X0F9inHa_zw4c",
  PLAYERDAYS_08: "1i7rqNNJrHUZT7SIisesJzHNVJfVz2lZExUB6XHsc2vw",
  PLAYERDAYS_09: "1Ffb0gqr-tm3HECUIA2vPNUFfs04XLTg51JX7tQ3xETM",
  PLAYERDAYS_10: "1x7KS6XsSCtbgZ5rxGqH6NNCS91ZHNH-lWJc84ZPmkO0",
  PLAYERDAYS_11: "1eai9BxtIXcaWBKzNI0BCn-kcjf06Hszx4aFXAkAGqVw",
  PLAYERDAYS_12: "1M1CLZ9FXqq7dWtgpNZa4OFoUU3h71N1bLxZTmprqVKk",
  PLAYERDAYS_13: "1980OlOIIK7OegX-yd3WICSiReeHpUROi8x0i4x6TtYI",
  PLAYERDAYS_14: "",
  PLAYERDAYS_15: "",
  PLAYERSTATS: "1qkyxmx8gC-xs8niDrmlB9Jv6qXhRmAWjFCq8ECEr-Cg",
  TEAMSTATS: "1X2pvw18aYEekdNApyJMqijOZL1Bl0e3Azlkg-eb2X54",
};

export const PLAYERDAY_WORKBOOK_KEYS = [
  "PLAYERDAYS_01",
  "PLAYERDAYS_02",
  "PLAYERDAYS_03",
  "PLAYERDAYS_04",
  "PLAYERDAYS_05",
  "PLAYERDAYS_06",
  "PLAYERDAYS_07",
  "PLAYERDAYS_08",
  "PLAYERDAYS_09",
  "PLAYERDAYS_10",
  "PLAYERDAYS_11",
  "PLAYERDAYS_12",
  "PLAYERDAYS_13",
  "PLAYERDAYS_14",
  "PLAYERDAYS_15",
] as const satisfies readonly (keyof typeof WORKBOOKS)[];

export type PlayerDayWorkbookKey = (typeof PLAYERDAY_WORKBOOK_KEYS)[number];

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
  PlayerDayStatLine: "PLAYERDAYS_12",

  // PLAYERSTATS workbook
  PlayerWeekStatLine: "PLAYERSTATS",
  PlayerSplitStatLine: "PLAYERSTATS",
  PlayerTotalStatLine: "PLAYERSTATS",
  PlayerCareerSplitStatLine: "PLAYERSTATS",
  PlayerCareerTotalStatLine: "PLAYERSTATS",
  PlayerNHLStatLine: "PLAYERSTATS",

  // TEAMSTATS workbook
  TeamDayStatLine: "TEAMSTATS",
  TeamWeekStatLine: "TEAMSTATS",
  TeamSeasonStatLine: "TEAMSTATS",
};

function uniqueWorkbookIds(
  keys: readonly (keyof typeof WORKBOOKS)[],
): string[] {
  return Array.from(new Set(keys.map((key) => WORKBOOKS[key]).filter(Boolean)));
}

export function getPlayerDayWorkbookKey(
  seasonId: string | number | null | undefined,
): PlayerDayWorkbookKey | null {
  const seasonNumber = Number(seasonId);
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
    return null;
  }

  const key = `PLAYERDAYS_${String(seasonNumber).padStart(2, "0")}`;
  return PLAYERDAY_WORKBOOK_KEYS.includes(key as PlayerDayWorkbookKey)
    ? (key as PlayerDayWorkbookKey)
    : null;
}

export function getPlayerDayWorkbookId(
  seasonId: string | number | null | undefined,
): string {
  const key = getPlayerDayWorkbookKey(seasonId);
  if (!key) {
    throw new Error(
      `PlayerDay workbook lookup requires a valid seasonId; received ${String(seasonId)}`,
    );
  }

  const spreadsheetId = WORKBOOKS[key]?.trim();
  if (!spreadsheetId) {
    throw new Error(
      `Missing PlayerDay workbook id for ${key}. Configure WORKBOOKS.${key} for PlayerDays-${key.replace("PLAYERDAYS_", "")}.`,
    );
  }

  return spreadsheetId;
}

export function getSpreadsheetIdsForModel(modelName: string): string[] {
  if (modelName === "PlayerDayStatLine") {
    return uniqueWorkbookIds(PLAYERDAY_WORKBOOK_KEYS);
  }

  const workbookKey = MODEL_TO_WORKBOOK[modelName];
  if (!workbookKey) {
    throw new Error(`No workbook mapping found for model: ${modelName}`);
  }

  return [WORKBOOKS[workbookKey]];
}

export function getSpreadsheetIdForModel(modelName: string): string {
  const spreadsheetId = getSpreadsheetIdsForModel(modelName)[0];
  if (!spreadsheetId) {
    throw new Error(`No spreadsheet configured for model: ${modelName}`);
  }

  return spreadsheetId;
}

export type CompositeKeyModelName =
  | "PlayerDayStatLine"
  | "PlayerWeekStatLine"
  | "PlayerSplitStatLine"
  | "PlayerTotalStatLine"
  | "PlayerCareerSplitStatLine"
  | "PlayerCareerTotalStatLine"
  | "PlayerNHLStatLine"
  | "TeamDayStatLine"
  | "TeamWeekStatLine"
  | "TeamSeasonStatLine";

export function getCompositeKeyColumnsForModel(
  modelName: CompositeKeyModelName,
): readonly string[] {
  switch (modelName) {
    case "PlayerDayStatLine":
      return ["playerId", "date"];
    case "PlayerWeekStatLine":
      return ["playerId", "weekId", "gshlTeamId"];
    case "PlayerSplitStatLine":
      return ["playerId", "seasonId", "gshlTeamId", "seasonType"];
    case "PlayerTotalStatLine":
      return ["playerId", "seasonId", "seasonType"];
    case "PlayerCareerSplitStatLine":
      return ["playerId", "gshlTeamId", "seasonType"];
    case "PlayerCareerTotalStatLine":
      return ["playerId", "seasonType"];
    case "PlayerNHLStatLine":
      return ["playerId", "seasonId"];
    case "TeamDayStatLine":
      return ["seasonId", "gshlTeamId", "date"];
    case "TeamWeekStatLine":
      return ["seasonId", "gshlTeamId", "weekId"];
    case "TeamSeasonStatLine":
      return ["seasonId", "gshlTeamId", "seasonType"];
  }
}

export function getWriteSpreadsheetIdForModel(
  modelName: string,
  options?: {
    seasonId?: string | number | null | undefined;
  },
): string {
  if (modelName === "PlayerDayStatLine") {
    return getPlayerDayWorkbookId(options?.seasonId);
  }

  return getSpreadsheetIdForModel(modelName);
}

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
    PlayerCareerSplitStatLine: "PlayerCareerSplitStatLine",
    PlayerCareerTotalStatLine: "PlayerCareerTotalStatLine",
    PlayerNHLStatLine: "PlayerNHLStatLine",
    TeamDayStatLine: "TeamDayStatLine",
    TeamWeekStatLine: "TeamWeekStatLine",
    TeamSeasonStatLine: "TeamSeasonStatLine",
    Event: "Event",
    Matchup: "Matchup",
    Owner: "Owner",
    Awards: "Award",
    DraftPick: "DraftPick",
    nhlTeam: "nhlTeam", // legacy
    NHLTeam: "NHLTeam", // actual sheet name as provided
    // ArchivedSkaterDayStatLine: "ArchivedSkaterDayStatLine", // Disabled for performance
    // ArchivedGoalieDayStatLine: "ArchivedGoalieDayStatLine", // Disabled for performance
  },

  // Column mappings for each model (these match our database schema)
  COLUMNS: {
    nhlTeam: NHL_TEAM_COLUMNS,
    NHLTeam: NHL_TEAM_COLUMNS,
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
    Season: [
      "id",
      "year",
      "name",
      "categories",
      "rosterSpots",
      "startDate",
      "endDate",
      "isActive",
      "usesLegacyTies",
      "signingEndDate",
      "createdAt",
      "updatedAt",
    ],
    Team: [
      "id",
      "seasonId",
      "franchiseId",
      "yahooId",
      "confId",
      "createdAt",
      "updatedAt",
    ],
    Player: [
      "id",
      "yahooId",
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
      "nhlContractStatus",
      "nhlContractLength",
      "nhlCapHit",
      "nhlClauses",
      "nhlStartYear",
      "nhlSigningStatus",
      "nhlExpiryYear",
      "nhlExpiryStatus",
      "createdAt",
      "updatedAt",
      "nhlApiId",
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
      "ownerId",
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
    PlayerCareerSplitStatLine: [
      "id",
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
    PlayerCareerTotalStatLine: [
      "id",
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
      "powerRating",
      "powerElo",
      "powerEloPre",
      "powerEloPost",
      "powerEloDelta",
      "powerEloExpected",
      "powerEloK",
      "powerStatScore",
      "powerStatEwma",
      "powerTalent",
      "powerHistoryPrior",
      "powerComposite",
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
      "teamW",
      "teamHW",
      "teamHL",
      "teamL",
      "teamT",
      "teamCCW",
      "teamCCHW",
      "teamCCHL",
      "teamCCL",
      "teamCCT",
      "overallRk",
      "conferenceRk",
      "wildcardRk",
      "playersUsed",
      "hartRating",
      "hartRk",
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
      "isComplete",
      "rating",
      "ratingPre",
      "ratingRealized",
      "ratingCompetitive",
      "ratingImportance",
      "ratingRosterStrength",
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
  "usesLegacyTies",
  "isSignable",
  "isPlayoffs",
  "ownerIsActive",
  "isComplete",
  "homeWin",
  "awayWin",
  "tie",
  "isTraded",
  "isSigning",
]);

const BOOLEAN_TRUE_VALUES = new Set(["true", "1", "yes", "y", "on"]);
const BOOLEAN_FALSE_VALUES = new Set(["false", "0", "no", "n", "off"]);

// Google Sheets checkbox cells can come through as literal "TRUE"/"FALSE".
// We normalize via `.toLowerCase()`, but include these explicitly for clarity and safety.
BOOLEAN_TRUE_VALUES.add("true");
BOOLEAN_FALSE_VALUES.add("false");

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

    // Some sheets emit checkbox values as "TRUE"/"FALSE" (already handled above),
    // but occasionally come through as quoted JSON strings like "\"TRUE\"".
    // Try a very small unquote step.
    if (
      (normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'"))
    ) {
      const unquoted = normalized.slice(1, -1).trim();
      if (BOOLEAN_TRUE_VALUES.has(unquoted)) return true;
      if (BOOLEAN_FALSE_VALUES.has(unquoted)) return false;
    }
  }

  return null;
}

function isIdColumn(column: string): boolean {
  return column === "id" || column.endsWith("Id") || column.endsWith("Ids");
}

function isCsvMultiValueColumn(column: string): boolean {
  return (
    column === "nhlPos" || column === "nhlTeam" || column === "gshlTeamIds"
  );
}

function isJsonArrayColumn(column: string): boolean {
  return (
    column === "categories" ||
    column === "rosterSpots" ||
    (column.endsWith("Ids") && !isCsvMultiValueColumn(column))
  );
}

function isDateOnlyColumn(column: string): boolean {
  return column === "date" || column.endsWith("Date") || column === "birthday";
}

function coerceDateOnlyString(value: unknown): string | null {
  return normalizeDateOnlyValue(value);
}

function normalizeMultiValueTokens(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeMultiValueTokens(entry));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.flatMap((entry) => normalizeMultiValueTokens(entry));
      }
    } catch {
      // Fall through to CSV parsing for plain sheet cell values.
    }
    return trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [String(value).trim()].filter(Boolean);
}

export function serializeCsvMultiValue(value: unknown): string {
  return normalizeMultiValueTokens(value).join(",");
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

    if (isCsvMultiValueColumn(column)) {
      return serializeCsvMultiValue(value);
    }

    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }

    if (value instanceof Date) {
      // Check if the date is valid before converting to ISO string
      if (isNaN(value.getTime())) {
        return "";
      }
      // Return only YYYY-MM-DD format without timestamp
      return value.toISOString().split("T")[0]!;
    }

    if (isDateOnlyColumn(column)) {
      return normalizeDateOnlyValue(value) ?? "";
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
    if (column.endsWith("At")) {
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
            // For date-only fields (startDate, endDate), parse as UTC midnight
            // This ensures consistent comparisons regardless of timezone
            // Extract just the date portion (YYYY-MM-DD) if it's an ISO string
            let dateOnlyStr = stringValue;
            if (stringValue.includes("T")) {
              // It's an ISO string with time, extract just the date
              dateOnlyStr = stringValue.split("T")[0]!;
            }
            // Parse as UTC midnight to avoid timezone shifts
            dateValue = new Date(dateOnlyStr + "T00:00:00.000Z");
            if (isNaN(dateValue.getTime())) {
              dateValue = null;
            }
          }
        }
        // Fallback to regular date parsing
        else {
          const asDate = new Date(stringValue);
          dateValue = !isNaN(asDate.getTime()) ? asDate : null;
        }

        result[column] = dateValue;
      }
    } else if (isDateOnlyColumn(column)) {
      // Date-only fields are stored as YYYY-MM-DD strings in our domain models.
      // Normalize serial dates / ISO strings with times to date-only.
      result[column] = coerceDateOnlyString(value);
    } else if (isCsvMultiValueColumn(column)) {
      result[column] = normalizeMultiValueTokens(value);
    } else if (isJsonArrayColumn(column)) {
      const stringValue = String(value).trim();
      try {
        const parsed = JSON.parse(stringValue) as unknown;
        result[column] = parsed as unknown[];
      } catch {
        // Common legacy format: comma-separated string
        result[column] = normalizeMultiValueTokens(stringValue);
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
    } else if (isIdColumn(column)) {
      // Domain model IDs are strings, even if Sheets returns numbers.
      result[column] = String(value);
    } else if (typeof value === "number") {
      // Preserve numeric values (Sheets API returns numbers for numeric cells)
      result[column] = value;
    } else if (typeof value === "boolean") {
      result[column] = value;
    } else {
      result[column] = String(value);
    }
  });

  return result as T;
}
