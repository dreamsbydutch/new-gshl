/**
 * GSHL Apps Script Utilities
 * ==========================
 * Shared helper functions for date formatting, text normalization,
 * array/string coercion, numeric parsing, and efficient sheet writes.
 *
 * Note: In Apps Script, files share a global scope. Functions defined here
 * are available to other .js/.gs files in the same project without imports.
 */

// @ts-nocheck

/**
 * Table of contents
 * - Environment flags + logging
 * - Date + name + numeric helpers
 * - Sheet typing + schema metadata
 * - Sheet read helpers
 * - Sheet write/upsert helpers
 * - Yahoo scraper utilities (HTML parsing + fetch)
 */

// ============================================================================
// ENVIRONMENT FLAG HELPERS
// ============================================================================

var _scriptPropertyCache = null;

function getScriptPropertiesSnapshot() {
  if (_scriptPropertyCache !== null) return _scriptPropertyCache;
  if (typeof PropertiesService === "undefined" || !PropertiesService) {
    _scriptPropertyCache = null;
    return _scriptPropertyCache;
  }
  try {
    _scriptPropertyCache =
      PropertiesService.getScriptProperties().getProperties() || {};
  } catch (err) {
    if (typeof console !== "undefined" && console && console.log) {
      console.log("Unable to read script properties: " + err);
    }
    _scriptPropertyCache = {};
  }
  return _scriptPropertyCache;
}

function coerceBooleanFlag(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return !!fallback;
  }
  if (typeof value === "boolean") return value;
  var normalized = String(value).trim().toLowerCase();
  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "on"
  ) {
    return true;
  }
  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "off"
  ) {
    return false;
  }
  return !!fallback;
}

function getEnvironmentFlag(flagName, fallback) {
  var props = getScriptPropertiesSnapshot();
  if (props && Object.prototype.hasOwnProperty.call(props, flagName)) {
    return coerceBooleanFlag(props[flagName], fallback);
  }
  return coerceBooleanFlag(undefined, fallback);
}

function isVerboseLoggingEnabled() {
  var fallback =
    typeof ENABLE_VERBOSE_LOGGING === "undefined"
      ? false
      : !!ENABLE_VERBOSE_LOGGING;
  return getEnvironmentFlag("VERBOSE_LOGGING", fallback);
}

function isDryRunModeEnabled() {
  var fallback =
    typeof ENABLE_DRY_RUN_MODE === "undefined" ? false : !!ENABLE_DRY_RUN_MODE;
  return getEnvironmentFlag("DRY_RUN_MODE", fallback);
}

function logVerbose() {
  if (!isVerboseLoggingEnabled()) return;
  if (typeof console !== "undefined" && console && console.log) {
    console.log.apply(console, arguments);
  }
}

// ============================================================================
// DATE + NAME + NUMERIC UTILITIES
// ============================================================================

/**
 * Format a Date as YYYY-MM-DD
 * @param {Date} date
 */
function formatDate(date) {
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, "0");
  var day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

/**
 * Get the target date for scraping
 * Before 7 AM ET: previous day; otherwise current day
 */
function getTargetDateForScraping() {
  var now = new Date();
  var etDateStr = now.toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  var etHour = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  ).getHours();
  var targetDate = new Date(etDateStr + "T00:00:00.000");
  if (etHour < 7) targetDate.setDate(targetDate.getDate() - 1);
  return formatDate(targetDate);
}
/**
 * Get previous date
 */
function getPreviousDate(date) {
  var now = new Date(date + "T00:00:00.000");
  var etDateStr = now.toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  var targetDate = new Date(etDateStr + "T00:00:00.000");
  targetDate.setDate(targetDate.getDate() - 1);
  return formatDate(targetDate);
}
/**
 * Get next date
 */
function getNextDate(date) {
  var now = new Date(date + "T00:00:00.000");
  var etDateStr = now.toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  var targetDate = new Date(etDateStr + "T00:00:00.000");
  targetDate.setDate(targetDate.getDate() + 1);
  return formatDate(targetDate);
}
/**
 * Return all dates between start and end (inclusive) in YYYY-MM-DD format.
 *
 * Inputs may be Date objects, YYYY-MM-DD strings, or values coercible to Date.
 * Output is always an array of YYYY-MM-DD strings.
 *
 * @param {Date|string|number} start
 * @param {Date|string|number} end
 * @returns {string[]}
 */
