// @ts-nocheck

/**
 * StatsAggregator
 *
 * Single export for “just add the stats up” rollups:
 * - PlayerDay -> PlayerWeek
 * - PlayerWeek -> PlayerSplit (per team) + PlayerTotal (across teams)
 * - PlayerDay (starters) -> TeamDay -> TeamWeek -> TeamSeason
 *
 * This module focuses on summing raw stat fields and recomputing derived
 * goalie rates (GAA, SVP) from those summed totals. It intentionally does not
 * attempt to compute standings, rankings, power ratings, or matchup outcomes.
 */
var StatsAggregator = (function StatsAggregatorModule() {
  "use strict";

  var ns = {};

  function requireSeason(seasonId, caller) {
    var seasonKey =
      seasonId === undefined || seasonId === null
        ? ""
        : typeof seasonId === "string"
          ? seasonId.trim()
          : String(seasonId);
    if (!seasonKey) {
      throw new Error((caller || "StatsAggregator") + " requires a seasonId");
    }
    return seasonKey;
  }

  function requireWeekIds(weekIds, caller) {
    if (!Array.isArray(weekIds) || !weekIds.length) {
      throw new Error((caller || "StatsAggregator") + " requires weekIds");
    }

    return weekIds
      .map(function (weekId) {
        return weekId === undefined || weekId === null
          ? ""
          : String(weekId).trim();
      })
      .filter(Boolean);
  }

  function buildWeekMapById(weeks) {
    var map = new Map();
    (weeks || []).forEach(function (week) {
      var weekId =
        week && week.id !== undefined && week.id !== null
          ? String(week.id)
          : "";
      if (!weekId) return;
      map.set(weekId, week);
    });
    return map;
  }

  function buildWeekTypeMap(weeks, seasonTypeFallback) {
    var SeasonType = GshlUtils.core.constants.SeasonType;
    var fallback = seasonTypeFallback || SeasonType.REGULAR_SEASON;
    var map = new Map();
    (weeks || []).forEach(function (week) {
      var weekId =
        week && week.id !== undefined && week.id !== null
          ? String(week.id)
          : "";
      if (!weekId) return;
      map.set(weekId, normalizeSeasonType(week && week.weekType, fallback));
    });
    return map;
  }

  function normalizeSeasonType(value, fallback) {
    var SeasonType = GshlUtils.core.constants.SeasonType;
    var resolvedFallback = fallback || SeasonType.REGULAR_SEASON;
    var seasonType = value === undefined || value === null ? "" : String(value);
    if (!seasonType) return resolvedFallback;
    if (seasonType === SeasonType.LOSERS_TOURNAMENT) {
      return SeasonType.PLAYOFFS;
    }
    return seasonType;
  }

  function mergeRowsByKey(existingRows, updatedRows, keyBuilder) {
    var map = new Map();
    (existingRows || []).forEach(function (row) {
      var key = keyBuilder(row);
      if (!key) return;
      map.set(key, row);
    });
    (updatedRows || []).forEach(function (row) {
      var key = keyBuilder(row);
      if (!key) return;
      map.set(key, row);
    });
    return Array.from(map.values());
  }

  function normalizeDateKey(value) {
    if (value === undefined || value === null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      if (isNaN(value.getTime())) return "";
      return value.toISOString().slice(0, 10);
    }

    var text = String(value).trim();
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

    var parsed = new Date(text);
    if (isNaN(parsed.getTime())) return "";
    return parsed.toISOString().slice(0, 10);
  }

  function getDatesInRangeInclusive(startDate, endDate) {
    var startKey = normalizeDateKey(startDate);
    var endKey = normalizeDateKey(endDate);
    if (!startKey || !endKey || startKey > endKey) {
      return [];
    }

    var dates = [];
    var cursor = new Date(startKey + "T00:00:00.000Z");
    var end = new Date(endKey + "T00:00:00.000Z");
    while (cursor.getTime() <= end.getTime()) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }

    return dates;
  }

  function preferNonEmpty(current, candidate) {
    if (current !== undefined && current !== null) {
      var currentText = String(current).trim();
      if (currentText) return currentText;
    }

    if (candidate !== undefined && candidate !== null) {
      return String(candidate).trim();
    }

    return "";
  }

  function canonicalizePlayerDayRows(playerDays) {
    var TEAM_STAT_FIELDS = GshlUtils.core.constants.TEAM_STAT_FIELDS;
    var formatNumber = GshlUtils.core.parse.formatNumber;
    var toNumber = GshlUtils.core.parse.toNumber;
    var playerDayMap = new Map();

    (playerDays || []).forEach(function (playerDay) {
      if (!playerDay) return;
      var playerId =
        playerDay.playerId === undefined || playerDay.playerId === null
          ? ""
          : String(playerDay.playerId).trim();
      var date = normalizeDateKey(playerDay.date);
      if (!playerId || !date) return;

      var key = playerId + "|" + date;
      var existing = playerDayMap.get(key);
      if (!existing) {
        var canonical = {
          id: playerDay.id,
          createdAt: playerDay.createdAt,
          updatedAt: playerDay.updatedAt,
          playerId: playerId,
          date: date,
          seasonId: preferNonEmpty("", playerDay.seasonId),
          gshlTeamId: preferNonEmpty("", playerDay.gshlTeamId),
          weekId: preferNonEmpty("", playerDay.weekId),
          nhlPos: uniqCsv([playerDay.nhlPos]),
          posGroup: preferNonEmpty("", playerDay.posGroup),
          nhlTeam: uniqCsv([playerDay.nhlTeam]),
          dailyPos: preferNonEmpty("", playerDay.dailyPos),
          bestPos: preferNonEmpty("", playerDay.bestPos),
          fullPos: preferNonEmpty("", playerDay.fullPos),
          opp: preferNonEmpty("", playerDay.opp),
          score: preferNonEmpty("", playerDay.score),
          Rating: "",
        };

        TEAM_STAT_FIELDS.forEach(function (field) {
          canonical[field] = formatNumber(toNumber(playerDay[field]));
        });
        canonical.GS = computePlayerDayGsValue(canonical);

        playerDayMap.set(key, canonical);
        return;
      }

      existing.seasonId = preferNonEmpty(existing.seasonId, playerDay.seasonId);
      existing.gshlTeamId = preferNonEmpty(
        existing.gshlTeamId,
        playerDay.gshlTeamId,
      );
      existing.weekId = preferNonEmpty(existing.weekId, playerDay.weekId);
      existing.posGroup = preferNonEmpty(existing.posGroup, playerDay.posGroup);
      existing.dailyPos = preferNonEmpty(existing.dailyPos, playerDay.dailyPos);
      existing.bestPos = preferNonEmpty(existing.bestPos, playerDay.bestPos);
      existing.fullPos = preferNonEmpty(existing.fullPos, playerDay.fullPos);
      existing.opp = preferNonEmpty(existing.opp, playerDay.opp);
      existing.score = preferNonEmpty(existing.score, playerDay.score);
      existing.nhlPos = uniqCsv([existing.nhlPos, playerDay.nhlPos]);
      existing.nhlTeam = uniqCsv([existing.nhlTeam, playerDay.nhlTeam]);

      TEAM_STAT_FIELDS.forEach(function (field) {
        existing[field] = formatNumber(
          toNumber(existing[field]) + toNumber(playerDay[field]),
        );
      });
      existing.GS = computePlayerDayGsValue(existing);
    });

    return Array.from(playerDayMap.values()).map(function (row) {
      var isGoalie = String(row.posGroup || "") === "G";
      row.GS = computePlayerDayGsValue(row);
      row.GAA = isGoalie ? computeGAA(row.GA, row.TOI) : "";
      row.SVP = isGoalie ? computeSVP(row.SV, row.SA) : "";
      row.Rating = "";
      return normalizeAggregateRowPrecision(row);
    });
  }

  function safeSplitCsv(value) {
    if (!value) return [];
    var text = String(value).trim();
    if (!text) return [];
    if (text.indexOf("[") === 0 && text.lastIndexOf("]") === text.length - 1) {
      try {
        var parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return parsed
            .map(function (entry) {
              return String(entry == null ? "" : entry).trim();
            })
            .filter(Boolean);
        }
      } catch (error) {
        // Fall through to CSV parsing for malformed legacy values.
      }
    }
    return text
      .split(",")
      .map(function (v) {
        return v.trim();
      })
      .filter(Boolean);
  }

  function uniqCsv(values) {
    var out = [];
    var seen = new Set();
    (values || []).forEach(function (v) {
      safeSplitCsv(v).forEach(function (token) {
        if (seen.has(token)) return;
        seen.add(token);
        out.push(token);
      });
    });
    return out.join(",");
  }

  function computeGAA(totalGA, totalTOI) {
    var ga = Number(totalGA) || 0;
    var toi = Number(totalTOI) || 0;
    if (toi <= 0) return "";
    return ((ga / toi) * 60).toFixed(5);
  }

  function computeSVP(totalSV, totalSA) {
    var sv = Number(totalSV) || 0;
    var sa = Number(totalSA) || 0;
    if (sa <= 0) return "";
    return (sv / sa).toFixed(5);
  }

  var INTEGER_AGGREGATE_FIELDS = new Set(
    GshlUtils.core.constants.TEAM_STAT_FIELDS.concat([
      "days",
      "playersUsed",
    ]),
  );

  function formatRoundedInteger(value) {
    if (value === null || value === undefined || value === "") return "";
    var num = Number(value);
    if (!isFinite(num)) return "";
    return String(Math.round(num));
  }

  function formatRoundedFixed(value, decimals) {
    if (value === null || value === undefined || value === "") return "";
    var num = Number(value);
    if (!isFinite(num)) return "";
    var factor = Math.pow(10, decimals);
    return (Math.round(num * factor) / factor).toFixed(decimals);
  }

  function normalizeAggregateFieldValue(field, value) {
    if (value === null || value === undefined || value === "") {
      return value === "" ? "" : value == null ? "" : value;
    }
    if (field === "GAA" || field === "SVP") {
      return formatRoundedFixed(value, 5);
    }
    if (field === "TOI") {
      return formatRoundedFixed(value, 2);
    }
    if (/rating$/i.test(field)) {
      return formatRoundedFixed(value, 4);
    }
    if (INTEGER_AGGREGATE_FIELDS.has(field)) {
      return formatRoundedInteger(value);
    }
    return value;
  }

  function normalizeAggregateRowPrecision(row) {
    if (!row) return row;
    Object.keys(row).forEach(function (field) {
      row[field] = normalizeAggregateFieldValue(field, row[field]);
    });
    return row;
  }

  function hasGoalieStats(source) {
    return TEAM_GOALIE_STARTER_FIELDS.some(function (field) {
      return (Number(source && source[field]) || 0) > 0;
    });
  }

  function hasQualifiedWeekGoalieStats(weekAgg, goalieStartMinimumOverride) {
    var goalieStartMinimum =
      goalieStartMinimumOverride !== undefined &&
      goalieStartMinimumOverride !== null
        ? Number(goalieStartMinimumOverride) || DEFAULT_GOALIE_START_MINIMUM
        :
      weekAgg &&
      weekAgg.goalieStartMinimum !== undefined &&
      weekAgg.goalieStartMinimum !== null
        ? Number(weekAgg.goalieStartMinimum) || DEFAULT_GOALIE_START_MINIMUM
        : DEFAULT_GOALIE_START_MINIMUM;
    var goalieStarts =
      weekAgg && weekAgg.goalieStarts !== undefined && weekAgg.goalieStarts !== null
        ? Number(weekAgg.goalieStarts) || 0
        : null;
    if (goalieStarts !== null) {
      return goalieStarts >= goalieStartMinimum;
    }
    var goalieStatDays =
      weekAgg &&
      weekAgg.goalieStatDays !== undefined &&
      weekAgg.goalieStatDays !== null
        ? Number(weekAgg.goalieStatDays) || 0
        : null;
    if (goalieStatDays !== null) {
      return goalieStatDays >= goalieStartMinimum;
    }
    return hasGoalieStats(weekAgg);
  }

  function buildPlayerSplitCountByTeam(playerSplits) {
    var map = new Map();
    (playerSplits || []).forEach(function (playerSplit) {
      if (!playerSplit) return;
      var teamId =
        playerSplit.gshlTeamId === undefined || playerSplit.gshlTeamId === null
          ? ""
          : String(playerSplit.gshlTeamId);
      if (!teamId) return;
      map.set(teamId, (map.get(teamId) || 0) + 1);
    });
    return map;
  }

  function sumField(rows, field, toNumber) {
    var sum = 0;
    for (var i = 0; i < rows.length; i++) {
      sum += toNumber(rows[i] && rows[i][field]);
    }
    return sum;
  }

  function blankFields(target, fields) {
    fields.forEach(function (f) {
      target[f] = "";
    });
  }

  function rankPlayerRows(rows, sheetName, seasonId) {
    if (
      !rows ||
      !rows.length ||
      typeof RankingEngine === "undefined" ||
      !RankingEngine ||
      typeof RankingEngine.rankRows !== "function"
    ) {
      return;
    }

    RankingEngine.rankRows(rows, {
      sheetName: sheetName,
      seasonId: seasonId,
      outputField: "Rating",
      mutate: true,
    });

    rows.forEach(function (row) {
      if (!row) return;
      if (row.Rating !== undefined) row.rating = row.Rating;
      else if (row.rating !== undefined) row.Rating = row.rating;
      normalizeAggregateRowPrecision(row);
    });
  }

  var TEAM_ALWAYS_SUM_FIELDS = [
    "GP",
    "MG",
    "IR",
    "IRplus",
    "GS",
    "ADD",
    "MS",
    "BS",
  ];

  var TEAM_SKATER_STARTER_FIELDS = [
    "G",
    "A",
    "P",
    "PM",
    "PIM",
    "PPP",
    "SOG",
    "HIT",
    "BLK",
  ];

  var TEAM_GOALIE_STARTER_FIELDS = ["W", "GA", "SV", "SA", "SO", "TOI"];
  var SKATER_STARTER_FIELD_SET = new Set(TEAM_SKATER_STARTER_FIELDS);
  var GOALIE_STARTER_FIELD_SET = new Set(TEAM_GOALIE_STARTER_FIELDS);
  var STARTING_DAILY_POSITIONS = new Set(["C", "LW", "RW", "D", "G", "UTIL"]);
  var NON_STARTING_DAILY_POSITIONS = new Set(["BN", "IR", "IR+"]);
  var FALLBACK_SEASON_CATEGORIES = [
    "G",
    "A",
    "P",
    "PM",
    "PPP",
    "SOG",
    "HIT",
    "BLK",
    "W",
    "GAA",
    "SVP",
  ];
  var DEFAULT_GOALIE_START_MINIMUM = 2;
  var SINGLE_GOALIE_START_SEASON_IDS = new Set(["1"]);

  function normalizeDailyPosToken(value) {
    var token =
      value === undefined || value === null ? "" : String(value).trim().toUpperCase();
    if (token === "UTIL") return "UTIL";
    return token;
  }

  function isStarterPlayerDay(playerDay) {
    var dailyPos = normalizeDailyPosToken(playerDay && playerDay.dailyPos);
    if (STARTING_DAILY_POSITIONS.has(dailyPos)) return true;
    if (NON_STARTING_DAILY_POSITIONS.has(dailyPos) || dailyPos) return false;
    return String((playerDay && playerDay.GS) || "").trim() === "1";
  }

  function computePlayerDayGsValue(playerDay) {
    return isStarterPlayerDay(playerDay) ? "1" : "0";
  }

  function normalizeSeasonCategory(category) {
    var normalized =
      category === undefined || category === null
        ? ""
        : String(category).trim().toUpperCase();
    if (!normalized) return null;
    if (
      SKATER_STARTER_FIELD_SET.has(normalized) ||
      GOALIE_STARTER_FIELD_SET.has(normalized) ||
      normalized === "GAA" ||
      normalized === "SVP"
    ) {
      return normalized;
    }
    return null;
  }

  function parseSeasonCategories(rawValue) {
    if (Array.isArray(rawValue)) {
      return rawValue
        .map(normalizeSeasonCategory)
        .filter(Boolean);
    }
    if (typeof rawValue === "string") {
      return rawValue
        .split(",")
        .map(normalizeSeasonCategory)
        .filter(Boolean);
    }
    return [];
  }

  function getGoalieStartMinimumForSeason(season) {
    var seasonId =
      season && season.id !== undefined && season.id !== null
        ? String(season.id).trim()
        : season && season.seasonId !== undefined && season.seasonId !== null
          ? String(season.seasonId).trim()
          : "";
    return SINGLE_GOALIE_START_SEASON_IDS.has(seasonId)
      ? 1
      : DEFAULT_GOALIE_START_MINIMUM;
  }

  function buildSeasonAggregationFieldConfig(season) {
    var configuredCategories = parseSeasonCategories(season && season.categories);
    var resolvedCategories = configuredCategories.length
      ? configuredCategories
      : FALLBACK_SEASON_CATEGORIES.slice();
    var activeCategories = new Set(resolvedCategories);
    var activeStarterFields = new Set(["GA", "SV", "SA"]);

    resolvedCategories.forEach(function (category) {
      if (SKATER_STARTER_FIELD_SET.has(category) || GOALIE_STARTER_FIELD_SET.has(category)) {
        activeStarterFields.add(category);
        return;
      }
      if (category === "GAA") {
        activeStarterFields.add("GA");
        activeStarterFields.add("TOI");
        return;
      }
      if (category === "SVP") {
        activeStarterFields.add("SV");
        activeStarterFields.add("SA");
      }
    });

    return {
      activeCategories: activeCategories,
      activeStarterFields: activeStarterFields,
      goalieStartMinimum: getGoalieStartMinimumForSeason(season),
    };
  }

  function addFieldsToBucket(bucket, source, fields, toNumber) {
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      bucket[field] = (bucket[field] || 0) + toNumber(source && source[field]);
    }
  }

  function createPlayerWeekBucket(
    seasonId,
    weekId,
    teamId,
    playerId,
    seasonType,
    posGroup,
    statFields,
  ) {
    var bucket = {
      playerId: playerId,
      gshlTeamId: teamId,
      seasonId: seasonId,
      weekId: weekId,
      seasonType: seasonType,
      posGroup: posGroup || "",
      nhlPosValues: [],
      nhlTeamValues: [],
      days: 0,
    };

    statFields.forEach(function (field) {
      bucket[field] = 0;
    });

    return bucket;
  }

  function addPlayerDayToWeekBucket(bucket, playerDay, fieldConfig, toNumber) {
    fieldConfig = fieldConfig || buildSeasonAggregationFieldConfig(null);
    bucket.days += 1;
    if (!bucket.posGroup && playerDay && playerDay.posGroup) {
      bucket.posGroup = String(playerDay.posGroup);
    }
    if (playerDay && playerDay.nhlPos)
      bucket.nhlPosValues.push(playerDay.nhlPos);
    if (playerDay && playerDay.nhlTeam) {
      bucket.nhlTeamValues.push(playerDay.nhlTeam);
    }

    addFieldsToBucket(bucket, playerDay, TEAM_ALWAYS_SUM_FIELDS, toNumber);

    if (!isStarterPlayerDay(playerDay)) return;

    if (String(bucket.posGroup || playerDay.posGroup || "") === "G") {
      addFieldsToBucket(
        bucket,
        playerDay,
        TEAM_GOALIE_STARTER_FIELDS.filter(function (field) {
          return fieldConfig.activeStarterFields.has(field);
        }),
        toNumber,
      );
      return;
    }

    addFieldsToBucket(
      bucket,
      playerDay,
      TEAM_SKATER_STARTER_FIELDS.filter(function (field) {
        return fieldConfig.activeStarterFields.has(field);
      }),
      toNumber,
    );
  }

  function buildPlayerWeekRowFromBucket(
    bucket,
    statFields,
    formatNumber,
    fieldConfig,
  ) {
    fieldConfig = fieldConfig || buildSeasonAggregationFieldConfig(null);
    var isGoalie = String(bucket.posGroup || "") === "G";
    var row = {
      playerId: bucket.playerId,
      gshlTeamId: bucket.gshlTeamId,
      seasonId: bucket.seasonId,
      weekId: bucket.weekId,
      seasonType: bucket.seasonType,
      nhlPos: uniqCsv(bucket.nhlPosValues),
      posGroup: bucket.posGroup,
      nhlTeam: uniqCsv(bucket.nhlTeamValues),
      days: formatNumber(bucket.days),
      Rating: "",
    };

    TEAM_ALWAYS_SUM_FIELDS.forEach(function (field) {
      row[field] = formatNumber(bucket[field]);
    });

    if (isGoalie) {
      TEAM_GOALIE_STARTER_FIELDS.forEach(function (field) {
        row[field] = fieldConfig.activeStarterFields.has(field)
          ? formatNumber(bucket[field])
          : "";
      });
      blankFields(row, TEAM_SKATER_STARTER_FIELDS);
      row.GAA = fieldConfig.activeCategories.has("GAA")
        ? computeGAA(row.GA, row.TOI)
        : "";
      row.SVP = fieldConfig.activeCategories.has("SVP")
        ? computeSVP(row.SV, row.SA)
        : "";
    } else {
      TEAM_SKATER_STARTER_FIELDS.forEach(function (field) {
        row[field] = fieldConfig.activeStarterFields.has(field)
          ? formatNumber(bucket[field])
          : "";
      });
      blankFields(row, TEAM_GOALIE_STARTER_FIELDS.concat(["GAA", "SVP"]));
    }

    statFields.forEach(function (field) {
      if (row[field] === undefined) row[field] = "";
    });

    return normalizeAggregateRowPrecision(row);
  }

  function buildPlayerAggregateFromWeeks(base, weeksArr, opts, context) {
    var fieldConfig =
      (context && context.fieldConfig) || buildSeasonAggregationFieldConfig(null);
    var isGoalie = base.posGroup === "G";
    var statFields = context.statFields;
    var toNumber = context.toNumber;
    var formatNumber = context.formatNumber;

    var agg = {
      playerId: opts.playerId,
      seasonId: context.seasonId,
      seasonType: opts.seasonType,
      posGroup: base.posGroup,
      nhlPos: uniqCsv(
        weeksArr.map(function (w) {
          return w && w.nhlPos;
        }),
      ),
      nhlTeam: uniqCsv(
        weeksArr.map(function (w) {
          return w && w.nhlTeam;
        }),
      ),
      days: formatNumber(
        weeksArr.reduce(function (p, c) {
          return p + toNumber(c && c.days);
        }, 0),
      ),
      Rating: "",
    };

    if (opts.gshlTeamId) {
      agg.gshlTeamId = opts.gshlTeamId;
    }
    if (opts.gshlTeamIds) {
      agg.gshlTeamIds = uniqCsv(opts.gshlTeamIds);
    }

    statFields.forEach(function (field) {
      var sum = sumField(weeksArr, field, toNumber);

      if (TEAM_ALWAYS_SUM_FIELDS.indexOf(field) !== -1) {
        agg[field] = formatNumber(sum);
      } else if (isGoalie && SKATER_STARTER_FIELD_SET.has(field)) {
        agg[field] = "";
      } else if (!isGoalie && GOALIE_STARTER_FIELD_SET.has(field)) {
        agg[field] = "";
      } else if (!fieldConfig.activeStarterFields.has(field)) {
        agg[field] = "";
      } else {
        agg[field] = formatNumber(sum);
      }
    });

    if (isGoalie) {
      agg.GAA = fieldConfig.activeCategories.has("GAA")
        ? computeGAA(agg.GA, agg.TOI)
        : "";
      agg.SVP = fieldConfig.activeCategories.has("SVP")
        ? computeSVP(agg.SV, agg.SA)
        : "";
    } else {
      agg.GAA = "";
      agg.SVP = "";
    }

    return normalizeAggregateRowPrecision(agg);
  }

  function buildPlayerSplitsAndTotalsFromWeeks(playerWeeks, context) {
    var SeasonType = GshlUtils.core.constants.SeasonType;
    var playerSplitsMap = new Map();
    var playerTotalsMap = new Map();

    function resolveSeasonTypeForWeekRow(pw) {
      var raw = pw && pw.seasonType ? String(pw.seasonType) : "";
      if (raw) return normalizeSeasonType(raw, SeasonType.REGULAR_SEASON);
      var fromWeek =
        context.weekTypeMap && context.weekTypeMap.get(String(pw && pw.weekId));
      return fromWeek || context.defaultSeasonType || SeasonType.REGULAR_SEASON;
    }

    playerWeeks.forEach(function (pw) {
      if (!pw) return;
      var playerId =
        pw.playerId === undefined || pw.playerId === null
          ? ""
          : String(pw.playerId);
      var teamId =
        pw.gshlTeamId === undefined || pw.gshlTeamId === null
          ? ""
          : String(pw.gshlTeamId);
      if (!playerId || !teamId) return;

      var seasonType = resolveSeasonTypeForWeekRow(pw);
      var totalKey = playerId + "|" + String(seasonType);
      if (!playerTotalsMap.has(totalKey)) playerTotalsMap.set(totalKey, []);
      playerTotalsMap.get(totalKey).push(pw);

      var splitKey = playerId + "|" + teamId + "|" + String(seasonType);
      if (!playerSplitsMap.has(splitKey)) playerSplitsMap.set(splitKey, []);
      playerSplitsMap.get(splitKey).push(pw);
    });

    var playerSplits = [];
    var playerTotals = [];

    playerSplitsMap.forEach(function (weeksArr, splitKey) {
      if (!weeksArr || !weeksArr.length) return;
      var parts = splitKey.split("|");
      playerSplits.push(
        buildPlayerAggregateFromWeeks(
          weeksArr[0],
          weeksArr,
          {
            playerId: parts[0],
            gshlTeamId: parts[1],
            seasonType: parts[2],
          },
          context,
        ),
      );
    });

    playerTotalsMap.forEach(function (weeksArr, totalKey) {
      if (!weeksArr || !weeksArr.length) return;
      var parts = totalKey.split("|");
      playerTotals.push(
        buildPlayerAggregateFromWeeks(
          weeksArr[0],
          weeksArr,
          {
            playerId: parts[0],
            seasonType: parts[1],
            gshlTeamIds: weeksArr.map(function (w) {
              return w && w.gshlTeamId;
            }),
          },
          context,
        ),
      );
    });

    return {
      splits: playerSplits,
      totals: playerTotals,
    };
  }

  // ============================================================================
  // PLAYER AGGREGATION
  // ============================================================================

  /**
   * Builds PlayerSplitStatLine + PlayerTotalStatLine from PlayerWeekStatLine.
   *
   * Internal alternate aggregation path from existing PlayerWeek rows.
   */
  ns.updatePlayerSplitsAndTotalsFromExistingPlayerWeeks =
    function updatePlayerSplitsAndTotalsFromExistingPlayerWeeks(seasonId) {
      var seasonKey = requireSeason(
        seasonId,
        "updatePlayerSplitsAndTotalsFromExistingPlayerWeeks",
      );

      var SeasonType = GshlUtils.core.constants.SeasonType;
      var TEAM_STAT_FIELDS = GshlUtils.core.constants.TEAM_STAT_FIELDS;

      var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
      var upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;

      var toNumber = GshlUtils.core.parse.toNumber;
      var formatNumber = GshlUtils.core.parse.formatNumber;

      var season = fetchSheetAsObjects(SPREADSHEET_ID, "Season").find(
        function (s) {
          return String(s && s.id) === seasonKey;
        },
      );
      if (!season) {
        console.log("[StatsAggregator] Season not found for id", seasonKey);
        return;
      }
      var fieldConfig = buildSeasonAggregationFieldConfig(season);

      var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
        function (w) {
          return String(w && w.seasonId) === String(season.id);
        },
      );

      var weekTypeMap = new Map();
      weeks.forEach(function (week) {
        weekTypeMap.set(
          String(week.id),
          normalizeSeasonType(week.weekType, SeasonType.REGULAR_SEASON),
        );
      });

      var playerWeeks = fetchSheetAsObjects(
        PLAYERSTATS_SPREADSHEET_ID,
        "PlayerWeekStatLine",
      ).filter(function (pw) {
        return String(pw && pw.seasonId) === String(season.id);
      });

      var playerAggregates = buildPlayerSplitsAndTotalsFromWeeks(playerWeeks, {
        seasonId: season.id,
        weekTypeMap: weekTypeMap,
        defaultSeasonType: SeasonType.REGULAR_SEASON,
        statFields: TEAM_STAT_FIELDS,
        fieldConfig: fieldConfig,
        toNumber: toNumber,
        formatNumber: formatNumber,
      });
      var playerSplits = playerAggregates.splits;
      var playerTotals = playerAggregates.totals;

      rankPlayerRows(playerSplits, "PlayerSplitStatLine", seasonKey);
      rankPlayerRows(playerTotals, "PlayerTotalStatLine", seasonKey);

      upsertSheetByKeys(
        PLAYERSTATS_SPREADSHEET_ID,
        "PlayerSplitStatLine",
        ["playerId", "seasonId", "gshlTeamId", "seasonType"],
        playerSplits,
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
          deleteMissing: {
            filter: {
              seasonId: String(season.id),
            },
          },
        },
      );

      upsertSheetByKeys(
        PLAYERSTATS_SPREADSHEET_ID,
        "PlayerTotalStatLine",
        ["playerId", "seasonId", "seasonType"],
        playerTotals,
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
          deleteMissing: {
            filter: {
              seasonId: String(season.id),
            },
          },
        },
      );

      console.log(
        "[StatsAggregator] Updated player splits/totals from existing weeks for season",
        seasonKey,
        "(splits:",
        playerSplits.length,
        "totals:",
        playerTotals.length,
        ")",
      );
    };

  ns.updatePlayerStatsForSeasonFromExistingPlayerWeeks =
    ns.updatePlayerSplitsAndTotalsFromExistingPlayerWeeks;

  /**
   * Rolls up player days -> weeks -> splits + totals for a season.
   * Writes PlayerWeekStatLine, PlayerSplitStatLine, PlayerTotalStatLine.
   */
  ns.updatePlayerStatsForSeason = function updatePlayerStatsForSeason(
    seasonId,
  ) {
    var seasonKey = requireSeason(seasonId, "updatePlayerStatsForSeason");

    var SeasonType = GshlUtils.core.constants.SeasonType;
    var TEAM_STAT_FIELDS = GshlUtils.core.constants.TEAM_STAT_FIELDS;

    var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
    var upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;
    var getPlayerDayWorkbookId =
      GshlUtils.domain.workbooks.getPlayerDayWorkbookId;
    var isStarter = GshlUtils.domain.players.isStarter;

    var toNumber = GshlUtils.core.parse.toNumber;
    var formatNumber = GshlUtils.core.parse.formatNumber;

    var season = fetchSheetAsObjects(SPREADSHEET_ID, "Season").find(
      function (s) {
        return String(s && s.id) === seasonKey;
      },
    );
    if (!season) {
      console.log("[StatsAggregator] Season not found for id", seasonKey);
      return;
    }
    var fieldConfig = buildSeasonAggregationFieldConfig(season);

    var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
      function (w) {
        return String(w && w.seasonId) === String(season.id);
      },
    );

    var playerDayWorkbookId = getPlayerDayWorkbookId(season.id);
    var rawPlayerDays = fetchSheetAsObjects(
      playerDayWorkbookId,
      "PlayerDayStatLine",
    ).filter(function (pd) {
      return String(pd.seasonId) === String(season.id);
    });
    var playerDays = canonicalizePlayerDayRows(rawPlayerDays);

    var weekTypeMap = new Map();
    weeks.forEach(function (week) {
      weekTypeMap.set(
        String(week.id),
        normalizeSeasonType(week.weekType, SeasonType.REGULAR_SEASON),
      );
    });

    rankPlayerRows(playerDays, "PlayerDayStatLine", seasonKey);
    upsertSheetByKeys(
      playerDayWorkbookId,
      "PlayerDayStatLine",
      ["playerId", "date"],
      playerDays,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
        deleteMissing: {
          filter: {
            seasonId: String(season.id),
          },
        },
      },
    );

    var playerWeekMap = new Map();
    playerDays.forEach(function (pd) {
      if (!pd) return;
      var weekId =
        pd.weekId === undefined || pd.weekId === null ? "" : String(pd.weekId);
      var weekSeasonType = weekTypeMap.get(weekId);
      if (!weekId || !weekSeasonType) return;

      var playerId =
        pd.playerId === undefined || pd.playerId === null
          ? ""
          : String(pd.playerId);
      var gshlTeamId =
        pd.gshlTeamId === undefined || pd.gshlTeamId === null
          ? ""
          : String(pd.gshlTeamId);
      if (!playerId || !gshlTeamId) return;

      var key = weekId + "|" + gshlTeamId + "|" + playerId;
      if (!playerWeekMap.has(key)) {
        playerWeekMap.set(
          key,
          createPlayerWeekBucket(
            String(season.id),
            weekId,
            gshlTeamId,
            playerId,
            weekSeasonType,
            pd.posGroup ? String(pd.posGroup) : "",
            TEAM_STAT_FIELDS,
          ),
        );
      }

      addPlayerDayToWeekBucket(
        playerWeekMap.get(key),
        pd,
        fieldConfig,
        toNumber,
      );
    });

    var playerWeeks = Array.from(playerWeekMap.values()).map(function (bucket) {
      return buildPlayerWeekRowFromBucket(
        bucket,
        TEAM_STAT_FIELDS,
        formatNumber,
        fieldConfig,
      );
    });

    var playerAggregates = buildPlayerSplitsAndTotalsFromWeeks(playerWeeks, {
      seasonId: season.id,
      weekTypeMap: weekTypeMap,
      defaultSeasonType: SeasonType.REGULAR_SEASON,
      statFields: TEAM_STAT_FIELDS,
      fieldConfig: fieldConfig,
      toNumber: toNumber,
      formatNumber: formatNumber,
    });
    var playerSplits = playerAggregates.splits;
    var playerTotals = playerAggregates.totals;

    rankPlayerRows(playerWeeks, "PlayerWeekStatLine", seasonKey);
    rankPlayerRows(playerSplits, "PlayerSplitStatLine", seasonKey);
    rankPlayerRows(playerTotals, "PlayerTotalStatLine", seasonKey);

    // Persist
    upsertSheetByKeys(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerWeekStatLine",
      ["playerId", "gshlTeamId", "weekId"],
        playerWeeks,
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
          deleteMissing: {
            filter: {
              seasonId: String(season.id),
            },
          },
        },
      );

    upsertSheetByKeys(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerSplitStatLine",
      ["playerId", "seasonId", "gshlTeamId", "seasonType"],
        playerSplits,
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
          deleteMissing: {
            filter: {
              seasonId: String(season.id),
            },
          },
        },
      );

    upsertSheetByKeys(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerTotalStatLine",
      ["playerId", "seasonId", "seasonType"],
        playerTotals,
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
          deleteMissing: {
            filter: {
              seasonId: String(season.id),
            },
          },
        },
      );

    console.log(
      "[StatsAggregator] Updated player aggregates for season",
      seasonKey,
      "(weeks:",
      playerWeeks.length,
      "splits:",
      playerSplits.length,
      "totals:",
      playerTotals.length,
      ")",
    );

    return {
      seasonId: seasonKey,
      playerWeeks: playerWeeks.length,
      playerSplits: playerSplits.length,
      playerTotals: playerTotals.length,
    };
  };

  ns.updatePlayerStatsForWeekIds = function updatePlayerStatsForWeekIds(
    seasonId,
    weekIds,
  ) {
    var seasonKey = requireSeason(seasonId, "updatePlayerStatsForWeekIds");
    var selectedWeekIds = requireWeekIds(
      weekIds,
      "updatePlayerStatsForWeekIds",
    );

    var SeasonType = GshlUtils.core.constants.SeasonType;
    var TEAM_STAT_FIELDS = GshlUtils.core.constants.TEAM_STAT_FIELDS;

    var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
    var upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;
    var getPlayerDayWorkbookId =
      GshlUtils.domain.workbooks.getPlayerDayWorkbookId;
    var isStarter = GshlUtils.domain.players.isStarter;

    var toNumber = GshlUtils.core.parse.toNumber;
    var formatNumber = GshlUtils.core.parse.formatNumber;

    var season = fetchSheetAsObjects(SPREADSHEET_ID, "Season").find(
      function (s) {
        return String(s && s.id) === seasonKey;
      },
    );
    if (!season) {
      throw new Error("[StatsAggregator] Season not found for id " + seasonKey);
    }
    var fieldConfig = buildSeasonAggregationFieldConfig(season);

    var seasonIdStr = String(season.id);
    var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
      function (w) {
        return String(w && w.seasonId) === seasonIdStr;
      },
    );
    var weekById = buildWeekMapById(weeks);
    var weekIdSet = new Set(
      selectedWeekIds.filter(function (weekId) {
        return weekById.has(String(weekId));
      }),
    );
    if (weekIdSet.size !== selectedWeekIds.length) {
      throw new Error(
        "[StatsAggregator] updatePlayerStatsForWeekIds could not resolve every requested weekId",
      );
    }

    var weekTypeMap = buildWeekTypeMap(weeks, SeasonType.REGULAR_SEASON);
    var playerDayWorkbookId = getPlayerDayWorkbookId(season.id);
    var playerDays = fetchSheetAsObjects(
      playerDayWorkbookId,
      "PlayerDayStatLine",
    ).filter(function (pd) {
      return (
        String(pd && pd.seasonId) === seasonIdStr &&
        weekIdSet.has(String(pd && pd.weekId))
      );
    });

    if (!playerDays.length) {
      console.log(
        "[StatsAggregator] No player days found for selected weeks in season",
        seasonKey,
      );
      return {
        seasonId: seasonKey,
        weekIds: selectedWeekIds,
        playerWeeks: [],
        playerSplits: [],
        playerTotals: [],
        touchedPlayerIds: [],
      };
    }

    var playerWeekMap = new Map();
    playerDays.forEach(function (pd) {
      if (!pd) return;
      var weekId =
        pd.weekId === undefined || pd.weekId === null ? "" : String(pd.weekId);
      var weekSeasonType = weekTypeMap.get(weekId);
      if (!weekId || !weekSeasonType) return;

      var playerId =
        pd.playerId === undefined || pd.playerId === null
          ? ""
          : String(pd.playerId);
      var gshlTeamId =
        pd.gshlTeamId === undefined || pd.gshlTeamId === null
          ? ""
          : String(pd.gshlTeamId);
      if (!playerId || !gshlTeamId) return;

      var key = weekId + "|" + gshlTeamId + "|" + playerId;
      if (!playerWeekMap.has(key)) {
        playerWeekMap.set(
          key,
          createPlayerWeekBucket(
            seasonIdStr,
            weekId,
            gshlTeamId,
            playerId,
            weekSeasonType,
            pd.posGroup ? String(pd.posGroup) : "",
            TEAM_STAT_FIELDS,
          ),
        );
      }

      addPlayerDayToWeekBucket(
        playerWeekMap.get(key),
        pd,
        fieldConfig,
        toNumber,
      );
    });

    var playerWeeks = Array.from(playerWeekMap.values()).map(function (bucket) {
      return buildPlayerWeekRowFromBucket(
        bucket,
        TEAM_STAT_FIELDS,
        formatNumber,
        fieldConfig,
      );
    });
    rankPlayerRows(playerWeeks, "PlayerWeekStatLine", seasonKey);

    upsertSheetByKeys(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerWeekStatLine",
      ["gshlTeamId", "playerId", "weekId", "seasonId"],
      playerWeeks,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
      },
    );

    var existingSeasonPlayerWeeks = fetchSheetAsObjects(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerWeekStatLine",
    ).filter(function (pw) {
      return String(pw && pw.seasonId) === seasonIdStr;
    });
    var touchedPlayerIds = new Set();
    existingSeasonPlayerWeeks.forEach(function (pw) {
      if (!pw || !weekIdSet.has(String(pw.weekId))) return;
      if (pw.playerId !== undefined && pw.playerId !== null) {
        touchedPlayerIds.add(String(pw.playerId));
      }
    });
    playerWeeks.forEach(function (pw) {
      if (pw && pw.playerId !== undefined && pw.playerId !== null) {
        touchedPlayerIds.add(String(pw.playerId));
      }
    });

    var mergedSeasonPlayerWeeks = mergeRowsByKey(
      existingSeasonPlayerWeeks,
      playerWeeks,
      function (row) {
        if (!row) return "";
        return [
          row.playerId === undefined || row.playerId === null
            ? ""
            : String(row.playerId),
          row.gshlTeamId === undefined || row.gshlTeamId === null
            ? ""
            : String(row.gshlTeamId),
          row.weekId === undefined || row.weekId === null
            ? ""
            : String(row.weekId),
        ].join("|");
      },
    ).filter(function (pw) {
      return pw && touchedPlayerIds.has(String(pw.playerId));
    });

    var playerAggregates = buildPlayerSplitsAndTotalsFromWeeks(
      mergedSeasonPlayerWeeks,
      {
        seasonId: season.id,
        weekTypeMap: weekTypeMap,
        defaultSeasonType: SeasonType.REGULAR_SEASON,
        statFields: TEAM_STAT_FIELDS,
        fieldConfig: fieldConfig,
        toNumber: toNumber,
        formatNumber: formatNumber,
      },
    );
    var playerSplits = playerAggregates.splits;
    var playerTotals = playerAggregates.totals;

    rankPlayerRows(playerSplits, "PlayerSplitStatLine", seasonKey);
    rankPlayerRows(playerTotals, "PlayerTotalStatLine", seasonKey);

    upsertSheetByKeys(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerSplitStatLine",
      ["playerId", "seasonId", "gshlTeamId", "seasonType"],
      playerSplits,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
      },
    );

    upsertSheetByKeys(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerTotalStatLine",
      ["playerId", "seasonId", "seasonType"],
      playerTotals,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
      },
    );

    console.log(
      "[StatsAggregator] Updated player aggregates for selected weeks in season",
      seasonKey,
      "(weekIds:",
      selectedWeekIds.join(","),
      "weeks:",
      playerWeeks.length,
      "splits:",
      playerSplits.length,
      "totals:",
      playerTotals.length,
      ")",
    );

    return {
      seasonId: seasonKey,
      weekIds: selectedWeekIds,
      playerWeeks: playerWeeks,
      playerSplits: playerSplits,
      playerTotals: playerTotals,
      touchedPlayerIds: Array.from(touchedPlayerIds),
    };
  };

  // ============================================================================
  // TEAM AGGREGATION
  // ============================================================================

  /**
   * Week-first team rollups: PlayerWeek -> TeamWeek -> TeamSeason.
   *
   * When starting from PlayerWeekStatLine, TeamDayStatLine is intentionally ignored.
   */
  ns.updateTeamStatsForSeasonFromExistingPlayerWeeks =
    function updateTeamStatsForSeasonFromExistingPlayerWeeks(
      seasonId,
      options,
    ) {
      var seasonKey = requireSeason(
        seasonId,
        "updateTeamStatsForSeasonFromExistingPlayerWeeks",
      );

      var SeasonType = GshlUtils.core.constants.SeasonType;
      var TEAM_STAT_FIELDS = GshlUtils.core.constants.TEAM_STAT_FIELDS;

      var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
      var upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;
      var getDatesInRangeInclusive =
        GshlUtils.core.date.getDatesInRangeInclusive;
      var toNumber = GshlUtils.core.parse.toNumber;

      var season = fetchSheetAsObjects(SPREADSHEET_ID, "Season").find(
        function (s) {
          return String(s && s.id) === seasonKey;
        },
      );
      if (!season) {
        console.log("[StatsAggregator] Season not found for id", seasonKey);
        return;
      }
      var fieldConfig = buildSeasonAggregationFieldConfig(season);

      var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
        function (w) {
          return String(w && w.seasonId) === String(season.id);
        },
      );
      if (!weeks.length) return;

      var weekTypeMap = new Map();
      var weekDayCountMap = new Map();
      weeks.forEach(function (week) {
        var weekId = String(week.id);
        weekTypeMap.set(
          weekId,
          normalizeSeasonType(week.weekType, SeasonType.REGULAR_SEASON),
        );
        var dates =
          getDatesInRangeInclusive(week.startDate, week.endDate) || [];
        weekDayCountMap.set(weekId, dates.length || 0);
      });

      var seasonIdStr = String(season.id);
      var playerSplits = fetchSheetAsObjects(
        PLAYERSTATS_SPREADSHEET_ID,
        "PlayerSplitStatLine",
      ).filter(function (ps) {
        return String(ps && ps.seasonId) === seasonIdStr;
      });
      var playerSplitCountByTeam = buildPlayerSplitCountByTeam(playerSplits);
      var playerWeeks = fetchSheetAsObjects(
        PLAYERSTATS_SPREADSHEET_ID,
        "PlayerWeekStatLine",
      ).filter(function (pw) {
        return String(pw && pw.seasonId) === seasonIdStr;
      });

      if (!playerWeeks.length) {
        console.log(
          "[StatsAggregator] No PlayerWeekStatLine rows found for season",
          seasonKey,
        );
        return;
      }

      var teamWeekMap = new Map();

      playerWeeks.forEach(function (pw) {
        if (!pw) return;
        var teamId = pw.gshlTeamId && String(pw.gshlTeamId);
        var weekId = pw.weekId && String(pw.weekId);
        if (!teamId || !weekId) return;

        var key = weekId + "_" + teamId;
        if (!teamWeekMap.has(key)) {
          var init = {
            seasonId: seasonIdStr,
            gshlTeamId: teamId,
            weekId: weekId,
            days: weekDayCountMap.get(weekId) || 0,
            goalieStarts: 0,
          };
          TEAM_STAT_FIELDS.forEach(function (f) {
            init[f] = 0;
          });
          teamWeekMap.set(key, init);
        }

        var bucket = teamWeekMap.get(key);
        if (String(pw.posGroup || "") === "G") {
          bucket.goalieStarts += toNumber(pw.GS);
        }
        TEAM_STAT_FIELDS.forEach(function (field) {
          bucket[field] += toNumber(pw[field]);
        });
      });

      var teamWeekAggregates = Array.from(teamWeekMap.values());
      var teamWeekRows = teamWeekAggregates.map(function (week) {
        return buildTeamWeekRow(week, fieldConfig);
      });

      var teamSeasonRows = buildTeamSeasonRowsFromWeekAggregates(
        teamWeekAggregates,
        weekTypeMap,
        seasonIdStr,
        SeasonType.REGULAR_SEASON,
        TEAM_STAT_FIELDS,
        playerSplitCountByTeam,
        fieldConfig,
      );

      upsertSheetByKeys(
        TEAMSTATS_SPREADSHEET_ID,
        "TeamWeekStatLine",
        ["weekId", "gshlTeamId"],
        teamWeekRows,
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
        },
      );

      upsertSheetByKeys(
        TEAMSTATS_SPREADSHEET_ID,
        "TeamSeasonStatLine",
        ["seasonId", "gshlTeamId", "seasonType"],
        teamSeasonRows,
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
        },
      );

      console.log(
        "[StatsAggregator] Updated alternate team aggregates from PlayerWeek rows for season",
        seasonKey,
        "(weeks:",
        teamWeekRows.length,
        "seasons:",
        teamSeasonRows.length,
        ")",
      );
    };

  function buildTeamSeasonRowsFromWeekAggregates(
    teamWeekAggregates,
    weekTypeMap,
    seasonId,
    defaultSeasonType,
    statFields,
    playerSplitCountByTeam,
    fieldConfig,
  ) {
    fieldConfig = fieldConfig || buildSeasonAggregationFieldConfig(null);
    var teamSeasonMap = new Map();

    teamWeekAggregates.forEach(function (weekAgg) {
      if (!weekAgg) return;
      var teamId =
        weekAgg.gshlTeamId === undefined || weekAgg.gshlTeamId === null
          ? ""
          : String(weekAgg.gshlTeamId);
      var weekId =
        weekAgg.weekId === undefined || weekAgg.weekId === null
          ? ""
          : String(weekAgg.weekId);
      if (!teamId || !weekId) return;

      var seasonType =
        (weekTypeMap && weekTypeMap.get(weekId)) || defaultSeasonType;
      var key = teamId + ":" + String(seasonType);
      if (!teamSeasonMap.has(key)) {
        var init = {
          seasonId: seasonId,
          seasonType: seasonType,
          gshlTeamId: teamId,
          days: 0,
        };
        statFields.forEach(function (field) {
          init[field] = 0;
        });
        teamSeasonMap.set(key, init);
      }

      var bucket = teamSeasonMap.get(key);
      bucket.days += Number(weekAgg.days) || 0;
      statFields.forEach(function (field) {
        if (
          GOALIE_STARTER_FIELD_SET.has(field) &&
          !hasQualifiedWeekGoalieStats(
            weekAgg,
            fieldConfig && fieldConfig.goalieStartMinimum,
          )
        ) {
          return;
        }
        bucket[field] += Number(weekAgg[field]) || 0;
      });
    });

    return Array.from(teamSeasonMap.values()).map(function (seasonStat) {
      seasonStat.playersUsed = playerSplitCountByTeam
        ? playerSplitCountByTeam.get(String(seasonStat.gshlTeamId)) || 0
        : 0;
      return buildTeamSeasonRow(seasonStat, fieldConfig);
    });
  }

  function createTeamDayBucket(seasonId, teamId, weekId, date) {
    var TEAM_STAT_FIELDS = GshlUtils.core.constants.TEAM_STAT_FIELDS;

    var bucket = {
      seasonId: seasonId,
      gshlTeamId: teamId,
      weekId: weekId,
      date: date,
      goalieStarts: 0,
    };

    TEAM_STAT_FIELDS.forEach(function (field) {
      bucket[field] = 0;
    });

    return bucket;
  }

  function createTeamWeekBucket(day) {
    var TEAM_STAT_FIELDS = GshlUtils.core.constants.TEAM_STAT_FIELDS;

    var bucket = {
      seasonId: day.seasonId,
      gshlTeamId: day.gshlTeamId,
      weekId: day.weekId,
      days: 0,
      goalieStarts: 0,
      goalieStatDays: 0,
    };

    TEAM_STAT_FIELDS.forEach(function (field) {
      bucket[field] = 0;
    });

    return bucket;
  }

  function buildTeamDayRow(day, fieldConfig) {
    fieldConfig = fieldConfig || buildSeasonAggregationFieldConfig(null);
    var formatNumber = GshlUtils.core.parse.formatNumber;

    return normalizeAggregateRowPrecision({
      seasonId: day.seasonId,
      gshlTeamId: day.gshlTeamId,
      weekId: day.weekId,
      date: day.date,
      GP: formatNumber(day.GP),
      MG: formatNumber(day.MG),
      IR: formatNumber(day.IR),
      IRplus: formatNumber(day.IRplus),
      GS: formatNumber(day.GS),
      G: fieldConfig.activeStarterFields.has("G") ? formatNumber(day.G) : "",
      A: fieldConfig.activeStarterFields.has("A") ? formatNumber(day.A) : "",
      P: fieldConfig.activeStarterFields.has("P") ? formatNumber(day.P) : "",
      PM: fieldConfig.activeStarterFields.has("PM") ? formatNumber(day.PM) : "",
      PIM: fieldConfig.activeStarterFields.has("PIM") ? formatNumber(day.PIM) : "",
      PPP: fieldConfig.activeStarterFields.has("PPP") ? formatNumber(day.PPP) : "",
      SOG: fieldConfig.activeStarterFields.has("SOG") ? formatNumber(day.SOG) : "",
      HIT: fieldConfig.activeStarterFields.has("HIT") ? formatNumber(day.HIT) : "",
      BLK: fieldConfig.activeStarterFields.has("BLK") ? formatNumber(day.BLK) : "",
      W: fieldConfig.activeStarterFields.has("W") ? formatNumber(day.W) : "",
      GA: fieldConfig.activeStarterFields.has("GA") ? formatNumber(day.GA) : "",
      GAA: fieldConfig.activeCategories.has("GAA")
        ? computeGAA(day.GA, day.TOI)
        : "",
      SV: fieldConfig.activeStarterFields.has("SV") ? formatNumber(day.SV) : "",
      SA: fieldConfig.activeStarterFields.has("SA") ? formatNumber(day.SA) : "",
      SVP: fieldConfig.activeCategories.has("SVP")
        ? computeSVP(day.SV, day.SA)
        : "",
      SO: fieldConfig.activeStarterFields.has("SO") ? formatNumber(day.SO) : "",
      TOI: fieldConfig.activeStarterFields.has("TOI")
        ? formatNumber(day.TOI)
        : "",
      Rating: "",
      ADD: formatNumber(day.ADD),
      MS: formatNumber(day.MS),
      BS: formatNumber(day.BS),
    });
  }

  function buildTeamWeekRow(week, fieldConfig) {
    fieldConfig = fieldConfig || buildSeasonAggregationFieldConfig(null);
    var formatNumber = GshlUtils.core.parse.formatNumber;
    var hasQualifiedGoalieStats = hasQualifiedWeekGoalieStats(
      week,
      fieldConfig && fieldConfig.goalieStartMinimum,
    );

    return normalizeAggregateRowPrecision({
      seasonId: week.seasonId,
      gshlTeamId: week.gshlTeamId,
      weekId: week.weekId,
      days: formatNumber(week.days),
      GP: formatNumber(week.GP),
      MG: formatNumber(week.MG),
      IR: formatNumber(week.IR),
      IRplus: formatNumber(week.IRplus),
      GS: formatNumber(week.GS),
      G: fieldConfig.activeStarterFields.has("G") ? formatNumber(week.G) : "",
      A: fieldConfig.activeStarterFields.has("A") ? formatNumber(week.A) : "",
      P: fieldConfig.activeStarterFields.has("P") ? formatNumber(week.P) : "",
      PM: fieldConfig.activeStarterFields.has("PM") ? formatNumber(week.PM) : "",
      PIM: fieldConfig.activeStarterFields.has("PIM") ? formatNumber(week.PIM) : "",
      PPP: fieldConfig.activeStarterFields.has("PPP") ? formatNumber(week.PPP) : "",
      SOG: fieldConfig.activeStarterFields.has("SOG") ? formatNumber(week.SOG) : "",
      HIT: fieldConfig.activeStarterFields.has("HIT") ? formatNumber(week.HIT) : "",
      BLK: fieldConfig.activeStarterFields.has("BLK") ? formatNumber(week.BLK) : "",
      W:
        hasQualifiedGoalieStats && fieldConfig.activeStarterFields.has("W")
          ? formatNumber(week.W)
          : "",
      GA:
        hasQualifiedGoalieStats && fieldConfig.activeStarterFields.has("GA")
          ? formatNumber(week.GA)
          : "",
      GAA:
        hasQualifiedGoalieStats && fieldConfig.activeCategories.has("GAA")
          ? computeGAA(week.GA, week.TOI)
          : "",
      SV:
        hasQualifiedGoalieStats && fieldConfig.activeStarterFields.has("SV")
          ? formatNumber(week.SV)
          : "",
      SA:
        hasQualifiedGoalieStats && fieldConfig.activeStarterFields.has("SA")
          ? formatNumber(week.SA)
          : "",
      SVP:
        hasQualifiedGoalieStats && fieldConfig.activeCategories.has("SVP")
          ? computeSVP(week.SV, week.SA)
          : "",
      SO:
        hasQualifiedGoalieStats && fieldConfig.activeStarterFields.has("SO")
          ? formatNumber(week.SO)
          : "",
      TOI:
        hasQualifiedGoalieStats && fieldConfig.activeStarterFields.has("TOI")
          ? formatNumber(week.TOI)
          : "",
      Rating: "",
      ADD: formatNumber(week.ADD),
      MS: formatNumber(week.MS),
      BS: formatNumber(week.BS),
    });
  }

  function buildTeamSeasonRow(seasonStat, fieldConfig) {
    fieldConfig = fieldConfig || buildSeasonAggregationFieldConfig(null);
    var formatNumber = GshlUtils.core.parse.formatNumber;

    // Keep schema-compatible fields, but this module does not compute standings.
    return normalizeAggregateRowPrecision({
      seasonId: seasonStat.seasonId,
      seasonType: seasonStat.seasonType,
      gshlTeamId: seasonStat.gshlTeamId,
      days: formatNumber(seasonStat.days),
      GP: formatNumber(seasonStat.GP),
      MG: formatNumber(seasonStat.MG),
      IR: formatNumber(seasonStat.IR),
      IRplus: formatNumber(seasonStat.IRplus),
      GS: formatNumber(seasonStat.GS),
      G: fieldConfig.activeStarterFields.has("G") ? formatNumber(seasonStat.G) : "",
      A: fieldConfig.activeStarterFields.has("A") ? formatNumber(seasonStat.A) : "",
      P: fieldConfig.activeStarterFields.has("P") ? formatNumber(seasonStat.P) : "",
      PM: fieldConfig.activeStarterFields.has("PM") ? formatNumber(seasonStat.PM) : "",
      PIM: fieldConfig.activeStarterFields.has("PIM") ? formatNumber(seasonStat.PIM) : "",
      PPP: fieldConfig.activeStarterFields.has("PPP") ? formatNumber(seasonStat.PPP) : "",
      SOG: fieldConfig.activeStarterFields.has("SOG") ? formatNumber(seasonStat.SOG) : "",
      HIT: fieldConfig.activeStarterFields.has("HIT") ? formatNumber(seasonStat.HIT) : "",
      BLK: fieldConfig.activeStarterFields.has("BLK") ? formatNumber(seasonStat.BLK) : "",
      W: fieldConfig.activeStarterFields.has("W") ? formatNumber(seasonStat.W) : "",
      GA: fieldConfig.activeStarterFields.has("GA") ? formatNumber(seasonStat.GA) : "",
      GAA: fieldConfig.activeCategories.has("GAA")
        ? computeGAA(seasonStat.GA, seasonStat.TOI)
        : "",
      SV: fieldConfig.activeStarterFields.has("SV") ? formatNumber(seasonStat.SV) : "",
      SA: fieldConfig.activeStarterFields.has("SA") ? formatNumber(seasonStat.SA) : "",
      SVP: fieldConfig.activeCategories.has("SVP")
        ? computeSVP(seasonStat.SV, seasonStat.SA)
        : "",
      SO: fieldConfig.activeStarterFields.has("SO") ? formatNumber(seasonStat.SO) : "",
      TOI: fieldConfig.activeStarterFields.has("TOI")
        ? formatNumber(seasonStat.TOI)
        : "",
      ADD: formatNumber(seasonStat.ADD),
      MS: formatNumber(seasonStat.MS),
      BS: formatNumber(seasonStat.BS),
      playersUsed: formatNumber(seasonStat.playersUsed),
    });
  }

  /**
   * Rolls up starter player-days -> team day/week/season stats.
   * Writes TeamDayStatLine, TeamWeekStatLine, TeamSeasonStatLine.
   */
  ns.updateTeamStatsForSeason = function updateTeamStatsForSeason(seasonId) {
    var seasonKey = requireSeason(seasonId, "updateTeamStatsForSeason");

    var SeasonType = GshlUtils.core.constants.SeasonType;
    var TEAM_STAT_FIELDS = GshlUtils.core.constants.TEAM_STAT_FIELDS;

    var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
    var upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;
    var getPlayerDayWorkbookId =
      GshlUtils.domain.workbooks.getPlayerDayWorkbookId;
    var isStarter = GshlUtils.domain.players.isStarter;
    var toNumber = GshlUtils.core.parse.toNumber;

    var season = fetchSheetAsObjects(SPREADSHEET_ID, "Season").find(
      function (s) {
        return String(s && s.id) === seasonKey;
      },
    );
    if (!season) {
      console.log("[StatsAggregator] Season not found for id", seasonKey);
      return;
    }
    var fieldConfig = buildSeasonAggregationFieldConfig(season);

    var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
      function (w) {
        return String(w && w.seasonId) === String(season.id);
      },
    );
    var activeTeamIds = fetchSheetAsObjects(SPREADSHEET_ID, "Team")
      .filter(function (team) {
        return String(team && team.seasonId) === String(season.id);
      })
      .map(function (team) {
        return team && team.id !== undefined && team.id !== null
          ? String(team.id)
          : "";
      })
      .filter(Boolean);
    if (!weeks.length) return;

    var weekTypeMap = new Map();
    weeks.forEach(function (week) {
      weekTypeMap.set(
        String(week.id),
        week.weekType || SeasonType.REGULAR_SEASON,
      );
    });

    var seasonIdStr = String(season.id);
    var playerSplits = fetchSheetAsObjects(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerSplitStatLine",
    ).filter(function (ps) {
      return String(ps && ps.seasonId) === seasonIdStr;
    });
    var playerSplitCountByTeam = buildPlayerSplitCountByTeam(playerSplits);
    var playerWB = getPlayerDayWorkbookId(seasonIdStr);
    var playerDays = canonicalizePlayerDayRows(
      fetchSheetAsObjects(playerWB, "PlayerDayStatLine").filter(function (pd) {
        return String(pd.seasonId) === seasonIdStr;
      }),
    );

    // PlayerDay -> TeamDay
    var teamDayMap = new Map();

    weeks.forEach(function (week) {
      var weekId =
        week && week.id !== undefined && week.id !== null ? String(week.id) : "";
      if (!weekId || !weekTypeMap.has(weekId)) return;
      var dates = getDatesInRangeInclusive(week.startDate, week.endDate);
      activeTeamIds.forEach(function (teamId) {
        dates.forEach(function (dateKey) {
          var key = weekId + "|" + teamId + "|" + dateKey;
          if (!teamDayMap.has(key)) {
            teamDayMap.set(
              key,
              createTeamDayBucket(seasonIdStr, teamId, weekId, dateKey),
            );
          }
        });
      });
    });

    playerDays.forEach(function (pd) {
      var teamId = pd.gshlTeamId && String(pd.gshlTeamId);
      var weekId = pd.weekId && String(pd.weekId);
      if (!teamId || !weekId) return;
      var dateKey = normalizeDateKey(pd.date);
      if (!dateKey) return;

      var mapKey = weekId + "|" + teamId + "|" + dateKey;
      if (!teamDayMap.has(mapKey)) {
        teamDayMap.set(
          mapKey,
          createTeamDayBucket(seasonIdStr, teamId, weekId, dateKey),
        );
      }
      var bucket = teamDayMap.get(mapKey);

      TEAM_ALWAYS_SUM_FIELDS.forEach(function (field) {
        bucket[field] += toNumber(pd[field]);
      });

      if (!isStarterPlayerDay(pd)) return;

      if (String(pd.posGroup || "") === "G") {
        bucket.goalieStarts += toNumber(pd.GS);
        TEAM_GOALIE_STARTER_FIELDS.filter(function (field) {
          return fieldConfig.activeStarterFields.has(field);
        }).forEach(function (field) {
          bucket[field] += toNumber(pd[field]);
        });
        return;
      }

      TEAM_SKATER_STARTER_FIELDS.filter(function (field) {
        return fieldConfig.activeStarterFields.has(field);
      }).forEach(function (field) {
        bucket[field] += toNumber(pd[field]);
      });
    });

    var teamDayAggregates = Array.from(teamDayMap.values());
    var teamDayRows = teamDayAggregates.map(function (day) {
      return buildTeamDayRow(day, fieldConfig);
    });

    // TeamDay -> TeamWeek
    var teamWeekMap = new Map();

    teamDayAggregates.forEach(function (day) {
      var key = String(day.weekId) + "_" + String(day.gshlTeamId);
      if (!teamWeekMap.has(key)) {
        teamWeekMap.set(key, createTeamWeekBucket(day));
      }
      var weekBucket = teamWeekMap.get(key);
      weekBucket.days += 1;
      weekBucket.goalieStarts += Number(day.goalieStarts) || 0;
      if (hasGoalieStats(day)) {
        weekBucket.goalieStatDays += 1;
      }
      TEAM_STAT_FIELDS.forEach(function (field) {
        weekBucket[field] += day[field];
      });
    });

    var teamWeekAggregates = Array.from(teamWeekMap.values());
    var teamWeekRows = teamWeekAggregates.map(function (week) {
      return buildTeamWeekRow(week, fieldConfig);
    });

    var teamSeasonRows = buildTeamSeasonRowsFromWeekAggregates(
      teamWeekAggregates,
      weekTypeMap,
      seasonIdStr,
      SeasonType.REGULAR_SEASON,
      TEAM_STAT_FIELDS,
      playerSplitCountByTeam,
      fieldConfig,
    );

    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamDayStatLine",
      ["date", "gshlTeamId"],
        teamDayRows,
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
          deleteMissing: {
            filter: {
              seasonId: seasonIdStr,
            },
          },
        },
      );

    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
      ["weekId", "gshlTeamId"],
        teamWeekRows,
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
          deleteMissing: {
            filter: {
              seasonId: seasonIdStr,
            },
          },
        },
      );

    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamSeasonStatLine",
      ["seasonId", "gshlTeamId", "seasonType"],
        teamSeasonRows,
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
          deleteMissing: {
            filter: {
              seasonId: seasonIdStr,
            },
          },
        },
      );

    console.log(
      "[StatsAggregator] Updated team aggregates for season",
      seasonKey,
      "(days:",
      teamDayRows.length,
      "weeks:",
      teamWeekRows.length,
      "seasons:",
      teamSeasonRows.length,
      ")",
    );

    return {
      seasonId: seasonKey,
      teamDays: teamDayRows.length,
      teamWeeks: teamWeekRows.length,
      teamSeasons: teamSeasonRows.length,
    };
  };

  ns.updateTeamStatsForWeekIds = function updateTeamStatsForWeekIds(
    seasonId,
    weekIds,
  ) {
    var seasonKey = requireSeason(seasonId, "updateTeamStatsForWeekIds");
    var selectedWeekIds = requireWeekIds(weekIds, "updateTeamStatsForWeekIds");

    var SeasonType = GshlUtils.core.constants.SeasonType;
    var TEAM_STAT_FIELDS = GshlUtils.core.constants.TEAM_STAT_FIELDS;

    var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
    var upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;
    var getPlayerDayWorkbookId =
      GshlUtils.domain.workbooks.getPlayerDayWorkbookId;
    var isStarter = GshlUtils.domain.players.isStarter;
    var formatDateOnly = GshlUtils.core.date.formatDateOnly;
    var toNumber = GshlUtils.core.parse.toNumber;

    var season = fetchSheetAsObjects(SPREADSHEET_ID, "Season").find(
      function (s) {
        return String(s && s.id) === seasonKey;
      },
    );
    if (!season) {
      throw new Error("[StatsAggregator] Season not found for id " + seasonKey);
    }
    var fieldConfig = buildSeasonAggregationFieldConfig(season);

    var seasonIdStr = String(season.id);
    var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
      function (w) {
        return String(w && w.seasonId) === seasonIdStr;
      },
    );
    var weekById = buildWeekMapById(weeks);
    var weekIdSet = new Set(
      selectedWeekIds.filter(function (weekId) {
        return weekById.has(String(weekId));
      }),
    );
    if (weekIdSet.size !== selectedWeekIds.length) {
      throw new Error(
        "[StatsAggregator] updateTeamStatsForWeekIds could not resolve every requested weekId",
      );
    }

    var weekTypeMap = buildWeekTypeMap(weeks, SeasonType.REGULAR_SEASON);
    var playerSplits = fetchSheetAsObjects(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerSplitStatLine",
    ).filter(function (ps) {
      return String(ps && ps.seasonId) === seasonIdStr;
    });
    var playerSplitCountByTeam = buildPlayerSplitCountByTeam(playerSplits);
    var playerWB = getPlayerDayWorkbookId(seasonIdStr);
    var playerDays = fetchSheetAsObjects(playerWB, "PlayerDayStatLine").filter(
      function (pd) {
        return (
          String(pd && pd.seasonId) === seasonIdStr &&
          weekIdSet.has(String(pd && pd.weekId))
        );
      },
    );

    if (!playerDays.length) {
      console.log(
        "[StatsAggregator] No player days found for selected team-week rebuild in season",
        seasonKey,
      );
      return {
        seasonId: seasonKey,
        weekIds: selectedWeekIds,
        teamDays: [],
        teamWeeks: [],
        teamSeasons: [],
        touchedTeamIds: [],
      };
    }

    var teamDayMap = new Map();
    playerDays.forEach(function (pd) {
      var teamId = pd.gshlTeamId && String(pd.gshlTeamId);
      var weekId = pd.weekId && String(pd.weekId);
      if (!teamId || !weekId) return;
      var dateKey = formatDateOnly(pd.date);
      if (!dateKey) return;

      var mapKey = weekId + "|" + teamId + "|" + dateKey;
      if (!teamDayMap.has(mapKey)) {
        teamDayMap.set(
          mapKey,
          createTeamDayBucket(seasonIdStr, teamId, weekId, dateKey),
        );
      }
      var bucket = teamDayMap.get(mapKey);

      TEAM_ALWAYS_SUM_FIELDS.forEach(function (field) {
        bucket[field] += toNumber(pd[field]);
      });

      if (!isStarterPlayerDay(pd)) return;

      if (String(pd.posGroup || "") === "G") {
        bucket.goalieStarts += toNumber(pd.GS);
        TEAM_GOALIE_STARTER_FIELDS.filter(function (field) {
          return fieldConfig.activeStarterFields.has(field);
        }).forEach(function (field) {
          bucket[field] += toNumber(pd[field]);
        });
        return;
      }

      TEAM_SKATER_STARTER_FIELDS.filter(function (field) {
        return fieldConfig.activeStarterFields.has(field);
      }).forEach(function (field) {
        bucket[field] += toNumber(pd[field]);
      });
    });

    var teamDayAggregates = Array.from(teamDayMap.values());
    var teamDayRows = teamDayAggregates.map(function (day) {
      return buildTeamDayRow(day, fieldConfig);
    });

    var teamWeekMap = new Map();
    teamDayAggregates.forEach(function (day) {
      var key = String(day.weekId) + "_" + String(day.gshlTeamId);
      if (!teamWeekMap.has(key)) {
        teamWeekMap.set(key, createTeamWeekBucket(day));
      }
      var weekBucket = teamWeekMap.get(key);
      weekBucket.days += 1;
      weekBucket.goalieStarts += Number(day.goalieStarts) || 0;
      if (hasGoalieStats(day)) {
        weekBucket.goalieStatDays += 1;
      }
      TEAM_STAT_FIELDS.forEach(function (field) {
        weekBucket[field] += day[field];
      });
    });

    var teamWeekRows = Array.from(teamWeekMap.values()).map(function (week) {
      return buildTeamWeekRow(week, fieldConfig);
    });

    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamDayStatLine",
      ["date", "gshlTeamId"],
      teamDayRows,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
      },
    );

    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
      ["weekId", "gshlTeamId"],
      teamWeekRows,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
      },
    );

    var existingSeasonTeamWeeks = fetchSheetAsObjects(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
    ).filter(function (tw) {
      return String(tw && tw.seasonId) === seasonIdStr;
    });
    var touchedTeamIds = new Set();
    existingSeasonTeamWeeks.forEach(function (tw) {
      if (!tw || !weekIdSet.has(String(tw.weekId))) return;
      if (tw.gshlTeamId !== undefined && tw.gshlTeamId !== null) {
        touchedTeamIds.add(String(tw.gshlTeamId));
      }
    });
    teamWeekRows.forEach(function (tw) {
      if (tw && tw.gshlTeamId !== undefined && tw.gshlTeamId !== null) {
        touchedTeamIds.add(String(tw.gshlTeamId));
      }
    });

    var mergedSeasonTeamWeeks = mergeRowsByKey(
      existingSeasonTeamWeeks,
      teamWeekRows,
      function (row) {
        if (!row) return "";
        return [
          row.weekId === undefined || row.weekId === null
            ? ""
            : String(row.weekId),
          row.gshlTeamId === undefined || row.gshlTeamId === null
            ? ""
            : String(row.gshlTeamId),
        ].join("|");
      },
    ).filter(function (tw) {
      return tw && touchedTeamIds.has(String(tw.gshlTeamId));
    });

    var teamSeasonRows = buildTeamSeasonRowsFromWeekAggregates(
      mergedSeasonTeamWeeks,
      weekTypeMap,
      seasonIdStr,
      SeasonType.REGULAR_SEASON,
      TEAM_STAT_FIELDS,
      playerSplitCountByTeam,
      fieldConfig,
    );

    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamSeasonStatLine",
      ["seasonId", "gshlTeamId", "seasonType"],
      teamSeasonRows,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
      },
    );

    console.log(
      "[StatsAggregator] Updated team aggregates for selected weeks in season",
      seasonKey,
      "(weekIds:",
      selectedWeekIds.join(","),
      "days:",
      teamDayRows.length,
      "weeks:",
      teamWeekRows.length,
      "seasons:",
      teamSeasonRows.length,
      ")",
    );

    return {
      seasonId: seasonKey,
      weekIds: selectedWeekIds,
      teamDays: teamDayRows,
      teamWeeks: teamWeekRows,
      teamSeasons: teamSeasonRows,
      touchedTeamIds: Array.from(touchedTeamIds),
    };
  };

  // Expose internals needed by other modules (e.g. YahooScraper)
  ns.internals = {
    createTeamDayBucket: createTeamDayBucket,
    createTeamWeekBucket: createTeamWeekBucket,
    buildTeamDayRow: buildTeamDayRow,
    buildTeamWeekRow: buildTeamWeekRow,
    buildTeamSeasonRow: buildTeamSeasonRow,
  };

  delete ns.updatePlayerSplitsAndTotalsFromExistingPlayerWeeks;
  delete ns.updatePlayerStatsForSeasonFromExistingPlayerWeeks;
  delete ns.updatePlayerStatsForWeekIds;
  delete ns.updateTeamStatsForSeasonFromExistingPlayerWeeks;
  delete ns.updateTeamStatsForWeekIds;

  return ns;
})();
