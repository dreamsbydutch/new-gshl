// @ts-nocheck

/**
 * PlayerOverallRatingUpdater
 *
 * Builds a multi-season talent metric for PlayerNHL rows using the last
 * 4 seasons of PlayerNHL performance. The goal is to preserve the same
 * general scale as seasonRating while being less reactive to injuries,
 * one-year outliers, and thin early-career samples.
 */
var PlayerOverallRatingUpdater = (function PlayerOverallRatingUpdaterModule() {
  "use strict";

  var ns = {};

  var MAX_LOOKBACK_SEASONS = 4;
  var RECENCY_WEIGHTS = [1.0, 0.78, 0.59, 0.43];
  var RECENT_SEASON_INFLUENCE_BASE = 0.11;
  var SKATER_SAMPLE_TARGET = 82;
  var GOALIE_SAMPLE_TARGET = 50;
  var SKATER_TALENT_STABILITY_TARGET = 180;
  var GOALIE_TALENT_STABILITY_TARGET = 90;
  var MIN_SALARY = 1000000;
  var MAX_SALARY = 10000000;
  var SALARY_RANK_POINTS = [
    { rank: 3.5, salary: 10000000 },
    { rank: 18, salary: 9000000 },
    { rank: 35, salary: 8000000 },
    { rank: 140, salary: 5000000 },
    { rank: 225, salary: 2000000 },
    { rank: 270, salary: 1000000 },
  ];

  function requireSeasonId(seasonId, caller) {
    var seasonKey =
      seasonId === undefined || seasonId === null
        ? ""
        : typeof seasonId === "string"
          ? seasonId.trim()
          : String(seasonId);
    if (!seasonKey) {
      throw new Error((caller || "PlayerOverallRatingUpdater") + " requires a seasonId");
    }
    return seasonKey;
  }

  function toNumber(value) {
    if (value === undefined || value === null || value === "") return 0;
    var numeric = Number(value);
    return isFinite(numeric) ? numeric : 0;
  }

  function clip(value, min, max) {
    var numeric = Number(value);
    if (!isFinite(numeric)) return min;
    if (numeric < min) return min;
    if (numeric > max) return max;
    return numeric;
  }

  function roundScore(value) {
    return Math.round(Number(value) * 100) / 100;
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

  function detectNhlSheetName() {
    var candidates = ["PlayerNHLStatLine", "PlayerNHL", "PlayerNhlStatLine", "PlayerNhl"];
    for (var i = 0; i < candidates.length; i++) {
      try {
        GshlUtils.sheets.read.fetchSheetAsObjects(PLAYERSTATS_SPREADSHEET_ID, candidates[i], {
          coerceTypes: true,
        });
        return candidates[i];
      } catch (_e) {
        // try next
      }
    }
    return "PlayerNHL";
  }

  function resolveOutputField(rows) {
    var sample = rows && rows.length ? rows.find(function (row) { return !!row; }) : null;
    if (!sample) return "overallRating";
    if (Object.prototype.hasOwnProperty.call(sample, "overallRating")) return "overallRating";
    if (Object.prototype.hasOwnProperty.call(sample, "overallrating")) return "overallrating";
    if (Object.prototype.hasOwnProperty.call(sample, "overall_rating")) return "overall_rating";
    return "overallRating";
  }

  function resolveSalaryField(rows) {
    var sample = rows && rows.length ? rows.find(function (row) { return !!row; }) : null;
    if (!sample) return "salary";
    if (Object.prototype.hasOwnProperty.call(sample, "salary")) return "salary";
    if (Object.prototype.hasOwnProperty.call(sample, "Salary")) return "Salary";
    return "salary";
  }

  function average(values) {
    if (!values || !values.length) return 0;
    var total = 0;
    for (var i = 0; i < values.length; i++) total += Number(values[i]) || 0;
    return total / values.length;
  }

  function weightedAverage(entries) {
    var weighted = 0;
    var totalWeight = 0;
    (entries || []).forEach(function (entry) {
      var weight = Number(entry && entry.weight) || 0;
      var value = Number(entry && entry.value) || 0;
      if (weight <= 0) return;
      weighted += value * weight;
      totalWeight += weight;
    });
    return totalWeight > 0 ? weighted / totalWeight : 0;
  }

  function getPosGroup(row) {
    var raw = String(row && (row.posGroup || "")).toUpperCase();
    if (raw === "G") return "G";
    if (raw === "D") return "D";
    return "F";
  }

  function getUsageValue(row) {
    if (getPosGroup(row) === "G") {
      var starts = toNumber(row && row.GS);
      if (starts > 0) return starts;
      return toNumber(row && row.GP);
    }
    return toNumber(row && row.GP);
  }

  function getSeasonRatingValue(row) {
    if (!row) return null;
    var candidates = ["seasonRating", "seasonrating", "season_rating", "Rating", "rating"];
    for (var i = 0; i < candidates.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(row, candidates[i])) continue;
      var numeric = Number(row[candidates[i]]);
      if (isFinite(numeric)) return numeric;
    }
    return null;
  }

  function compareSeasonIdAsc(a, b) {
    var an = Number(a);
    var bn = Number(b);
    if (isFinite(an) && isFinite(bn)) return an - bn;
    return String(a || "").localeCompare(String(b || ""));
  }

  function buildSeasonOrder(rows) {
    var seen = {};
    (rows || []).forEach(function (row) {
      var seasonId = row && row.seasonId !== undefined && row.seasonId !== null ? String(row.seasonId) : "";
      if (!seasonId) return;
      seen[seasonId] = true;
    });
    return Object.keys(seen).sort(compareSeasonIdAsc);
  }

  function buildSeasonIndexMap(rows, extraSeasonIds) {
    var seen = {};
    buildSeasonOrder(rows).forEach(function (seasonId) {
      if (!seasonId) return;
      seen[String(seasonId)] = true;
    });
    (extraSeasonIds || []).forEach(function (seasonId) {
      if (seasonId === undefined || seasonId === null || seasonId === "") return;
      seen[String(seasonId)] = true;
    });

    var order = Object.keys(seen).sort(compareSeasonIdAsc);
    var map = {};
    order.forEach(function (seasonId, index) {
      map[seasonId] = index;
    });
    return map;
  }

  function buildRowsByPlayerId(rows) {
    var rowsByPlayerId = {};

    (rows || []).forEach(function (row) {
      if (!row || row.playerId === undefined || row.playerId === null || row.playerId === "") return;
      var playerId = String(row.playerId);
      if (!rowsByPlayerId[playerId]) rowsByPlayerId[playerId] = [];
      rowsByPlayerId[playerId].push(row);
    });

    Object.keys(rowsByPlayerId).forEach(function (playerId) {
      rowsByPlayerId[playerId].sort(function (a, b) {
        return compareSeasonIdAsc(String(b && b.seasonId || ""), String(a && a.seasonId || ""));
      });
    });

    return rowsByPlayerId;
  }

  function getLeagueAnchor(rowsForSeason, posGroup) {
    var scores = (rowsForSeason || [])
      .filter(function (row) {
        return getPosGroup(row) === posGroup;
      })
      .map(getSeasonRatingValue)
      .filter(function (value) {
        return value !== null && isFinite(value);
      });
    if (!scores.length) return 62.5;
    return average(scores);
  }

  function buildSeasonLeagueAnchors(rowsForSeason) {
    return {
      F: getLeagueAnchor(rowsForSeason, "F"),
      D: getLeagueAnchor(rowsForSeason, "D"),
      G: getLeagueAnchor(rowsForSeason, "G"),
    };
  }

  function getSampleReliability(row) {
    var posGroup = getPosGroup(row);
    var usage = getUsageValue(row);
    if (usage <= 0) return 0;
    var target = posGroup === "G" ? GOALIE_SAMPLE_TARGET : SKATER_SAMPLE_TARGET;
    var ratio = clip(usage / target, 0, 1);
    return 0.35 + 0.65 * Math.sqrt(ratio);
  }

  function getCareerStabilityFactor(posGroup, seasonCount, totalUsage) {
    var usageTarget =
      posGroup === "G" ? GOALIE_TALENT_STABILITY_TARGET : SKATER_TALENT_STABILITY_TARGET;
    var usageTrust = clip(Math.sqrt(clip(totalUsage / usageTarget, 0, 1)), 0, 1);
    var seasonTrust =
      seasonCount >= 4 ? 1 : seasonCount === 3 ? 0.92 : seasonCount === 2 ? 0.84 : 0.76;
    return seasonTrust * (0.8 + 0.2 * usageTrust);
  }

  function dampDeviation(score, mean, reliability) {
    var deviation = Number(score) - Number(mean);
    var absDeviation = Math.abs(deviation);
    var factor;
    if (absDeviation <= 8) {
      factor = 1;
    } else if (absDeviation <= 18) {
      factor = 0.78 + 0.12 * reliability;
    } else {
      factor = 0.55 + 0.2 * reliability;
    }
    return mean + deviation * factor;
  }

  function computeOverallRatingForHistory(historyRows, leagueAnchor) {
    if (!historyRows || !historyRows.length) return "";

    var scoredHistory = historyRows
      .map(function (row, index) {
        var score = getSeasonRatingValue(row);
        if (score === null || !isFinite(score)) return null;
        return {
          row: row,
          score: score,
          usage: getUsageValue(row),
          reliability: getSampleReliability(row),
          recencyWeight: RECENCY_WEIGHTS[index] || RECENCY_WEIGHTS[RECENCY_WEIGHTS.length - 1],
        };
      })
      .filter(Boolean);

    if (!scoredHistory.length) return "";

    var prelimEntries = scoredHistory.map(function (entry) {
      return {
        value: entry.score,
        weight: entry.recencyWeight * entry.reliability,
      };
    });
    var prelimMean = weightedAverage(prelimEntries);

    var dampedEntries = scoredHistory.map(function (entry) {
      return {
        value: dampDeviation(entry.score, prelimMean, entry.reliability),
        weight: entry.recencyWeight * entry.reliability,
      };
    });
    var dampedMean = weightedAverage(dampedEntries);

    var posGroup = getPosGroup(scoredHistory[0].row);
    var totalUsage = scoredHistory.reduce(function (sum, entry) {
      return sum + entry.usage;
    }, 0);
    var stability = getCareerStabilityFactor(posGroup, scoredHistory.length, totalUsage);
    var anchored = leagueAnchor + (dampedMean - leagueAnchor) * stability;

    // Keep recent seasons slightly more influential for talent perception.
    var recentScore = scoredHistory[0].score;
    var recentInfluence = RECENT_SEASON_INFLUENCE_BASE * scoredHistory[0].reliability;
    var overall = anchored + (recentScore - anchored) * recentInfluence;

    if (posGroup === "G") {
      overall *= 1.03;
    } else if (posGroup === "D") {
      overall *= 1.0025;
    }

    return roundScore(clip(overall, 0, 125));
  }

  function getHistoryRowsForSeason(
    playerId,
    rowsByPlayerId,
    seasonIndexMap,
    targetSeasonIndex,
    maxLookbackSeasons,
  ) {
    var playerHistory = rowsByPlayerId && playerId ? rowsByPlayerId[String(playerId)] || [] : [];
    if (!playerHistory.length) return [];

    return playerHistory
      .filter(function (historyRow) {
        if (!historyRow) return false;
        var historySeasonId = String(historyRow.seasonId || "");
        var historyIndex = seasonIndexMap[historySeasonId];
        if (historyIndex === undefined || targetSeasonIndex === undefined) return false;
        return historyIndex <= targetSeasonIndex;
      })
      .slice(0, maxLookbackSeasons || MAX_LOOKBACK_SEASONS);
  }

  function interpolateSalaryByRank(rank) {
    var numericRank = Number(rank);
    if (!isFinite(numericRank) || numericRank <= 0) return MAX_SALARY;
    if (numericRank <= SALARY_RANK_POINTS[0].rank) return MAX_SALARY;
    if (numericRank >= SALARY_RANK_POINTS[SALARY_RANK_POINTS.length - 1].rank) return MIN_SALARY;

    for (var i = 0; i < SALARY_RANK_POINTS.length - 1; i++) {
      var left = SALARY_RANK_POINTS[i];
      var right = SALARY_RANK_POINTS[i + 1];
      if (numericRank <= right.rank) {
        var span = Math.max(right.rank - left.rank, 0.0001);
        var progress = (numericRank - left.rank) / span;
        return left.salary + progress * (right.salary - left.salary);
      }
    }

    return MIN_SALARY;
  }

  function roundSalary(value) {
    var numeric = Number(value);
    if (!isFinite(numeric)) return MIN_SALARY;
    return Math.round(numeric / 50000) * 50000;
  }

  function assignSalariesToUpdates(updates, salaryField) {
    var rated = (updates || []).filter(function (update) {
      var rating = Number(update && update.overallRatingValue);
      return isFinite(rating);
    });

    rated.sort(function (a, b) {
      var ratingDiff = (Number(b.overallRatingValue) || 0) - (Number(a.overallRatingValue) || 0);
      if (ratingDiff !== 0) return ratingDiff;

      var seasonRatingDiff =
        (Number(b.seasonRatingValue) || 0) - (Number(a.seasonRatingValue) || 0);
      if (seasonRatingDiff !== 0) return seasonRatingDiff;

      return String(a.playerId || a.id || "").localeCompare(
        String(b.playerId || b.id || ""),
      );
    });

    var index = 0;
    while (index < rated.length) {
      var end = index + 1;
      var score = Number(rated[index].overallRatingValue) || 0;
      while (end < rated.length && Number(rated[end].overallRatingValue) === score) {
        end++;
      }

      var startRank = index + 1;
      var endRank = end;
      var averageRank = (startRank + endRank) / 2;
      var salary = roundSalary(interpolateSalaryByRank(averageRank));

      for (var i = index; i < end; i++) {
        rated[i][salaryField] = salary;
        rated[i].salaryRank = averageRank;
      }

      index = end;
    }

    (updates || []).forEach(function (update) {
      if (!Object.prototype.hasOwnProperty.call(update, salaryField)) {
        update[salaryField] = "";
      }
      delete update.overallRatingValue;
      delete update.seasonRatingValue;
    });
  }

  ns.updateOverallRatingsForSeason = function updateOverallRatingsForSeason(seasonId, options) {
    var seasonKey = requireSeasonId(seasonId, "updateOverallRatingsForSeason");
    var opts = Object.assign(
      {
        dryRun: false,
        logToConsole: true,
      },
      options || {},
    );
    var actualSheetName = detectNhlSheetName();
    var rows = GshlUtils.sheets.read.fetchSheetAsObjects(
      PLAYERSTATS_SPREADSHEET_ID,
      actualSheetName,
      { coerceTypes: true },
    );
    var outputField = resolveOutputField(rows);
    var salaryField = resolveSalaryField(rows);
    var seasonIndexMap = buildSeasonIndexMap(rows, [seasonKey]);
    var targetSeasonIndex = seasonIndexMap[seasonKey];
    var seasonRows = rows.filter(function (row) {
      return row && String(row.seasonId || "") === seasonKey;
    });
    var rowsByPlayerId = buildRowsByPlayerId(rows);

    var updates = [];
    var seasonLeagueAnchors = buildSeasonLeagueAnchors(seasonRows);

    seasonRows.forEach(function (row) {
      var playerId = String(row && row.playerId || "");
      var playerHistory = getHistoryRowsForSeason(
        playerId,
        rowsByPlayerId,
        seasonIndexMap,
        targetSeasonIndex,
        MAX_LOOKBACK_SEASONS,
      );

      var posGroup = getPosGroup(row);
      var overallRating = computeOverallRatingForHistory(
        playerHistory,
        seasonLeagueAnchors[posGroup] || 62.5,
      );
      var update = {
        playerId: row.playerId,
        seasonId: row.seasonId,
        overallRatingValue: overallRating === "" ? NaN : Number(overallRating),
        seasonRatingValue: getSeasonRatingValue(row),
      };
      update[outputField] = overallRating === "" ? "" : Number(overallRating);
      updates.push(update);
    });

    assignSalariesToUpdates(updates, salaryField);

    if (opts.logToConsole) {
      console.log(
        "[PlayerOverallRatingUpdater] season=" +
          seasonKey +
          " sheet=" +
          actualSheetName +
          " rows=" +
          seasonRows.length +
          " updates=" +
          updates.length +
          " salaryField=" +
          salaryField,
      );
    }

    if (opts.dryRun) {
      return {
        dryRun: true,
        seasonId: seasonKey,
        sheetName: actualSheetName,
        updated: updates.length,
        total: updates.length,
      };
    }

    var result = GshlUtils.sheets.write.upsertSheetByKeys(
      PLAYERSTATS_SPREADSHEET_ID,
      actualSheetName,
      ["playerId", "seasonId"],
      updates,
      {
        merge: true,
        updatedAtColumn: "updatedAt",
      },
    );

    return {
      dryRun: false,
      seasonId: seasonKey,
      sheetName: actualSheetName,
      updated: result && result.updated ? result.updated : updates.length,
      inserted: result && result.inserted ? result.inserted : 0,
      total: result && result.total ? result.total : updates.length,
    };
  };

  return ns;
})();
