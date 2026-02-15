// @ts-nocheck

/**
 * Environment flag helpers for Apps Script runtime.
 * Provides cached script properties and convenience toggles
 * for verbose logging and dry-run execution modes.
 */
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
