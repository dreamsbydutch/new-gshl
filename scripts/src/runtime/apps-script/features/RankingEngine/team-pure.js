// @ts-nocheck

var RankingEngine = RankingEngine || {};

(function (ns) {
  "use strict";

  var api = {};
  var initialized = false;

  var PositionGroup;
  var GOALIE_CORE_CATEGORIES;
  var TEAM_DAY_NO_GOALIE_CATEGORY_SCORE;
  var TEAM_WEEK_NO_GOALIE_CATEGORY_SCORE;
  var TEAM_DAY_FINAL_SCORE_MULTIPLIER;
  var TEAM_WEEK_FINAL_SCORE_MULTIPLIER;
  var TEAM_WEEK_AVERAGE_GP_BASELINE;
  var TEAM_WEEK_LONG_WEEK_GP_BASELINE;
  var clip;
  var toNumber;
  var normalizePosGroup;
  var isRegularSeasonType;
  var isLowerBetterStat;
  var getMatchupCategoriesForSeason;
  var getScoreScale;
  var average;
  var roundScore;
  var percentileRank;
  var sortedValues;
  var sortedValuesByGetter;

  function ensureDeps() {
    if (initialized) return;

    var deps = ns.EngineDeps || {};
    PositionGroup = deps.PositionGroup;
    GOALIE_CORE_CATEGORIES = deps.GOALIE_CORE_CATEGORIES;
    TEAM_DAY_NO_GOALIE_CATEGORY_SCORE =
      deps.TEAM_DAY_NO_GOALIE_CATEGORY_SCORE;
    TEAM_WEEK_NO_GOALIE_CATEGORY_SCORE =
      deps.TEAM_WEEK_NO_GOALIE_CATEGORY_SCORE;
    TEAM_DAY_FINAL_SCORE_MULTIPLIER =
      deps.TEAM_DAY_FINAL_SCORE_MULTIPLIER;
    TEAM_WEEK_FINAL_SCORE_MULTIPLIER =
      deps.TEAM_WEEK_FINAL_SCORE_MULTIPLIER;
    TEAM_WEEK_AVERAGE_GP_BASELINE = deps.TEAM_WEEK_AVERAGE_GP_BASELINE;
    TEAM_WEEK_LONG_WEEK_GP_BASELINE = deps.TEAM_WEEK_LONG_WEEK_GP_BASELINE;
    clip = deps.clip;
    toNumber = deps.toNumber;
    normalizePosGroup = deps.normalizePosGroup;
    isRegularSeasonType = deps.isRegularSeasonType;
    isLowerBetterStat = deps.isLowerBetterStat;
    getMatchupCategoriesForSeason = deps.getMatchupCategoriesForSeason;
    getScoreScale = deps.getScoreScale;
    average = deps.average;
    roundScore = deps.roundScore;
    percentileRank = deps.percentileRank;
    sortedValues = deps.sortedValues;
    sortedValuesByGetter = deps.sortedValuesByGetter;
    initialized = true;
  }

  function rankTeamRows(rows, outputField) {
    ensureDeps();

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

  function hasNonBlankCellValue(value) {
    return !(
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    );
  }

  function getTeamWeekCategoryValue(row, category) {
    if (!row || !hasNonBlankCellValue(row[category])) return null;
    var numeric = Number(row[category]);
    return isFinite(numeric) ? numeric : null;
  }

  function getTeamWeekComparableGp(row) {
    var gp = toNumber(row && row.GP);
    if (gp <= 0) return 0;
    if (gp < TEAM_WEEK_AVERAGE_GP_BASELINE) {
      return gp + (TEAM_WEEK_AVERAGE_GP_BASELINE - gp) * 0.5;
    }
    if (gp > TEAM_WEEK_LONG_WEEK_GP_BASELINE) {
      return TEAM_WEEK_LONG_WEEK_GP_BASELINE;
    }
    return gp;
  }

  function getComparableTeamWeekCategoryValue(row, category) {
    var value = getTeamWeekCategoryValue(row, category);
    if (value === null) return null;
    if (category === "GAA" || category === "SVP") return value;

    var gp = toNumber(row && row.GP);
    if (gp <= 0) return value;

    var comparableGp = getTeamWeekComparableGp(row);
    if (comparableGp <= 0) return value;

    return value * (comparableGp / gp);
  }

  function hasTeamWeekQualifiedGoalieStats(row) {
    if (!row) return false;
    return (
      hasNonBlankCellValue(row.W) ||
      hasNonBlankCellValue(row.GA) ||
      hasNonBlankCellValue(row.GAA) ||
      hasNonBlankCellValue(row.SV) ||
      hasNonBlankCellValue(row.SA) ||
      hasNonBlankCellValue(row.SVP) ||
      hasNonBlankCellValue(row.SO) ||
      hasNonBlankCellValue(row.TOI)
    );
  }

  function buildTeamWeekDistributions(rows, categories) {
    var distributions = {};
    (categories || []).forEach(function (category) {
      distributions[category] = sortedValuesByGetter(rows, function (row) {
        return getComparableTeamWeekCategoryValue(row, category);
      });
    });
    return distributions;
  }

  function scoreTeamWeekCategory(row, category, distributions) {
    var value = getComparableTeamWeekCategoryValue(row, category);
    if (value === null) {
      if (
        GOALIE_CORE_CATEGORIES.indexOf(category) !== -1 &&
        !hasTeamWeekQualifiedGoalieStats(row)
      ) {
        return TEAM_WEEK_NO_GOALIE_CATEGORY_SCORE;
      }
      return 0;
    }
    return percentileRank(
      value,
      distributions[category],
      isLowerBetterStat(category),
    );
  }

  function rankTeamWeekRows(rows, outputField) {
    ensureDeps();
    if (!rows || !rows.length) return;

    var categories = getMatchupCategoriesForSeason(rows[0] && rows[0].seasonId);
    var scoreScale = getScoreScale("TeamWeekStatLine");
    var distributions = buildTeamWeekDistributions(rows, categories);
    rows.forEach(function (row) {
      var scores = categories.map(function (category) {
        return scoreTeamWeekCategory(row, category, distributions);
      });
      row[outputField] = roundScore(
        Math.max(
          scoreScale * average(scores) * TEAM_WEEK_FINAL_SCORE_MULTIPLIER,
          0,
        ),
      );
    });
  }

  function getTeamDayCategoryValue(row, category) {
    if (!row || !hasNonBlankCellValue(row[category])) return null;
    var numeric = Number(row[category]);
    return isFinite(numeric) ? numeric : null;
  }

  function hasMeaningfulTeamDayActivity(row, categories) {
    if (!row) return false;
    if (toNumber(row.GP) <= 0) return false;
    if (toNumber(row.GS) > 0) return true;
    return (categories || []).some(function (category) {
      var value = getTeamDayCategoryValue(row, category);
      return value !== null && value > 0;
    });
  }

  function hasTeamDayGoalieActivity(row) {
    if (!row) return false;
    return (
      toNumber(row.W) > 0 ||
      toNumber(row.GA) > 0 ||
      toNumber(row.SV) > 0 ||
      toNumber(row.SA) > 0 ||
      toNumber(row.SO) > 0 ||
      toNumber(row.TOI) > 0 ||
      getTeamDayCategoryValue(row, "GAA") !== null ||
      getTeamDayCategoryValue(row, "SVP") !== null
    );
  }

  function buildTeamDayDistributions(rows, categories) {
    var distributions = {};
    (categories || []).forEach(function (category) {
      distributions[category] = sortedValuesByGetter(rows, function (row) {
        return getTeamDayCategoryValue(row, category);
      });
    });
    return distributions;
  }

  function scoreTeamDayCategory(row, category, distributions) {
    var value = getTeamDayCategoryValue(row, category);
    if (value === null) {
      if (
        GOALIE_CORE_CATEGORIES.indexOf(category) !== -1 &&
        !hasTeamDayGoalieActivity(row)
      ) {
        return TEAM_DAY_NO_GOALIE_CATEGORY_SCORE;
      }
      return 0;
    }
    return percentileRank(
      value,
      distributions[category],
      isLowerBetterStat(category),
    );
  }

  function rankTeamDayRows(rows, outputField) {
    ensureDeps();
    if (!rows || !rows.length) return;

    var categories = getMatchupCategoriesForSeason(rows[0] && rows[0].seasonId);
    var scoreScale = getScoreScale("TeamDayStatLine");
    var distributions = buildTeamDayDistributions(rows, categories);
    rows.forEach(function (row) {
      if (!hasMeaningfulTeamDayActivity(row, categories)) {
        row[outputField] = 0;
        return;
      }

      var scores = categories.map(function (category) {
        return scoreTeamDayCategory(row, category, distributions);
      });
      row[outputField] = roundScore(
        scoreScale * average(scores) * TEAM_DAY_FINAL_SCORE_MULTIPLIER,
      );
    });
  }

  function getTeamSeasonCategoryValue(row, category) {
    if (!row || !hasNonBlankCellValue(row[category])) return null;
    var numeric = Number(row[category]);
    return isFinite(numeric) ? numeric : null;
  }

  function buildTeamSeasonDistributions(rows, categories) {
    var distributions = {};
    (categories || []).forEach(function (category) {
      distributions[category] = sortedValuesByGetter(rows, function (row) {
        return getTeamSeasonCategoryValue(row, category);
      });
    });
    return distributions;
  }

  function scoreTeamSeasonCategory(row, category, distributions) {
    var value = getTeamSeasonCategoryValue(row, category);
    if (value === null) return 0;
    return percentileRank(
      value,
      distributions[category],
      isLowerBetterStat(category),
    );
  }

  function rankTeamSeasonRows(rows, outputField) {
    ensureDeps();
    if (!rows || !rows.length) return;

    var categories = getMatchupCategoriesForSeason(rows[0] && rows[0].seasonId);
    var scoreScale = getScoreScale("TeamSeasonStatLine");
    var distributions = buildTeamSeasonDistributions(rows, categories);
    rows.forEach(function (row) {
      var scores = categories.map(function (category) {
        return scoreTeamSeasonCategory(row, category, distributions);
      });
      row[outputField] = roundScore(Math.max(scoreScale * average(scores), 0));
    });
  }

  function computeGoalieAggregateGaa(row) {
    var ga = toNumber(row && row.GA);
    var toi = toNumber(row && row.TOI);
    if (toi <= 0) return "";
    return (ga / toi) * 60;
  }

  function computeGoalieAggregateSvp(row) {
    var sv = toNumber(row && row.SV);
    var sa = toNumber(row && row.SA);
    if (sa <= 0) return "";
    return sv / sa;
  }

  function buildTeamSeasonAwardAggregateRows(
    teamSeasonRows,
    playerSplitRows,
    posGroup,
    categories,
  ) {
    ensureDeps();

    var categoryList = (categories || []).slice();
    var rowsByTeamKey = {};

    (teamSeasonRows || []).forEach(function (row) {
      if (!row || !isRegularSeasonType(row.seasonType)) return;
      var teamKey =
        row.gshlTeamId !== undefined && row.gshlTeamId !== null
          ? String(row.gshlTeamId)
          : "";
      if (!teamKey) return;
      var baseRow = {
        seasonId:
          row.seasonId !== undefined && row.seasonId !== null
            ? String(row.seasonId)
            : "",
        seasonType:
          row.seasonType !== undefined && row.seasonType !== null
            ? String(row.seasonType)
            : "",
        gshlTeamId: teamKey,
      };
      categoryList.forEach(function (category) {
        baseRow[category] = 0;
      });
      if (posGroup === PositionGroup.G) {
        baseRow.GA = 0;
        baseRow.SV = 0;
        baseRow.SA = 0;
        baseRow.TOI = 0;
      }
      rowsByTeamKey[teamKey] = baseRow;
    });

    (playerSplitRows || []).forEach(function (row) {
      if (!row) return;
      if (!isRegularSeasonType(row.seasonType)) return;
      if (normalizePosGroup(row.posGroup, row) !== posGroup) return;
      var teamKey =
        row.gshlTeamId !== undefined && row.gshlTeamId !== null
          ? String(row.gshlTeamId)
          : "";
      var aggregate = rowsByTeamKey[teamKey];
      if (!aggregate) return;

      categoryList.forEach(function (category) {
        if (category === "GAA" || category === "SVP") return;
        aggregate[category] =
          toNumber(aggregate[category]) + toNumber(row[category]);
      });

      if (posGroup === PositionGroup.G) {
        aggregate.GA = toNumber(aggregate.GA) + toNumber(row.GA);
        aggregate.SV = toNumber(aggregate.SV) + toNumber(row.SV);
        aggregate.SA = toNumber(aggregate.SA) + toNumber(row.SA);
        aggregate.TOI = toNumber(aggregate.TOI) + toNumber(row.TOI);
      }
    });

    return Object.keys(rowsByTeamKey)
      .sort()
      .map(function (teamKey) {
        var row = rowsByTeamKey[teamKey];
        if (posGroup === PositionGroup.G) {
          row.GAA = computeGoalieAggregateGaa(row);
          row.SVP = computeGoalieAggregateSvp(row);
        }
        return row;
      });
  }

  function computeTeamSeasonAwardRatings(rows, categories, ratingField, rankField) {
    ensureDeps();
    if (!rows || !rows.length) return;

    var scoreScale = getScoreScale("TeamSeasonStatLine");
    var distributions = buildTeamSeasonDistributions(rows, categories);
    rows.forEach(function (row) {
      var scores = (categories || []).map(function (category) {
        return scoreTeamSeasonCategory(row, category, distributions);
      });
      row[ratingField] = roundScore(Math.max(scoreScale * average(scores), 0));
    });

    rows
      .slice()
      .sort(function (left, right) {
        var scoreDiff =
          toNumber(right && right[ratingField]) -
          toNumber(left && left[ratingField]);
        if (scoreDiff !== 0) return scoreDiff;
        return String((left && left.gshlTeamId) || "").localeCompare(
          String((right && right.gshlTeamId) || ""),
        );
      })
      .forEach(function (row, index) {
        row[rankField] = index + 1;
      });
  }

  api.rankTeamRows = rankTeamRows;
  api.rankTeamWeekRows = rankTeamWeekRows;
  api.rankTeamDayRows = rankTeamDayRows;
  api.rankTeamSeasonRows = rankTeamSeasonRows;
  api.computeGoalieAggregateGaa = computeGoalieAggregateGaa;
  api.computeGoalieAggregateSvp = computeGoalieAggregateSvp;
  api.buildTeamSeasonAwardAggregateRows = buildTeamSeasonAwardAggregateRows;
  api.computeTeamSeasonAwardRatings = computeTeamSeasonAwardRatings;

  ns.TeamPure = api;
})(RankingEngine);
