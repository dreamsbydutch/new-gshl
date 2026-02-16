// @ts-nocheck

/**
 * Sheet schema metadata and field typing helpers.
 * Centralizes schema definitions so fetch/upsert logic stays consistent.
 */
var SHEET_DATE_ONLY_FIELDS = new Set([
  "date",
  "startDate",
  "endDate",
  "effectiveDate",
]);

var SHEET_DATETIME_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "lastUpdatedAt",
  "lastSyncAt",
  "timestamp",
  "processedAt",
]);

var SHEET_BOOLEAN_FIELDS = new Set([
  "homeWin",
  "awayWin",
  "tie",
  "isComplete",
  "isActive",
  "enabled",
  "isArchived",
  "isPlayoff",
  "isLocked",
  "isStarter",
]);

var SHEET_NUMERIC_FIELDS = new Set([
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
  "powerElo",
  "powerEloPre",
  "powerEloPost",
  "powerEloDelta",
  "powerEloExpected",
  "powerEloK",
  "powerStatScore",
  "powerStatEwma",
  "powerComposite",
  "powerRk",
  "ADD",
  "MS",
  "BS",
  "homeScore",
  "awayScore",
  "teamW",
  "teamHW",
  "teamHL",
  "teamL",
  "teamCCW",
  "teamCCHW",
  "teamCCHL",
  "teamCCL",
  "overallRk",
  "conferenceRk",
  "wildcardRk",
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
  "seasonNumber",
  "weekNumber",
  "weekIndex",
  "weekSortOrder",
]);

var SHEET_SCHEMAS = typeof SHEET_SCHEMAS !== "undefined" ? SHEET_SCHEMAS : {};

function createSheetSchema(config) {
  return {
    description: config.description || "",
    category: config.category || "core",
    keyColumns: (config.keyColumns || []).slice(),
    fields: config.fields || {},
    numericColumns: (config.numericColumns || []).slice(),
    booleanColumns: (config.booleanColumns || []).slice(),
    dateColumns: (config.dateColumns || []).slice(),
    datetimeColumns: (config.datetimeColumns || []).slice(),
    timestampColumns: (config.timestampColumns || []).slice(),
  };
}

SHEET_SCHEMAS.Season =
  SHEET_SCHEMAS.Season ||
  createSheetSchema({
    description: "Season master metadata",
    keyColumns: ["id"],
    dateColumns: ["startDate", "endDate"],
    numericColumns: ["seasonNumber"],
  });

SHEET_SCHEMAS.Week =
  SHEET_SCHEMAS.Week ||
  createSheetSchema({
    description: "Week definitions per season",
    keyColumns: ["id"],
    dateColumns: ["startDate", "endDate"],
    numericColumns: ["weekNumber", "weekIndex", "weekSortOrder"],
  });

SHEET_SCHEMAS.Matchup =
  SHEET_SCHEMAS.Matchup ||
  createSheetSchema({
    description: "Weekly team matchups",
    keyColumns: ["id"],
    numericColumns: ["homeScore", "awayScore"],
    booleanColumns: ["homeWin", "awayWin", "isComplete"],
    timestampColumns: ["updatedAt"],
  });

var PLAYER_DAY_NUMERIC_FIELDS = [
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
];

var PLAYER_WEEK_NUMERIC_FIELDS = PLAYER_DAY_NUMERIC_FIELDS.concat(["days"]);

SHEET_SCHEMAS.PlayerDayStatLine =
  SHEET_SCHEMAS.PlayerDayStatLine ||
  createSheetSchema({
    description: "Daily player stat lines",
    category: "stat",
    keyColumns: ["playerId", "gshlTeamId", "date"],
    dateColumns: ["date"],
    datetimeColumns: ["createdAt", "updatedAt"],
    numericColumns: PLAYER_DAY_NUMERIC_FIELDS,
  });

SHEET_SCHEMAS.PlayerWeekStatLine =
  SHEET_SCHEMAS.PlayerWeekStatLine ||
  createSheetSchema({
    description: "Weekly player aggregates",
    category: "stat",
    keyColumns: ["playerId", "gshlTeamId", "weekId"],
    datetimeColumns: ["createdAt", "updatedAt"],
    numericColumns: PLAYER_WEEK_NUMERIC_FIELDS,
  });