function getDatesInRangeInclusive(start, end) {
  var startStr = formatDateOnly(start);
  var endStr = formatDateOnly(end);
  if (!startStr || !endStr) return [];

  // If the caller swaps the order, keep behavior simple and safe.
  if (startStr > endStr) return [];

  // Work in UTC to avoid timezone/DST off-by-one issues.
  var current = new Date(startStr + "T00:00:00.000Z");
  var endDate = new Date(endStr + "T00:00:00.000Z");
  if (isNaN(current.getTime()) || isNaN(endDate.getTime())) return [];

  var out = [];
  while (current.getTime() <= endDate.getTime()) {
    out.push(formatDateOnly(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return out;
}

function isDateInRange(target, start, end) {
  var targetDate = formatDateOnly(target);
  var startDate = formatDateOnly(start);
  var endDate = formatDateOnly(end);
  if (!targetDate || !startDate || !endDate) return false;
  return targetDate >= startDate && targetDate <= endDate;
}

/**
 * Remove accents/diacritics using Unicode normalization.
 * @param {string} str
 */
function removeAccents(str) {
  if (!str) return "";
  try {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (e) {
    return str;
  }
}

/**
 * Apply common first-name variations to improve matching.
 * @param {string} name
 */
function applyNameVariations(name) {
  if (!name) return "";
  var nameVariations = {
    "matt ": "matthew ",
    "^matt$": "matthew",
    "mike ": "michael ",
    "^mike$": "michael",
    "mitch ": "mitchell ",
    "^mitch$": "mitchell",
    "alex ": "alexander ",
    "^alex$": "alexander",
    "chris ": "christopher ",
    "^chris$": "christopher",
    "dave ": "david ",
    "^dave$": "david",
    "dan ": "daniel ",
    "^dan$": "daniel",
    "nick ": "nicholas ",
    "^nick$": "nicholas",
    "rob ": "robert ",
    "^rob$": "robert",
    "tom ": "thomas ",
    "^tom$": "thomas",
    "joe ": "joseph ",
    "^joe$": "joseph",
    "jim ": "james ",
    "^jim$": "james",
    "pat ": "patrick ",
    "^pat$": "patrick",
    "josh ": "joshua ",
    "^josh$": "joshua",
    "sam ": "samuel ",
    "^sam$": "samuel",
    "ben ": "benjamin ",
    "^ben$": "benjamin",
    "will ": "william ",
    "^will$": "william",
    "tony ": "anthony ",
    "^tony$": "anthony",
    "steve ": "steven ",
    "^steve$": "steven",
    "zach ": "zachary ",
    "^zach$": "zachary",
    "j.t. ": "jt ",
    "j. t. ": "jt ",
    "jake ": "jacob ",
    "^jake$": "jacob",
  };
  var lowerName = String(name).toLowerCase();
  for (var key in nameVariations) {
    var replacement = nameVariations[key];
    if (key.indexOf("^") === 0) {
      var cleanKey = key.replace(/\^|\$/g, "");
      if (lowerName === cleanKey) return replacement;
    } else if (lowerName.indexOf(key) === 0) {
      lowerName = lowerName.replace(key, replacement);
    }
  }
  return lowerName;
}

/**
 * Normalize a player name for matching (lowercase, strip non-letters, handle accents/variations)
 * @param {string} name
 */
function normalizeName(name) {
  if (!name) return "";
  var varied = applyNameVariations(name);
  var noAccents = removeAccents(varied);
  return noAccents
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();
}

/**
 * Parse stat value to number or null
 * @param {any} value
 */
function parseStatValue(value) {
  if (value === null || value === undefined || value === "") return null;
  var num = parseFloat(value);
  return isNaN(num) ? null : num;
}

function toNumber(value) {
  var num = Number(value);
  return isFinite(num) ? num : 0;
}

function toBool(value) {
  return (
    value === true ||
    value === "TRUE" ||
    value === "true" ||
    value === 1 ||
    value === "1"
  );
}

function parseScore(value) {
  if (value === null || value === undefined || value === "") return null;
  var num = Number(value);
  return isFinite(num) ? num : null;
}

function formatDateOnly(value) {
  if (!value && value !== 0) return "";
  if (typeof value === "string") {
    var trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return "";
  var year = date.getUTCFullYear();
  var month = String(date.getUTCMonth() + 1).padStart(2, "0");
  var day = String(date.getUTCDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function isStarter(playerDay) {
  return String(playerDay && playerDay.GS) === "1";
}

function formatNumber(value) {
  if (value === null || value === undefined) return "";
  var num = Number(value);
  if (!isFinite(num)) return "";
  return num.toString();
}

// ============================================================================
// SHEET TYPING HELPERS
// ============================================================================

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

/**
 * Extract a scalar from a value that may be an array or a stringified array.
 * @param {any} value
 * @returns {string|number|''}
 */
function extractFirstArrayValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.length > 0 ? value[0] : "";
  if (typeof value === "string") {
    var trimmed = value.trim();
    if (
      trimmed.indexOf("[") === 0 &&
      trimmed.lastIndexOf("]") === trimmed.length - 1
    ) {
      try {
        var parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.length > 0 ? parsed[0] : "";
      } catch (e) {
        var match = trimmed.match(/\[["']?([^"'\]]+)["']?\]/);
        if (match && match[1]) return match[1];
      }
    }
    return value;
  }
  return value;
}

/**
 * Efficiently apply updates by grouping contiguous rows into single setValues calls.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array<{rowIndex:number,data:any[]}>} rowsToUpdate
 */
function groupAndApplyUpdates(sheet, rowsToUpdate) {
  if (!rowsToUpdate || rowsToUpdate.length === 0) return;
  rowsToUpdate.sort(function (a, b) {
    return a.rowIndex - b.rowIndex;
  });

  // Debug: Check if any rows have IRplus=1 at index 17
  var rowsWithIRplus = rowsToUpdate.filter(function (r) {
    return r.data[17] === "1" || r.data[17] === 1;
  });

  var start = rowsToUpdate[0].rowIndex;
  var width = rowsToUpdate[0].data.length;
  var buffer = [rowsToUpdate[0].data];
  for (var i = 1; i < rowsToUpdate.length; i++) {
    var prev = rowsToUpdate[i - 1];
    var curr = rowsToUpdate[i];
    if (curr.rowIndex === prev.rowIndex + 1 && curr.data.length === width) {
      buffer.push(curr.data);
    } else {
      sheet.getRange(start, 1, buffer.length, width).setValues(buffer);
      start = curr.rowIndex;
      width = curr.data.length;
      buffer = [curr.data];
    }
  }
  sheet.getRange(start, 1, buffer.length, width).setValues(buffer);
}

/**
 * Calculate age with one decimal place precision.
 * @param {Date|string} birthday
 * @param {Date} [currentDate]
 * @returns {number|null}
 */
function calculateAgeWithDecimal(birthday, currentDate) {
  try {
    var birthDate = birthday instanceof Date ? birthday : new Date(birthday);
    if (isNaN(birthDate.getTime())) return null;
    var current = currentDate || new Date();
    var diffMs = current - birthDate;
    var msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    var ageYears = diffMs / msPerYear;
    return Math.round(ageYears * 10) / 10;
  } catch (error) {
    Logger.log("⚠️  Error calculating age: " + error.message);
    return null;
  }
}

// ============================================================================
// Spreadsheet convenience helpers
// ============================================================================

/**
 * Open a sheet by spreadsheetId and sheet name. Throws when required and missing.
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {boolean} [required=true]
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null}
 */
function getSheetByName(spreadsheetId, sheetName, required) {
  var must = required === undefined ? true : !!required;
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet && must) {
    throw new Error(
      sheetName + " sheet not found in spreadsheet " + spreadsheetId,
    );
  }
  return sheet;
}

/**
 * Get the first row of values as headers. Throws if missing.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {string[]}
 */
function getHeadersFromSheet(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length === 0)
    throw new Error("Sheet is empty: " + sheet.getName());
  var headers = data[0];
  if (!headers || headers.length === 0)
    throw new Error("Header row missing in sheet: " + sheet.getName());
  return headers;
}

/**
 * Get a column index (0-based) for a header name; throws if required and missing.
 * @param {string[]} headers
 * @param {string} name
 * @param {boolean} [required=true]
 */
function getColIndex(headers, name, required) {
  var must = required === undefined ? true : !!required;
  var idx = headers.indexOf(name);
  if (idx === -1 && must)
    throw new Error("Required column '" + name + "' not found");
  return idx;
}

/**
 * Fetch data from a sheet and convert to array of objects
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {string} sheetName - Name of the sheet to fetch
 * @returns {Object[]} Array of objects where keys are headers and values are row data
 */
function fetchSheetAsObjects(spreadsheetId, sheetName, options) {
  options = options || {};
  var coerceTypes =
    options.coerceTypes === undefined ? true : !!options.coerceTypes;
  var fieldTypes = options.fieldTypes || options.schema || null;
  var sheet = getSheetByName(spreadsheetId, sheetName, true);
  var data = sheet.getDataRange().getValues();

  if (!data || data.length === 0) {
    throw new Error("Sheet is empty: " + sheetName);
  }

  var tableData = extractSheetTableData(sheetName, data, options);

  if (!tableData.headers.length) {
    throw new Error("Sheet is empty: " + sheetName);
  }

  if (tableData.rows.length === 0) {
    return [];
  }

  return tableData.rows.map(function (row) {
    var obj = {};
    tableData.headers.forEach(function (header, index) {
      var cellValue = row[index];
      obj[header] = coerceTypes
        ? coerceSheetValue(sheetName, header, cellValue, fieldTypes)
        : cellValue;
    });
    return obj;
  });
}

function extractSheetTableData(sheetName, data, options) {
  var opts = options || {};
  var headerRowIndex = 0;

  if (
    typeof opts.headerRowIndex === "number" &&
    opts.headerRowIndex >= 0 &&
    opts.headerRowIndex < data.length
  ) {
    headerRowIndex = opts.headerRowIndex;
  } else {
    headerRowIndex = inferHeaderRowIndex(data);
  }

  var headers = (data[headerRowIndex] || []).map(function (header) {
    if (header === null || header === undefined) return "";
    return typeof header === "string" ? header.trim() : String(header);
  });

  var rows = data.slice(headerRowIndex + 1).filter(function (row) {
    if (!row) return false;
    return row.some(function (cell) {
      return cell !== "" && cell !== null && cell !== undefined;
    });
  });

  var normalizedRows = rows.map(function (row) {
    var normalized = [];
    for (var i = 0; i < headers.length; i++) {
      normalized[i] = row[i] === undefined ? "" : row[i];
    }
    return normalized;
  });

  if (!headers.length) {
    throw new Error("Header row missing in sheet: " + sheetName);
  }

  return {
    headers: headers,
    rows: normalizedRows,
  };
}

function inferHeaderRowIndex(data) {
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row) continue;

    var hasIdColumn = row.some(function (cell) {
      return typeof cell === "string" && cell.trim().toLowerCase() === "id";
    });

    if (hasIdColumn) {
      return i;
    }
  }

  return 0;
}

/**
 * Group and apply single-column updates efficiently.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} colIndex1Based - 1-based column index to update
 * @param {Array<{rowIndex:number,value:any}>} updates - 1-based row indices
 */
function groupAndApplyColumnUpdates(sheet, colIndex1Based, updates) {
  if (!updates || updates.length === 0) return;
  // Sort by rowIndex
  updates.sort(function (a, b) {
    return a.rowIndex - b.rowIndex;
  });
  var start = updates[0].rowIndex;
  var buffer = [[updates[0].value]];
  for (var i = 1; i < updates.length; i++) {
    var prev = updates[i - 1].rowIndex;
    var curr = updates[i];
    if (curr.rowIndex === prev + 1) {
      buffer.push([curr.value]);
    } else {
      sheet.getRange(start, colIndex1Based, buffer.length, 1).setValues(buffer);
      start = curr.rowIndex;
      buffer = [[curr.value]];
    }
  }
  sheet.getRange(start, colIndex1Based, buffer.length, 1).setValues(buffer);
}

/**
 * Build a row array from an object keyed by header names.
 * If mergeExisting is true and existingRow is provided, missing keys keep existing values; otherwise empty string.
 * @param {string[]} headers
 * @param {Object} obj
 * @param {any[]} [existingRow]
 * @param {boolean} [mergeExisting=true]
 */
function objectToRow(
  headers,
  obj,
  existingRow,
  mergeExisting,
  sheetName,
  fieldTypes,
  stringifyValues,
) {
  var merge = mergeExisting === undefined ? true : !!mergeExisting;
  var shouldStringify =
    stringifyValues === undefined ? true : !!stringifyValues;
  var row = new Array(headers.length);

  for (var i = 0; i < headers.length; i++) {
    var key = headers[i];
    // Check if property exists in object (even if value is falsy)
    if (obj.hasOwnProperty(key)) {
      var val = obj[key];
      if (shouldStringify && sheetName) {
        row[i] = stringifySheetValue(sheetName, key, val, fieldTypes);
      } else {
        row[i] = val === null || val === undefined ? "" : val;
      }
    } else if (merge && existingRow) {
      // Property not provided, preserve existing value when merging
      row[i] = existingRow[i];
    } else {
      // Property not provided, no existing row or not merging
      row[i] = "";
    }
  }
  return row;
}

/**
 * Upsert rows into a sheet using key columns to detect existing records.
 * items are plain objects keyed by header name. Missing properties are preserved from existing when merge is true (default).
 * Options: { idColumn, createdAtColumn, updatedAtColumn, merge=true, clearMissing }
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {string[]} keyColumns
 * @param {Array<Object>} items
 * @param {{idColumn?:string,createdAtColumn?:string,updatedAtColumn?:string,merge?:boolean,clearMissing?:boolean|{filter?:Object,columnsToClear?:string[]}}} [options]
 * @returns {{updated:number, inserted:number, cleared:number, total:number}}
 */
function upsertSheetByKeys(
  spreadsheetId,
  sheetName,
  keyColumns,
  items,
  options,
) {
  options = options || {};
  var merge = options.merge === undefined ? true : !!options.merge;
  var idColName = options.idColumn || null;
  var createdAtColName = options.createdAtColumn || null;
  var updatedAtColName = options.updatedAtColumn || null;
  var clearMissing = options.clearMissing || null;
  var deleteMissing = options.deleteMissing || null;
  var fieldTypes = options.fieldTypes || options.schema || null;
  var stringifyValues =
    options.stringifyValues === undefined ? true : !!options.stringifyValues;
  var dryRunMode =
    typeof isDryRunModeEnabled === "function" && isDryRunModeEnabled();

  var sheet = getSheetByName(spreadsheetId, sheetName, true);
  var data = sheet.getDataRange().getValues();
  if (!data || data.length === 0) {
    throw new Error("Sheet has no data/header row");
  }
  var headers = data[0];
  var existingRows = data.slice(1);

  // Column indices
  var headerIndex = {};
  for (var i = 0; i < headers.length; i++) headerIndex[headers[i]] = i;

  function makeKeyFromArray(arr) {
    return keyColumns
      .map(function (k) {
        var idx = headerIndex[k];
        var val = idx === undefined ? "" : arr[idx];
        if (val instanceof Date) return formatDate(val);
        return String(val === undefined || val === null ? "" : val);
      })
      .join("|");
  }

  function makeKeyFromObject(obj) {
    return keyColumns
      .map(function (k) {
        var v = obj[k];
        if (v instanceof Date) return formatDate(v);
        return String(v === undefined || v === null ? "" : v);
      })
      .join("|");
  }

  // Build map of existing rows by key
  var existingMap = {};
  var maxId = 0;
  var idIdx = idColName ? headerIndex[idColName] : undefined;

  for (var r = 0; r < existingRows.length; r++) {
    var row = existingRows[r];
    var key = makeKeyFromArray(row);
    existingMap[key] = { row: row, rowIndex1Based: r + 2 };

    if (idIdx !== undefined) {
      var rowId = row[idIdx];
      var n = typeof rowId === "number" ? rowId : parseInt(rowId, 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    }
  }

  // Prepare items, assign ids/timestamps as needed
  var nowStr = new Date().toISOString();
  var updates = [];
  var inserts = [];
  var inserted = 0;
  var updated = 0;
  var nextId = maxId + 1;

  // Track keys present in incoming items
  var incomingKeys = {};

  for (var ii = 0; ii < items.length; ii++) {
    var item = items[ii] || {};

    // auto id / timestamps
    if (idColName && (!item[idColName] || item[idColName] === "")) {
      item[idColName] = String(nextId++);
    }
    if (createdAtColName) {
      if (!item[createdAtColName] || item[createdAtColName] === "") {
        item[createdAtColName] = nowStr;
      }
    }
    if (updatedAtColName) item[updatedAtColName] = nowStr;

    var key = makeKeyFromObject(item);
    incomingKeys[key] = true;

    var existing = existingMap[key];
    if (existing) {
      // Update: build full row array using objectToRow
      var newRow = objectToRow(
        headers,
        item,
        existing.row,
        merge,
        sheetName,
        fieldTypes,
        stringifyValues,
      );
      // Preserve createdAt if it exists
      if (createdAtColName) {
        var cIdx = headerIndex[createdAtColName];
        if (cIdx !== undefined && existing.row[cIdx]) {
          newRow[cIdx] = existing.row[cIdx];
        }
      }
      updates.push({ rowIndex: existing.rowIndex1Based, data: newRow });
      updated++;
    } else {
      // Insert: build full row array with no existing row
      var rowToAppend = objectToRow(
        headers,
        item,
        null,
        false,
        sheetName,
        fieldTypes,
        stringifyValues,
      );
      inserts.push(rowToAppend);
      inserted++;
    }
  }

  // Apply updates in grouped contiguous writes
  if (updates.length > 0) {
    if (dryRunMode) {
      logVerbose(
        "[dry-run] upsertSheetByKeys(%s) would update %s row(s).",
        sheetName,
        updates.length,
      );
    } else {
      groupAndApplyUpdates(sheet, updates);
    }
  }

  // Append inserts in a single block
  if (inserts.length > 0) {
    if (dryRunMode) {
      logVerbose(
        "[dry-run] upsertSheetByKeys(%s) would insert %s row(s).",
        sheetName,
        inserts.length,
      );
    } else {
      var lastRow = sheet.getLastRow();
      var startRow = lastRow + 1;
      sheet
        .getRange(startRow, 1, inserts.length, headers.length)
        .setValues(inserts);
    }
  }

  // clearMissing handling
  var cleared = 0;
  if (clearMissing) {
    // Normalize clearMissing into { filter: {...} | null, columnsToClear: [] }
    var cfg = {};
    if (clearMissing === true) {
      cfg.filter = null;
      // Default columns to clear: all non-key and non-id/created/updated columns
      cfg.columnsToClear = headers.filter(function (h) {
        if (keyColumns.indexOf(h) !== -1) return false;
        if (idColName && h === idColName) return false;
        if (createdAtColName && h === createdAtColName) return false;
        if (updatedAtColName && h === updatedAtColName) return false;
        return true;
      });
    } else {
      cfg.filter = clearMissing.filter || null;
      // Support columnsToClear: true to clear all non-key columns
      if (clearMissing.columnsToClear === true) {
        cfg.columnsToClear = headers.filter(function (h) {
          if (keyColumns.indexOf(h) !== -1) return false;
          if (idColName && h === idColName) return false;
          if (createdAtColName && h === createdAtColName) return false;
          if (updatedAtColName && h === updatedAtColName) return false;
          return true;
        });
      } else {
        cfg.columnsToClear = clearMissing.columnsToClear || [];
      }
    }

    // Find existing rows that match filter (if provided) and are NOT in incomingKeys
    var clearUpdates = [];
    for (var rr = 0; rr < existingRows.length; rr++) {
      var erow = existingRows[rr];
      var sheetKey = makeKeyFromArray(erow);

      // Skip rows that were present in incoming set
      if (incomingKeys[sheetKey]) continue;

      // If filter provided, verify match
      var skip = false;
      if (cfg.filter) {
        for (var fcol in cfg.filter) {
          var idx = headerIndex[fcol];
          var want = cfg.filter[fcol];
          var have = idx !== undefined ? erow[idx] : undefined;
          if (String(have) !== String(want)) {
            skip = true;
            break;
          }
        }
      }
      if (skip) continue;

      // Build new row with specified columns cleared
      var newRow = erow.slice();
      var didChange = false;
      for (var ci = 0; ci < cfg.columnsToClear.length; ci++) {
        var colName = cfg.columnsToClear[ci];
        var cidx = headerIndex[colName];
        if (cidx === undefined) continue;
        if (newRow[cidx] !== "") {
          newRow[cidx] = "";
          didChange = true;
        }
      }
      if (didChange) {
        clearUpdates.push({ rowIndex: rr + 2, data: newRow });
        cleared++;
      }
    }

    if (clearUpdates.length > 0) {
      if (dryRunMode) {
        logVerbose(
          "[dry-run] upsertSheetByKeys(%s) would clear %s row(s).",
          sheetName,
          clearUpdates.length,
        );
      } else {
        groupAndApplyUpdates(sheet, clearUpdates);
      }
    }
  }

  // deleteMissing handling - actually delete rows that are missing from incoming data
  var deleted = 0;
  if (deleteMissing) {
    var deleteFilter = deleteMissing === true ? null : deleteMissing;
    var rowsToDelete = [];

    // Find existing rows that match filter (if provided) and are NOT in incomingKeys
    for (var dr = 0; dr < existingRows.length; dr++) {
      var drow = existingRows[dr];
      var dkey = makeKeyFromArray(drow);

      // Skip rows that were present in incoming set
      if (incomingKeys[dkey]) continue;

      // If filter provided, verify match
      var dskip = false;
      if (deleteFilter) {
        for (var dfcol in deleteFilter) {
          var didx = headerIndex[dfcol];
          var dwant = deleteFilter[dfcol];
          var dhave = didx !== undefined ? drow[didx] : undefined;
          if (String(dhave) !== String(dwant)) {
            dskip = true;
            break;
          }
        }
      }
      if (dskip) continue;

      // Mark row for deletion (store 1-based row index)
      rowsToDelete.push(dr + 2);
    }

    // Delete rows in reverse order to maintain correct indices
    if (rowsToDelete.length > 0) {
      deleted = rowsToDelete.length;
      if (dryRunMode) {
        logVerbose(
          "[dry-run] upsertSheetByKeys(%s) would delete %s row(s).",
          sheetName,
          rowsToDelete.length,
        );
      } else {
        rowsToDelete.sort(function (a, b) {
          return b - a;
        });
        for (var di = 0; di < rowsToDelete.length; di++) {
          sheet.deleteRow(rowsToDelete[di]);
        }
      }
    }
  }

  if (dryRunMode) {
    logVerbose(
      "[dry-run] upsertSheetByKeys(%s) summary -> updates:%s inserts:%s cleared:%s deleted:%s",
      sheetName,
      updated,
      inserted,
      cleared,
      deleted,
    );
  }

  return {
    updated: updated,
    inserted: inserted,
    cleared: cleared,
    deleted: deleted,
    total: updated + inserted,
  };
}

// ============================================================================
// YAHOO SCRAPER UTILITIES
// ============================================================================

// ---------------------------------------------------------------------------
// HTML parsing helpers (used by Yahoo scraper)
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags and clean text content
 * @param {string} html - HTML string
 * @returns {string} Clean text
 */
function cleanText(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&#x[0-9a-fA-F]+;/gi, "")
    .trim();
}

/**
 * Extract game status from nested span structure
 * @param {string} html - HTML containing game status span
 * @returns {string} Clean game status text
 */
function extractGameStatus(html) {
  const gameStatusStart = html.indexOf('<span class="ysf-game-status');
  if (gameStatusStart === -1) return "";

  // Find matching closing span by counting depth
  let depth = 0;
  let pos = html.indexOf(">", gameStatusStart) + 1;
  const len = html.length;

  for (let i = pos; i < len; i++) {
    if (html[i] === "<") {
      if (html.substr(i, 6) === "<span ") {
        depth++;
      } else if (html.substr(i, 7) === "</span>") {
        if (depth === 0) {
          return html
            .substring(pos, i)
            .replace(/<span[^>]*>&#x[0-9a-fA-F]+;<\/span>/gi, "")
            .replace(/<[^>]*>/g, "")
            .replace(/&#x[0-9a-fA-F]+;/gi, "")
            .replace(/\s+(vs|@)\s+[A-Z]{2,3}$/i, "")
            .trim();
        }
        depth--;
      }
    }
  }
  return "";
}

/**
 * Parse table HTML to extract player data
 * @param {string} tableHtml - Complete table HTML
 * @param {string} playerType - "Skaters" or "Goaltenders"
 * @returns {Array} Array of player objects
 */
function parseTable(tableHtml, playerType) {
  if (!tableHtml) return [];

  // Extract thead to parse column headers
  const theadMatch = tableHtml.match(/<thead>([\s\S]*?)<\/thead>/i);
  let columnMap = {};

  if (theadMatch) {
    // Get the last row of thead which contains the actual column names
    const headerRows = theadMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (headerRows && headerRows.length > 0) {
      const lastHeaderRow = headerRows[headerRows.length - 1];
      const headerCols = lastHeaderRow.match(/<th[^>]*>([\s\S]*?)<\/th>/gi);

      if (headerCols) {
        let colIndex = 0;
        headerCols.forEach((col, idx) => {
          // Extract colspan if present
          const colspanMatch = col.match(/colspan=["'](\d+)["']/i);
          const colspan = colspanMatch ? parseInt(colspanMatch[1]) : 1;

          // Extract the column title/text
          const titleMatch = col.match(/title=["']([^"']*)["']/i);
          const divMatch = col.match(/<div[^>]*>(.*?)<\/div>/i);
          const colText = (
            titleMatch?.[1] ||
            divMatch?.[1] ||
            cleanText(col)
          ).trim();

          // Map recognizable column names to their indices
          if (colText) {
            const normalized = colText.toLowerCase();
            if (normalized === "pos") columnMap.pos = colIndex;
            else if (
              normalized.includes("forward") ||
              normalized.includes("defensem") ||
              normalized.includes("goaltender")
            )
              columnMap.player = colIndex;
            else if (normalized === "action") columnMap.action = colIndex;
            else if (normalized === "opp" || normalized === "opponents")
              columnMap.opp = colIndex;
            else if (normalized === "g" || normalized === "goals")
              columnMap.G = colIndex;
            else if (normalized === "a" || normalized === "assists")
              columnMap.A = colIndex;
            else if (normalized === "p" || normalized === "points")
              columnMap.P = colIndex;
            else if (normalized === "ppp" || normalized === "powerplay points")
              columnMap.PPP = colIndex;
            else if (normalized === "sog" || normalized === "shots on goal")
              columnMap.SOG = colIndex;
            else if (normalized === "hit" || normalized === "hits")
              columnMap.HIT = colIndex;
            else if (normalized === "blk" || normalized === "blocks")
              columnMap.BLK = colIndex;
            else if (normalized === "w" || normalized === "wins")
              columnMap.W = colIndex;
            else if (normalized === "ga" || normalized === "goals against")
              columnMap.GA = colIndex;
            else if (
              normalized === "gaa" ||
              normalized === "goals against average"
            )
              columnMap.GAA = colIndex;
            else if (normalized === "sv" || normalized === "saves")
              columnMap.SV = colIndex;
            else if (normalized === "sa" || normalized === "shots against")
              columnMap.SA = colIndex;
            else if (normalized === "sv%" || normalized === "save percentage")
              columnMap.SVP = colIndex;
          }

          colIndex += colspan;
        });
      }
    }
  }

  // Extract tbody
  const tbodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];

  // Get all rows
  const rows = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  if (!rows) return [];

  const isSkater = playerType === "Skaters";

  return rows
    .map((row) => {
      const cols = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
      if (!cols || cols.length < 2) return null;

      // Extract position (index 0 or from columnMap)
      const posIdx = columnMap.pos !== undefined ? columnMap.pos : 0;
      const dailyPos = cols[posIdx] ? cleanText(cols[posIdx]) : "";

      // Extract player column data (index 1 or from columnMap)
      const playerIdx = columnMap.player !== undefined ? columnMap.player : 1;
      const playerCol = cols[playerIdx] || cols[1];

      // Extract player name and Yahoo ID
      const nameMatch = playerCol.match(
        /<div[^>]*class="[^"]*ysf-player-name[^"]*"[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>/i,
      );
      const playerName = nameMatch ? nameMatch[1].trim() : "";

      // Try explicit data-ys-playerid attribute first, otherwise fallback to id in the href (/players/<id>)
      const yahooIdMatch = playerCol.match(
        /<a[^>]*data-ys-playerid=["']([^"']+)["']/i,
      );
      let yahooId = yahooIdMatch ? yahooIdMatch[1] : "";
      if (!yahooId) {
        const hrefMatch = playerCol.match(
          /<a[^>]*href=["'][^"']*\/players\/(\d+)[^"']*["']/i,
        );
        if (hrefMatch) {
          yahooId = hrefMatch[1];
        }
      }

      // Extract team and position
      const detailMatch = playerCol.match(
        /<span[^>]*class="[^"]*D-b[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
      );
      let nhlTeam = "";
      let nhlPos = "";
      if (detailMatch) {
        const detailText = detailMatch[1].trim();
        // Remove any HTML tags and entities from the detail text
        const cleanDetail = detailText
          .replace(/<[^>]*>/g, "")
          .replace(/&#x[0-9a-fA-F]+;/gi, "")
          .trim();
        const parts = cleanDetail.split(" - ");
        nhlTeam = parts[0] || "";
        nhlPos = (parts[1] && parts[1].split(",")) || "";
      }

      // Extract injury status
      const injuryMatch = playerCol.match(
        /<span[^>]*class="[^"]*ysf-player-status[^"]*Nowrap[^"]*F-injury[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
      );
      const injuryStatus = injuryMatch ? cleanText(injuryMatch[1]) : "";

      // Extract game status
      const gameStatus = extractGameStatus(playerCol);

      // Extract opponent using columnMap
      const oppIdx = columnMap.opp;
      const opp =
        oppIdx !== undefined && cols[oppIdx] ? cleanText(cols[oppIdx]) : "";

      // Helper function to get stat value by column name
      const getStat = (statKey) => {
        const idx = columnMap[statKey];
        if (idx === undefined || !cols[idx]) return "";
        const val = cleanText(cols[idx]);
        return val === "-" ? "" : val;
      };

      // Map to player object
      if (isSkater) {
        const G = getStat("G");
        const A = getStat("A");
        const P = getStat("P");
        const PPP = getStat("PPP");
        const SOG = getStat("SOG");
        const HIT = getStat("HIT");
        const BLK = getStat("BLK");

        return {
          yahooId: yahooId,
          dailyPos: dailyPos,
          playerName,
          nhlTeam,
          nhlPos,
          score: gameStatus,
          opp: opp,
          GP: opp && G !== "" ? "1" : "",
          MG:
            opp &&
            G === "" &&
            !(
              gameStatus.toLocaleLowerCase().includes("pm") ||
              gameStatus.toLocaleLowerCase().includes("am")
            )
              ? "1"
              : "",
          IR: injuryStatus.includes("IR") ? "1" : "",
          IRplus: injuryStatus && !injuryStatus.includes("IR") ? "1" : "",
          GS:
            dailyPos !== "BN" &&
            dailyPos !== "IR" &&
            dailyPos !== "IR+" &&
            opp &&
            G !== ""
              ? "1"
              : "",
          G: G,
          A: A,
          P: P,
          PM: "",
          PIM: "",
          PPP: PPP,
          SOG: SOG,
          HIT: HIT,
          BLK: BLK,
          W: "",
          GA: "",
          GAA: "",
          SV: "",
          SA: "",
          SVP: "",
          SO: "",
          TOI: "",
          Rating: "",
          ADD: "",
          MS: "",
          BS: "",
        };
      } else {
        const W = getStat("W");
        const GA = getStat("GA");
        const GAA = getStat("GAA");
        const SV = getStat("SV");
        const SA = getStat("SA");
        const SVP = getStat("SVP");

        return {
          yahooId: yahooId,
          dailyPos: dailyPos,
          playerName,
          nhlTeam,
          nhlPos,
          score: gameStatus,
          opp: opp,
          GP: opp && W !== "" ? "1" : "",
          MG:
            opp &&
            W === "" &&
            !(
              gameStatus.toLocaleLowerCase().includes("pm") ||
              gameStatus.toLocaleLowerCase().includes("am")
            )
              ? "1"
              : "",
          IR: injuryStatus.includes("IR") ? "1" : "",
          IRplus: injuryStatus && !injuryStatus.includes("IR") ? "1" : "",
          GS:
            dailyPos !== "BN" &&
            dailyPos !== "IR" &&
            dailyPos !== "IR+" &&
            opp &&
            W !== ""
              ? "1"
              : "",
          G: "",
          A: "",
          P: "",
          PPP: "",
          SOG: "",
          HIT: "",
          BLK: "",
          W: W,
          GA: GA,
          GAA: GAA,
          SV: SV,
          SA: SA,
          SVP: SVP,
          SO: "",
          TOI:
            GAA === ""
              ? ""
              : GA === "0" || GAA === "0"
                ? "60"
                : ((GA * 60) / GAA).toString() || "",
          Rating: "",
          ADD: "",
          MS: "",
          BS: "",
        };
      }
    })
    .filter((player) => {
      return player !== null;
    });
}

/**
 * Fetch and parse Yahoo team roster for a specific date
 * @param {string} targetDate - Date in YYYY-MM-DD format
 * @param {string} yahooTeamId - Yahoo team ID
 * @returns {Array} Array of player objects (skaters and goaltenders combined)
 */
function yahooTableScraper(targetDate, yahooTeamId, seasonId) {
  const urlMap = {
    1: "https://hockey.fantasysports.yahoo.com/2014/hockey/32199/",
    2: "https://hockey.fantasysports.yahoo.com/2015/hockey/15588/",
    3: "https://hockey.fantasysports.yahoo.com/2016/hockey/14315/",
    4: "https://hockey.fantasysports.yahoo.com/2017/hockey/2537/",
    5: "https://hockey.fantasysports.yahoo.com/2018/hockey/22001/",
    6: "https://hockey.fantasysports.yahoo.com/2019/hockey/75888/",
    7: "https://hockey.fantasysports.yahoo.com/2020/hockey/8673/",
    8: "https://hockey.fantasysports.yahoo.com/2021/hockey/31325/",
    9: "https://hockey.fantasysports.yahoo.com/2022/hockey/52650/",
    10: "https://hockey.fantasysports.yahoo.com/2023/hockey/45850/",
    11: "https://hockey.fantasysports.yahoo.com/2024/hockey/47379/",
    12:
      "https://hockey.fantasysports.yahoo.com/hockey/" + YAHOO_LEAGUE_ID + "/",
  };
  const url = urlMap[seasonId] + yahooTeamId + "/team?&date=" + targetDate;
  try {
    const response = UrlFetchApp.fetch(url);
    const html = response.getContentText();

    // Extract skater table
    const skaterTableMatch = html.match(
      /<table[^>]*id=["']statTable0["'][^>]*>([\s\S]*?)<\/table>/i,
    );

    // Extract goalie table
    const goalieTableMatch = html.match(
      /<table[^>]*id=["']statTable1["'][^>]*>([\s\S]*?)<\/table>/i,
    );

    return [
      ...(skaterTableMatch ? parseTable(skaterTableMatch[0], "Skaters") : []),
      ...(goalieTableMatch
        ? parseTable(goalieTableMatch[0], "Goaltenders")
        : []),
    ];
  } catch (error) {
    Logger.log("❌ Error fetching page:");
    Logger.log(error.toString());
    throw error;
  }
}

function getTodayDateString() {
  return formatDateOnly(new Date());
}

function isWeekCompleteRecord(week, todayDateString) {
  if (!week) return false;
  var endDateStr = formatDateOnly(week.endDate);
  if (!endDateStr) return false;
  if (!todayDateString) return false;
  return todayDateString > endDateStr;
}

function getPlayerDayWorkbookId(seasonId) {
  const seasonNumber = Number(seasonId);
  if (isNaN(seasonNumber)) return CURRENT_PLAYERDAY_SPREADSHEET_ID;
  if (seasonNumber <= 5) return PLAYERDAY_WORKBOOKS.PLAYERDAYS_1_5;
  if (seasonNumber <= 10) return PLAYERDAY_WORKBOOKS.PLAYERDAYS_6_10;
  return PLAYERDAY_WORKBOOKS.PLAYERDAYS_11_15;
}

function normalizeNhlPosValue(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(",");
  return value.toString();
}

function resolvePosGroupFromNhlPos(nhlPos) {
  const normalized = normalizeNhlPosValue(nhlPos).toUpperCase();
  if (normalized.includes("G")) return "G";
  if (normalized.includes("D")) return "D";
  return "F";
}

function buildMissingPlayerDayRow(
  scrapedPlayer,
  playerRecord,
  teamId,
  seasonId,
  weekId,
  dateStr,
) {
  if (!scrapedPlayer || !playerRecord || !playerRecord.id) return null;
  if (!teamId || !seasonId || !dateStr) return null;

  const playerIdStr = playerRecord.id.toString();
  const normalizedNhlPos = normalizeNhlPosValue(scrapedPlayer.nhlPos);
  const row = {
    ...scrapedPlayer,
    playerId: playerIdStr,
    gshlTeamId: teamId,
    seasonId,
    weekId: weekId || "",
    date: dateStr,
    posGroup: resolvePosGroupFromNhlPos(normalizedNhlPos),
    bestPos: "",
    fullPos: "",
    IR: "",
    IRplus: "",
    ADD: "",
    MS: "",
    BS: "",
    nhlPos: normalizedNhlPos,
    yahooId:
      scrapedPlayer.yahooId ||
      (playerRecord.yahooId && playerRecord.yahooId.toString()) ||
      "",
    playerName:
      scrapedPlayer.playerName ||
      playerRecord.playerName ||
      playerRecord.fullName ||
      playerRecord.name ||
      "",
  };

  row.Rating = "";
  return row;
}
