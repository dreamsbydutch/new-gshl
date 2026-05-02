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

  const FALLBACK_SEASON_CATEGORIES = [
    StatCategory.G,
    StatCategory.A,
    StatCategory.P,
    StatCategory.PPP,
    StatCategory.SOG,
    StatCategory.HIT,
    StatCategory.BLK,
    StatCategory.W,
    StatCategory.GAA,
    StatCategory.SVP,
  ];

  const GOALIE_CATEGORY_SET = new Set([
    StatCategory.W,
    StatCategory.GAA,
    StatCategory.SVP,
  ]);

  const LowerBetterStats = new Set([StatCategory.GAA]);
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
      return rawValue
        .split(",")
        .map(normalizeCategory)
        .filter(Boolean);
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
    if (score >= 120) return "Insanity";
    if (score >= 110) return "Super Elite";
    if (score >= 100) return "Elite";
    if (score >= 90) return "Above Average Starter";
    if (score >= 70) return "Borderline Starter";
    if (score >= 50) return "Rosterable";
    if (score >= 30) return "Waiver Wire";
    return "No Impact";
  }

  ns.PositionGroup = PositionGroup;
  ns.StatCategory = StatCategory;
  ns.getRelevantStats = getRelevantStats;
  ns.getMatchupCategoriesForSeason = getMatchupCategoriesForSeason;
  ns.isLowerBetterStat = isLowerBetterStat;
  ns.getPerformanceGrade = getPerformanceGrade;
})(RankingEngine);
