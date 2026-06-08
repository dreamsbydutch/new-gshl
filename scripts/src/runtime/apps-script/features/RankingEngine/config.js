// @ts-nocheck

var RankingEngine = RankingEngine || {};

(function (ns) {
  "use strict";

  const PositionGroup = {
    F: "F",
    D: "D",
    G: "G",
    TEAM: "TEAM",
  };

  const StatCategory = {
    G: "G",
    A: "A",
    P: "P",
    PM: "PM",
    PPP: "PPP",
    SOG: "SOG",
    HIT: "HIT",
    BLK: "BLK",
    W: "W",
    GAA: "GAA",
    SVP: "SVP",
    GA: "GA",
    SA: "SA",
    SV: "SV",
    SO: "SO",
    TOI: "TOI",
  };

  const TuningConfig = {
    defaults: {
      skaterCategories: [
        StatCategory.G,
        StatCategory.A,
        StatCategory.P,
        StatCategory.PPP,
        StatCategory.SOG,
        StatCategory.HIT,
        StatCategory.BLK,
      ],
      goalieCoreCategories: [
        StatCategory.W,
        StatCategory.GAA,
        StatCategory.SVP,
      ],
      lowerBetterStats: [StatCategory.GAA, StatCategory.GA],
    },
    teamScoring: {
      dayNoGoalieCategoryScore: 0.45,
      weekNoGoalieCategoryScore: 0.15,
      dayFinalScoreMultiplier: 1.25,
      weekFinalScoreMultiplier: 1.25,
      weekAverageGpBaseline: 40,
      weekLongWeekGpBaseline: 45,
    },
    cohorts: {
      smallThresholds: {
        skater: 17,
        goalie: 5,
      },
    },
    distributions: {
      aggregateLimits: {
        PlayerNHL: { F: 256, D: 128, G: 56 },
        PlayerTotalStatLine: {
          RS: { F: 350, D: 140, G: 112 },
          PO: { F: 140, D: 49, G: 28 },
        },
        PlayerSplitStatLine: {
          RS: { F: 350, D: 140, G: 112 },
          PO: { F: 140, D: 49, G: 28 },
        },
      },
    },
    retention: {
      dayShare: {
        F: 0.85,
        D: 0.75,
        G: 0.55,
      },
      weekShare: {
        F: 0.5,
        D: 0.75,
        G: 0.5,
      },
      negativeCarry: 0.3,
      negativeFloor: -0.3,
    },
    goalie: {
      minimumToiForRating: 0,
      negligibleToiThreshold: 30,
      negligibleToiMaxScore: 15,
    },
    playerCalibration: {
      dayPositionMultiplier: {
        F: 1.725,
        D: 1.575,
        G: 1.325,
      },
      weekPositionMultiplier: {
        F: 1.75,
        D: 1.5,
        G: 1.05,
      },
      weekNormalization: {
        skater: { targetUsage: 3.5, fullUsage: 3 },
        goalie: { targetUsage: 2, fullUsage: 2 },
      },
    },
    profiles: {
      skater: {
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
      },
      goalie: {
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
      },
    },
  };

  const FALLBACK_SEASON_CATEGORIES =
    TuningConfig.defaults.skaterCategories.concat(
      TuningConfig.defaults.goalieCoreCategories,
    );

  const GOALIE_CATEGORY_SET = new Set(
    TuningConfig.defaults.goalieCoreCategories,
  );

  const LowerBetterStats = new Set(TuningConfig.defaults.lowerBetterStats);
  const seasonCategoryCache = {};

  function normalizeCategory(category) {
    const normalized = String(category || "")
      .trim()
      .toUpperCase();
    if (
      normalized === "G" ||
      normalized === "A" ||
      normalized === "P" ||
      normalized === "PM" ||
      normalized === "PPP" ||
      normalized === "SOG" ||
      normalized === "HIT" ||
      normalized === "BLK" ||
      normalized === "W" ||
      normalized === "GAA" ||
      normalized === "SVP"
    ) {
      return normalized;
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

  function readSeasonCategoriesFromSheet(seasonId) {
    const seasonKey =
      seasonId === undefined || seasonId === null ? "" : String(seasonId);
    if (!seasonKey) return null;
    if (seasonCategoryCache.hasOwnProperty(seasonKey)) {
      return seasonCategoryCache[seasonKey];
    }

    try {
      const fetchSheetAsObjects =
        typeof GshlUtils !== "undefined" &&
        GshlUtils.sheets &&
        GshlUtils.sheets.read &&
        GshlUtils.sheets.read.fetchSheetAsObjects
          ? GshlUtils.sheets.read.fetchSheetAsObjects
          : null;

      if (!fetchSheetAsObjects || typeof SPREADSHEET_ID === "undefined") {
        seasonCategoryCache[seasonKey] = null;
        return null;
      }

      const seasons = fetchSheetAsObjects(SPREADSHEET_ID, "Season");
      const season = (seasons || []).find(function (entry) {
        return String(entry && entry.id) === seasonKey;
      });
      const categories = parseSeasonCategories(season && season.categories);
      seasonCategoryCache[seasonKey] = categories.length ? categories : null;
      return seasonCategoryCache[seasonKey];
    } catch (error) {
      seasonCategoryCache[seasonKey] = null;
      return null;
    }
  }

  function getMatchupCategoriesForSeason(seasonId) {
    const dynamicCategories = readSeasonCategoriesFromSheet(seasonId);
    return dynamicCategories && dynamicCategories.length
      ? dynamicCategories
      : FALLBACK_SEASON_CATEGORIES.slice();
  }

  function getRelevantStats(posGroup, seasonId) {
    const categories = getMatchupCategoriesForSeason(seasonId);
    if (posGroup === PositionGroup.G) {
      return categories.filter(function (category) {
        return GOALIE_CATEGORY_SET.has(category);
      });
    }
    if (posGroup === PositionGroup.TEAM) {
      return categories.slice();
    }
    return categories.filter(function (category) {
      return !GOALIE_CATEGORY_SET.has(category);
    });
  }

  function isLowerBetterStat(category) {
    return LowerBetterStats.has(category);
  }

  function getPerformanceGrade(score) {
    if (score >= 105) return "Insanity";
    if (score >= 100) return "Super Elite";
    if (score >= 85) return "Elite";
    if (score >= 75) return "Above Average Starter";
    if (score >= 50) return "Borderline Starter";
    if (score >= 30) return "Rosterable";
    if (score >= 10) return "Waiver Wire";
    return "No Impact";
  }

  ns.PositionGroup = PositionGroup;
  ns.StatCategory = StatCategory;
  ns.TuningConfig = TuningConfig;
  ns.getRelevantStats = getRelevantStats;
  ns.getMatchupCategoriesForSeason = getMatchupCategoriesForSeason;
  ns.isLowerBetterStat = isLowerBetterStat;
  ns.getPerformanceGrade = getPerformanceGrade;
})(RankingEngine);
