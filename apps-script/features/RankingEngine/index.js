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
  var LOWER_BETTER = { GAA: true };
  var seasonCategoryCache = {};

  var SKATER_DAY_CATEGORIES = ["G", "A", "P", "PPP", "SOG", "HIT", "BLK"];
  var SKATER_DAY_FALLBACK_MEANS = {
    F: { G: 0.26, A: 0.43, P: 0.7, PPP: 0.21, SOG: 2.144, HIT: 0.91, BLK: 0.75 },
    D: { G: 0.14, A: 0.36, P: 0.5, PPP: 0.16, SOG: 1.7, HIT: 1.05, BLK: 1.35 },
  };
  var SKATER_DAY_IMPACT_WEIGHTS = [1, 0.85, 0.7, 0.45, 0.3, 0.2, 0.15];
  var SKATER_DAY_IMPACT_DENOMINATOR = 2.8;
  var SKATER_DAY_SCORE_CURVE = 1.8;

  var SMALL_COHORT_THRESHOLDS = {
    skater: 15,
    goalie: 8,
  };
  var PLAYER_NHL_DISTRIBUTION_LIMITS = {
    F: 240,
    D: 100,
    G: 45,
  };

  var SKATER_LEVEL_PROFILES = {
    PlayerDayStatLine: {
      categoryBlend: { raw: 1, rate: 0 },
      weights: { efficiency: 0.38, support: 0.27, breadth: 0.2, volume: 0.15 },
      volumeMix: { usage: 0, event: 1 },
      balancedBonus: 0,
      specialistCap: { maxSupport: 0.3, maxBreadth: 0.25, cap: 94 },
      smallSampleCaps: [],
    },
    PlayerWeekStatLine: {
      categoryBlend: { raw: 0.65, rate: 0.35 },
      weights: { efficiency: 0.22, support: 0.2, breadth: 0.16, volume: 0.28, star: 0.14 },
      volumeMix: { usage: 0.75, event: 0.25 },
      balancedBonus: 3,
      specialistCap: { maxSupport: 0.3, cap: 94 },
      smallSampleCaps: [{ maxUsage: 1, cap: 86 }],
    },
    PlayerSplitStatLine: {
      categoryBlend: { raw: 0.75, rate: 0.25 },
      weights: { efficiency: 0.18, support: 0.18, breadth: 0.16, volume: 0.3, star: 0.18 },
      volumeMix: { usage: 0.85, event: 0.15 },
      balancedBonus: 4,
      specialistCap: { maxSupport: 0.32, cap: 90 },
      smallSampleCaps: [{ maxUsageExclusive: 5, cap: 84 }],
    },
    PlayerTotalStatLine: {
      categoryBlend: { raw: 0.85, rate: 0.15 },
      weights: { efficiency: 0.12, support: 0.16, breadth: 0.12, volume: 0.34, star: 0.26 },
      volumeMix: { usage: 0.9, event: 0.1 },
      balancedBonus: 5,
      specialistCap: { maxSupport: 0.3, cap: 88 },
      smallSampleCaps: [{ maxUsageExclusive: 12, cap: 82 }],
    },
    PlayerNHL: {
      categoryBlend: { raw: 0.85, rate: 0.15 },
      weights: {
        efficiency: 0.01,
        support: 0.03,
        breadth: 0.01,
        volume: 0.02,
        star: 0.11,
        core: 0.82,
      },
      volumeMix: { usage: 0.9, event: 0.1 },
      balancedBonus: 5,
      specialistCap: { maxSupport: 0.3, cap: 88 },
      smallSampleCaps: [{ maxUsageExclusive: 12, cap: 82 }],
    },
  };

  var GOALIE_LEVEL_PROFILES = {
    PlayerDayStatLine: {
      winBlend: { raw: 1, rate: 0 },
      weights: { efficiency: 0.42, support: 0.18, breadth: 0.12, workload: 0.28 },
      workloadMix: { GS: 0, SA: 0.45, SV: 0.35, TOI: 0.2 },
      balancedBonus: 0,
      specialistCap: null,
      smallSampleCap: null,
    },
    PlayerWeekStatLine: {
      winBlend: { raw: 0.65, rate: 0.35 },
      weights: { efficiency: 0.3, support: 0.17, breadth: 0.13, workload: 0.4 },
      workloadMix: { GS: 0.55, SA: 0.2, SV: 0.15, TOI: 0.1 },
      balancedBonus: 3,
      specialistCap: { type: "singleElite", threshold: 0.75, cap: 92 },
      smallSampleCap: { maxUsage: 1, minWorkload: 0.55, cap: 88 },
    },
    PlayerSplitStatLine: {
      winBlend: { raw: 0.75, rate: 0.25 },
      weights: { efficiency: 0.25, support: 0.17, breadth: 0.16, workload: 0.42 },
      workloadMix: { GS: 0.65, SA: 0.15, SV: 0.1, TOI: 0.1 },
      balancedBonus: 4,
      specialistCap: { type: "support", maxSupport: 0.4, cap: 88 },
      smallSampleCap: { maxUsageExclusive: 3, cap: 84 },
    },
    PlayerTotalStatLine: {
      winBlend: { raw: 0.85, rate: 0.15 },
      weights: { efficiency: 0.2, support: 0.16, breadth: 0.16, workload: 0.48 },
      workloadMix: { GS: 0.75, SA: 0.1, SV: 0.1, TOI: 0.05 },
      balancedBonus: 5,
      specialistCap: { type: "support", maxSupport: 0.45, cap: 84 },
      smallSampleCap: { maxUsageExclusive: 8, cap: 82 },
    },
    PlayerNHL: {
      winBlend: { raw: 0.85, rate: 0.15 },
      weights: { efficiency: 0.2, support: 0.16, breadth: 0.16, workload: 0.48 },
      workloadMix: { GS: 0.75, SA: 0.1, SV: 0.1, TOI: 0.05 },
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
    var raw = String(value || (row && (row.posGroup || row.POS_GROUP)) || "").toUpperCase();
    if (raw === "G") return PositionGroup.G;
    if (raw === "D") return PositionGroup.D;
    if (raw === "F") return PositionGroup.F;
    if (raw === "TEAM") return PositionGroup.TEAM;
    if (row && (row.gshlTeamId || row.teamId) && !row.playerId) return PositionGroup.TEAM;
    return PositionGroup.F;
  }

  function detectSheetName(row, options) {
    if (options && options.sheetName) return normalizeSheetName(options.sheetName);
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
    if (row.weekId) return row.playerId ? "PlayerWeekStatLine" : "TeamWeekStatLine";
    if (row.gshlTeamIds !== undefined) return "PlayerTotalStatLine";
    if (row.seasonType && row.playerId && row.gshlTeamId) return "PlayerSplitStatLine";
    if (row.seasonType && row.playerId) return "PlayerTotalStatLine";
    if (!row.playerId && (row.gshlTeamId || row.teamId)) return "TeamSeasonStatLine";
    return "PlayerDayStatLine";
  }

  function normalizeCategory(category) {
    var value = String(category || "").trim().toUpperCase();
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
    var seasonKey = seasonId === undefined || seasonId === null ? "" : String(seasonId);
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

  function getMatchupCategoriesForSeason(seasonId) {
    return getSkaterCategories(seasonId).concat(GOALIE_CORE_CATEGORIES);
  }

  function isLowerBetterStat(category) {
    return !!LOWER_BETTER[category];
  }

  function getOutputField(sheetName, options) {
    if (options && options.outputField) return options.outputField;
    return normalizeSheetName(sheetName) === "PlayerNHL" ? "seasonRating" : "Rating";
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

  function getPlayerNhlDistributionLimit(sheetName, posGroup) {
    if (normalizeSheetName(sheetName) !== "PlayerNHL") return 0;
    return PLAYER_NHL_DISTRIBUTION_LIMITS[posGroup] || 0;
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
    return normalizeSheetName(sheetName) === "PlayerNHL" ? 100 : 125;
  }

  function finalizeAggregateScore(score, sheetName) {
    var numeric = Number(score);
    if (!isFinite(numeric)) return 0;
    if (normalizeSheetName(sheetName) === "PlayerNHL") {
      return roundScore(Math.max(numeric, 0));
    }
    return roundScore(clip(numeric, 0, 125));
  }

  function applyAggregateSheetCalibration(score, sheetName, posGroup) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    var adjusted = Number(score);
    if (!isFinite(adjusted)) return 0;

    if (normalizedSheetName === "PlayerNHL") {
      adjusted = compressScoreAbove(adjusted, 100, 0.7);
      if (posGroup === PositionGroup.D) {
        adjusted += 2.25;
        adjusted *= 1.125;
      } else if (posGroup === PositionGroup.G) {
        adjusted += 3.5;
        adjusted *= 1.125;
        adjusted *= 0.995;
      }
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
    var gp = row && row.GP !== undefined && row.GP !== null ? String(row.GP).trim() : "";
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

  function getUsageRateValue(row, field, posGroup, sheetName) {
    var usage = getUsageValue(row, posGroup, sheetName);
    if (usage <= 0) return 0;
    return toNumber(row && row[field]) / usage;
  }

  function getSkaterEventLoadValue(row) {
    return 0.4 * toNumber(row && row.SOG) + 0.35 * toNumber(row && row.HIT) + 0.25 * toNumber(row && row.BLK);
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
    var depth = Math.max(1, Math.min(Number(targetDepth) || values.length, values.length));
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
    return 0.5 * (above60 / depth) + 0.3 * (above75 / depth) + 0.2 * (above90 / depth);
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
    var sorted = entries
      .slice()
      .sort(function (a, b) {
        return (Number(b && b.score) || 0) * (Number(b && b.weight) || 0) -
          (Number(a && a.score) || 0) * (Number(a && a.weight) || 0);
      });
    return computeWeightedScoreAverage(
      sorted.slice(skipCount || 0, (skipCount || 0) + (takeCount || sorted.length)),
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
    return entryMap[category] ? Number(entryMap[category].seasonValueScore) || 0 : 0;
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

  function computePlayerNhlSeasonValueScore(value, sortedValues, category, posGroup) {
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
    } else if (posGroup === PositionGroup.D && (category === "HIT" || category === "BLK")) {
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
    } else if (posGroup === PositionGroup.D && (category === "HIT" || category === "BLK")) {
      tailMax = 1.22;
    }

    return Math.max(baseScore, 1.12 + (tailMax - 1.12) * Math.pow(tailRatio, 0.72));
  }

  function computePlayerNhlCoreScore(entryMap, posGroup) {
    if (posGroup === PositionGroup.D) {
      return (
        0.2 * getEntryScore(entryMap, "P") +
        0.1 * getEntrySeasonValueScore(entryMap, "P") +
        0.1 * getEntryScore(entryMap, "HIT") +
        0.08 * getEntrySeasonValueScore(entryMap, "HIT") +
        0.1 * getEntryScore(entryMap, "BLK") +
        0.08 * getEntrySeasonValueScore(entryMap, "BLK") +
        0.08 * getEntryScore(entryMap, "G") +
        0.08 * getEntryScore(entryMap, "PPP") +
        0.1 * getEntryScore(entryMap, "A") +
        0.1 * getEntryScore(entryMap, "SOG")
      );
    }

    var forwardPointScore =
      0.42 * getEntryScore(entryMap, "P") +
      0.58 * getEntrySeasonValueScore(entryMap, "P");

    return (
      0.6 * forwardPointScore +
      0.12 * getEntryScore(entryMap, "G") +
      0.12 * getEntryScore(entryMap, "PPP") +
      0.08 * getEntryScore(entryMap, "A") +
      0.06 * getEntryScore(entryMap, "SOG") +
      0.01 * getEntryScore(entryMap, "HIT") +
      0.01 * getEntryScore(entryMap, "BLK")
    );
  }

  function applySkaterTalentCategoryEmphasis(sheetName, posGroup, category, score) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    var adjusted = Number(score);
    if (!isFinite(adjusted)) return 0;
    var maxScore = 1;

    if (normalizedSheetName === "PlayerNHL" && posGroup === PositionGroup.F) {
      maxScore = 1.18;
      if (category === "P") {
        if (adjusted > 0.68) adjusted += (adjusted - 0.68) * 1.05;
        if (adjusted > 0.82) adjusted += (adjusted - 0.82) * 1.55;
        if (adjusted > 0.92) adjusted += (adjusted - 0.92) * 1.9;
      } else if (category === "G" || category === "PPP") {
        maxScore = 1.12;
        if (adjusted > 0.72) adjusted += (adjusted - 0.72) * 0.52;
        if (adjusted > 0.88) adjusted += (adjusted - 0.88) * 0.62;
      } else if (category === "A" || category === "SOG") {
        maxScore = 1.08;
        if (adjusted > 0.76) adjusted += (adjusted - 0.76) * 0.28;
        if (adjusted > 0.9) adjusted += (adjusted - 0.9) * 0.34;
      }
    } else if (normalizedSheetName === "PlayerNHL" && posGroup === PositionGroup.D) {
      maxScore = 1.14;
      if (category === "P") {
        if (adjusted > 0.72) adjusted += (adjusted - 0.72) * 0.5;
        if (adjusted > 0.88) adjusted += (adjusted - 0.88) * 0.6;
      } else if (category === "HIT" || category === "BLK") {
        maxScore = 1.08;
        if (adjusted > 0.74) adjusted += (adjusted - 0.74) * 0.22;
      } else if (category === "G" || category === "PPP" || category === "A" || category === "SOG") {
        maxScore = 1.1;
        if (adjusted > 0.76) adjusted += (adjusted - 0.76) * 0.24;
        if (adjusted > 0.9) adjusted += (adjusted - 0.9) * 0.28;
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

    if (normalizedSheetName === "PlayerNHL" && posGroup === PositionGroup.F) {
      weights.G = 1.35;
      weights.A = 1.05;
      weights.P = 2.1;
      weights.PPP = 1.35;
      weights.SOG = 1.05;
      weights.HIT = 0.7;
      weights.BLK = 0.55;
    } else if (normalizedSheetName === "PlayerNHL" && posGroup === PositionGroup.D) {
      weights.G = 1.02;
      weights.A = 1.08;
      weights.P = 1.42;
      weights.PPP = 1.04;
      weights.SOG = 1.06;
      weights.HIT = 1.1;
      weights.BLK = 1.1;
    }

    return weights;
  }

  function getNhlBreadthEntries(categoryEntries) {
    return (categoryEntries || [])
      .slice()
      .sort(function (a, b) {
        return (Number(b && b.score) || 0) * (Number(b && b.weight) || 0) -
          (Number(a && a.score) || 0) * (Number(a && a.weight) || 0);
      })
      .slice(0, Math.min(5, (categoryEntries || []).length));
  }

  function getSkaterProfile(sheetName) {
    return SKATER_LEVEL_PROFILES[normalizeSheetName(sheetName)] || SKATER_LEVEL_PROFILES.PlayerTotalStatLine;
  }

  function getGoalieProfile(sheetName) {
    return GOALIE_LEVEL_PROFILES[normalizeSheetName(sheetName)] || GOALIE_LEVEL_PROFILES.PlayerTotalStatLine;
  }

  function buildPrimaryGroupKey(row, sheetName, posGroup) {
    var seasonId = row && row.seasonId !== undefined && row.seasonId !== null ? String(row.seasonId) : "";
    if (sheetName === "PlayerDayStatLine") {
      return [seasonId, row && row.date ? String(row.date) : "", posGroup].join("|");
    }
    if (sheetName === "PlayerWeekStatLine") {
      return [seasonId, row && row.weekId ? String(row.weekId) : "", posGroup].join("|");
    }
    if (sheetName === "PlayerSplitStatLine" || sheetName === "PlayerTotalStatLine") {
      return [seasonId, row && row.seasonType ? String(row.seasonType) : "", posGroup].join("|");
    }
    if (sheetName === "PlayerNHL") {
      return [seasonId, posGroup].join("|");
    }
    return [seasonId, posGroup].join("|");
  }

  function buildFallbackGroupKey(row, sheetName, posGroup) {
    var seasonId = row && row.seasonId !== undefined && row.seasonId !== null ? String(row.seasonId) : "";
    if (sheetName === "PlayerDayStatLine" || sheetName === "PlayerWeekStatLine") {
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
        return buildPrimaryGroupKey(row, sheetName, normalizePosGroup(row && row.posGroup, row));
      }),
      fallbackGroups: groupRowsByKey(rows, function (row) {
        return buildFallbackGroupKey(row, sheetName, normalizePosGroup(row && row.posGroup, row));
      }),
    };
  }

  function getPoolRowsForGroup(groupRows, sheetName, context, posGroup) {
    var threshold = posGroup === PositionGroup.G ? SMALL_COHORT_THRESHOLDS.goalie : SMALL_COHORT_THRESHOLDS.skater;
    var validPrimaryRows = (groupRows || []).filter(function (row) {
      return hasMeaningfulPlayerVolume(row, posGroup, sheetName);
    });
    if (validPrimaryRows.length >= threshold) return validPrimaryRows;

    var fallbackKey = buildFallbackGroupKey(groupRows[0], sheetName, posGroup);
    var fallbackRows = (context.fallbackGroups[fallbackKey] || []).filter(function (row) {
      return hasMeaningfulPlayerVolume(row, posGroup, sheetName);
    });
    return fallbackRows.length ? fallbackRows : validPrimaryRows;
  }

  function buildSkaterDistributions(rows, categories, sheetName, posGroup) {
    var distributionLimit = getPlayerNhlDistributionLimit(sheetName, posGroup);
    var raw = {};
    var rate = {};
    categories.forEach(function (category) {
      raw[category] = limitDistribution(
        sortedValues(rows, category),
        distributionLimit,
        isLowerBetterStat(category),
      );
      rate[category] = limitDistribution(
        sortedValuesByGetter(rows, function (row) {
          return getUsageRateValue(row, category, PositionGroup.F, sheetName);
        }),
        distributionLimit,
        isLowerBetterStat(category),
      );
    });
    return {
      raw: raw,
      rate: rate,
      usage: limitDistribution(
        sortedValuesByGetter(rows, function (row) {
          return getUsageValue(row, PositionGroup.F, sheetName);
        }),
        distributionLimit,
        false,
      ),
      event: limitDistribution(
        sortedValuesByGetter(rows, getSkaterEventLoadValue),
        distributionLimit,
        false,
      ),
    };
  }

  function computeSkaterCategoryParts(row, category, profile, distributions, sheetName) {
    var rawScore = percentileRank(
      toNumber(row && row[category]),
      distributions.raw[category],
      isLowerBetterStat(category),
    );
    var rateScore = profile.categoryBlend.rate
      ? percentileRank(
          getUsageRateValue(row, category, PositionGroup.F, sheetName),
          distributions.rate[category],
          isLowerBetterStat(category),
        )
      : rawScore;
    var blendedScore = profile.categoryBlend.raw * rawScore + profile.categoryBlend.rate * rateScore;
    return {
      rawScore: rawScore,
      rateScore: rateScore,
      blendedScore: blendedScore,
    };
  }

  function computeSkaterCategoryScore(row, category, profile, distributions, sheetName) {
    return computeSkaterCategoryParts(row, category, profile, distributions, sheetName).blendedScore;
  }

  function computeSkaterVolumeScore(row, profile, distributions, sheetName) {
    var usageScore = percentileRank(
      getUsageValue(row, PositionGroup.F, sheetName),
      distributions.usage,
      false,
    );
    var eventScore = percentileRank(getSkaterEventLoadValue(row), distributions.event, false);
    return profile.volumeMix.usage * usageScore + profile.volumeMix.event * eventScore;
  }

  function applySkaterSpecialistCap(score, profile, supportScore, breadthScore) {
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
      if (rule.maxUsageExclusive !== undefined && usage < rule.maxUsageExclusive) {
        score = Math.min(score, rule.cap);
      }
    }
    return score;
  }

  function maybeApplyBalancedBonus(score, profile, supportScore, breadthScore, volumeOrWorkload) {
    if (!profile.balancedBonus) return score;
    if (supportScore >= 0.75 && breadthScore >= 0.6 && volumeOrWorkload >= 0.55) {
      return score + profile.balancedBonus;
    }
    return score;
  }

  function rankSkaterGroup(rows, poolRows, sheetName, outputField, options) {
    var seasonId = rows[0] && rows[0].seasonId;
    var categories = getRatingSkaterCategories(seasonId, sheetName);
    var profile = getSkaterProfile(sheetName);
    var posGroup = normalizePosGroup(rows[0] && rows[0].posGroup, rows[0]);
    var categoryWeights = getSkaterCategoryWeights(sheetName, posGroup, categories);
    var validPoolRows = (poolRows || []).filter(function (row) {
      return hasMeaningfulPlayerVolume(row, PositionGroup.F, sheetName);
    });
    var distributions = buildSkaterDistributions(validPoolRows, categories, sheetName, posGroup);

    rows.forEach(function (row) {
      if (!hasMeaningfulPlayerVolume(row, PositionGroup.F, sheetName)) {
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
          perGameValue: getUsageRateValue(row, category, PositionGroup.F, sheetName),
        };
      });
      var categoryScores = categoryEntries.map(function (entry) {
        return entry.score;
      });
      var categoryEntryMap = buildCategoryEntryMap(categoryEntries);
      var efficiencyScore = computeWeightedScoreAverage(categoryEntries);
      var supportScore = computeWeightedTopAverage(categoryEntries, 1, 4);
      var breadthEntries =
        normalizeSheetName(sheetName) === "PlayerNHL"
          ? getNhlBreadthEntries(categoryEntries)
          : categoryEntries.slice(0, Math.min(5, categoryEntries.length || 0));
      var breadthScore = computeBreadthScore(
        breadthEntries.map(function (entry) {
          return entry.score;
        }),
        breadthEntries.length,
      );
      var volumeScore = computeSkaterVolumeScore(row, profile, distributions, sheetName);
      var starScore = computeWeightedTopAverage(
        categoryEntries,
        0,
        Math.min(3, categoryEntries.length || 0),
      );
      var coreScore =
        normalizeSheetName(sheetName) === "PlayerNHL"
          ? computePlayerNhlCoreScore(categoryEntryMap, posGroup)
          : 0;
      var weights = profile.weights;
      var scoreScale = getScoreScale(sheetName);
      var score =
        scoreScale *
        (weights.efficiency * efficiencyScore +
          weights.support * supportScore +
          weights.breadth * breadthScore +
          weights.volume * volumeScore +
          (weights.star || 0) * starScore +
          (weights.core || 0) * coreScore);

      score = maybeApplyBalancedBonus(score, profile, supportScore, breadthScore, volumeScore);
      score = applySkaterSpecialistCap(score, profile, supportScore, breadthScore);
      score = applySkaterSmallSampleCaps(score, row, profile, sheetName);
      score = applyAggregateSheetCalibration(score, sheetName, normalizePosGroup(row && row.posGroup, row));

      row[outputField] = finalizeAggregateScore(score, sheetName);

      if (options && options.includeBreakdown) {
        row.__ratingDebug = {
          sheetName: normalizeSheetName(sheetName),
          posGroup: posGroup,
          categories: categoryEntries.map(function (entry) {
            return {
              category: entry.category,
              value: entry.value,
              perGameValue: roundScore(entry.perGameValue),
              rawScore: roundScore(entry.rawScore),
              rateScore: roundScore(entry.rateScore),
              blendedScore: roundScore(entry.blendedScore),
              emphasizedScore: roundScore(entry.score),
              seasonValueScore: roundScore(entry.seasonValueScore || 0),
              weight: entry.weight,
              weightedScore: roundScore((Number(entry.score) || 0) * (Number(entry.weight) || 0)),
            };
          }),
          components: {
            efficiency: roundScore(efficiencyScore),
            support: roundScore(supportScore),
            breadth: roundScore(breadthScore),
            volume: roundScore(volumeScore),
            star: roundScore(starScore),
            core: roundScore(coreScore),
          },
          weights: {
            efficiency: weights.efficiency || 0,
            support: weights.support || 0,
            breadth: weights.breadth || 0,
            volume: weights.volume || 0,
            star: weights.star || 0,
            core: weights.core || 0,
          },
          usageValue: roundScore(getUsageValue(row, PositionGroup.F, sheetName)),
          eventLoadValue: roundScore(getSkaterEventLoadValue(row)),
          finalScore: row[outputField],
        };
      }
    });
  }

  function buildGoalieDistributions(rows, sheetName) {
    var distributionLimit = getPlayerNhlDistributionLimit(sheetName, PositionGroup.G);
    return {
      raw: {
        W: limitDistribution(sortedValues(rows, "W"), distributionLimit, false),
        GAA: limitDistribution(sortedValues(rows, "GAA"), distributionLimit, true),
        SVP: limitDistribution(sortedValues(rows, "SVP"), distributionLimit, false),
      },
      rate: {
        W: limitDistribution(
          sortedValuesByGetter(rows, function (row) {
            return getUsageRateValue(row, "W", PositionGroup.G, sheetName);
          }),
          distributionLimit,
          false,
        ),
      },
      GS: limitDistribution(
        sortedValuesByGetter(rows, function (row) {
          return getUsageValue(row, PositionGroup.G, sheetName);
        }),
        distributionLimit,
        false,
      ),
      SA: limitDistribution(sortedValues(rows, "SA"), distributionLimit, false),
      SV: limitDistribution(sortedValues(rows, "SV"), distributionLimit, false),
      TOI: limitDistribution(sortedValues(rows, "TOI"), distributionLimit, false),
    };
  }

  function computeGoalieWinScore(row, profile, distributions, sheetName) {
    var rawScore = percentileRank(toNumber(row && row.W), distributions.raw.W, false);
    if (!profile.winBlend.rate) return rawScore;
    var rateScore = percentileRank(
      getUsageRateValue(row, "W", PositionGroup.G, sheetName),
      distributions.rate.W,
      false,
    );
    return profile.winBlend.raw * rawScore + profile.winBlend.rate * rateScore;
  }

  function computeGoalieWorkloadScore(row, profile, distributions, sheetName) {
    var mix = profile.workloadMix;
    var score = 0;
    if (mix.GS) {
      score +=
        mix.GS *
        percentileRank(getUsageValue(row, PositionGroup.G, sheetName), distributions.GS, false);
    }
    if (mix.SA) {
      score += mix.SA * percentileRank(toNumber(row && row.SA), distributions.SA, false);
    }
    if (mix.SV) {
      score += mix.SV * percentileRank(toNumber(row && row.SV), distributions.SV, false);
    }
    if (mix.TOI) {
      score += mix.TOI * percentileRank(toNumber(row && row.TOI), distributions.TOI, false);
    }
    return score;
  }

  function applyGoalieSpecialistCap(score, profile, categoryScores, supportScore) {
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

  function applyGoalieSmallSampleCap(score, row, profile, workloadScore, sheetName) {
    var rule = profile.smallSampleCap;
    if (!rule) return score;
    var usage = getUsageValue(row, PositionGroup.G, sheetName);
    if (rule.maxUsage !== undefined && usage <= rule.maxUsage) {
      if (rule.minWorkload === undefined || workloadScore < rule.minWorkload) {
        return Math.min(score, rule.cap);
      }
    }
    if (rule.maxUsageExclusive !== undefined && usage < rule.maxUsageExclusive) {
      return Math.min(score, rule.cap);
    }
    return score;
  }

  function rankGoalieGroup(rows, poolRows, sheetName, outputField) {
    var profile = getGoalieProfile(sheetName);
    var validPoolRows = (poolRows || []).filter(function (row) {
      return hasMeaningfulPlayerVolume(row, PositionGroup.G, sheetName);
    });
    var distributions = buildGoalieDistributions(validPoolRows, sheetName);

    rows.forEach(function (row) {
      if (!hasMeaningfulPlayerVolume(row, PositionGroup.G, sheetName)) {
        row[outputField] = "";
        return;
      }

      var coreScores = {
        W: computeGoalieWinScore(row, profile, distributions, sheetName),
        GAA: percentileRank(toNumber(row && row.GAA), distributions.raw.GAA, true),
        SVP: percentileRank(toNumber(row && row.SVP), distributions.raw.SVP, false),
      };
      var categoryValues = [coreScores.W, coreScores.GAA, coreScores.SVP];
      var efficiencyScore = weightedAverage(coreScores, { W: 0.3, GAA: 0.35, SVP: 0.35 });
      var supportScore = computeSupportScore(categoryValues, 2);
      var breadthScore = computeBreadthScore(categoryValues, categoryValues.length);
      var workloadScore = computeGoalieWorkloadScore(row, profile, distributions, sheetName);
      var weights = profile.weights;
      var scoreScale = getScoreScale(sheetName);
      var score =
        scoreScale *
        (weights.efficiency * efficiencyScore +
          weights.support * supportScore +
          weights.breadth * breadthScore +
          weights.workload * workloadScore);

      score = maybeApplyBalancedBonus(score, profile, supportScore, breadthScore, workloadScore);
      score = applyGoalieSpecialistCap(score, profile, categoryValues, supportScore);
      score = applyGoalieSmallSampleCap(score, row, profile, workloadScore, sheetName);
      score = applyAggregateSheetCalibration(score, sheetName, normalizePosGroup(row && row.posGroup, row));

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
        return percentileRank(toNumber(row[category]), distributions[category], isLowerBetterStat(category));
      });
      row[outputField] = roundScore(clip(125 * average(scores), 0, 125));
    });
  }

  function rankRows(rows, options) {
    var opts = options || {};
    var sheetName = normalizeSheetName(opts.sheetName || (rows && rows[0] ? detectSheetName(rows[0], opts) : ""));
    var outputField = getOutputField(sheetName, opts);
    var targetRows = opts.mutate === false ? (rows || []).map(cloneObject) : rows || [];

    if (!targetRows.length) return targetRows;

    if (sheetName === "TeamDayStatLine") {
      targetRows.forEach(function (row) {
        var result = rankPerformance(row, { sheetName: sheetName });
        row[outputField] = result && result.score !== undefined ? result.score : "";
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

  function rankSkaterPlayerDay(row) {
    var posGroup = normalizePosGroup(row && row.posGroup, row);
    if (!getDailyPlayedFlag(row)) return blankResult(row, "PlayerDayStatLine", posGroup);

    var fallback = SKATER_DAY_FALLBACK_MEANS[posGroup] || SKATER_DAY_FALLBACK_MEANS.F;
    var breakdown = SKATER_DAY_CATEGORIES.map(function (category) {
      var value = toNumber(row[category]);
      var mean = fallback[category] || 1;
      var peak = Math.max(mean * 3.5, 1);
      return {
        category: category,
        value: value,
        perGameValue: value,
        baseline: mean,
        winThreshold: mean,
        softCap: peak,
        direction: "higher",
        delta: value - mean,
        contribution: value / Math.max(peak, 0.01),
      };
    });
    var weightedImpact = breakdown
      .map(function (item) {
        return clip(item.contribution, 0, 1.35);
      })
      .sort(function (a, b) {
        return b - a;
      })
      .reduce(function (sum, contribution, index) {
        return sum + contribution * (SKATER_DAY_IMPACT_WEIGHTS[index] || 0);
      }, 0);
    var rawComposite = clip(weightedImpact / SKATER_DAY_IMPACT_DENOMINATOR, 0, 1.4);
    var score = 125 * (1 - Math.exp(-SKATER_DAY_SCORE_CURVE * Math.max(rawComposite, 0)));
    return buildResult(row, "PlayerDayStatLine", posGroup, roundScore(score), breakdown, {
      categoryQuality: rawComposite,
      spike: rawComposite,
      breadth: 0,
      volume: 1,
    });
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
          return sorted[i].score + ratio * (sorted[i + 1].score - sorted[i].score);
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
        return sorted[j].score + progress * (sorted[j + 1].score - sorted[j].score);
      }
    }
    var top = sorted[sorted.length - 1];
    return Math.min(1.02, top.score + (1 - Math.exp(-(numeric - top.value) * 2)) * 0.02);
  }

  function rankGoaliePlayerDay(row) {
    var posGroup = PositionGroup.G;
    if (!getDailyPlayedFlag(row)) return blankResult(row, "PlayerDayStatLine", posGroup);

    var wins = toNumber(row.W);
    var gaa = toNumber(row.GAA);
    var svp = toNumber(row.SVP);
    var saves = toNumber(row.SV);
    var shotsAgainst = toNumber(row.SA);
    var goalsAgainst = toNumber(row.GA);
    var toi = toNumber(row.TOI);
    var shutouts = toNumber(row.SO);

    var winContribution = wins >= 1 ? 1 : 0;
    var gaaContribution = interpolatePiecewise(
      gaa,
      [
        { value: 0, score: 1 },
        { value: 2, score: 0.82 },
        { value: 3, score: 0.62 },
        { value: 4, score: 0.3 },
        { value: 5, score: 0.1 },
        { value: 6, score: 0.03 },
      ],
      true,
    );
    var svpContribution = interpolatePiecewise(
      svp,
      [
        { value: 0.85, score: 0.1 },
        { value: 0.875, score: 0.28 },
        { value: 0.9, score: 0.52 },
        { value: 0.92, score: 0.68 },
        { value: 0.95, score: 0.9 },
        { value: 1, score: 1 },
      ],
      false,
    );
    var svContribution = interpolatePiecewise(
      saves,
      [
        { value: 0, score: 0 },
        { value: 15, score: 0.28 },
        { value: 25, score: 0.55 },
        { value: 32, score: 0.75 },
        { value: 40, score: 0.92 },
        { value: 50, score: 1 },
      ],
      false,
    );
    var saContribution = interpolatePiecewise(
      shotsAgainst,
      [
        { value: 0, score: 0 },
        { value: 18, score: 0.25 },
        { value: 26, score: 0.5 },
        { value: 32, score: 0.72 },
        { value: 40, score: 0.9 },
        { value: 50, score: 1 },
      ],
      false,
    );
    var toiContribution = interpolatePiecewise(
      toi,
      [
        { value: 0, score: 0 },
        { value: 20, score: 0.18 },
        { value: 35, score: 0.45 },
        { value: 50, score: 0.78 },
        { value: 60, score: 1 },
        { value: 70, score: 1.02 },
      ],
      false,
    );
    var gaContribution = interpolatePiecewise(
      goalsAgainst,
      [
        { value: 0, score: 1 },
        { value: 1, score: 0.86 },
        { value: 2, score: 0.66 },
        { value: 3, score: 0.42 },
        { value: 4, score: 0.2 },
        { value: 5, score: 0.08 },
        { value: 6, score: 0.02 },
      ],
      true,
    );
    var rateQuality = 0.52 * svpContribution + 0.48 * gaaContribution;
    var workloadContribution =
      (0.42 * svContribution + 0.23 * saContribution + 0.35 * toiContribution) *
      (0.35 + 0.65 * rateQuality);
    var rawComposite =
      0.12 * winContribution +
      0.24 * gaaContribution +
      0.28 * svpContribution +
      0.2 * workloadContribution +
      0.16 * gaContribution;
    var shapedComposite = Math.pow(Math.max(rawComposite, 0), 1.35);
    var score = 125 * (1 - Math.exp(-1.81 * shapedComposite));
    if (shutouts > 0 || (wins >= 1 && gaa === 0 && svp >= 1 && shotsAgainst > 0)) {
      score += 10;
    }

    return buildResult(row, "PlayerDayStatLine", posGroup, roundScore(score), [], {
      categoryQuality: rawComposite,
      spike: Math.max(gaaContribution, svpContribution, winContribution),
      breadth: 0,
      volume: 1,
    });
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
    return buildResult(row, sheetName, PositionGroup.TEAM, roundScore(125 * average(scores)), [], {
      categoryQuality: average(scores),
      spike: topAverage(scores, 2),
      breadth: 0,
      volume: 1,
    });
  }

  function rankAggregateSingle(row, sheetName, posGroup) {
    var outputField = getOutputField(sheetName, {});
    var clone = cloneObject(row);
    if (sheetName === "PlayerDayStatLine") {
      var dayResult = rankPerformance(row, { sheetName: sheetName });
      return buildResult(row, sheetName, posGroup, dayResult.score, [], {});
    }
    rankRows([clone], { sheetName: sheetName, outputField: outputField, mutate: true });
    var score = clone[outputField];
    return buildResult(row, sheetName, posGroup, score === undefined ? "" : score, [], {});
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
      efficiencyScore: components && components.categoryQuality ? components.categoryQuality : 0,
      gamesScore: components && components.volume ? components.volume : 0,
      densityScore: components && components.breadth ? components.breadth : 0,
      rawComposite: score === "" ? 0 : Number(score) / 125,
    };
  }

  function rankPerformance(row, options) {
    var opts = options || {};
    var sheetName = normalizeSheetName(detectSheetName(row, opts));
    var posGroup = normalizePosGroup(row && row.posGroup, row);

    if (sheetName === "PlayerDayStatLine") {
      return posGroup === PositionGroup.G ? rankGoaliePlayerDay(row) : rankSkaterPlayerDay(row);
    }
    if (posGroup === PositionGroup.TEAM || sheetName.indexOf("Team") === 0) {
      return rankTeamSingle(row, sheetName);
    }
    return rankAggregateSingle(row, sheetName, posGroup);
  }

  function getPerformanceGrade(score) {
    if (score === "" || score === null || score === undefined) return "No Impact";
    var numeric = Number(score);
    if (numeric >= 120) return "Insanity";
    if (numeric >= 110) return "Super Elite";
    if (numeric >= 100) return "Elite";
    if (numeric >= 90) return "Above Average Starter";
    if (numeric >= 70) return "Borderline Starter";
    if (numeric >= 50) return "Rosterable";
    if (numeric >= 30) return "Waiver Wire";
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