SHEET_SCHEMAS.PlayerSplitStatLine =
  SHEET_SCHEMAS.PlayerSplitStatLine ||
  createSheetSchema({
    description: "Season splits per team",
    category: "stat",
    keyColumns: ["playerId", "gshlTeamId", "seasonId", "seasonType"],
    datetimeColumns: ["createdAt", "updatedAt"],
    numericColumns: PLAYER_WEEK_NUMERIC_FIELDS,
  });

SHEET_SCHEMAS.PlayerTotalStatLine =
  SHEET_SCHEMAS.PlayerTotalStatLine ||
  createSheetSchema({
    description: "Season totals per player",
    category: "stat",
    keyColumns: ["playerId", "seasonId", "seasonType"],
    datetimeColumns: ["createdAt", "updatedAt"],
    numericColumns: PLAYER_WEEK_NUMERIC_FIELDS,
  });

var TEAM_DAY_NUMERIC_FIELDS = PLAYER_DAY_NUMERIC_FIELDS.slice();

SHEET_SCHEMAS.TeamDayStatLine =
  SHEET_SCHEMAS.TeamDayStatLine ||
  createSheetSchema({
    description: "Daily team aggregates",
    category: "stat",
    keyColumns: ["gshlTeamId", "date"],
    dateColumns: ["date"],
    datetimeColumns: ["createdAt", "updatedAt"],
    numericColumns: TEAM_DAY_NUMERIC_FIELDS,
  });

var TEAM_WEEK_NUMERIC_FIELDS = TEAM_DAY_NUMERIC_FIELDS.concat([
  "days",
  "yearToDateRating",
  "powerRating",
  "powerElo",
  "powerEloPre",
  "powerEloPost",
  "powerEloDelta",
  "powerEloExpected",
  "powerEloK",
  "powerStatScore",
  "powerStatEwma",
  "powerComposite",
  "powerRk",
]);

SHEET_SCHEMAS.TeamWeekStatLine =
  SHEET_SCHEMAS.TeamWeekStatLine ||
  createSheetSchema({
    description: "Weekly team aggregates",
    category: "stat",
    keyColumns: ["gshlTeamId", "weekId"],
    datetimeColumns: ["createdAt", "updatedAt"],
    numericColumns: TEAM_WEEK_NUMERIC_FIELDS,
  });

var TEAM_SEASON_NUMERIC_FIELDS = TEAM_DAY_NUMERIC_FIELDS.concat([
  "days",
  "powerRating",
  "powerElo",
  "powerEloPre",
  "powerEloPost",
  "powerEloDelta",
  "powerEloExpected",
  "powerEloK",
  "powerStatScore",
  "powerStatEwma",
  "powerComposite",
  "powerRk",
  "prevPowerRating",
  "prevPowerRk",
  "teamW",
  "teamHW",
  "teamHL",
  "teamL",
  "teamCCW",
  "teamCCHW",
  "teamCCHL",
  "teamCCL",
  "overallRk",
  "conferenceRk",
  "wildcardRk",
  "playersUsed",
]);

SHEET_SCHEMAS.TeamSeasonStatLine =
  SHEET_SCHEMAS.TeamSeasonStatLine ||
  createSheetSchema({
    description: "Season-level team aggregates",
    category: "stat",
    keyColumns: ["gshlTeamId", "seasonId", "seasonType"],
    datetimeColumns: ["createdAt", "updatedAt"],
    numericColumns: TEAM_SEASON_NUMERIC_FIELDS,
  });

SHEET_SCHEMAS.TeamWeekStatLineHistory =
  SHEET_SCHEMAS.TeamWeekStatLineHistory ||
  createSheetSchema({
    description: "Historical weekly aggregates",
    category: "stat",
    keyColumns: ["gshlTeamId", "weekId"],
    datetimeColumns: ["createdAt", "updatedAt"],
    numericColumns: TEAM_WEEK_NUMERIC_FIELDS.concat([
      "weekIndex",
      "weekSortOrder",
    ]),
  });

var SHEET_TYPE_OVERRIDES = buildSheetTypeOverrides(SHEET_SCHEMAS);

function buildSheetTypeOverrides(schemaMap) {
  var overrides = {};
  Object.keys(schemaMap).forEach(function (sheetName) {
    overrides[sheetName] = buildFieldTypeMap(schemaMap[sheetName]);
  });
  return overrides;
}

