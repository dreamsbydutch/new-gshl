// @ts-nocheck

var RankingEngine = RankingEngine || {};

(function (ns) {
  "use strict";

  var PositionGroup = {
    F: "F",
    D: "D",
    G: "G",
    TEAM: "TEAM",
  };

  var TUNING_CONFIG = ns.TuningConfig || {};
  var TUNING_DEFAULTS = TUNING_CONFIG.defaults || {};
  var TUNING_TEAM_SCORING = TUNING_CONFIG.teamScoring || {};
  var TUNING_COHORTS = TUNING_CONFIG.cohorts || {};
  var TUNING_DISTRIBUTIONS = TUNING_CONFIG.distributions || {};
  var TUNING_RETENTION = TUNING_CONFIG.retention || {};
  var TUNING_GOALIE = TUNING_CONFIG.goalie || {};
  var TUNING_PLAYER_CALIBRATION = TUNING_CONFIG.playerCalibration || {};
  var TUNING_PROFILES = TUNING_CONFIG.profiles || {};
  var SKATER_DEFAULT_CATEGORIES = (
    TUNING_DEFAULTS.skaterCategories || ["G", "A", "P", "PPP", "SOG", "HIT", "BLK"]
  ).slice();
  var GOALIE_CORE_CATEGORIES = (
    TUNING_DEFAULTS.goalieCoreCategories || ["W", "GAA", "SVP"]
  ).slice();
  var LOWER_BETTER = {};
  (TUNING_DEFAULTS.lowerBetterStats || ["GAA", "GA"]).forEach(function (category) {
    LOWER_BETTER[String(category)] = true;
  });
  var seasonCategoryCache = {};
  var teamDaySeasonRowsCache = {};
  var teamWeekSeasonRowsCache = {};
  var teamSeasonRowsCache = {};
  var playerSplitSeasonRowsCache = {};
  var playerTotalSeasonRowsCache = {};
  var playerNhlSeasonRowsCache = {};
  var draftPickSeasonRowsCache = {};
  var seasonRowsCache = null;
  var TEAM_SEASON_AWARD_FIELD_PAIRS = [
    ["hartRating", "hartRk"],
    ["norrisRating", "norrisRk"],
    ["vezinaRating", "vezinaRk"],
    ["calderRating", "calderRk"],
    ["jackAdamsRating", "jackAdamsRk"],
    ["GMOYRating", "GMOYRk"],
  ];
  var TEAM_DAY_NO_GOALIE_CATEGORY_SCORE =
    TUNING_TEAM_SCORING.dayNoGoalieCategoryScore !== undefined
      ? TUNING_TEAM_SCORING.dayNoGoalieCategoryScore
      : 0.45;
  var TEAM_WEEK_NO_GOALIE_CATEGORY_SCORE =
    TUNING_TEAM_SCORING.weekNoGoalieCategoryScore !== undefined
      ? TUNING_TEAM_SCORING.weekNoGoalieCategoryScore
      : 0.15;
  var TEAM_DAY_FINAL_SCORE_MULTIPLIER =
    TUNING_TEAM_SCORING.dayFinalScoreMultiplier !== undefined
      ? TUNING_TEAM_SCORING.dayFinalScoreMultiplier
      : 1.25;
  var TEAM_WEEK_FINAL_SCORE_MULTIPLIER =
    TUNING_TEAM_SCORING.weekFinalScoreMultiplier !== undefined
      ? TUNING_TEAM_SCORING.weekFinalScoreMultiplier
      : 1.25;
  var TEAM_WEEK_AVERAGE_GP_BASELINE =
    TUNING_TEAM_SCORING.weekAverageGpBaseline !== undefined
      ? TUNING_TEAM_SCORING.weekAverageGpBaseline
      : 40;
  var TEAM_WEEK_LONG_WEEK_GP_BASELINE =
    TUNING_TEAM_SCORING.weekLongWeekGpBaseline !== undefined
      ? TUNING_TEAM_SCORING.weekLongWeekGpBaseline
      : 45;

  var SMALL_COHORT_THRESHOLDS = TUNING_COHORTS.smallThresholds || {
    skater: 17,
    goalie: 5,
  };
  var PLAYER_AGGREGATE_DISTRIBUTION_LIMITS =
    TUNING_DISTRIBUTIONS.aggregateLimits || {
      PlayerNHL: { F: 256, D: 128, G: 56 },
      PlayerTotalStatLine: {
        RS: { F: 350, D: 140, G: 112 },
        PO: { F: 140, D: 49, G: 28 },
      },
      PlayerSplitStatLine: {
        RS: { F: 350, D: 140, G: 112 },
        PO: { F: 140, D: 49, G: 28 },
      },
    };
  var PLAYER_DAY_RETAINED_SHARE = TUNING_RETENTION.dayShare || {
    F: 0.85,
    D: 0.75,
    G: 0.55,
  };
  var PLAYER_WEEK_RETAINED_SHARE = TUNING_RETENTION.weekShare || {
    F: 0.5,
    D: 0.75,
    G: 0.5,
  };
  var RETAINED_RANGE_NEGATIVE_CARRY =
    TUNING_RETENTION.negativeCarry !== undefined
      ? TUNING_RETENTION.negativeCarry
      : 0.3;
  var RETAINED_RANGE_NEGATIVE_FLOOR =
    TUNING_RETENTION.negativeFloor !== undefined
      ? TUNING_RETENTION.negativeFloor
      : -0.3;
  var GOALIE_MINIMUM_TOI_FOR_RATING =
    TUNING_GOALIE.minimumToiForRating !== undefined
      ? TUNING_GOALIE.minimumToiForRating
      : 0;
  var GOALIE_NEGLIGIBLE_TOI_THRESHOLD =
    TUNING_GOALIE.negligibleToiThreshold !== undefined
      ? TUNING_GOALIE.negligibleToiThreshold
      : 30;
  var GOALIE_NEGLIGIBLE_TOI_MAX_SCORE =
    TUNING_GOALIE.negligibleToiMaxScore !== undefined
      ? TUNING_GOALIE.negligibleToiMaxScore
      : 15;
  var PLAYER_DAY_POSITION_MULTIPLIER =
    TUNING_PLAYER_CALIBRATION.dayPositionMultiplier || {
      F: 1.725,
      D: 1.575,
      G: 1.325,
    };
  var PLAYER_WEEK_POSITION_MULTIPLIER =
    TUNING_PLAYER_CALIBRATION.weekPositionMultiplier || {
      F: 1.75,
      D: 1.5,
      G: 1.05,
    };
  var WEEK_NORMALIZATION_CONFIG =
    TUNING_PLAYER_CALIBRATION.weekNormalization || {
      skater: { targetUsage: 3.5, fullUsage: 3 },
      goalie: { targetUsage: 2, fullUsage: 2 },
    };

  var SKATER_LEVEL_PROFILES = TUNING_PROFILES.skater || {};
  var GOALIE_LEVEL_PROFILES = TUNING_PROFILES.goalie || {};

  function clip(value, min, max) {
    var numeric = Number(value);
    if (!isFinite(numeric)) return min;
    if (numeric < min) return min;
    if (numeric > max) return max;
    return numeric;
  }

  function toNumber(value) {
    if (value === undefined || value === null || value === "") return 0;
    var numeric = Number(value);
    return isFinite(numeric) ? numeric : 0;
  }

  function normalizeSheetName(sheetName) {
    var raw = String(sheetName || "").trim();
    if (
      raw === "PlayerNHL" ||
      raw === "PlayerNhl" ||
      raw === "PlayerNHLStatLine" ||
      raw === "PlayerNhlStatLine"
    ) {
      return "PlayerNHL";
    }
    return raw;
  }

  function normalizePosGroup(value, row) {
    var raw = String(
      value || (row && (row.posGroup || row.POS_GROUP)) || "",
    ).toUpperCase();
    if (raw === "G") return PositionGroup.G;
    if (raw === "D") return PositionGroup.D;
    if (raw === "F") return PositionGroup.F;
    if (raw === "TEAM") return PositionGroup.TEAM;
    if (row && (row.gshlTeamId || row.teamId) && !row.playerId)
      return PositionGroup.TEAM;
    return PositionGroup.F;
  }

  function detectSheetName(row, options) {
    if (options && options.sheetName)
      return normalizeSheetName(options.sheetName);
    if (!row) return "";
    if (row.date) return row.playerId ? "PlayerDayStatLine" : "TeamDayStatLine";
    if (
      row.seasonRating !== undefined ||
      row.overallRating !== undefined ||
      row.salary !== undefined ||
      row.QS !== undefined ||
      row.RBS !== undefined
    ) {
      return "PlayerNHL";
    }
    if (row.weekId)
      return row.playerId ? "PlayerWeekStatLine" : "TeamWeekStatLine";
    if (row.gshlTeamIds !== undefined) {
      return row.seasonId
        ? "PlayerTotalStatLine"
        : "PlayerCareerTotalStatLine";
    }
    if (row.playerId && row.gshlTeamId) {
      return row.seasonId
        ? "PlayerSplitStatLine"
        : "PlayerCareerSplitStatLine";
    }
    if (row.seasonType && row.playerId && row.gshlTeamId)
      return "PlayerSplitStatLine";
    if (row.seasonType && row.playerId) return "PlayerTotalStatLine";
    if (!row.playerId && (row.gshlTeamId || row.teamId))
      return "TeamSeasonStatLine";
    return "PlayerDayStatLine";
  }

  function normalizeCategory(category) {
    var value = String(category || "")
      .trim()
      .toUpperCase();
    if (
      value === "G" ||
      value === "A" ||
      value === "P" ||
      value === "PM" ||
      value === "PPP" ||
      value === "SOG" ||
      value === "HIT" ||
      value === "BLK" ||
      value === "W" ||
      value === "GAA" ||
      value === "SVP"
    ) {
      return value;
    }
    return null;
  }

  function parseSeasonCategories(rawValue) {
    if (Array.isArray(rawValue)) {
      return rawValue.map(normalizeCategory).filter(Boolean);
    }
    if (typeof rawValue === "string") {
      return rawValue.split(",").map(normalizeCategory).filter(Boolean);
    }
    return [];
  }

  function readSeasonCategories(seasonId) {
    var seasonKey =
      seasonId === undefined || seasonId === null ? "" : String(seasonId);
    if (!seasonKey) return SKATER_DEFAULT_CATEGORIES.slice();
    if (Object.prototype.hasOwnProperty.call(seasonCategoryCache, seasonKey)) {
      return seasonCategoryCache[seasonKey].slice();
    }

    try {
      var fetchSheetAsObjects =
        typeof GshlUtils !== "undefined" &&
        GshlUtils.sheets &&
        GshlUtils.sheets.read &&
        GshlUtils.sheets.read.fetchSheetAsObjects
          ? GshlUtils.sheets.read.fetchSheetAsObjects
          : null;
      if (!fetchSheetAsObjects || typeof SPREADSHEET_ID === "undefined") {
        seasonCategoryCache[seasonKey] = SKATER_DEFAULT_CATEGORIES.slice();
        return seasonCategoryCache[seasonKey].slice();
      }

      var seasons = fetchSheetAsObjects(SPREADSHEET_ID, "Season") || [];
      var season = seasons.find(function (entry) {
        return String(entry && entry.id) === seasonKey;
      });
      var parsed = parseSeasonCategories(season && season.categories);
      seasonCategoryCache[seasonKey] = parsed.length
        ? parsed
        : SKATER_DEFAULT_CATEGORIES.slice();
      return seasonCategoryCache[seasonKey].slice();
    } catch (_error) {
      seasonCategoryCache[seasonKey] = SKATER_DEFAULT_CATEGORIES.slice();
      return seasonCategoryCache[seasonKey].slice();
    }
  }

  function getSkaterCategories(seasonId) {
    return readSeasonCategories(seasonId).filter(function (category) {
      return category !== "W" && category !== "GAA" && category !== "SVP";
    });
  }

  function getRatingSkaterCategories(seasonId, sheetName) {
    if (normalizeSheetName(sheetName) === "PlayerNHL") {
      return SKATER_DEFAULT_CATEGORIES.slice();
    }
    return getSkaterCategories(seasonId);
  }

  function getRelevantStats(posGroup, seasonId) {
    if (posGroup === PositionGroup.G) return GOALIE_CORE_CATEGORIES.slice();
    if (posGroup === PositionGroup.TEAM) {
      return getSkaterCategories(seasonId).concat(GOALIE_CORE_CATEGORIES);
    }
    return getSkaterCategories(seasonId);
  }

  function isPlayerAggregateSheet(sheetName) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    return (
      normalizedSheetName === "PlayerDayStatLine" ||
      normalizedSheetName === "PlayerWeekStatLine" ||
      normalizedSheetName === "PlayerSplitStatLine" ||
      normalizedSheetName === "PlayerTotalStatLine" ||
      normalizedSheetName === "PlayerCareerSplitStatLine" ||
      normalizedSheetName === "PlayerCareerTotalStatLine" ||
      normalizedSheetName === "PlayerNHL"
    );
  }

  function isFullSeasonPlayerSheet(sheetName) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    return (
      normalizedSheetName === "PlayerSplitStatLine" ||
      normalizedSheetName === "PlayerTotalStatLine" ||
      normalizedSheetName === "PlayerCareerSplitStatLine" ||
      normalizedSheetName === "PlayerCareerTotalStatLine" ||
      normalizedSheetName === "PlayerNHL"
    );
  }

  function isSeasonTypeScopedPlayerAggregateSheet(sheetName) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    return (
      normalizedSheetName === "PlayerSplitStatLine" ||
      normalizedSheetName === "PlayerTotalStatLine" ||
      normalizedSheetName === "PlayerCareerSplitStatLine" ||
      normalizedSheetName === "PlayerCareerTotalStatLine"
    );
  }

  function getAggregateCategoryScoreMode(sheetName) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    if (
      normalizedSheetName === "PlayerDayStatLine" ||
      normalizedSheetName === "PlayerWeekStatLine"
    ) {
      return "retainedRange";
    }
    return "distribution";
  }

  function getMatchupCategoriesForSeason(seasonId) {
    return getSkaterCategories(seasonId).concat(GOALIE_CORE_CATEGORIES);
  }

  function isRegularSeasonType(value) {
    var raw = String(value || "").trim().toUpperCase();
    return (
      raw === "RS" ||
      (typeof SeasonType !== "undefined" &&
        raw === String(SeasonType.REGULAR_SEASON).trim().toUpperCase())
    );
  }

  function isLowerBetterStat(category) {
    return !!LOWER_BETTER[category];
  }

  function getOutputField(sheetName, options) {
    if (options && options.outputField) return options.outputField;
    return normalizeSheetName(sheetName) === "PlayerNHL"
      ? "seasonRating"
      : "Rating";
  }

  function getSkaterProductionVolumeProxy(row) {
    return (
      0.3 * toNumber(row && row.G) +
      0.3 * toNumber(row && row.A) +
      0.15 * toNumber(row && row.PPP) +
      0.15 * toNumber(row && row.SOG) +
      0.05 * toNumber(row && row.HIT) +
      0.05 * toNumber(row && row.BLK)
    );
  }

  function hasActualUsageCount(row, posGroup) {
    if (posGroup === PositionGroup.G) {
      return toNumber(row && row.GS) > 0 || toNumber(row && row.GP) > 0;
    }
    return toNumber(row && row.GP) > 0 || toNumber(row && row.GS) > 0;
  }

  function hasMeaningfulPlayerVolume(row, posGroup, sheetName) {
    if (!row) return false;
    if (hasActualUsageCount(row, posGroup)) return true;
    if (posGroup === PositionGroup.G) {
      return (
        toNumber(row.W) > 0 ||
        toNumber(row.TOI) > 0 ||
        toNumber(row.SA) > 0 ||
        toNumber(row.SV) > 0 ||
        toNumber(row.GAA) > 0 ||
        toNumber(row.SVP) > 0
      );
    }
    if (normalizeSheetName(sheetName) === "PlayerNHL") {
      return (
        toNumber(row.G) > 0 ||
        toNumber(row.A) > 0 ||
        toNumber(row.P) > 0 ||
        toNumber(row.PPP) > 0 ||
        toNumber(row.SOG) > 0 ||
        toNumber(row.HIT) > 0 ||
        toNumber(row.BLK) > 0
      );
    }
    return false;
  }

  function percentileRank(value, sortedValues, lowerBetter) {
    if (!sortedValues || !sortedValues.length) return 0.5;
    var numeric = Number(value);
    if (!isFinite(numeric)) numeric = 0;
    if (sortedValues.length === 1) return 0.5;

    var less = 0;
    var equal = 0;
    for (var i = 0; i < sortedValues.length; i++) {
      if (sortedValues[i] < numeric) less++;
      else if (sortedValues[i] === numeric) equal++;
    }
    var rank = (less + Math.max(equal - 1, 0) / 2) / (sortedValues.length - 1);
    return lowerBetter ? 1 - rank : rank;
  }

  function sortedValues(rows, field) {
    return (rows || [])
      .map(function (row) {
        return toNumber(row && row[field]);
      })
      .filter(function (value) {
        return isFinite(value);
      })
      .sort(function (a, b) {
        return a - b;
      });
  }

  function sortedValuesByGetter(rows, getter) {
    return (rows || [])
      .map(function (row) {
        return Number(getter(row));
      })
      .filter(function (value) {
        return isFinite(value);
      })
      .sort(function (a, b) {
        return a - b;
      });
  }

  function maxSortedValue(values) {
    if (!values || !values.length) return 0;
    var value = Number(values[values.length - 1]);
    return isFinite(value) ? value : 0;
  }

  function minSortedValue(values) {
    if (!values || !values.length) return 0;
    var value = Number(values[0]);
    return isFinite(value) ? value : 0;
  }

  function computeZeroBaselineScore(value, maxValue, lowerBetter) {
    var numeric = Number(value);
    if (!isFinite(numeric)) numeric = 0;
    var ceiling = Number(maxValue);
    if (!isFinite(ceiling) || ceiling <= 0) {
      if (lowerBetter) return numeric <= 0 ? 1 : 0;
      return numeric > 0 ? 1 : 0;
    }
    if (lowerBetter) {
      return clip(1 - numeric / ceiling, 0, 1);
    }
    return clip(numeric / ceiling, 0, 1);
  }

  function getRetainedRangeShare(sheetName, posGroup) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    if (normalizedSheetName === "PlayerDayStatLine") {
      return PLAYER_DAY_RETAINED_SHARE[posGroup] || 0;
    }
    if (normalizedSheetName === "PlayerWeekStatLine") {
      return PLAYER_WEEK_RETAINED_SHARE[posGroup] || 0;
    }
    return 0;
  }

  function getDayWeekBaselineRows(rows, sheetName, posGroup) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    if (
      normalizedSheetName !== "PlayerDayStatLine" &&
      normalizedSheetName !== "PlayerWeekStatLine"
    ) {
      return rows || [];
    }

    var playedRows = (rows || []).filter(function (row) {
      if (!hasMeaningfulPlayerVolume(row, posGroup, sheetName)) return false;
      if (normalizedSheetName === "PlayerDayStatLine") {
        return getDailyPlayedFlag(row);
      }
      return getUsageValue(row, posGroup, sheetName) > 0;
    });

    return playedRows.length ? playedRows : rows || [];
  }

  function getRetainedRangeFloorValue(
    sortedValues,
    lowerBetter,
    retainedShare,
  ) {
    if (!sortedValues || !sortedValues.length) return 0;
    var share = clip(Number(retainedShare) || 0, 0, 1);
    if (share <= 0) {
      return lowerBetter
        ? minSortedValue(sortedValues)
        : maxSortedValue(sortedValues);
    }
    return percentileValue(sortedValues, lowerBetter ? share : 1 - share);
  }

  function computeRetainedRangeScore(
    value,
    baselineValue,
    bestValue,
    lowerBetter,
  ) {
    var numeric = Number(value);
    if (!isFinite(numeric)) numeric = 0;
    var baseline = Number(baselineValue);
    var best = Number(bestValue);
    if (!isFinite(baseline)) baseline = 0;
    if (!isFinite(best)) best = 0;

    if (lowerBetter) {
      var lowerSpan = baseline - best;
      if (lowerSpan <= 0.0001) {
        return numeric <= best ? 1 : 0;
      }
      var lowerScore = (baseline - numeric) / lowerSpan;
      if (lowerScore >= 0) return clip(lowerScore, 0, 1);
      return Math.max(
        RETAINED_RANGE_NEGATIVE_FLOOR,
        lowerScore * RETAINED_RANGE_NEGATIVE_CARRY,
      );
    }

    var upperSpan = best - baseline;
    if (upperSpan <= 0.0001) {
      return numeric >= best ? 1 : 0;
    }
    var upperScore = (numeric - baseline) / upperSpan;
    if (upperScore >= 0) return clip(upperScore, 0, 1);
    return Math.max(
      RETAINED_RANGE_NEGATIVE_FLOOR,
      upperScore * RETAINED_RANGE_NEGATIVE_CARRY,
    );
  }

  function computeAggregateCategoryScore(
    value,
    sortedValues,
    maxValue,
    lowerBetter,
    scoreMode,
    floorValue,
    bestValue,
  ) {
    if (scoreMode === "retainedRange") {
      return computeRetainedRangeScore(
        value,
        floorValue,
        bestValue,
        lowerBetter,
      );
    }
    if (scoreMode === "zeroToMax") {
      return computeZeroBaselineScore(value, maxValue, lowerBetter);
    }
    return percentileRank(value, sortedValues, lowerBetter);
  }

  function limitDistribution(values, limit, lowerBetter) {
    var numericLimit = Number(limit) || 0;
    var source = (values || []).slice();
    if (!numericLimit || source.length <= numericLimit) {
      return source.sort(function (a, b) {
        return a - b;
      });
    }

    return source
      .sort(function (a, b) {
        return lowerBetter ? a - b : b - a;
      })
      .slice(0, numericLimit)
      .sort(function (a, b) {
        return a - b;
      });
  }

  function getAggregateSeasonTypeKey(row) {
    var seasonType =
      row && row.seasonType !== undefined && row.seasonType !== null
        ? String(row.seasonType).trim().toUpperCase()
        : "";
    return seasonType === "PO" ? "PO" : "RS";
  }

  function getAggregateDistributionLimit(sheetName, posGroup, seasonType) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    var sheetLimits = PLAYER_AGGREGATE_DISTRIBUTION_LIMITS[normalizedSheetName];
    if (!sheetLimits) return 0;
    if (
      isSeasonTypeScopedPlayerAggregateSheet(normalizedSheetName) &&
      sheetLimits[seasonType || "RS"]
    ) {
      return sheetLimits[seasonType || "RS"][posGroup] || 0;
    }
    return sheetLimits[posGroup] || 0;
  }

  function average(values) {
    if (!values || !values.length) return 0;
    return (
      values.reduce(function (sum, value) {
        return sum + value;
      }, 0) / values.length
    );
  }

  function topAverage(values, count) {
    if (!values || !values.length) return 0;
    return average(
      values
        .slice()
        .sort(function (a, b) {
          return b - a;
        })
        .slice(0, count),
    );
  }

  function weightedAverage(valuesByCategory, weights) {
    var total = 0;
    var weightTotal = 0;
    Object.keys(weights).forEach(function (category) {
      var weight = weights[category];
      total += (valuesByCategory[category] || 0) * weight;
      weightTotal += weight;
    });
    return weightTotal > 0 ? total / weightTotal : 0;
  }

  function roundScore(score) {
    return Math.round(score * 100) / 100;
  }

  function compressScoreAbove(score, threshold, carry) {
    var numeric = Number(score);
    if (!isFinite(numeric)) return 0;
    if (numeric <= threshold) return numeric;
    return threshold + (numeric - threshold) * carry;
  }

  function getScoreScale(sheetName) {
    return 100;
  }

  function finalizeAggregateScore(score, sheetName) {
    var numeric = Number(score);
    if (!isFinite(numeric)) return 0;
    return roundScore(Math.max(numeric, 0));
  }

  function applyAggregateSheetCalibration(score, sheetName, posGroup) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    var adjusted = Number(score);
    if (!isFinite(adjusted)) return 0;

    if (normalizedSheetName === "PlayerDayStatLine") {
      adjusted *= PLAYER_DAY_POSITION_MULTIPLIER[posGroup] || 1;
    }

    if (normalizedSheetName === "PlayerWeekStatLine") {
      adjusted *= PLAYER_WEEK_POSITION_MULTIPLIER[posGroup] || 1;
    }

    if (normalizedSheetName === "PlayerNHL") {
      adjusted = compressScoreAbove(adjusted, 100, 0.78);
    }

    return adjusted;
  }

  function cloneObject(row) {
    var out = {};
    Object.keys(row || {}).forEach(function (key) {
      out[key] = row[key];
    });
    return out;
  }

  function getDailyPlayedFlag(row) {
    var gp =
      row && row.GP !== undefined && row.GP !== null
        ? String(row.GP).trim()
        : "";
    if (gp === "1") return true;
    return toNumber(row && row.GS) > 0;
  }

  function getUsageValue(row, posGroup, sheetName) {
    if (posGroup === PositionGroup.G) {
      var starts = toNumber(row && row.GS);
      if (starts > 0) return starts;
      return toNumber(row && row.GP);
    }
    var gp = toNumber(row && row.GP);
    if (gp > 0) return gp;
    var gs = toNumber(row && row.GS);
    if (gs > 0) return gs;
    if (normalizeSheetName(sheetName) === "PlayerNHL") {
      return getSkaterProductionVolumeProxy(row);
    }
    return 0;
  }

  function getGoalieToiValue(row) {
    return toNumber(row && row.TOI);
  }

  function getUsageRateValue(row, field, posGroup, sheetName) {
    var usage = getUsageValue(row, posGroup, sheetName);
    if (usage <= 0) return 0;
    return toNumber(row && row[field]) / usage;
  }

  function isWeeklyAggregateSheet(sheetName) {
    return normalizeSheetName(sheetName) === "PlayerWeekStatLine";
  }

  function shouldClampNonNegativeCategoryScore(sheetName) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    return (
      normalizedSheetName === "PlayerDayStatLine" ||
      normalizedSheetName === "PlayerWeekStatLine"
    );
  }

  function clampCategoryScore(score, sheetName) {
    var numericScore = Number(score);
    if (!isFinite(numericScore)) return 0;
    return shouldClampNonNegativeCategoryScore(sheetName)
      ? Math.max(numericScore, 0)
      : numericScore;
  }

  function getWeekNormalizationConfig(posGroup) {
    return posGroup === PositionGroup.G
      ? WEEK_NORMALIZATION_CONFIG.goalie
      : WEEK_NORMALIZATION_CONFIG.skater;
  }

  // Normalize weekly counting stats toward a comparable "full week" workload.
  function getComparableWeekUsageValue(usage, posGroup, sheetName) {
    var numericUsage = Number(usage);
    if (!isFinite(numericUsage) || numericUsage <= 0) return 0;
    if (!isWeeklyAggregateSheet(sheetName)) return numericUsage;

    if (posGroup !== PositionGroup.G) {
      if (numericUsage >= 3) return 3.5;
      if (numericUsage >= 2) {
        return 2.75 + (numericUsage - 2) * 0.75;
      }
      if (numericUsage >= 1) {
        return 2 + (numericUsage - 1) * 0.75;
      }
      return numericUsage;
    }

    var config = getWeekNormalizationConfig(posGroup);
    var targetUsage = Number(config && config.targetUsage) || numericUsage;
    var fullUsage = Number(config && config.fullUsage) || targetUsage;

    if (numericUsage >= targetUsage) return targetUsage;

    var completion = clip(numericUsage / Math.max(fullUsage, 0.0001), 0, 1);
    return numericUsage + (targetUsage - numericUsage) * completion;
  }

  function getComparableUsageValue(row, posGroup, sheetName) {
    return getComparableWeekUsageValue(
      getUsageValue(row, posGroup, sheetName),
      posGroup,
      sheetName,
    );
  }

  function scaleWeeklyCountingValue(value, row, posGroup, sheetName) {
    var numericValue = Number(value);
    if (!isFinite(numericValue) || numericValue <= 0)
      return Math.max(numericValue, 0);

    var usage = getUsageValue(row, posGroup, sheetName);
    if (usage <= 0) return numericValue;

    var comparableUsage = getComparableUsageValue(row, posGroup, sheetName);
    if (comparableUsage <= 0) return numericValue;

    return numericValue * (comparableUsage / usage);
  }

  function getComparableCategoryValue(row, category, posGroup, sheetName) {
    var value = toNumber(row && row[category]);
    if (!isWeeklyAggregateSheet(sheetName)) return value;
    if (category === "GAA" || category === "SVP") return value;
    return scaleWeeklyCountingValue(value, row, posGroup, sheetName);
  }

  function getSkaterEventLoadValue(row) {
    return (
      0.4 * toNumber(row && row.SOG) +
      0.35 * toNumber(row && row.HIT) +
      0.25 * toNumber(row && row.BLK)
    );
  }

  function getComparableSkaterEventLoadValue(row, sheetName) {
    var eventLoad = getSkaterEventLoadValue(row);
    if (!isWeeklyAggregateSheet(sheetName)) return eventLoad;
    return scaleWeeklyCountingValue(eventLoad, row, PositionGroup.F, sheetName);
  }

  function shareAbove(values, threshold) {
    if (!values || !values.length) return 0;
    return (
      values.filter(function (value) {
        return value >= threshold;
      }).length / values.length
    );
  }

  function computeBreadthScore(values, targetDepth) {
    if (!values || !values.length) return 0;
    var depth = Math.max(
      1,
      Math.min(Number(targetDepth) || values.length, values.length),
    );
    var above60 = Math.min(
      values.filter(function (value) {
        return value >= 0.6;
      }).length,
      depth,
    );
    var above75 = Math.min(
      values.filter(function (value) {
        return value >= 0.75;
      }).length,
      depth,
    );
    var above90 = Math.min(
      values.filter(function (value) {
        return value >= 0.9;
      }).length,
      depth,
    );
    return (
      0.5 * (above60 / depth) +
      0.3 * (above75 / depth) +
      0.2 * (above90 / depth)
    );
  }

  function computeSupportScore(values, count) {
    if (!values || !values.length) return 0;
    var sorted = values.slice().sort(function (a, b) {
      return b - a;
    });
    return average(sorted.slice(1, 1 + count));
  }

  function computeWeightedScoreAverage(entries) {
    var total = 0;
    var totalWeight = 0;
    (entries || []).forEach(function (entry) {
      var weight = Number(entry && entry.weight) || 0;
      var score = Number(entry && entry.score) || 0;
      if (weight <= 0) return;
      total += score * weight;
      totalWeight += weight;
    });
    return totalWeight > 0 ? total / totalWeight : 0;
  }

  function computeWeightedTopAverage(entries, skipCount, takeCount) {
    if (!entries || !entries.length) return 0;
    var sorted = entries.slice().sort(function (a, b) {
      return (
        (Number(b && b.score) || 0) * (Number(b && b.weight) || 0) -
        (Number(a && a.score) || 0) * (Number(a && a.weight) || 0)
      );
    });
    return computeWeightedScoreAverage(
      sorted.slice(
        skipCount || 0,
        (skipCount || 0) + (takeCount || sorted.length),
      ),
    );
  }

  function buildCategoryEntryMap(entries) {
    var map = {};
    (entries || []).forEach(function (entry) {
      if (!entry || !entry.category) return;
      map[entry.category] = entry;
    });
    return map;
  }

  function getEntryScore(entryMap, category) {
    return entryMap[category] ? Number(entryMap[category].score) || 0 : 0;
  }

  function getEntryValue(entryMap, category) {
    return entryMap[category] ? Number(entryMap[category].value) || 0 : 0;
  }

  function getEntrySeasonValueScore(entryMap, category) {
    return entryMap[category]
      ? Number(entryMap[category].seasonValueScore) || 0
      : 0;
  }

  function percentileValue(sortedValues, percentile) {
    if (!sortedValues || !sortedValues.length) return 0;
    if (sortedValues.length === 1) return Number(sortedValues[0]) || 0;
    var clamped = clip(Number(percentile) || 0, 0, 1);
    var index = clamped * (sortedValues.length - 1);
    var lowerIndex = Math.floor(index);
    var upperIndex = Math.ceil(index);
    var lowerValue = Number(sortedValues[lowerIndex]) || 0;
    var upperValue = Number(sortedValues[upperIndex]) || 0;
    if (lowerIndex === upperIndex) return lowerValue;
    var ratio = index - lowerIndex;
    return lowerValue + (upperValue - lowerValue) * ratio;
  }

  function computePlayerNhlSeasonValueScore(
    value,
    sortedValues,
    category,
    posGroup,
  ) {
    var numeric = Number(value);
    if (!isFinite(numeric)) numeric = 0;
    if (!sortedValues || !sortedValues.length) return 0.5;

    var lowerBetter = isLowerBetterStat(category);
    var p20 = percentileValue(sortedValues, 0.2);
    var p45 = percentileValue(sortedValues, 0.45);
    var p7 = percentileValue(sortedValues, 0.7);
    var p88 = percentileValue(sortedValues, 0.88);
    var p97 = percentileValue(sortedValues, 0.97);

    if (posGroup === PositionGroup.F && category === "P") {
      p20 = percentileValue(sortedValues, 0.18);
      p45 = percentileValue(sortedValues, 0.42);
      p7 = percentileValue(sortedValues, 0.68);
      p88 = percentileValue(sortedValues, 0.9);
      p97 = percentileValue(sortedValues, 0.985);
    } else if (posGroup === PositionGroup.D && category === "P") {
      p20 = percentileValue(sortedValues, 0.2);
      p45 = percentileValue(sortedValues, 0.46);
      p7 = percentileValue(sortedValues, 0.72);
      p88 = percentileValue(sortedValues, 0.9);
      p97 = percentileValue(sortedValues, 0.98);
    } else if (
      posGroup === PositionGroup.D &&
      (category === "HIT" || category === "BLK")
    ) {
      p20 = percentileValue(sortedValues, 0.2);
      p45 = percentileValue(sortedValues, 0.5);
      p7 = percentileValue(sortedValues, 0.76);
      p88 = percentileValue(sortedValues, 0.92);
      p97 = percentileValue(sortedValues, 0.985);
    }

    var baseScore = interpolatePiecewise(
      numeric,
      [
        { value: p20, score: 0.3 },
        { value: p45, score: 0.5 },
        { value: p7, score: 0.72 },
        { value: p88, score: 0.95 },
        { value: p97, score: 1.12 },
      ],
      lowerBetter,
    );

    if (lowerBetter || numeric <= p97) return baseScore;

    var maxValue = Number(sortedValues[sortedValues.length - 1]) || p97;
    var tailSpan = Math.max(maxValue - p97, 0.0001);
    var tailRatio = clip((numeric - p97) / tailSpan, 0, 1.35);
    var tailMax = 1.18;

    if (posGroup === PositionGroup.F && category === "P") {
      tailMax = 1.34;
    } else if (posGroup === PositionGroup.D && category === "P") {
      tailMax = 1.24;
    } else if (
      posGroup === PositionGroup.D &&
      (category === "HIT" || category === "BLK")
    ) {
      tailMax = 1.22;
    }

    return Math.max(
      baseScore,
      1.12 + (tailMax - 1.12) * Math.pow(tailRatio, 0.72),
    );
  }

  function computePlayerNhlCoreScore(categoryEntries) {
    var topFiveAverage = computeWeightedScoreAverage(
      getNhlBreadthEntries(categoryEntries),
    );
    var topThreeAverage = computeWeightedTopAverage(categoryEntries, 0, 3);
    return 0.72 * topFiveAverage + 0.28 * topThreeAverage;
  }

  function applySkaterTalentCategoryEmphasis(
    sheetName,
    posGroup,
    category,
    score,
  ) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    var adjusted = Number(score);
    if (!isFinite(adjusted)) return 0;
    var maxScore = 1;

    if (
      isFullSeasonPlayerSheet(normalizedSheetName) &&
      (posGroup === PositionGroup.F || posGroup === PositionGroup.D)
    ) {
      maxScore = 1.08;
      if (category === "P") {
        maxScore = normalizedSheetName === "PlayerNHL" ? 1.14 : 1.1;
        if (adjusted > 0.72) adjusted += (adjusted - 0.72) * 0.22;
        if (adjusted > 0.88) {
          adjusted +=
            (adjusted - 0.88) *
            (normalizedSheetName === "PlayerNHL" ? 0.28 : 0.18);
        }
      }
    }

    return clip(adjusted, 0, maxScore);
  }

  function getSkaterCategoryWeights(sheetName, posGroup, categories) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    var weights = {};
    (categories || []).forEach(function (category) {
      weights[category] = 1;
    });

    if (posGroup === PositionGroup.F || posGroup === PositionGroup.D) {
      if (normalizedSheetName === "PlayerNHL") {
        weights.P = 1.18;
      } else if (
        normalizedSheetName === "PlayerSplitStatLine" ||
        normalizedSheetName === "PlayerTotalStatLine" ||
        normalizedSheetName === "PlayerCareerSplitStatLine" ||
        normalizedSheetName === "PlayerCareerTotalStatLine"
      ) {
        weights.P = 1.14;
      } else if (
        normalizedSheetName === "PlayerDayStatLine" ||
        normalizedSheetName === "PlayerWeekStatLine"
      ) {
        weights.P = 1.08;
      }
    }

    return weights;
  }

  function getNhlBreadthEntries(categoryEntries) {
    return (categoryEntries || [])
      .slice()
      .sort(function (a, b) {
        return (
          (Number(b && b.score) || 0) * (Number(b && b.weight) || 0) -
          (Number(a && a.score) || 0) * (Number(a && a.weight) || 0)
        );
      })
      .slice(0, Math.min(5, (categoryEntries || []).length));
  }

  function getSkaterProfile(sheetName) {
    return (
      SKATER_LEVEL_PROFILES[normalizeSheetName(sheetName)] ||
      SKATER_LEVEL_PROFILES.PlayerTotalStatLine
    );
  }

  function getGoalieProfile(sheetName) {
    return (
      GOALIE_LEVEL_PROFILES[normalizeSheetName(sheetName)] ||
      GOALIE_LEVEL_PROFILES.PlayerTotalStatLine
    );
  }

  ns.EngineDeps = {
    PositionGroup: PositionGroup,
    GOALIE_CORE_CATEGORIES: GOALIE_CORE_CATEGORIES,
    TEAM_DAY_NO_GOALIE_CATEGORY_SCORE: TEAM_DAY_NO_GOALIE_CATEGORY_SCORE,
    TEAM_WEEK_NO_GOALIE_CATEGORY_SCORE: TEAM_WEEK_NO_GOALIE_CATEGORY_SCORE,
    TEAM_DAY_FINAL_SCORE_MULTIPLIER: TEAM_DAY_FINAL_SCORE_MULTIPLIER,
    TEAM_WEEK_FINAL_SCORE_MULTIPLIER: TEAM_WEEK_FINAL_SCORE_MULTIPLIER,
    TEAM_WEEK_AVERAGE_GP_BASELINE: TEAM_WEEK_AVERAGE_GP_BASELINE,
    TEAM_WEEK_LONG_WEEK_GP_BASELINE: TEAM_WEEK_LONG_WEEK_GP_BASELINE,
    GOALIE_MINIMUM_TOI_FOR_RATING: GOALIE_MINIMUM_TOI_FOR_RATING,
    GOALIE_NEGLIGIBLE_TOI_THRESHOLD: GOALIE_NEGLIGIBLE_TOI_THRESHOLD,
    GOALIE_NEGLIGIBLE_TOI_MAX_SCORE: GOALIE_NEGLIGIBLE_TOI_MAX_SCORE,
    clip: clip,
    toNumber: toNumber,
    normalizeSheetName: normalizeSheetName,
    normalizePosGroup: normalizePosGroup,
    getRatingSkaterCategories: getRatingSkaterCategories,
    getSkaterCategories: getSkaterCategories,
    getMatchupCategoriesForSeason: getMatchupCategoriesForSeason,
    isRegularSeasonType: isRegularSeasonType,
    isLowerBetterStat: isLowerBetterStat,
    hasMeaningfulPlayerVolume: hasMeaningfulPlayerVolume,
    sortedValues: sortedValues,
    sortedValuesByGetter: sortedValuesByGetter,
    maxSortedValue: maxSortedValue,
    minSortedValue: minSortedValue,
    getRetainedRangeFloorValue: getRetainedRangeFloorValue,
    getAggregateDistributionLimit: getAggregateDistributionLimit,
    getAggregateSeasonTypeKey: getAggregateSeasonTypeKey,
    getAggregateCategoryScoreMode: getAggregateCategoryScoreMode,
    getRetainedRangeShare: getRetainedRangeShare,
    getDayWeekBaselineRows: getDayWeekBaselineRows,
    limitDistribution: limitDistribution,
    getComparableCategoryValue: getComparableCategoryValue,
    getUsageRateValue: getUsageRateValue,
    getComparableUsageValue: getComparableUsageValue,
    getUsageValue: getUsageValue,
    getComparableSkaterEventLoadValue: getComparableSkaterEventLoadValue,
    getSkaterEventLoadValue: getSkaterEventLoadValue,
    computeAggregateCategoryScore: computeAggregateCategoryScore,
    clampCategoryScore: clampCategoryScore,
    weightedAverage: weightedAverage,
    computeSupportScore: computeSupportScore,
    computeBreadthScore: computeBreadthScore,
    computeWeightedScoreAverage: computeWeightedScoreAverage,
    computeWeightedTopAverage: computeWeightedTopAverage,
    getNhlBreadthEntries: getNhlBreadthEntries,
    computePlayerNhlCoreScore: computePlayerNhlCoreScore,
    getSkaterProfile: getSkaterProfile,
    getGoalieProfile: getGoalieProfile,
    getSkaterCategoryWeights: getSkaterCategoryWeights,
    applySkaterTalentCategoryEmphasis: applySkaterTalentCategoryEmphasis,
    computePlayerNhlSeasonValueScore: computePlayerNhlSeasonValueScore,
    average: average,
    roundScore: roundScore,
    percentileRank: percentileRank,
    getScoreScale: getScoreScale,
    applyAggregateSheetCalibration: applyAggregateSheetCalibration,
    finalizeAggregateScore: finalizeAggregateScore,
    getGoalieToiValue: getGoalieToiValue,
  };

  function buildPrimaryGroupKey(row, sheetName, posGroup) {
    var seasonId =
      row && row.seasonId !== undefined && row.seasonId !== null
        ? String(row.seasonId)
        : "";
    var seasonType = getAggregateSeasonTypeKey(row);
    if (isPlayerAggregateSheet(sheetName)) {
      if (isSeasonTypeScopedPlayerAggregateSheet(sheetName)) {
        return [seasonId, sheetName, seasonType, posGroup].join("|");
      }
      return [seasonId, sheetName, posGroup].join("|");
    }
    return [seasonId, posGroup].join("|");
  }

  function buildFallbackGroupKey(row, sheetName, posGroup) {
    var seasonId =
      row && row.seasonId !== undefined && row.seasonId !== null
        ? String(row.seasonId)
        : "";
    var seasonType = getAggregateSeasonTypeKey(row);
    if (isPlayerAggregateSheet(sheetName)) {
      if (isSeasonTypeScopedPlayerAggregateSheet(sheetName)) {
        return [seasonId, sheetName, seasonType, posGroup].join("|");
      }
      return [seasonId, sheetName, posGroup].join("|");
    }
    return buildPrimaryGroupKey(row, sheetName, posGroup);
  }

  function groupRowsByKey(rows, keyBuilder) {
    var groups = {};
    (rows || []).forEach(function (row) {
      if (!row) return;
      var key = keyBuilder(row);
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });
    return groups;
  }

  function buildAggregateGroupContext(rows, sheetName) {
    return {
      primaryGroups: groupRowsByKey(rows, function (row) {
        return buildPrimaryGroupKey(
          row,
          sheetName,
          normalizePosGroup(row && row.posGroup, row),
        );
      }),
      fallbackGroups: groupRowsByKey(rows, function (row) {
        return buildFallbackGroupKey(
          row,
          sheetName,
          normalizePosGroup(row && row.posGroup, row),
        );
      }),
    };
  }

  function getPoolRowsForGroup(groupRows, sheetName, context, posGroup) {
    var threshold =
      posGroup === PositionGroup.G
        ? SMALL_COHORT_THRESHOLDS.goalie
        : SMALL_COHORT_THRESHOLDS.skater;
    var validPrimaryRows = (groupRows || []).filter(function (row) {
      return hasMeaningfulPlayerVolume(row, posGroup, sheetName);
    });
    if (validPrimaryRows.length >= threshold) return validPrimaryRows;

    var fallbackKey = buildFallbackGroupKey(groupRows[0], sheetName, posGroup);
    var fallbackRows = (context.fallbackGroups[fallbackKey] || []).filter(
      function (row) {
        return hasMeaningfulPlayerVolume(row, posGroup, sheetName);
      },
    );
    return fallbackRows.length ? fallbackRows : validPrimaryRows;
  }

  function rankSkaterGroup(rows, poolRows, sheetName, outputField, options) {
    return ns.PlayerPure.rankSkaterGroup(
      rows,
      poolRows,
      sheetName,
      outputField,
      options,
    );
  }

  function rankGoalieGroup(rows, poolRows, sheetName, outputField) {
    return ns.PlayerPure.rankGoalieGroup(
      rows,
      poolRows,
      sheetName,
      outputField,
    );
  }

  function rankTeamRows(rows, outputField) {
    return ns.TeamPure.rankTeamRows(rows, outputField);
  }

  function rankTeamWeekRows(rows, outputField) {
    return ns.TeamPure.rankTeamWeekRows(rows, outputField);
  }

  function rankTeamDayRows(rows, outputField) {
    return ns.TeamPure.rankTeamDayRows(rows, outputField);
  }

  function getTeamDayRowKey(row) {
    return [
      row && row.gshlTeamId !== undefined ? String(row.gshlTeamId) : "",
      row && row.date !== undefined ? String(row.date) : "",
      row && row.weekId !== undefined ? String(row.weekId) : "",
      row && row.seasonId !== undefined ? String(row.seasonId) : "",
    ].join("|");
  }

  function getTeamWeekRowKey(row) {
    return [
      row && row.gshlTeamId !== undefined ? String(row.gshlTeamId) : "",
      row && row.weekId !== undefined ? String(row.weekId) : "",
      row && row.seasonId !== undefined ? String(row.seasonId) : "",
    ].join("|");
  }

  function getTeamSeasonRowKey(row) {
    return [
      row && row.gshlTeamId !== undefined ? String(row.gshlTeamId) : "",
      row && row.seasonType !== undefined ? String(row.seasonType) : "",
      row && row.seasonId !== undefined ? String(row.seasonId) : "",
    ].join("|");
  }

  function fetchSeasonTeamDayRows(seasonId) {
    var seasonKey = String(seasonId || "");
    if (Object.prototype.hasOwnProperty.call(teamDaySeasonRowsCache, seasonKey)) {
      return teamDaySeasonRowsCache[seasonKey].map(cloneObject);
    }

    try {
      var fetchSheetAsObjects =
        typeof GshlUtils !== "undefined" &&
        GshlUtils.sheets &&
        GshlUtils.sheets.read &&
        GshlUtils.sheets.read.fetchSheetAsObjects
          ? GshlUtils.sheets.read.fetchSheetAsObjects
          : null;
      if (!fetchSheetAsObjects || typeof TEAMSTATS_SPREADSHEET_ID === "undefined") {
        teamDaySeasonRowsCache[seasonKey] = [];
        return [];
      }

      teamDaySeasonRowsCache[seasonKey] = (fetchSheetAsObjects(
        TEAMSTATS_SPREADSHEET_ID,
        "TeamDayStatLine",
        {
          coerceTypes: true,
        },
      ) || []).filter(function (row) {
        return String(row && row.seasonId) === seasonKey;
      });
      return teamDaySeasonRowsCache[seasonKey].map(cloneObject);
    } catch (_error) {
      teamDaySeasonRowsCache[seasonKey] = [];
      return [];
    }
  }

  function fetchSeasonTeamWeekRows(seasonId) {
    var seasonKey = String(seasonId || "");
    if (
      Object.prototype.hasOwnProperty.call(teamWeekSeasonRowsCache, seasonKey)
    ) {
      return teamWeekSeasonRowsCache[seasonKey].map(cloneObject);
    }

    try {
      var fetchSheetAsObjects =
        typeof GshlUtils !== "undefined" &&
        GshlUtils.sheets &&
        GshlUtils.sheets.read &&
        GshlUtils.sheets.read.fetchSheetAsObjects
          ? GshlUtils.sheets.read.fetchSheetAsObjects
          : null;
      if (
        !fetchSheetAsObjects ||
        typeof TEAMSTATS_SPREADSHEET_ID === "undefined"
      ) {
        teamWeekSeasonRowsCache[seasonKey] = [];
        return [];
      }

      teamWeekSeasonRowsCache[seasonKey] = (
        fetchSheetAsObjects(TEAMSTATS_SPREADSHEET_ID, "TeamWeekStatLine", {
          coerceTypes: true,
        }) || []
      ).filter(function (row) {
        return String(row && row.seasonId) === seasonKey;
      });
      return teamWeekSeasonRowsCache[seasonKey].map(cloneObject);
    } catch (_error) {
      teamWeekSeasonRowsCache[seasonKey] = [];
      return [];
    }
  }

  function fetchSeasonTeamSeasonRows(seasonId) {
    var seasonKey = String(seasonId || "");
    if (Object.prototype.hasOwnProperty.call(teamSeasonRowsCache, seasonKey)) {
      return teamSeasonRowsCache[seasonKey].map(cloneObject);
    }

    try {
      var fetchSheetAsObjects =
        typeof GshlUtils !== "undefined" &&
        GshlUtils.sheets &&
        GshlUtils.sheets.read &&
        GshlUtils.sheets.read.fetchSheetAsObjects
          ? GshlUtils.sheets.read.fetchSheetAsObjects
          : null;
      if (
        !fetchSheetAsObjects ||
        typeof TEAMSTATS_SPREADSHEET_ID === "undefined"
      ) {
        teamSeasonRowsCache[seasonKey] = [];
        return [];
      }

      teamSeasonRowsCache[seasonKey] = (
        fetchSheetAsObjects(TEAMSTATS_SPREADSHEET_ID, "TeamSeasonStatLine", {
          coerceTypes: true,
        }) || []
      ).filter(function (row) {
        return String(row && row.seasonId) === seasonKey;
      });
      return teamSeasonRowsCache[seasonKey].map(cloneObject);
    } catch (_error) {
      teamSeasonRowsCache[seasonKey] = [];
      return [];
    }
  }

  function fetchSeasonPlayerSplitRows(seasonId) {
    var seasonKey = String(seasonId || "");
    if (
      Object.prototype.hasOwnProperty.call(playerSplitSeasonRowsCache, seasonKey)
    ) {
      return playerSplitSeasonRowsCache[seasonKey].map(cloneObject);
    }

    try {
      var fetchSheetAsObjects =
        typeof GshlUtils !== "undefined" &&
        GshlUtils.sheets &&
        GshlUtils.sheets.read &&
        GshlUtils.sheets.read.fetchSheetAsObjects
          ? GshlUtils.sheets.read.fetchSheetAsObjects
          : null;
      if (
        !fetchSheetAsObjects ||
        typeof PLAYERSTATS_SPREADSHEET_ID === "undefined"
      ) {
        playerSplitSeasonRowsCache[seasonKey] = [];
        return [];
      }

      playerSplitSeasonRowsCache[seasonKey] = (
        fetchSheetAsObjects(PLAYERSTATS_SPREADSHEET_ID, "PlayerSplitStatLine", {
          coerceTypes: true,
        }) || []
      ).filter(function (row) {
        return String(row && row.seasonId) === seasonKey;
      });
      return playerSplitSeasonRowsCache[seasonKey].map(cloneObject);
    } catch (_error) {
      playerSplitSeasonRowsCache[seasonKey] = [];
      return [];
    }
  }

  function fetchSeasonPlayerTotalRows(seasonId) {
    var seasonKey = String(seasonId || "");
    if (
      Object.prototype.hasOwnProperty.call(playerTotalSeasonRowsCache, seasonKey)
    ) {
      return playerTotalSeasonRowsCache[seasonKey].map(cloneObject);
    }

    try {
      var fetchSheetAsObjects =
        typeof GshlUtils !== "undefined" &&
        GshlUtils.sheets &&
        GshlUtils.sheets.read &&
        GshlUtils.sheets.read.fetchSheetAsObjects
          ? GshlUtils.sheets.read.fetchSheetAsObjects
          : null;
      if (
        !fetchSheetAsObjects ||
        typeof PLAYERSTATS_SPREADSHEET_ID === "undefined"
      ) {
        playerTotalSeasonRowsCache[seasonKey] = [];
        return [];
      }

      playerTotalSeasonRowsCache[seasonKey] = (
        fetchSheetAsObjects(PLAYERSTATS_SPREADSHEET_ID, "PlayerTotalStatLine", {
          coerceTypes: true,
        }) || []
      ).filter(function (row) {
        return String(row && row.seasonId) === seasonKey;
      });
      return playerTotalSeasonRowsCache[seasonKey].map(cloneObject);
    } catch (_error) {
      playerTotalSeasonRowsCache[seasonKey] = [];
      return [];
    }
  }

  function fetchSeasonPlayerNhlRows(seasonId) {
    var seasonKey = String(seasonId || "");
    if (
      Object.prototype.hasOwnProperty.call(playerNhlSeasonRowsCache, seasonKey)
    ) {
      return playerNhlSeasonRowsCache[seasonKey].map(cloneObject);
    }

    try {
      var fetchSheetAsObjects =
        typeof GshlUtils !== "undefined" &&
        GshlUtils.sheets &&
        GshlUtils.sheets.read &&
        GshlUtils.sheets.read.fetchSheetAsObjects
          ? GshlUtils.sheets.read.fetchSheetAsObjects
          : null;
      if (
        !fetchSheetAsObjects ||
        typeof PLAYERSTATS_SPREADSHEET_ID === "undefined"
      ) {
        playerNhlSeasonRowsCache[seasonKey] = [];
        return [];
      }

      var sheetNames = [
        "PlayerNHLStatLine",
        "PlayerNHL",
        "PlayerNhlStatLine",
        "PlayerNhl",
      ];
      var rows = [];
      for (var i = 0; i < sheetNames.length; i++) {
        try {
          rows = fetchSheetAsObjects(
            PLAYERSTATS_SPREADSHEET_ID,
            sheetNames[i],
            {
              coerceTypes: true,
            },
          ) || [];
          if (rows.length) break;
        } catch (_sheetError) {
          rows = [];
        }
      }

      playerNhlSeasonRowsCache[seasonKey] = rows.filter(function (row) {
        return String(row && row.seasonId) === seasonKey;
      });
      return playerNhlSeasonRowsCache[seasonKey].map(cloneObject);
    } catch (_error) {
      playerNhlSeasonRowsCache[seasonKey] = [];
      return [];
    }
  }

  function fetchSeasonDraftPickRows(seasonId) {
    var seasonKey = String(seasonId || "");
    if (
      Object.prototype.hasOwnProperty.call(draftPickSeasonRowsCache, seasonKey)
    ) {
      return draftPickSeasonRowsCache[seasonKey].map(cloneObject);
    }

    try {
      var fetchSheetAsObjects =
        typeof GshlUtils !== "undefined" &&
        GshlUtils.sheets &&
        GshlUtils.sheets.read &&
        GshlUtils.sheets.read.fetchSheetAsObjects
          ? GshlUtils.sheets.read.fetchSheetAsObjects
          : null;
      if (!fetchSheetAsObjects || typeof SPREADSHEET_ID === "undefined") {
        draftPickSeasonRowsCache[seasonKey] = [];
        return [];
      }

      draftPickSeasonRowsCache[seasonKey] = (
        fetchSheetAsObjects(SPREADSHEET_ID, "DraftPick", {
          coerceTypes: true,
        }) || []
      ).filter(function (row) {
        return String(row && row.seasonId) === seasonKey;
      });
      return draftPickSeasonRowsCache[seasonKey].map(cloneObject);
    } catch (_error) {
      draftPickSeasonRowsCache[seasonKey] = [];
      return [];
    }
  }

  function fetchAllSeasonRows() {
    if (seasonRowsCache) return seasonRowsCache.map(cloneObject);

    try {
      var fetchSheetAsObjects =
        typeof GshlUtils !== "undefined" &&
        GshlUtils.sheets &&
        GshlUtils.sheets.read &&
        GshlUtils.sheets.read.fetchSheetAsObjects
          ? GshlUtils.sheets.read.fetchSheetAsObjects
          : null;
      if (!fetchSheetAsObjects || typeof SPREADSHEET_ID === "undefined") {
        seasonRowsCache = [];
        return [];
      }

      seasonRowsCache =
        fetchSheetAsObjects(SPREADSHEET_ID, "Season", {
          coerceTypes: true,
        }) || [];
      return seasonRowsCache.map(cloneObject);
    } catch (_error) {
      seasonRowsCache = [];
      return [];
    }
  }

  function compareSeasonIdAsc(a, b) {
    var an = Number(a);
    var bn = Number(b);
    if (isFinite(an) && isFinite(bn)) return an - bn;
    return String(a || "").localeCompare(String(b || ""));
  }

  function resolvePreviousSeasonId(seasonId) {
    var seasonKey = String(seasonId || "");
    if (!seasonKey) return "";

    var seasons = fetchAllSeasonRows()
      .map(function (row) {
        return row && row.id !== undefined && row.id !== null
          ? String(row.id)
          : "";
      })
      .filter(function (id) {
        return !!id;
      })
      .sort(compareSeasonIdAsc);

    for (var i = 0; i < seasons.length; i++) {
      if (seasons[i] === seasonKey && i > 0) return seasons[i - 1];
    }

    var numericSeason = Number(seasonKey);
    if (isFinite(numericSeason) && numericSeason > 1) {
      return String(numericSeason - 1);
    }
    return "";
  }

  function rankSeasonScopedTeamWeekRows(targetRows, outputField) {
    if (!targetRows || !targetRows.length) return;

    var seasonKey =
      targetRows[0] && targetRows[0].seasonId !== undefined
        ? String(targetRows[0].seasonId)
        : "";
    var poolRows = seasonKey ? fetchSeasonTeamWeekRows(seasonKey) : [];
    var workingRows = poolRows.length ? poolRows : targetRows.slice();
    var workingRowByKey = {};

    workingRows.forEach(function (row) {
      workingRowByKey[getTeamWeekRowKey(row)] = row;
    });

    targetRows.forEach(function (row) {
      var key = getTeamWeekRowKey(row);
      workingRowByKey[key] = row;
    });

    workingRows = Object.keys(workingRowByKey).map(function (key) {
      return workingRowByKey[key];
    });

    rankTeamWeekRows(workingRows, outputField);

    var rankedByKey = {};
    workingRows.forEach(function (row) {
      rankedByKey[getTeamWeekRowKey(row)] = row;
    });

    targetRows.forEach(function (row) {
      var rankedRow = rankedByKey[getTeamWeekRowKey(row)];
      row[outputField] =
        rankedRow && rankedRow[outputField] !== undefined
          ? rankedRow[outputField]
          : 0;
    });
  }

  function rankTeamSeasonRows(rows, outputField) {
    return ns.TeamPure.rankTeamSeasonRows(rows, outputField);
  }

  function computeGoalieAggregateGaa(row) {
    return ns.TeamPure.computeGoalieAggregateGaa(row);
  }

  function computeGoalieAggregateSvp(row) {
    return ns.TeamPure.computeGoalieAggregateSvp(row);
  }

  function buildTeamSeasonAwardAggregateRows(
    teamSeasonRows,
    playerSplitRows,
    posGroup,
    categories,
  ) {
    return ns.TeamPure.buildTeamSeasonAwardAggregateRows(
      teamSeasonRows,
      playerSplitRows,
      posGroup,
      categories,
    );
  }

  function computeTeamSeasonAwardRatings(rows, categories, ratingField, rankField) {
    return ns.TeamPure.computeTeamSeasonAwardRatings(
      rows,
      categories,
      ratingField,
      rankField,
    );
  }

  function getTeamKey(row) {
    return row && row.gshlTeamId !== undefined && row.gshlTeamId !== null
      ? String(row.gshlTeamId)
      : "";
  }

  function getPlayerKey(row) {
    return row && row.playerId !== undefined && row.playerId !== null
      ? String(row.playerId)
      : "";
  }

  function getFirstFiniteNumber(row, fields) {
    for (var i = 0; i < (fields || []).length; i++) {
      var rawValue = row && row[fields[i]];
      if (
        rawValue === undefined ||
        rawValue === null ||
        String(rawValue).trim() === ""
      ) {
        continue;
      }
      var value = Number(rawValue);
      if (isFinite(value)) return value;
    }
    return null;
  }

  function numericValues(values) {
    return (values || [])
      .map(function (value) {
        return Number(value);
      })
      .filter(function (value) {
        return isFinite(value);
      })
      .sort(function (a, b) {
        return a - b;
      });
  }

  function medianValue(values) {
    var sorted = numericValues(values);
    if (!sorted.length) return 50;
    return percentileValue(sorted, 0.5);
  }

  function percentileScore(value, values, lowerBetter) {
    var sorted = numericValues(values);
    if (!sorted.length) return 50;
    return roundScore(100 * percentileRank(value, sorted, lowerBetter));
  }

  function cappedPercentileScore(value, values, capPercentile) {
    var sorted = numericValues(values);
    if (!sorted.length) return 50;
    var cap = percentileValue(sorted, capPercentile);
    var cappedValue = Math.min(Number(value) || 0, cap);
    var cappedValues = sorted.map(function (entry) {
      return Math.min(entry, cap);
    });
    return percentileScore(cappedValue, cappedValues, false);
  }

  function weightedScore(parts) {
    var total = 0;
    var weightTotal = 0;
    (parts || []).forEach(function (part) {
      var value = Number(part && part.value);
      var weight = Number(part && part.weight);
      if (!isFinite(value) || !isFinite(weight) || weight <= 0) return;
      total += value * weight;
      weightTotal += weight;
    });
    return weightTotal > 0 ? total / weightTotal : 0;
  }

  function computeTeamPointsFromSeasonRow(row) {
    var wins = toNumber(row && row.teamW);
    var homeWins = toNumber(row && row.teamHW);
    var homeLosses = toNumber(row && row.teamHL);
    return (wins - homeWins) * 3 + homeWins * 2 + homeLosses;
  }

  function isTruthySheetValue(value) {
    if (value === true) return true;
    if (value === false || value === undefined || value === null) return false;
    var raw = String(value).trim().toLowerCase();
    return (
      raw === "true" ||
      raw === "1" ||
      raw === "yes" ||
      raw === "y" ||
      raw === "on"
    );
  }

  function mapRowsByPlayerId(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      var playerKey = getPlayerKey(row);
      if (!playerKey) return;
      if (!map[playerKey] || isRegularSeasonType(row && row.seasonType)) {
        map[playerKey] = row;
      }
    });
    return map;
  }

  function mapPlayerSplitsByTeamPlayer(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      var teamKey = getTeamKey(row);
      var playerKey = getPlayerKey(row);
      if (!teamKey || !playerKey || !isRegularSeasonType(row && row.seasonType)) {
        return;
      }
      map[teamKey + "|" + playerKey] = row;
    });
    return map;
  }

  function getSplitUsageWeight(row) {
    var days = toNumber(row && row.days);
    if (days > 0) return days;
    var gp = toNumber(row && row.GP);
    if (gp > 0) return gp;
    var gs = toNumber(row && row.GS);
    if (gs > 0) return gs;
    return 1;
  }

  function buildLeagueTalentFallback(previousNhlRows, currentNhlRows, totalRows) {
    var values = [];
    (previousNhlRows || []).forEach(function (row) {
      var value = getFirstFiniteNumber(row, ["overallRating"]);
      if (value !== null) values.push(value);
    });
    (currentNhlRows || []).forEach(function (row) {
      var value = getFirstFiniteNumber(row, ["overallRating", "seasonRating"]);
      if (value !== null) values.push(value);
    });
    (totalRows || []).forEach(function (row) {
      if (!isRegularSeasonType(row && row.seasonType)) return;
      var value = getFirstFiniteNumber(row, ["Rating"]);
      if (value !== null) values.push(value);
    });
    return medianValue(values);
  }

  function resolvePlayerTalentValues(
    playerId,
    previousNhlByPlayer,
    currentNhlByPlayer,
    totalByPlayer,
    fallback,
  ) {
    var previousRow = previousNhlByPlayer[playerId];
    var currentRow = currentNhlByPlayer[playerId];
    var totalRow = totalByPlayer[playerId];
    var currentOverall = getFirstFiniteNumber(currentRow, [
      "overallRating",
      "seasonRating",
    ]);
    var previousOverall = getFirstFiniteNumber(previousRow, ["overallRating"]);
    var totalRating = getFirstFiniteNumber(totalRow, ["Rating"]);

    if (previousOverall === null) {
      previousOverall =
        currentOverall !== null
          ? currentOverall
          : getFirstFiniteNumber(currentRow, ["seasonRating"]);
    }
    if (previousOverall === null) previousOverall = fallback;
    if (currentOverall === null) {
      currentOverall =
        getFirstFiniteNumber(currentRow, ["seasonRating"]) !== null
          ? getFirstFiniteNumber(currentRow, ["seasonRating"])
          : previousOverall;
    }
    if (currentOverall === null) currentOverall = fallback;
    if (totalRating === null) totalRating = currentOverall;
    if (totalRating === null) totalRating = fallback;

    return {
      previousOverall: previousOverall,
      currentOverall: currentOverall,
      totalRating: totalRating,
      blended:
        0.55 * previousOverall + 0.3 * currentOverall + 0.15 * totalRating,
    };
  }

  function buildTeamTalentContext(
    playerSplitRows,
    previousNhlRows,
    currentNhlRows,
    totalRows,
  ) {
    var previousNhlByPlayer = mapRowsByPlayerId(previousNhlRows);
    var currentNhlByPlayer = mapRowsByPlayerId(currentNhlRows);
    var totalByPlayer = mapRowsByPlayerId(
      (totalRows || []).filter(function (row) {
        return isRegularSeasonType(row && row.seasonType);
      }),
    );
    var fallback = buildLeagueTalentFallback(
      previousNhlRows,
      currentNhlRows,
      totalRows,
    );
    var teamBuckets = {};

    (playerSplitRows || []).forEach(function (row) {
      if (!row || !isRegularSeasonType(row.seasonType)) return;
      var teamKey = getTeamKey(row);
      var playerKey = getPlayerKey(row);
      if (!teamKey || !playerKey) return;
      var talent = resolvePlayerTalentValues(
        playerKey,
        previousNhlByPlayer,
        currentNhlByPlayer,
        totalByPlayer,
        fallback,
      );
      var weight = getSplitUsageWeight(row);
      if (!teamBuckets[teamKey]) {
        teamBuckets[teamKey] = {
          talentTotal: 0,
          previousTotal: 0,
          weightTotal: 0,
        };
      }
      teamBuckets[teamKey].talentTotal += talent.blended * weight;
      teamBuckets[teamKey].previousTotal += talent.previousOverall * weight;
      teamBuckets[teamKey].weightTotal += weight;
    });

    return {
      previousNhlByPlayer: previousNhlByPlayer,
      currentNhlByPlayer: currentNhlByPlayer,
      totalByPlayer: totalByPlayer,
      fallback: fallback,
      teamTalent: teamBuckets,
    };
  }

  function buildTeamAwardComponentContext(regularRows, seasonId) {
    var previousSeasonId = resolvePreviousSeasonId(seasonId);
    var playerSplitRows = fetchSeasonPlayerSplitRows(seasonId);
    var playerTotalRows = fetchSeasonPlayerTotalRows(seasonId);
    var currentNhlRows = fetchSeasonPlayerNhlRows(seasonId);
    var previousNhlRows = previousSeasonId
      ? fetchSeasonPlayerNhlRows(previousSeasonId)
      : [];
    var talentContext = buildTeamTalentContext(
      playerSplitRows,
      previousNhlRows,
      currentNhlRows,
      playerTotalRows,
    );
    var teamTalentValues = {};
    var teamPreviousTalentValues = {};

    (regularRows || []).forEach(function (row) {
      var teamKey = getTeamKey(row);
      var bucket = talentContext.teamTalent[teamKey];
      var weightTotal = bucket ? bucket.weightTotal : 0;
      teamTalentValues[teamKey] =
        weightTotal > 0
          ? bucket.talentTotal / weightTotal
          : talentContext.fallback;
      teamPreviousTalentValues[teamKey] =
        weightTotal > 0
          ? bucket.previousTotal / weightTotal
          : talentContext.fallback;
    });

    var categoryValues = (regularRows || []).map(function (row) {
      return toNumber(row && row.Rating);
    });
    var winsValues = (regularRows || []).map(function (row) {
      return toNumber(row && row.teamW);
    });
    var pointsValues = (regularRows || []).map(computeTeamPointsFromSeasonRow);
    var msValues = (regularRows || []).map(function (row) {
      return toNumber(row && row.MS);
    });
    var lineupDecisionPctValues = (regularRows || []).map(function (row) {
      var gamesPlayed = toNumber(row && row.GP);
      var goodStarts = toNumber(row && row.GS);
      var missedStarts = toNumber(row && row.MS);
      var badStarts = toNumber(row && row.BS);
      var lineupDecisions = gamesPlayed - goodStarts - missedStarts;

      if (lineupDecisions <= 0) return 1;
      return badStarts / lineupDecisions;
    });
    var addValues = (regularRows || []).map(function (row) {
      return toNumber(row && row.ADD);
    });
    var playersUsedValues = (regularRows || []).map(function (row) {
      return toNumber(row && row.playersUsed);
    });
    var talentValues = Object.keys(teamTalentValues).map(function (teamKey) {
      return teamTalentValues[teamKey];
    });
    var improvementValues = Object.keys(teamTalentValues).map(function (teamKey) {
      return teamTalentValues[teamKey] - teamPreviousTalentValues[teamKey];
    });

    var componentsByTeam = {};
    (regularRows || []).forEach(function (row) {
      var teamKey = getTeamKey(row);
      var categoryScore = toNumber(row && row.Rating);
      var winsScore = percentileScore(toNumber(row && row.teamW), winsValues, false);
      var pointsScore = percentileScore(
        computeTeamPointsFromSeasonRow(row),
        pointsValues,
        false,
      );
      var standingsScore = weightedScore([
        { value: winsScore, weight: 0.6 },
        { value: pointsScore, weight: 0.4 },
      ]);
      var gamesPlayed = toNumber(row && row.GP);
      var goodStarts = toNumber(row && row.GS);
      var missedStarts = toNumber(row && row.MS);
      var badStarts = toNumber(row && row.BS);
      var lineupDecisions = gamesPlayed - goodStarts - missedStarts;
      var lineupDecisionPct =
        lineupDecisions > 0 ? badStarts / lineupDecisions : 1;
      var lineupScore = weightedScore([
        { value: percentileScore(missedStarts, msValues, true), weight: 0.6 },
        {
          value: percentileScore(lineupDecisionPct, lineupDecisionPctValues, true),
          weight: 0.4,
        },
      ]);
      var rosterTalentScore = percentileScore(
        teamTalentValues[teamKey],
        talentValues,
        false,
      );
      var talentImprovementScore = percentileScore(
        teamTalentValues[teamKey] - teamPreviousTalentValues[teamKey],
        improvementValues,
        false,
      );
      var activityScore = weightedScore([
        {
          value: cappedPercentileScore(toNumber(row && row.ADD), addValues, 0.85),
          weight: 0.6,
        },
        {
          value: cappedPercentileScore(
            toNumber(row && row.playersUsed),
            playersUsedValues,
            0.85,
          ),
          weight: 0.4,
        },
      ]);
      componentsByTeam[teamKey] = {
        categoryScore: categoryScore,
        standingsScore: standingsScore,
        lineupScore: lineupScore,
        rosterTalentScore: rosterTalentScore,
        talentImprovementScore: talentImprovementScore,
        activityScore: activityScore,
        teamPerformanceScore: weightedScore([
          { value: categoryScore, weight: 0.55 },
          { value: standingsScore, weight: 0.45 },
        ]),
      };
    });

    var overPerformanceValues = Object.keys(componentsByTeam).map(function (teamKey) {
      var component = componentsByTeam[teamKey];
      return component.teamPerformanceScore - component.rosterTalentScore;
    });
    Object.keys(componentsByTeam).forEach(function (teamKey) {
      var component = componentsByTeam[teamKey];
      component.overPerformanceScore = percentileScore(
        component.teamPerformanceScore - component.rosterTalentScore,
        overPerformanceValues,
        false,
      );
    });

    return {
      componentsByTeam: componentsByTeam,
      playerSplitRows: playerSplitRows,
      playerSplitByTeamPlayer: mapPlayerSplitsByTeamPlayer(playerSplitRows),
      talentContext: talentContext,
      draftPickRows: fetchSeasonDraftPickRows(seasonId),
    };
  }

  function buildCalderTeamScores(regularRows, seasonId, componentContext) {
    var nonSigningDraftRows = (componentContext.draftPickRows || []).filter(
      function (row) {
        return (
          row &&
          !isTruthySheetValue(row.isSigning) &&
          isFinite(Number(row.pick)) &&
          Number(row.pick) > 0
        );
      },
    );
    var draftRows = nonSigningDraftRows
      .filter(function (row) {
        return getTeamKey(row) && getPlayerKey(row);
      })
      .sort(function (left, right) {
        return toNumber(left && left.pick) - toNumber(right && right.pick);
      });
    var result = {};
    (regularRows || []).forEach(function (row) {
      result[getTeamKey(row)] = { score: 0, hasPicks: false };
    });
    if (!draftRows.length) return result;

    var maxPick = Math.max.apply(
      null,
      nonSigningDraftRows.map(function (row) {
        return toNumber(row && row.pick);
      }),
    );
    var talentContext = componentContext.talentContext;
    var pickEntries = draftRows.map(function (row) {
      var teamKey = getTeamKey(row);
      var playerKey = getPlayerKey(row);
      var pickNumber = toNumber(row && row.pick);
      var talent = resolvePlayerTalentValues(
        playerKey,
        talentContext.previousNhlByPlayer,
        talentContext.currentNhlByPlayer,
        talentContext.totalByPlayer,
        talentContext.fallback,
      );
      var splitRow = componentContext.playerSplitByTeamPlayer[
        teamKey + "|" + playerKey
      ];
      var totalRow = talentContext.totalByPlayer[playerKey];
      var slotShare = maxPick > 0 ? (maxPick - pickNumber + 1) / maxPick : 0;
      var slotValue = Math.pow(Math.max(slotShare, 0), 1.35);
      return {
        teamKey: teamKey,
        pickNumber: pickNumber,
        initialTalent: talent.previousOverall,
        currentNhlValue: talent.currentOverall,
        gshlTotalValue:
          getFirstFiniteNumber(totalRow, ["Rating"]) !== null
            ? getFirstFiniteNumber(totalRow, ["Rating"])
            : talent.totalRating,
        teamSplitValue:
          getFirstFiniteNumber(splitRow, ["Rating"]) !== null
            ? getFirstFiniteNumber(splitRow, ["Rating"])
            : 0,
        slotValue: slotValue,
      };
    });
    var initialTalentValues = pickEntries.map(function (entry) {
      return entry.initialTalent;
    });
    var topInitialTalent = Math.max.apply(null, numericValues(initialTalentValues));
    var bottomInitialTalent = Math.min.apply(
      null,
      numericValues(initialTalentValues),
    );
    if (!isFinite(topInitialTalent)) topInitialTalent = talentContext.fallback;
    if (!isFinite(bottomInitialTalent)) bottomInitialTalent = talentContext.fallback;

    pickEntries.forEach(function (entry) {
      var expectedTalent =
        bottomInitialTalent +
        (topInitialTalent - bottomInitialTalent) * entry.slotValue;
      entry.valueOverSlot = entry.initialTalent - expectedTalent;
    });

    var valueOverSlotValues = pickEntries.map(function (entry) {
      return entry.valueOverSlot;
    });
    var currentNhlValues = pickEntries.map(function (entry) {
      return entry.currentNhlValue;
    });
    var gshlTotalValues = pickEntries.map(function (entry) {
      return entry.gshlTotalValue;
    });
    var teamSplitValues = pickEntries.map(function (entry) {
      return entry.teamSplitValue;
    });

    pickEntries.forEach(function (entry) {
      var scoutingScore = weightedScore([
        {
          value: percentileScore(entry.valueOverSlot, valueOverSlotValues, false),
          weight: 0.45,
        },
        {
          value: percentileScore(entry.currentNhlValue, currentNhlValues, false),
          weight: 0.35,
        },
        {
          value: percentileScore(entry.gshlTotalValue, gshlTotalValues, false),
          weight: 0.2,
        },
      ]);
      var teamValueScore = percentileScore(
        entry.teamSplitValue,
        teamSplitValues,
        false,
      );
      entry.score = weightedScore([
        { value: scoutingScore, weight: 0.7 },
        { value: teamValueScore, weight: 0.3 },
      ]);
    });

    var picksByTeam = {};
    pickEntries.forEach(function (entry) {
      if (!picksByTeam[entry.teamKey]) picksByTeam[entry.teamKey] = [];
      picksByTeam[entry.teamKey].push(entry);
    });

    Object.keys(picksByTeam).forEach(function (teamKey) {
      var teamPicks = picksByTeam[teamKey].sort(function (left, right) {
        return left.pickNumber - right.pickNumber;
      });
      var topPicks = teamPicks.slice(0, 8);
      var latePicks = teamPicks.slice(8);
      var topScore = average(
        topPicks.map(function (entry) {
          return entry.score;
        }),
      );
      var lateScore = average(
        latePicks.map(function (entry) {
          return entry.score;
        }),
      );
      result[teamKey] = {
        score: roundScore(
          latePicks.length
            ? topScore * 0.8 + lateScore * 0.2
            : topScore,
        ),
        hasPicks: true,
      };
    });

    return result;
  }

  function rankTeamSeasonAwardRows(rows, ratingField, rankField, eligibilityMap) {
    rows
      .slice()
      .sort(function (left, right) {
        var leftKey = getTeamKey(left);
        var rightKey = getTeamKey(right);
        var leftEligible =
          !eligibilityMap || eligibilityMap[leftKey] !== false ? 1 : 0;
        var rightEligible =
          !eligibilityMap || eligibilityMap[rightKey] !== false ? 1 : 0;
        if (leftEligible !== rightEligible) return rightEligible - leftEligible;
        var scoreDiff =
          toNumber(right && right[ratingField]) -
          toNumber(left && left[ratingField]);
        if (scoreDiff !== 0) return scoreDiff;
        return leftKey.localeCompare(rightKey);
      })
      .forEach(function (row, index) {
        row[rankField] = index + 1;
      });
  }

  function clearTeamSeasonAwardFields(row) {
    TEAM_SEASON_AWARD_FIELD_PAIRS.forEach(function (pair) {
      row[pair[0]] = "";
      row[pair[1]] = "";
    });
  }

  function applyTeamSeasonAwardRatings(rows, seasonId) {
    if (!rows || !rows.length) return;

    var regularRows = rows.filter(function (row) {
      return row && isRegularSeasonType(row.seasonType);
    });

    rows.forEach(function (row) {
      if (!row) return;
      if (!isRegularSeasonType(row.seasonType)) {
        clearTeamSeasonAwardFields(row);
      }
    });

    if (!regularRows.length) return;

    var playerSplitRows = fetchSeasonPlayerSplitRows(seasonId);
    var norrisAggregateRows = buildTeamSeasonAwardAggregateRows(
      regularRows,
      playerSplitRows,
      PositionGroup.D,
      getSkaterCategories(seasonId),
    );
    var vezinaAggregateRows = buildTeamSeasonAwardAggregateRows(
      regularRows,
      playerSplitRows,
      PositionGroup.G,
      GOALIE_CORE_CATEGORIES,
    );
    var norrisByTeamKey = {};
    var vezinaByTeamKey = {};
    var componentContext = buildTeamAwardComponentContext(regularRows, seasonId);
    var calderByTeamKey = buildCalderTeamScores(
      regularRows,
      seasonId,
      componentContext,
    );
    var calderEligibilityMap = {};

    computeTeamSeasonAwardRatings(
      norrisAggregateRows,
      getSkaterCategories(seasonId),
      "norrisRating",
      "norrisRk",
    );
    computeTeamSeasonAwardRatings(
      vezinaAggregateRows,
      GOALIE_CORE_CATEGORIES,
      "vezinaRating",
      "vezinaRk",
    );

    norrisAggregateRows.forEach(function (row) {
      norrisByTeamKey[String(row && row.gshlTeamId || "")] = row;
    });
    vezinaAggregateRows.forEach(function (row) {
      vezinaByTeamKey[String(row && row.gshlTeamId || "")] = row;
    });

    regularRows.forEach(function (row) {
      if (!row) return;

      var teamKey = getTeamKey(row);
      var norrisRow = norrisByTeamKey[teamKey];
      var vezinaRow = vezinaByTeamKey[teamKey];
      var components = componentContext.componentsByTeam[teamKey] || {};
      var calder = calderByTeamKey[teamKey] || { score: 0, hasPicks: false };

      row.hartRating = roundScore(
        weightedScore([
          { value: components.categoryScore || 0, weight: 0.8 },
          { value: components.standingsScore || 0, weight: 0.2 },
        ]),
      );
      row.norrisRating =
        norrisRow && norrisRow.norrisRating !== undefined
          ? norrisRow.norrisRating
          : 0;
      row.norrisRk =
        norrisRow && norrisRow.norrisRk !== undefined ? norrisRow.norrisRk : "";
      row.vezinaRating =
        vezinaRow && vezinaRow.vezinaRating !== undefined
          ? vezinaRow.vezinaRating
          : 0;
      row.vezinaRk =
        vezinaRow && vezinaRow.vezinaRk !== undefined ? vezinaRow.vezinaRk : "";
      row.calderRating = roundScore(calder.score || 0);
      row.jackAdamsRating = roundScore(
        weightedScore([
          { value: components.lineupScore || 0, weight: 0.7 },
          { value: components.overPerformanceScore || 0, weight: 0.15 },
          { value: components.standingsScore || 0, weight: 0.075 },
          { value: components.categoryScore || 0, weight: 0.075 },
        ]),
      );
      row.GMOYRating = roundScore(
        weightedScore([
          { value: components.talentImprovementScore || 0, weight: 0.3 },
          { value: components.rosterTalentScore || 0, weight: 0.2 },
          { value: components.activityScore || 0, weight: 0.15 },
          { value: components.standingsScore || 0, weight: 0.15 },
          { value: components.categoryScore || 0, weight: 0.15 },
          { value: row.calderRating || 0, weight: 0.05 },
        ]),
      );
      calderEligibilityMap[teamKey] = !!calder.hasPicks;
    });

    rankTeamSeasonAwardRows(regularRows, "hartRating", "hartRk");
    rankTeamSeasonAwardRows(
      regularRows,
      "calderRating",
      "calderRk",
      calderEligibilityMap,
    );
    rankTeamSeasonAwardRows(
      regularRows,
      "jackAdamsRating",
      "jackAdamsRk",
    );
    rankTeamSeasonAwardRows(regularRows, "GMOYRating", "GMOYRk");
  }

  function rankSeasonScopedTeamSeasonRows(targetRows, outputField) {
    if (!targetRows || !targetRows.length) return;

    var seasonKey =
      targetRows[0] && targetRows[0].seasonId !== undefined
        ? String(targetRows[0].seasonId)
        : "";
    var seasonTypeKey =
      targetRows[0] && targetRows[0].seasonType !== undefined
        ? String(targetRows[0].seasonType)
        : "";
    var poolRows = seasonKey ? fetchSeasonTeamSeasonRows(seasonKey) : [];
    var workingRows = (poolRows.length ? poolRows : targetRows.slice()).filter(
      function (row) {
        return (
          String(row && row.seasonId) === seasonKey &&
          String(row && row.seasonType) === seasonTypeKey
        );
      },
    );
    var workingRowByKey = {};

    workingRows.forEach(function (row) {
      workingRowByKey[getTeamSeasonRowKey(row)] = row;
    });

    targetRows.forEach(function (row) {
      var key = getTeamSeasonRowKey(row);
      workingRowByKey[key] = row;
    });

    workingRows = Object.keys(workingRowByKey).map(function (key) {
      return workingRowByKey[key];
    });

    rankTeamSeasonRows(workingRows, outputField);
    applyTeamSeasonAwardRatings(workingRows, seasonKey);

    var rankedByKey = {};
    workingRows.forEach(function (row) {
      rankedByKey[getTeamSeasonRowKey(row)] = row;
    });

    targetRows.forEach(function (row) {
      var rankedRow = rankedByKey[getTeamSeasonRowKey(row)];
      row[outputField] =
        rankedRow && rankedRow[outputField] !== undefined
          ? rankedRow[outputField]
          : 0;
    });
  }

  function rankRows(rows, options) {
    var opts = options || {};
    var sheetName = normalizeSheetName(
      opts.sheetName || (rows && rows[0] ? detectSheetName(rows[0], opts) : ""),
    );
    var outputField = getOutputField(sheetName, opts);
    var targetRows =
      opts.mutate === false ? (rows || []).map(cloneObject) : rows || [];

    if (!targetRows.length) return targetRows;

    if (sheetName === "TeamDayStatLine") {
      var seasonGroups = {};
      targetRows.forEach(function (row) {
        var seasonKey = row && row.seasonId !== undefined ? String(row.seasonId) : "";
        if (!seasonGroups[seasonKey]) {
          seasonGroups[seasonKey] = [];
        }
        seasonGroups[seasonKey].push(row);
      });
      Object.keys(seasonGroups).forEach(function (seasonKey) {
        rankTeamDayRows(seasonGroups[seasonKey], outputField);
      });
      return targetRows;
    }

    if (sheetName === "TeamWeekStatLine") {
      var teamWeekSeasonGroups = {};
      targetRows.forEach(function (row) {
        var seasonKey =
          row && row.seasonId !== undefined ? String(row.seasonId) : "";
        if (!teamWeekSeasonGroups[seasonKey]) {
          teamWeekSeasonGroups[seasonKey] = [];
        }
        teamWeekSeasonGroups[seasonKey].push(row);
      });
      Object.keys(teamWeekSeasonGroups).forEach(function (seasonKey) {
        rankSeasonScopedTeamWeekRows(
          teamWeekSeasonGroups[seasonKey],
          outputField,
        );
      });
      return targetRows;
    }

    if (sheetName === "TeamSeasonStatLine") {
      var teamSeasonGroups = {};
      targetRows.forEach(function (row) {
        var seasonKey =
          row && row.seasonId !== undefined ? String(row.seasonId) : "";
        var seasonTypeKey =
          row && row.seasonType !== undefined ? String(row.seasonType) : "";
        var groupKey = [seasonKey, seasonTypeKey].join("|");
        if (!teamSeasonGroups[groupKey]) {
          teamSeasonGroups[groupKey] = [];
        }
        teamSeasonGroups[groupKey].push(row);
      });
      Object.keys(teamSeasonGroups).forEach(function (groupKey) {
        rankSeasonScopedTeamSeasonRows(
          teamSeasonGroups[groupKey],
          outputField,
        );
      });
      return targetRows;
    }

    if (sheetName.indexOf("Team") === 0) {
      rankTeamRows(targetRows, outputField);
      return targetRows;
    }

    var context = buildAggregateGroupContext(targetRows, sheetName);
    Object.keys(context.primaryGroups).forEach(function (key) {
      var group = context.primaryGroups[key];
      var posGroup = normalizePosGroup(group[0] && group[0].posGroup, group[0]);
      var poolRows = getPoolRowsForGroup(group, sheetName, context, posGroup);
      if (posGroup === PositionGroup.G) {
        rankGoalieGroup(group, poolRows, sheetName, outputField);
      } else if (posGroup === PositionGroup.TEAM) {
        rankTeamRows(group, outputField);
      } else {
        rankSkaterGroup(group, poolRows, sheetName, outputField, opts);
      }
    });

    return targetRows;
  }

  function interpolatePiecewise(value, points, lowerBetter) {
    var numeric = Number(value);
    if (!isFinite(numeric)) numeric = 0;
    var sorted = points.slice().sort(function (a, b) {
      return a.value - b.value;
    });
    if (lowerBetter) {
      if (numeric <= sorted[0].value) return sorted[0].score;
      for (var i = 0; i < sorted.length - 1; i++) {
        if (numeric <= sorted[i + 1].value) {
          var span = Math.max(sorted[i + 1].value - sorted[i].value, 0.0001);
          var ratio = (numeric - sorted[i].value) / span;
          return (
            sorted[i].score + ratio * (sorted[i + 1].score - sorted[i].score)
          );
        }
      }
      var tail = sorted[sorted.length - 1];
      return Math.max(0, tail.score * Math.exp(-(numeric - tail.value) * 0.9));
    }
    if (numeric <= sorted[0].value) return sorted[0].score;
    for (var j = 0; j < sorted.length - 1; j++) {
      if (numeric <= sorted[j + 1].value) {
        var width = Math.max(sorted[j + 1].value - sorted[j].value, 0.0001);
        var progress = (numeric - sorted[j].value) / width;
        return (
          sorted[j].score + progress * (sorted[j + 1].score - sorted[j].score)
        );
      }
    }
    var top = sorted[sorted.length - 1];
    return Math.min(
      1.02,
      top.score + (1 - Math.exp(-(numeric - top.value) * 2)) * 0.02,
    );
  }

  function rankTeamSingle(row, sheetName) {
    var normalizedSheetName = normalizeSheetName(sheetName);

    if (normalizedSheetName === "TeamDayStatLine") {
      var categories = getMatchupCategoriesForSeason(row && row.seasonId);
      if (!hasMeaningfulTeamDayActivity(row, categories)) {
        return buildResult(row, sheetName, PositionGroup.TEAM, 0, [], {
          categoryQuality: 0,
          spike: 0,
          breadth: 0,
          volume: 0,
        });
      }

      var poolRows = fetchSeasonTeamDayRows(row && row.seasonId);
      var targetRow = cloneObject(row);
      var targetKey = getTeamDayRowKey(targetRow);
      var hasExistingRow = poolRows.some(function (poolRow) {
        return getTeamDayRowKey(poolRow) === targetKey;
      });
      if (!hasExistingRow) {
        poolRows.push(targetRow);
      }

      rankRows(poolRows, {
        sheetName: "TeamDayStatLine",
        outputField: getOutputField("TeamDayStatLine", {}),
        mutate: true,
      });

      var resolvedRow = hasExistingRow
        ? poolRows.find(function (poolRow) {
            return getTeamDayRowKey(poolRow) === targetKey;
          })
        : targetRow;
      var score =
        resolvedRow && resolvedRow.Rating !== undefined ? resolvedRow.Rating : 0;
      var normalizedScore = Number(score);
      if (!isFinite(normalizedScore)) normalizedScore = 0;

      return buildResult(
        row,
        sheetName,
        PositionGroup.TEAM,
        normalizedScore,
        [],
        {
          categoryQuality: normalizedScore / getScoreScale(sheetName),
          spike: normalizedScore / getScoreScale(sheetName),
          breadth: normalizedScore > 0 ? 1 : 0,
          volume: normalizedScore > 0 ? 1 : 0,
        },
      );
    }

    if (normalizedSheetName === "TeamWeekStatLine") {
      var poolRows = fetchSeasonTeamWeekRows(row && row.seasonId);
      var targetRow = cloneObject(row);
      var targetKey = getTeamWeekRowKey(targetRow);
      var hasExistingRow = poolRows.some(function (poolRow) {
        return getTeamWeekRowKey(poolRow) === targetKey;
      });
      if (!hasExistingRow) {
        poolRows.push(targetRow);
      }

      rankSeasonScopedTeamWeekRows(poolRows, getOutputField(sheetName, {}));

      var resolvedRow = hasExistingRow
        ? poolRows.find(function (poolRow) {
            return getTeamWeekRowKey(poolRow) === targetKey;
          })
        : targetRow;
      var score =
        resolvedRow && resolvedRow.Rating !== undefined ? resolvedRow.Rating : 0;
      var normalizedScore = Number(score);
      if (!isFinite(normalizedScore)) normalizedScore = 0;

      return buildResult(
        row,
        sheetName,
        PositionGroup.TEAM,
        normalizedScore,
        [],
        {
          categoryQuality: normalizedScore / getScoreScale(sheetName),
          spike: normalizedScore / getScoreScale(sheetName),
          breadth: normalizedScore > 0 ? 1 : 0,
          volume: normalizedScore > 0 ? 1 : 0,
        },
      );
    }

    if (normalizedSheetName === "TeamSeasonStatLine") {
      var teamSeasonPoolRows = fetchSeasonTeamSeasonRows(row && row.seasonId);
      var teamSeasonTargetRow = cloneObject(row);
      var teamSeasonTargetKey = getTeamSeasonRowKey(teamSeasonTargetRow);
      var hasExistingTeamSeasonRow = teamSeasonPoolRows.some(function (poolRow) {
        return getTeamSeasonRowKey(poolRow) === teamSeasonTargetKey;
      });
      if (!hasExistingTeamSeasonRow) {
        teamSeasonPoolRows.push(teamSeasonTargetRow);
      }

      rankSeasonScopedTeamSeasonRows(
        teamSeasonPoolRows.filter(function (poolRow) {
          return (
            String(poolRow && poolRow.seasonType) ===
            String(teamSeasonTargetRow && teamSeasonTargetRow.seasonType)
          );
        }),
        getOutputField(sheetName, {}),
      );

      var resolvedTeamSeasonRow = hasExistingTeamSeasonRow
        ? teamSeasonPoolRows.find(function (poolRow) {
            return getTeamSeasonRowKey(poolRow) === teamSeasonTargetKey;
          })
        : teamSeasonTargetRow;
      var seasonScore =
        resolvedTeamSeasonRow && resolvedTeamSeasonRow.Rating !== undefined
          ? resolvedTeamSeasonRow.Rating
          : 0;
      var normalizedSeasonScore = Number(seasonScore);
      if (!isFinite(normalizedSeasonScore)) normalizedSeasonScore = 0;

      return buildResult(
        row,
        sheetName,
        PositionGroup.TEAM,
        normalizedSeasonScore,
        [],
        {
          categoryQuality: normalizedSeasonScore / getScoreScale(sheetName),
          spike: normalizedSeasonScore / getScoreScale(sheetName),
          breadth: normalizedSeasonScore > 0 ? 1 : 0,
          volume: normalizedSeasonScore > 0 ? 1 : 0,
        },
      );
    }

    var categories = getMatchupCategoriesForSeason(row && row.seasonId);
    var scores = categories.map(function (category) {
      var value = toNumber(row && row[category]);
      if (category === "GAA") {
        return value > 0 ? clip((5 - value) / 4, 0, 1) : 0;
      }
      if (category === "SVP") {
        return clip((value - 0.85) / 0.12, 0, 1);
      }
      return clip(value / 10, 0, 1);
    });
    return buildResult(
      row,
      sheetName,
      PositionGroup.TEAM,
      roundScore(125 * average(scores)),
      [],
      {
        categoryQuality: average(scores),
        spike: topAverage(scores, 2),
        breadth: 0,
        volume: 1,
      },
    );
  }

  function rankAggregateSingle(row, sheetName, posGroup) {
    var outputField = getOutputField(sheetName, {});
    var clone = cloneObject(row);
    rankRows([clone], {
      sheetName: sheetName,
      outputField: outputField,
      mutate: true,
    });
    var score = clone[outputField];
    return buildResult(
      row,
      sheetName,
      posGroup,
      score === undefined ? "" : score,
      [],
      {},
    );
  }

  function blankResult(row, sheetName, posGroup) {
    return buildResult(row, sheetName, posGroup, "", [], {
      categoryQuality: 0,
      spike: 0,
      breadth: 0,
      volume: 0,
    });
  }

  function buildResult(row, sheetName, posGroup, score, breakdown, components) {
    return {
      score: score,
      percentile: score === "" ? "" : clip(score, 0, 100),
      referencePercentile: score === "" ? "" : clip(score, 0, 100),
      aggregationLevel: sheetName,
      posGroup: posGroup,
      seasonId: row && row.seasonId !== undefined ? String(row.seasonId) : "",
      seasonPhase: row && row.seasonType ? row.seasonType : "",
      modelKey: "",
      breakdown: breakdown || [],
      components: components || {},
      efficiencyScore:
        components && components.categoryQuality
          ? components.categoryQuality
          : 0,
      gamesScore: components && components.volume ? components.volume : 0,
      densityScore: components && components.breadth ? components.breadth : 0,
      rawComposite:
        score === ""
          ? 0
          : Number(score) /
            (normalizeSheetName(sheetName) === "TeamWeekStatLine"
              ? getScoreScale(sheetName)
              : 125),
    };
  }

  function rankPerformance(row, options) {
    var opts = options || {};
    var sheetName = normalizeSheetName(detectSheetName(row, opts));
    var posGroup = normalizePosGroup(row && row.posGroup, row);

    if (
      row &&
      row.playerId &&
      (sheetName === "PlayerDayStatLine" || sheetName === "PlayerWeekStatLine")
    ) {
      return blankResult(row, sheetName, posGroup);
    }
    if (posGroup === PositionGroup.TEAM || sheetName.indexOf("Team") === 0) {
      return rankTeamSingle(row, sheetName);
    }
    return rankAggregateSingle(row, sheetName, posGroup);
  }

  function getPerformanceGrade(score) {
    if (score === "" || score === null || score === undefined)
      return "No Impact";
    var numeric = Number(score);
    if (numeric >= 105) return "Insanity";
    if (numeric >= 100) return "Super Elite";
    if (numeric >= 85) return "Elite";
    if (numeric >= 75) return "Above Average Starter";
    if (numeric >= 50) return "Borderline Starter";
    if (numeric >= 30) return "Rosterable";
    if (numeric >= 10) return "Waiver Wire";
    return "No Impact";
  }

  ns.PositionGroup = PositionGroup;
  ns.rankPerformance = rankPerformance;
  ns.rankRows = rankRows;
  ns.getPerformanceGrade = getPerformanceGrade;
  ns.getRelevantStats = getRelevantStats;
  ns.getMatchupCategoriesForSeason = getMatchupCategoriesForSeason;
  ns.isLowerBetterStat = isLowerBetterStat;
})(RankingEngine);
