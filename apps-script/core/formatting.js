// @ts-nocheck

/**
 * Date, string, and numeric helpers shared across scripts.
 * These remain globally accessible for Apps Script runtime.
 */
function formatDate(date) {
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, "0");
  var day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

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

function getPreviousDate(date) {
  var now = new Date(date + "T00:00:00.000");
  var etDateStr = now.toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  var targetDate = new Date(etDateStr + "T00:00:00.000");
  targetDate.setDate(targetDate.getDate() - 1);
  return formatDate(targetDate);
}

function isDateInRange(target, start, end) {
  var targetDate = formatDateOnly(target);
  var startDate = formatDateOnly(start);
  var endDate = formatDateOnly(end);
  if (!targetDate || !startDate || !endDate) return false;
  return targetDate >= startDate && targetDate <= endDate;
}

function removeAccents(str) {
  if (!str) return "";
  try {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (e) {
    return str;
  }
}

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

function normalizeName(name) {
  if (!name) return "";
  var varied = applyNameVariations(name);
  var noAccents = removeAccents(varied);
  return noAccents
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();
}

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