function buildFieldTypeMap(schema) {
  var typeMap = {};
  if (!schema) return typeMap;
  addTypeGroup(typeMap, schema.numericColumns, "number");
  addTypeGroup(typeMap, schema.booleanColumns, "boolean");
  addTypeGroup(typeMap, schema.dateColumns, "date");
  addTypeGroup(typeMap, schema.datetimeColumns, "datetime");
  addTypeGroup(typeMap, schema.timestampColumns, "datetime");
  if (schema.fields) {
    Object.keys(schema.fields).forEach(function (fieldName) {
      var def = schema.fields[fieldName];
      if (!def || !def.type) return;
      if (!typeMap[fieldName]) {
        typeMap[fieldName] = def.type;
      }
    });
  }
  return typeMap;
}

function addTypeGroup(map, columns, type) {
  if (!columns || !columns.length) return;
  columns.forEach(function (column) {
    if (!column || map[column]) return;
    map[column] = type;
  });
}

function getSheetSchema(sheetName) {
  return SHEET_SCHEMAS[sheetName] || null;
}

function getSheetKeyColumns(sheetName) {
  var schema = getSheetSchema(sheetName);
  if (!schema || !schema.keyColumns) return [];
  return schema.keyColumns.slice();
}

function resolveFieldType(sheetName, fieldName, overrideMap) {
  if (!fieldName) return "string";
  if (overrideMap && overrideMap[fieldName]) {
    return overrideMap[fieldName];
  }
  var sheetOverrides = SHEET_TYPE_OVERRIDES[sheetName] || {};
  if (sheetOverrides[fieldName]) {
    return sheetOverrides[fieldName];
  }
  if (SHEET_DATE_ONLY_FIELDS.has(fieldName)) return "date";
  if (SHEET_DATETIME_FIELDS.has(fieldName)) return "datetime";
  if (SHEET_BOOLEAN_FIELDS.has(fieldName)) return "boolean";
  if (SHEET_NUMERIC_FIELDS.has(fieldName)) return "number";
  if (/date$/i.test(fieldName)) return "date";
  if (/At$/.test(fieldName)) return "datetime";
  if (/^(is|has)[A-Z]/.test(fieldName)) return "boolean";
  if (/(Score|Rating|Rk|Count|Total)$/i.test(fieldName)) return "number";
  return "string";
}

function coerceSheetValue(sheetName, fieldName, value, overrideMap) {
  if (value === undefined || value === null || value === "") {
    return resolveFieldType(sheetName, fieldName, overrideMap) === "string"
      ? ""
      : null;
  }
  var type = resolveFieldType(sheetName, fieldName, overrideMap);
  switch (type) {
    case "number": {
      if (typeof value === "number") return value;
      var num = Number(value);
      return isFinite(num) ? num : null;
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      var normalized = String(value).trim().toLowerCase();
      if (!normalized) return null;
      return (
        normalized === "true" || normalized === "1" || normalized === "yes"
      );
    }
    case "date": {
      return formatDateOnly(value);
    }
    case "datetime": {
      if (value instanceof Date) return value;
      var parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    default:
      return String(value);
  }
}

function stringifySheetValue(sheetName, fieldName, value, overrideMap) {
  if (value === undefined || value === null || value === "") return "";
  var type = resolveFieldType(sheetName, fieldName, overrideMap);
  switch (type) {
    case "number": {
      var num = Number(value);
      return isFinite(num) ? num.toString() : "";
    }
    case "boolean": {
      if (
        value === true ||
        value === "TRUE" ||
        value === "true" ||
        value === 1 ||
        value === "1"
      ) {
        return "TRUE";
      }
      if (
        value === false ||
        value === "FALSE" ||
        value === "false" ||
        value === 0 ||
        value === "0"
      ) {
        return "FALSE";
      }
      return "";
    }
    case "date": {
      return formatDateOnly(value);
    }
    case "datetime": {
      var date = value instanceof Date ? value : new Date(value);
      return isNaN(date.getTime()) ? "" : date.toISOString();
    }
    default: {
      return Array.isArray(value) ? value.join(",") : String(value);
    }
  }
}

function matchupHasOutcome(matchup) {
  if (!matchup) return false;
  if (matchup.homeWin || matchup.awayWin || matchup.tie) return true;
  return matchup.homeScore !== null && matchup.awayScore !== null;
}
