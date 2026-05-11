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

  var SKATER_DEFAULT_CATEGORIES = ["G", "A", "P", "PPP", "SOG", "HIT", "BLK"];
  var GOALIE_CORE_CATEGORIES = ["W", "GAA", "SVP"];
  var LOWER_BETTER = { GAA: true, GA: true };
  var seasonCategoryCache = {};

  var SMALL_COHORT_THRESHOLDS = {
    skater: 17,
    goalie: 5,
  };
  var PLAYER_AGGREGATE_DISTRIBUTION_LIMITS = {
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
  var PLAYER_DAY_RETAINED_SHARE = {
    F: 0.85,
    D: 0.75,
    G: 0.55,
  };
  var PLAYER_WEEK_RETAINED_SHARE = {
    F: 0.5,
    D: 0.75,
    G: 0.5,
  };
  var RETAINED_RANGE_NEGATIVE_CARRY = 0.3;
  var RETAINED_RANGE_NEGATIVE_FLOOR = -0.3;
  var GOALIE_MINIMUM_TOI_FOR_RATING = 0;
  var GOALIE_NEGLIGIBLE_TOI_THRESHOLD = 30;
  var GOALIE_NEGLIGIBLE_TOI_MAX_SCORE = 15;
  var PLAYER_DAY_POSITION_MULTIPLIER = {
    F: 1.725,
    D: 1.575,
    G: 1.325,
  };
  var PLAYER_WEEK_POSITION_MULTIPLIER = {
    F: 1.75,
    D: 1.5,
    G: 1.05,
  };
  var WEEK_NORMALIZATION_CONFIG = {
    skater: { targetUsage: 3.5, fullUsage: 3 },
    goalie: { targetUsage: 2, fullUsage: 2 },
  };

  var SKATER_LEVEL_PROFILES = {
    PlayerDayStatLine: {
      categoryBlend: { raw: 1, rate: 0 },
      weights: {
        efficiency: 0.33,
        support: 0.14,
        breadth: 0.08,
        volume: 0.1,
        star: 0.35,
      },
      volumeMix: { usage: 0.1, event: 0.9 },
      volumeScoreBlend: { normalized: 0.675, raw: 0.325 },
      balancedBonus: 0,
      specialistCap: { maxSupport: 0.18, maxBreadth: 0.15, cap: 102 },
      smallSampleCaps: [],
    },
    PlayerWeekStatLine: {
      categoryBlend: { raw: 0.62, rate: 0.38 },
      weights: {
        efficiency: 0.24,
        support: 0.14,
        breadth: 0.09,
        volume: 0.17,
        star: 0.36,
      },
      volumeMix: { usage: 0.58, event: 0.42 },
      volumeScoreBlend: { normalized: 0.675, raw: 0.325 },
      balancedBonus: 2,
      specialistCap: { maxSupport: 0.24, cap: 96 },
      smallSampleCaps: [{ maxUsage: 1, cap: 92 }],
    },
    PlayerSplitStatLine: {
      categoryBlend: { raw: 0.6, rate: 0.4 },
      weights: {
        efficiency: 0.24,
        support: 0.17,
        breadth: 0.13,
        volume: 0.18,
        star: 0.28,
      },
      volumeMix: { usage: 0.7, event: 0.3 },
      balancedBonus: 4,
      specialistCap: { maxSupport: 0.32, cap: 90 },
      smallSampleCaps: [{ maxUsageExclusive: 3, cap: 87 }],
    },
    PlayerTotalStatLine: {
      categoryBlend: { raw: 0.58, rate: 0.42 },
      weights: {
        efficiency: 0.24,
        support: 0.14,
        breadth: 0.1,
        volume: 0.14,
        star: 0.38,
      },
      volumeMix: { usage: 0.68, event: 0.32 },
      balancedBonus: 5,
      specialistCap: { maxSupport: 0.3, cap: 88 },
      smallSampleCaps: [{ maxUsageExclusive: 6, cap: 86 }],
    },
    PlayerNHL: {
      categoryBlend: { raw: 0.55, rate: 0.45 },
      weights: {
        efficiency: 0.045,
        support: 0.04,
        breadth: 0.01,
        volume: 0.005,
        star: 0.18,
        core: 0.675,
      },
      volumeMix: { usage: 0.5, event: 0.5 },
      balancedBonus: 5,
      specialistCap: { maxSupport: 0.3, cap: 88 },
      smallSampleCaps: [{ maxUsageExclusive: 6, cap: 86 }],
    },
  };

  var GOALIE_LEVEL_PROFILES = {
    PlayerDayStatLine: {
      winBlend: { raw: 1, rate: 0 },
      weights: {
        efficiency: 0.53,
        support: 0.12,
        breadth: 0.07,
        workload: 0.18,
      },
      workloadMix: { GS: 0, SA: 0.18, SV: 0.34, TOI: 0.4 },
      balancedBonus: 0,
      specialistCap: null,
      smallSampleCap: null,
    },
    PlayerWeekStatLine: {
      winBlend: { raw: 1, rate: 0 },
      weights: {
        efficiency: 0.5,
        support: 0.2,
        breadth: 0.15,
        workload: 0.225,
      },
      workloadMix: { GS: 0.25, SA: 0.2, SV: 0.3, TOI: 0.45 },
      balancedBonus: 2,
      specialistCap: null,
      smallSampleCap: null,
    },
    PlayerSplitStatLine: {
      winBlend: { raw: 0.75, rate: 0.25 },
      weights: {
        efficiency: 0.29,
        support: 0.18,
        breadth: 0.17,
        workload: 0.36,
      },
      workloadMix: { GS: 0.7, SA: 0.12, SV: 0.08, TOI: 0.1 },
      balancedBonus: 4,
      specialistCap: { type: "support", maxSupport: 0.4, cap: 88 },
      smallSampleCap: { maxUsageExclusive: 3, cap: 84 },
    },
    PlayerTotalStatLine: {
      winBlend: { raw: 0.85, rate: 0.15 },
      weights: {
        efficiency: 0.24,
        support: 0.17,
        breadth: 0.17,
        workload: 0.42,
      },
      workloadMix: { GS: 0.8, SA: 0.08, SV: 0.07, TOI: 0.05 },
      balancedBonus: 5,
      specialistCap: { type: "support", maxSupport: 0.45, cap: 84 },
      smallSampleCap: { maxUsageExclusive: 8, cap: 82 },
    },
    PlayerNHL: {
      winBlend: { raw: 0.8, rate: 0.2 },
      weights: {
        efficiency: 0.24,
        support: 0.17,
        breadth: 0.17,
        workload: 0.42,
      },
      workloadMix: { GS: 0.8, SA: 0.08, SV: 0.07, TOI: 0.05 },
      balancedBonus: 5,
      specialistCap: { type: "support", maxSupport: 0.45, cap: 84 },
      smallSampleCap: { maxUsageExclusive: 8, cap: 82 },
    },
  };

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
    if (row.gshlTeamIds !== undefined) return "PlayerTotalStatLine";
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
      normalizedSheetName === "PlayerNHL"
    );
  }

  function isFullSeasonPlayerSheet(sheetName) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    return (
      normalizedSheetName === "PlayerSplitStatLine" ||
      normalizedSheetName === "PlayerTotalStatLine" ||
      normalizedSheetName === "PlayerNHL"
    );
  }

  function isSeasonTypeScopedPlayerAggregateSheet(sheetName) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    return (
      normalizedSheetName === "PlayerSplitStatLine" ||
      normalizedSheetName === "PlayerTotalStatLine"
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
        normalizedSheetName === "PlayerTotalStatLine"
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

  function buildSkaterDistributions(rows, categories, sheetName, posGroup) {
    var distributionLimit = getAggregateDistributionLimit(
      sheetName,
      posGroup,
      getAggregateSeasonTypeKey(rows && rows[0]),
    );
    var scoreMode = getAggregateCategoryScoreMode(sheetName);
    var retainedShare = getRetainedRangeShare(sheetName, posGroup);
    var baselineRows =
      scoreMode === "retainedRange"
        ? getDayWeekBaselineRows(rows, sheetName, posGroup)
        : rows;
    var raw = {};
    var rate = {};
    var rawMax = {};
    var rawBest = {};
    var rawFloor = {};
    var rateMax = {};
    var rateBest = {};
    var rateFloor = {};
    categories.forEach(function (category) {
      raw[category] = limitDistribution(
        sortedValuesByGetter(baselineRows, function (row) {
          return getComparableCategoryValue(row, category, posGroup, sheetName);
        }),
        distributionLimit,
        isLowerBetterStat(category),
      );
      rawMax[category] = maxSortedValue(raw[category]);
      rawBest[category] = isLowerBetterStat(category)
        ? minSortedValue(raw[category])
        : rawMax[category];
      rawFloor[category] = getRetainedRangeFloorValue(
        raw[category],
        isLowerBetterStat(category),
        retainedShare,
      );
      rate[category] = limitDistribution(
        sortedValuesByGetter(baselineRows, function (row) {
          return getUsageRateValue(row, category, posGroup, sheetName);
        }),
        distributionLimit,
        isLowerBetterStat(category),
      );
      rateMax[category] = maxSortedValue(rate[category]);
      rateBest[category] = isLowerBetterStat(category)
        ? minSortedValue(rate[category])
        : rateMax[category];
      rateFloor[category] = getRetainedRangeFloorValue(
        rate[category],
        isLowerBetterStat(category),
        retainedShare,
      );
    });
    var usage = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableUsageValue(row, posGroup, sheetName);
      }),
      distributionLimit,
      false,
    );
    var rawUsage = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getUsageValue(row, posGroup, sheetName);
      }),
      distributionLimit,
      false,
    );
    var event = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableSkaterEventLoadValue(row, sheetName);
      }),
      distributionLimit,
      false,
    );
    var rawEvent = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getSkaterEventLoadValue(row);
      }),
      distributionLimit,
      false,
    );
    return {
      scoreMode: scoreMode,
      raw: raw,
      rate: rate,
      rawMax: rawMax,
      rawBest: rawBest,
      rawFloor: rawFloor,
      rateMax: rateMax,
      rateBest: rateBest,
      rateFloor: rateFloor,
      usage: usage,
      usageMax: maxSortedValue(usage),
      usageBest: maxSortedValue(usage),
      usageFloor: getRetainedRangeFloorValue(usage, false, retainedShare),
      rawUsage: rawUsage,
      rawUsageMax: maxSortedValue(rawUsage),
      rawUsageBest: maxSortedValue(rawUsage),
      rawUsageFloor: getRetainedRangeFloorValue(rawUsage, false, retainedShare),
      event: event,
      eventMax: maxSortedValue(event),
      eventBest: maxSortedValue(event),
      eventFloor: getRetainedRangeFloorValue(event, false, retainedShare),
      rawEvent: rawEvent,
      rawEventMax: maxSortedValue(rawEvent),
      rawEventBest: maxSortedValue(rawEvent),
      rawEventFloor: getRetainedRangeFloorValue(rawEvent, false, retainedShare),
    };
  }

  function computeSkaterCategoryParts(
    row,
    category,
    profile,
    distributions,
    sheetName,
  ) {
    var scoreMode = distributions.scoreMode || "distribution";
    var rawScore = computeAggregateCategoryScore(
      getComparableCategoryValue(row, category, PositionGroup.F, sheetName),
      distributions.raw[category],
      distributions.rawMax[category],
      isLowerBetterStat(category),
      scoreMode,
      distributions.rawFloor[category],
      distributions.rawBest[category],
    );
    var rateScore = profile.categoryBlend.rate
      ? computeAggregateCategoryScore(
          getUsageRateValue(row, category, PositionGroup.F, sheetName),
          distributions.rate[category],
          distributions.rateMax[category],
          isLowerBetterStat(category),
          scoreMode,
          distributions.rateFloor[category],
          distributions.rateBest[category],
        )
      : rawScore;
    rawScore = clampCategoryScore(rawScore, sheetName);
    rateScore = clampCategoryScore(rateScore, sheetName);
    var blendedScore =
      profile.categoryBlend.raw * rawScore +
      profile.categoryBlend.rate * rateScore;
    blendedScore = clampCategoryScore(blendedScore, sheetName);
    return {
      rawScore: rawScore,
      rateScore: rateScore,
      blendedScore: blendedScore,
    };
  }

  function computeSkaterCategoryScore(
    row,
    category,
    profile,
    distributions,
    sheetName,
  ) {
    return computeSkaterCategoryParts(
      row,
      category,
      profile,
      distributions,
      sheetName,
    ).blendedScore;
  }

  function computeSkaterVolumeScore(row, profile, distributions, sheetName) {
    var blend = profile.volumeScoreBlend || { normalized: 1, raw: 0 };
    var scoreMode = distributions.scoreMode || "distribution";
    var normalizedUsageScore = computeAggregateCategoryScore(
      getComparableUsageValue(row, PositionGroup.F, sheetName),
      distributions.usage,
      distributions.usageMax,
      false,
      scoreMode,
      distributions.usageFloor,
      distributions.usageBest,
    );
    var normalizedEventScore = computeAggregateCategoryScore(
      getComparableSkaterEventLoadValue(row, sheetName),
      distributions.event,
      distributions.eventMax,
      false,
      scoreMode,
      distributions.eventFloor,
      distributions.eventBest,
    );
    var normalizedScore =
      profile.volumeMix.usage * normalizedUsageScore +
      profile.volumeMix.event * normalizedEventScore;

    if (!blend.raw) return normalizedScore;

    var rawUsageScore = computeAggregateCategoryScore(
      getUsageValue(row, PositionGroup.F, sheetName),
      distributions.rawUsage,
      distributions.rawUsageMax,
      false,
      scoreMode,
      distributions.rawUsageFloor,
      distributions.rawUsageBest,
    );
    var rawEventScore = computeAggregateCategoryScore(
      getSkaterEventLoadValue(row),
      distributions.rawEvent,
      distributions.rawEventMax,
      false,
      scoreMode,
      distributions.rawEventFloor,
      distributions.rawEventBest,
    );
    var rawScore =
      profile.volumeMix.usage * rawUsageScore +
      profile.volumeMix.event * rawEventScore;
    return blend.normalized * normalizedScore + blend.raw * rawScore;
  }

  function applySkaterSpecialistCap(
    score,
    profile,
    supportScore,
    breadthScore,
  ) {
    var cap = profile.specialistCap;
    if (!cap) return score;
    if (
      cap.maxBreadth !== undefined &&
      supportScore < cap.maxSupport &&
      breadthScore < cap.maxBreadth
    ) {
      return Math.min(score, cap.cap);
    }
    if (cap.maxBreadth === undefined && supportScore < cap.maxSupport) {
      return Math.min(score, cap.cap);
    }
    return score;
  }

  function applySkaterSmallSampleCaps(score, row, profile, sheetName) {
    var usage = getUsageValue(row, PositionGroup.F, sheetName);
    var caps = profile.smallSampleCaps || [];
    for (var i = 0; i < caps.length; i++) {
      var rule = caps[i];
      if (rule.maxUsage !== undefined && usage <= rule.maxUsage) {
        score = Math.min(score, rule.cap);
      }
      if (
        rule.maxUsageExclusive !== undefined &&
        usage < rule.maxUsageExclusive
      ) {
        score = Math.min(score, rule.cap);
      }
    }
    return score;
  }

  function maybeApplyBalancedBonus(
    score,
    profile,
    supportScore,
    breadthScore,
    volumeOrWorkload,
  ) {
    if (!profile.balancedBonus) return score;
    if (
      supportScore >= 0.75 &&
      breadthScore >= 0.6 &&
      volumeOrWorkload >= 0.55
    ) {
      return score + profile.balancedBonus;
    }
    return score;
  }

  function getSkaterDropScenarioWeights(sheetName) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    if (normalizedSheetName === "PlayerDayStatLine") {
      return [
        { dropCount: 3, weight: 0.5 },
        { dropCount: 2, weight: 0.35 },
        { dropCount: 1, weight: 0.1 },
        { dropCount: 0, weight: 0.05 },
      ];
    }
    if (normalizedSheetName === "PlayerWeekStatLine") {
      return [
        { dropCount: 3, weight: 0.25 },
        { dropCount: 2, weight: 0.45 },
        { dropCount: 1, weight: 0.2 },
        { dropCount: 0, weight: 0.1 },
      ];
    }
    return [{ dropCount: 0, weight: 1 }];
  }

  function splitSkaterCategoryEntriesByDropCount(entries, dropCount) {
    var list = (entries || []).slice();
    if (!dropCount || list.length <= 1) {
      return { kept: list, dropped: [] };
    }

    var maxDrop = Math.max(0, Math.min(dropCount, list.length - 1));
    if (!maxDrop) {
      return { kept: list, dropped: [] };
    }

    var byWeakest = list.slice().sort(function (a, b) {
      var left = (Number(a && a.score) || 0) * (Number(a && a.weight) || 0);
      var right = (Number(b && b.score) || 0) * (Number(b && b.weight) || 0);
      if (left !== right) return left - right;
      return (Number(a && a.score) || 0) - (Number(b && b.score) || 0);
    });
    var droppedKeys = {};
    byWeakest.slice(0, maxDrop).forEach(function (entry) {
      if (!entry || !entry.category) return;
      droppedKeys[entry.category] = true;
    });

    return {
      kept: list.filter(function (entry) {
        return !droppedKeys[entry.category];
      }),
      dropped: list.filter(function (entry) {
        return !!droppedKeys[entry.category];
      }),
    };
  }

  function buildSkaterScenarioMetrics(entries, sheetName, dropCount) {
    var retainedCategoryGroups = splitSkaterCategoryEntriesByDropCount(
      entries,
      dropCount,
    );
    var retainedCategoryEntries = retainedCategoryGroups.kept;
    var efficiencyScore =
      normalizeSheetName(sheetName) === "PlayerNHL"
        ? computeWeightedScoreAverage(
            getNhlBreadthEntries(retainedCategoryEntries),
          )
        : computeWeightedScoreAverage(retainedCategoryEntries);
    var supportScore = computeWeightedTopAverage(retainedCategoryEntries, 1, 4);
    var breadthEntries =
      normalizeSheetName(sheetName) === "PlayerNHL"
        ? getNhlBreadthEntries(retainedCategoryEntries)
        : retainedCategoryEntries.slice(
            0,
            Math.min(5, retainedCategoryEntries.length || 0),
          );
    var breadthScore = computeBreadthScore(
      breadthEntries.map(function (entry) {
        return entry.score;
      }),
      breadthEntries.length,
    );
    var starScore = computeWeightedTopAverage(
      retainedCategoryEntries,
      0,
      Math.min(3, retainedCategoryEntries.length || 0),
    );
    var coreScore =
      normalizeSheetName(sheetName) === "PlayerNHL"
        ? computePlayerNhlCoreScore(retainedCategoryEntries)
        : 0;

    return {
      retainedCategoryEntries: retainedCategoryEntries,
      droppedCategoryEntries: retainedCategoryGroups.dropped,
      efficiencyScore: efficiencyScore,
      supportScore: supportScore,
      breadthScore: breadthScore,
      starScore: starScore,
      coreScore: coreScore,
    };
  }

  function rankSkaterGroup(rows, poolRows, sheetName, outputField, options) {
    var seasonId = rows[0] && rows[0].seasonId;
    var categories = getRatingSkaterCategories(seasonId, sheetName);
    var profile = getSkaterProfile(sheetName);
    var posGroup = normalizePosGroup(rows[0] && rows[0].posGroup, rows[0]);
    var categoryWeights = getSkaterCategoryWeights(
      sheetName,
      posGroup,
      categories,
    );
    var validPoolRows = (poolRows || []).filter(function (row) {
      return hasMeaningfulPlayerVolume(row, PositionGroup.F, sheetName);
    });
    var distributions = buildSkaterDistributions(
      validPoolRows,
      categories,
      sheetName,
      posGroup,
    );

    rows.forEach(function (row) {
      if (
        !hasMeaningfulPlayerVolume(row, PositionGroup.F, sheetName) &&
        normalizeSheetName(sheetName) !== "PlayerNHL"
      ) {
        row[outputField] = "";
        row.Rating = outputField === "Rating" ? "" : row.Rating;
        return;
      }

      var categoryEntries = categories.map(function (category) {
        var categoryValue = toNumber(row && row[category]);
        var categoryParts = computeSkaterCategoryParts(
          row,
          category,
          profile,
          distributions,
          sheetName,
        );
        var emphasizedScore = applySkaterTalentCategoryEmphasis(
          sheetName,
          posGroup,
          category,
          categoryParts.blendedScore,
        );
        return {
          category: category,
          score: emphasizedScore,
          weight: categoryWeights[category] || 1,
          rawScore: categoryParts.rawScore,
          rateScore: categoryParts.rateScore,
          blendedScore: categoryParts.blendedScore,
          seasonValueScore:
            normalizeSheetName(sheetName) === "PlayerNHL"
              ? computePlayerNhlSeasonValueScore(
                  categoryValue,
                  distributions.raw[category],
                  category,
                  posGroup,
                )
              : 0,
          value: categoryValue,
          perGameValue: getUsageRateValue(
            row,
            category,
            PositionGroup.F,
            sheetName,
          ),
        };
      });
      var volumeScore = computeSkaterVolumeScore(
        row,
        profile,
        distributions,
        sheetName,
      );
      var weights = profile.weights;
      var scoreScale = getScoreScale(sheetName);
      var scenarioWeights = getSkaterDropScenarioWeights(sheetName);
      var droppedCategoryMap = {};
      var scenarioDebug = [];
      var blendedComponents = {
        efficiency: 0,
        support: 0,
        breadth: 0,
        star: 0,
        core: 0,
      };
      var score = scenarioWeights.reduce(function (sum, scenario) {
        var metrics = buildSkaterScenarioMetrics(
          categoryEntries,
          sheetName,
          scenario.dropCount,
        );
        metrics.droppedCategoryEntries.forEach(function (entry) {
          if (!entry || !entry.category) return;
          if (!droppedCategoryMap[entry.category]) {
            droppedCategoryMap[entry.category] = [];
          }
          droppedCategoryMap[entry.category].push(scenario.dropCount);
        });

        blendedComponents.efficiency +=
          scenario.weight * metrics.efficiencyScore;
        blendedComponents.support += scenario.weight * metrics.supportScore;
        blendedComponents.breadth += scenario.weight * metrics.breadthScore;
        blendedComponents.star += scenario.weight * metrics.starScore;
        blendedComponents.core += scenario.weight * metrics.coreScore;

        var scenarioScore =
          scoreScale *
          (weights.efficiency * metrics.efficiencyScore +
            weights.support * metrics.supportScore +
            weights.breadth * metrics.breadthScore +
            weights.volume * volumeScore +
            (weights.star || 0) * metrics.starScore +
            (weights.core || 0) * metrics.coreScore);

        scenarioScore = maybeApplyBalancedBonus(
          scenarioScore,
          profile,
          metrics.supportScore,
          metrics.breadthScore,
          volumeScore,
        );
        scenarioScore = applySkaterSpecialistCap(
          scenarioScore,
          profile,
          metrics.supportScore,
          metrics.breadthScore,
        );
        scenarioScore = applySkaterSmallSampleCaps(
          scenarioScore,
          row,
          profile,
          sheetName,
        );

        if (options && options.includeBreakdown) {
          scenarioDebug.push({
            dropCount: scenario.dropCount,
            weight: scenario.weight,
            keptCategories: metrics.retainedCategoryEntries.map(
              function (entry) {
                return entry.category;
              },
            ),
            droppedCategories: metrics.droppedCategoryEntries.map(
              function (entry) {
                return entry.category;
              },
            ),
            components: {
              efficiency: roundScore(metrics.efficiencyScore),
              support: roundScore(metrics.supportScore),
              breadth: roundScore(metrics.breadthScore),
              volume: roundScore(volumeScore),
              star: roundScore(metrics.starScore),
              core: roundScore(metrics.coreScore),
            },
            score: roundScore(scenarioScore),
          });
        }

        return sum + scenario.weight * scenarioScore;
      }, 0);
      score = applyAggregateSheetCalibration(
        score,
        sheetName,
        normalizePosGroup(row && row.posGroup, row),
      );

      row[outputField] = finalizeAggregateScore(score, sheetName);

      if (options && options.includeBreakdown) {
        row.__ratingDebug = {
          sheetName: normalizeSheetName(sheetName),
          posGroup: posGroup,
          categories: categoryEntries.map(function (entry) {
            return {
              category: entry.category,
              droppedScenarios: droppedCategoryMap[entry.category] || [],
              value: entry.value,
              comparableValue: roundScore(
                getComparableCategoryValue(
                  row,
                  entry.category,
                  PositionGroup.F,
                  sheetName,
                ),
              ),
              perGameValue: roundScore(entry.perGameValue),
              rawScore: roundScore(entry.rawScore),
              rateScore: roundScore(entry.rateScore),
              blendedScore: roundScore(entry.blendedScore),
              emphasizedScore: roundScore(entry.score),
              seasonValueScore: roundScore(entry.seasonValueScore || 0),
              weight: entry.weight,
              weightedScore: roundScore(
                (Number(entry.score) || 0) * (Number(entry.weight) || 0),
              ),
            };
          }),
          components: {
            efficiency: roundScore(blendedComponents.efficiency),
            support: roundScore(blendedComponents.support),
            breadth: roundScore(blendedComponents.breadth),
            volume: roundScore(volumeScore),
            star: roundScore(blendedComponents.star),
            core: roundScore(blendedComponents.core),
          },
          weights: {
            efficiency: weights.efficiency || 0,
            support: weights.support || 0,
            breadth: weights.breadth || 0,
            volume: weights.volume || 0,
            star: weights.star || 0,
            core: weights.core || 0,
          },
          scenarioBlend: scenarioDebug,
          usageValue: roundScore(
            getUsageValue(row, PositionGroup.F, sheetName),
          ),
          comparableUsageValue: roundScore(
            getComparableUsageValue(row, PositionGroup.F, sheetName),
          ),
          eventLoadValue: roundScore(getSkaterEventLoadValue(row)),
          comparableEventLoadValue: roundScore(
            getComparableSkaterEventLoadValue(row, sheetName),
          ),
          finalScore: row[outputField],
        };
      }
    });
  }

  function buildGoalieDistributions(rows, sheetName) {
    var distributionLimit = getAggregateDistributionLimit(
      sheetName,
      PositionGroup.G,
      getAggregateSeasonTypeKey(rows && rows[0]),
    );
    var scoreMode = getAggregateCategoryScoreMode(sheetName);
    var retainedShare = getRetainedRangeShare(sheetName, PositionGroup.G);
    var baselineRows =
      scoreMode === "retainedRange"
        ? getDayWeekBaselineRows(rows, sheetName, PositionGroup.G)
        : rows;
    var rawW = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableCategoryValue(row, "W", PositionGroup.G, sheetName);
      }),
      distributionLimit,
      false,
    );
    var rawGaa = limitDistribution(
      sortedValues(baselineRows, "GAA"),
      distributionLimit,
      true,
    );
    var rawSvp = limitDistribution(
      sortedValues(baselineRows, "SVP"),
      distributionLimit,
      false,
    );
    var rateW = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getUsageRateValue(row, "W", PositionGroup.G, sheetName);
      }),
      distributionLimit,
      false,
    );
    var gs = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableUsageValue(row, PositionGroup.G, sheetName);
      }),
      distributionLimit,
      false,
    );
    var sa = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableCategoryValue(
          row,
          "SA",
          PositionGroup.G,
          sheetName,
        );
      }),
      distributionLimit,
      false,
    );
    var ga = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableCategoryValue(
          row,
          "GA",
          PositionGroup.G,
          sheetName,
        );
      }),
      distributionLimit,
      true,
    );
    var sv = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableCategoryValue(
          row,
          "SV",
          PositionGroup.G,
          sheetName,
        );
      }),
      distributionLimit,
      false,
    );
    var toi = limitDistribution(
      sortedValuesByGetter(baselineRows, function (row) {
        return getComparableCategoryValue(
          row,
          "TOI",
          PositionGroup.G,
          sheetName,
        );
      }),
      distributionLimit,
      false,
    );
    return {
      scoreMode: scoreMode,
      raw: {
        W: rawW,
        GAA: rawGaa,
        SVP: rawSvp,
      },
      rawMax: {
        W: maxSortedValue(rawW),
        GAA: maxSortedValue(rawGaa),
        SVP: maxSortedValue(rawSvp),
      },
      rawBest: {
        W: maxSortedValue(rawW),
        GAA: minSortedValue(rawGaa),
        SVP: maxSortedValue(rawSvp),
      },
      rawFloor: {
        W: getRetainedRangeFloorValue(rawW, false, retainedShare),
        GAA: getRetainedRangeFloorValue(rawGaa, true, retainedShare),
        SVP: getRetainedRangeFloorValue(rawSvp, false, retainedShare),
      },
      rate: {
        W: rateW,
      },
      rateMax: {
        W: maxSortedValue(rateW),
      },
      rateBest: {
        W: maxSortedValue(rateW),
      },
      rateFloor: {
        W: getRetainedRangeFloorValue(rateW, false, retainedShare),
      },
      GS: gs,
      GSMax: maxSortedValue(gs),
      GSBest: maxSortedValue(gs),
      GSFloor: getRetainedRangeFloorValue(gs, false, retainedShare),
      SA: sa,
      SAMax: maxSortedValue(sa),
      SABest: maxSortedValue(sa),
      SAFloor: getRetainedRangeFloorValue(sa, false, retainedShare),
      GA: ga,
      GAMax: maxSortedValue(ga),
      GABest: minSortedValue(ga),
      GAFloor: getRetainedRangeFloorValue(ga, true, retainedShare),
      SV: sv,
      SVMax: maxSortedValue(sv),
      SVBest: maxSortedValue(sv),
      SVFloor: getRetainedRangeFloorValue(sv, false, retainedShare),
      TOI: toi,
      TOIMax: maxSortedValue(toi),
      TOIBest: maxSortedValue(toi),
      TOIFloor: getRetainedRangeFloorValue(toi, false, retainedShare),
    };
  }

  function computeGoalieWinScore(row, profile, distributions, sheetName) {
    var scoreMode = distributions.scoreMode || "distribution";
    var rawScore = computeAggregateCategoryScore(
      getComparableCategoryValue(row, "W", PositionGroup.G, sheetName),
      distributions.raw.W,
      distributions.rawMax.W,
      false,
      scoreMode,
      distributions.rawFloor.W,
      distributions.rawBest.W,
    );
    rawScore = clampCategoryScore(rawScore, sheetName);
    if (!profile.winBlend.rate) return rawScore;
    var rateScore = computeAggregateCategoryScore(
      getUsageRateValue(row, "W", PositionGroup.G, sheetName),
      distributions.rate.W,
      distributions.rateMax.W,
      false,
      scoreMode,
      distributions.rateFloor.W,
      distributions.rateBest.W,
    );
    rateScore = clampCategoryScore(rateScore, sheetName);
    return clampCategoryScore(
      profile.winBlend.raw * rawScore + profile.winBlend.rate * rateScore,
      sheetName,
    );
  }

  function computeGoalieWorkloadScore(row, profile, distributions, sheetName) {
    var mix = (profile && profile.workloadMix) || {};
    var scoreMode = distributions.scoreMode || "distribution";
    var score = 0;
    if (mix.GS) {
      score +=
        mix.GS *
        computeAggregateCategoryScore(
          getComparableUsageValue(row, PositionGroup.G, sheetName),
          distributions.GS,
          distributions.GSMax,
          false,
          scoreMode,
          distributions.GSFloor,
          distributions.GSBest,
        );
    }
    if (mix.SA) {
      score +=
        mix.SA *
        computeAggregateCategoryScore(
          getComparableCategoryValue(row, "SA", PositionGroup.G, sheetName),
          distributions.SA,
          distributions.SAMax,
          false,
          scoreMode,
          distributions.SAFloor,
          distributions.SABest,
        );
    }
    if (mix.GA) {
      score +=
        mix.GA *
        computeAggregateCategoryScore(
          getComparableCategoryValue(row, "GA", PositionGroup.G, sheetName),
          distributions.GA,
          distributions.GAMax,
          true,
          scoreMode,
          distributions.GAFloor,
          distributions.GABest,
        );
    }
    if (mix.SV) {
      score +=
        mix.SV *
        computeAggregateCategoryScore(
          getComparableCategoryValue(row, "SV", PositionGroup.G, sheetName),
          distributions.SV,
          distributions.SVMax,
          false,
          scoreMode,
          distributions.SVFloor,
          distributions.SVBest,
        );
    }
    if (mix.TOI) {
      score +=
        mix.TOI *
        computeAggregateCategoryScore(
          getComparableCategoryValue(row, "TOI", PositionGroup.G, sheetName),
          distributions.TOI,
          distributions.TOIMax,
          false,
          scoreMode,
          distributions.TOIFloor,
          distributions.TOIBest,
        );
    }
    return score;
  }

  function applyGoalieSpecialistCap(
    score,
    profile,
    categoryScores,
    supportScore,
  ) {
    var cap = profile.specialistCap;
    if (!cap) return score;
    if (cap.type === "singleElite") {
      var eliteCount = categoryScores.filter(function (value) {
        return value >= cap.threshold;
      }).length;
      if (eliteCount <= 1) return Math.min(score, cap.cap);
      return score;
    }
    if (cap.type === "support" && supportScore < cap.maxSupport) {
      return Math.min(score, cap.cap);
    }
    return score;
  }

  function applyGoalieSmallSampleCap(
    score,
    row,
    profile,
    workloadScore,
    sheetName,
  ) {
    var rule = profile.smallSampleCap;
    if (!rule) return score;
    var usage = getUsageValue(row, PositionGroup.G, sheetName);
    if (rule.maxUsage !== undefined && usage <= rule.maxUsage) {
      if (rule.minWorkload === undefined || workloadScore < rule.minWorkload) {
        return Math.min(score, rule.cap);
      }
    }
    if (
      rule.maxUsageExclusive !== undefined &&
      usage < rule.maxUsageExclusive
    ) {
      return Math.min(score, rule.cap);
    }
    return score;
  }

  function applyGoalieToiCap(score, row) {
    var toi = getGoalieToiValue(row);
    if (toi <= GOALIE_MINIMUM_TOI_FOR_RATING) return 0;
    if (toi >= GOALIE_NEGLIGIBLE_TOI_THRESHOLD) return score;

    var toiCap =
      GOALIE_NEGLIGIBLE_TOI_MAX_SCORE *
      clip(toi / GOALIE_NEGLIGIBLE_TOI_THRESHOLD, 0, 1);
    return Math.min(score, toiCap);
  }

  function rankGoalieGroup(rows, poolRows, sheetName, outputField) {
    var profile = getGoalieProfile(sheetName);
    var validPoolRows = (poolRows || []).filter(function (row) {
      return hasMeaningfulPlayerVolume(row, PositionGroup.G, sheetName);
    });
    var distributions = buildGoalieDistributions(validPoolRows, sheetName);

    rows.forEach(function (row) {
      if (
        !hasMeaningfulPlayerVolume(row, PositionGroup.G, sheetName) &&
        normalizeSheetName(sheetName) !== "PlayerNHL"
      ) {
        row[outputField] = "";
        return;
      }

      if (getGoalieToiValue(row) <= GOALIE_MINIMUM_TOI_FOR_RATING) {
        row[outputField] = 0;
        return;
      }

      var scoreMode = distributions.scoreMode || "distribution";
      var coreScores = {
        W: computeGoalieWinScore(row, profile, distributions, sheetName),
        GAA: clampCategoryScore(
          computeAggregateCategoryScore(
            toNumber(row && row.GAA),
            distributions.raw.GAA,
            distributions.rawMax.GAA,
            true,
            scoreMode,
            distributions.rawFloor.GAA,
            distributions.rawBest.GAA,
          ),
          sheetName,
        ),
        SVP: clampCategoryScore(
          computeAggregateCategoryScore(
            toNumber(row && row.SVP),
            distributions.raw.SVP,
            distributions.rawMax.SVP,
            false,
            scoreMode,
            distributions.rawFloor.SVP,
            distributions.rawBest.SVP,
          ),
          sheetName,
        ),
      };
      var categoryValues = [coreScores.W, coreScores.GAA, coreScores.SVP];
      var efficiencyScore = weightedAverage(coreScores, {
        W: 0.3,
        GAA: 0.35,
        SVP: 0.35,
      });
      var supportScore = computeSupportScore(categoryValues, 2);
      var breadthScore = computeBreadthScore(
        categoryValues,
        categoryValues.length,
      );
      var workloadScore = computeGoalieWorkloadScore(
        row,
        profile,
        distributions,
        sheetName,
      );
      var weights = profile.weights;
      var scoreScale = getScoreScale(sheetName);
      var score =
        scoreScale *
        (weights.efficiency * efficiencyScore +
          weights.support * supportScore +
          weights.breadth * breadthScore +
          weights.workload * workloadScore);

      score = maybeApplyBalancedBonus(
        score,
        profile,
        supportScore,
        breadthScore,
        workloadScore,
      );
      score = applyGoalieSpecialistCap(
        score,
        profile,
        categoryValues,
        supportScore,
      );
      score = applyGoalieSmallSampleCap(
        score,
        row,
        profile,
        workloadScore,
        sheetName,
      );
      score = applyAggregateSheetCalibration(
        score,
        sheetName,
        normalizePosGroup(row && row.posGroup, row),
      );
      score = applyGoalieToiCap(score, row);

      row[outputField] = finalizeAggregateScore(score, sheetName);
    });
  }

  function rankTeamRows(rows, outputField) {
    var categories = getMatchupCategoriesForSeason(rows[0] && rows[0].seasonId);
    var distributions = {};
    categories.forEach(function (category) {
      distributions[category] = sortedValues(rows, category);
    });
    rows.forEach(function (row) {
      var scores = categories.map(function (category) {
        return percentileRank(
          toNumber(row[category]),
          distributions[category],
          isLowerBetterStat(category),
        );
      });
      row[outputField] = roundScore(clip(125 * average(scores), 0, 125));
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
      targetRows.forEach(function (row) {
        var result = rankPerformance(row, { sheetName: sheetName });
        row[outputField] =
          result && result.score !== undefined ? result.score : "";
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
      rawComposite: score === "" ? 0 : Number(score) / 125,
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
