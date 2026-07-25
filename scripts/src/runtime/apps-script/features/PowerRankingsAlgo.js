// @ts-nocheck

/**
 * PowerRankingsAlgo (Apps Script)
 * ------------------------------
 * Computes a comprehensive weekly power ranking for teams.
 *
 * Outputs:
 * - TeamWeekStatLine: full weekly power fields
 * - TeamSeasonStatLine: seasonType powerRk snapshot only
 *
 * Design notes:
 * - Deterministic computations from existing sheets (Week/Matchup/TeamWeekStatLine)
 * - Uses Elo (matchup results) + exponentially weighted team-stat strength
 * - Hooks exist for franchise-history priors (v2)
 */

var PowerRankingsAlgo = (function buildPowerRankingsAlgo() {
  "use strict";

  if (typeof GshlUtils === "undefined") {
    throw new Error(
      "GshlUtils is not defined. Ensure core utils are loaded before PowerRankingsAlgo.js",
    );
  }
  if (typeof SPREADSHEET_ID === "undefined") {
    throw new Error("SPREADSHEET_ID is not defined");
  }
  if (typeof TEAMSTATS_SPREADSHEET_ID === "undefined") {
    throw new Error("TEAMSTATS_SPREADSHEET_ID is not defined");
  }
  if (typeof PLAYERSTATS_SPREADSHEET_ID === "undefined") {
    throw new Error("PLAYERSTATS_SPREADSHEET_ID is not defined");
  }

  var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
  var upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;
  var ensureSheetColumns = GshlUtils.sheets.write.ensureSheetColumns;
  var formatDateOnly = GshlUtils.core.date.formatDateOnly;
  var toNumber = GshlUtils.core.parse.toNumber;
  var parseScore = GshlUtils.core.parse.parseScore;
  var normalizeSeasonId = GshlUtils.core.parse.normalizeSeasonId;

  var MATCHUP_CATEGORY_RULES = GshlUtils.core.constants.MATCHUP_CATEGORY_RULES;
  var SeasonType = GshlUtils.core.constants.SeasonType;

  var DEFAULTS = {
    // Elo
    baseElo: 1500,
    eloScale: 400,
    baseK: 36,
    marginKMultiplier: 0.9,
    eloMarginWeight: 0.75,
    eloWeekTypeKMultipliers: (function () {
      var out = {};
      out["RS"] = 1;
      out["LT"] = 0.5;
      out["PO"] = 2;
      if (SeasonType && SeasonType.REGULAR_SEASON !== undefined)
        out[String(SeasonType.REGULAR_SEASON)] = 1;
      if (SeasonType && SeasonType.LOSERS_TOURNAMENT !== undefined)
        out[String(SeasonType.LOSERS_TOURNAMENT)] = 0.5;
      if (SeasonType && SeasonType.PLAYOFFS !== undefined)
        out[String(SeasonType.PLAYOFFS)] = 2;
      return out;
    })(),
    eloPlayoffRoundStep: 1,
    ewmaAlpha: 0.72,
    perfCategoryWeight: 0.5,
    perfMatchupPointsWeight: 0.25,
    perfMatchupMarginWeight: 0.25,
    historySeasons: 3,
    historyOwnerHalfLifeSeasons: 1.5,
    historyFranchiseHalfLifeSeasons: 1,
    historyOwnerBlend: 0.7,
    historyFranchiseBlend: 0.3,
    powerHistoryHalfLifeWeeks: 3,
    seedEloTalentPointsPerZ: 120,
    seedEloHistoryPointsPerZ: 110,
    // Published TeamWeek power is always the state entering that week.
    wElo: 0.2,
    wStat: 0.3,
    wCurrent: 0.25,
    wTalent: 0.15,
    wGm: 0.1,
    wHistory: 0,
    matchupPregameBlend: 0.6,
    matchupRealizedBlend: 0.4,
    matchupPregameStrengthWeight: 0.55,
    matchupPregameCompetitiveWeight: 0.25,
    matchupPregameImportanceWeight: 0.1,
    matchupPregameRosterWeight: 0.1,
    matchupRealizedStrengthWeight: 0.65,
    matchupRealizedCompetitiveWeight: 0.35,
    weekTypes: null,
    seasonType: null,
    dryRun: false,
    logToConsole: true,
    returnRows: false,
    todayDate: null,
  };

  var REQUIRED_TEAM_WEEK_COLUMNS = [
    "powerElo",
    "powerEloPre",
    "powerEloPost",
    "powerEloDelta",
    "powerEloExpected",
    "powerEloK",
    "powerStatScore",
    "powerStatEwma",
    "powerTalent",
    "gmLadderRating",
    "powerGmScore",
    "powerHistoryPrior",
    "powerComposite",
    "powerRating",
    "powerRk",
  ];

  var REQUIRED_TEAM_SEASON_COLUMNS = ["powerRk"];

  var REQUIRED_MATCHUP_COLUMNS = [
    "homeRank",
    "awayRank",
    "rating",
    "ratingPre",
    "ratingRealized",
    "ratingCompetitive",
    "ratingImportance",
    "ratingRosterStrength",
  ];

  function tryFetchSheetAsObjects(spreadsheetId, sheetName, options) {
    try {
      return fetchSheetAsObjects(spreadsheetId, sheetName, options);
    } catch (e) {
      return null;
    }
  }

  function fetchFirstAvailableSheet(spreadsheetId, candidates, options) {
    for (var i = 0; i < (candidates || []).length; i++) {
      var name = candidates[i];
      var rows = tryFetchSheetAsObjects(spreadsheetId, name, options);
      if (rows) return { sheetName: name, rows: rows };
    }
    return { sheetName: null, rows: [] };
  }

  function resolvePlayerDayWorkbookId(seasonId) {
    try {
      var getId =
        GshlUtils &&
        GshlUtils.domain &&
        GshlUtils.domain.workbooks &&
        GshlUtils.domain.workbooks.getPlayerDayWorkbookId;
      if (typeof getId === "function") {
        var id = getId(seasonId);
        return id ? String(id) : "";
      }
    } catch (e) {
      return "";
    }
    return "";
  }

  function safeLower(s) {
    return s === undefined || s === null ? "" : String(s).trim().toLowerCase();
  }

  function detectPlayerNhlSheetName() {
    // Fast-path: common names.
    var known = [
      "PlayerNHLStatLine",
      "PlayerNHL",
      "PlayerNhlStatLine",
      "PlayerNhl",
    ];
    for (var i = 0; i < known.length; i++) {
      var rows = tryFetchSheetAsObjects(PLAYERSTATS_SPREADSHEET_ID, known[i]);
      if (rows) return known[i];
    }

    // Fallback: scan the workbook for a sheet with playerId + seasonId + (seasonRating|overallRating).
    // This avoids silent breakage if the sheet is renamed.
    if (typeof SpreadsheetApp === "undefined") return null;
    try {
      var ss = SpreadsheetApp.openById(PLAYERSTATS_SPREADSHEET_ID);
      var sheets = ss.getSheets() || [];
      for (var s = 0; s < sheets.length; s++) {
        var sh = sheets[s];
        var lastCol = sh.getLastColumn();
        if (!lastCol) continue;
        var header = sh.getRange(1, 1, 1, lastCol).getValues();
        var cols = (header && header[0] ? header[0] : []).map(safeLower);
        if (!cols.length) continue;

        var hasSeason =
          cols.indexOf("seasonid") !== -1 ||
          cols.indexOf("gshlseasonid") !== -1 ||
          cols.indexOf("nhlseasonid") !== -1 ||
          cols.indexOf("season") !== -1 ||
          cols.indexOf("nhlseason") !== -1;
        var hasPlayer =
          cols.indexOf("playerid") !== -1 ||
          cols.indexOf("gshlplayerid") !== -1 ||
          cols.indexOf("player_id") !== -1 ||
          cols.indexOf("yahooplayerid") !== -1 ||
          cols.indexOf("yahooid") !== -1 ||
          cols.indexOf("id") !== -1;
        var hasRating =
          cols.indexOf("seasonrating") !== -1 ||
          cols.indexOf("season_rating") !== -1 ||
          cols.indexOf("overallrating") !== -1 ||
          cols.indexOf("overall_rating") !== -1 ||
          cols.indexOf("rating") !== -1;
        if (hasSeason && hasPlayer && hasRating) {
          return sh.getName();
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  function getPlayerSeasonTalentRating(nhlRow, ratingField) {
    if (!nhlRow) return null;

    if (ratingField && nhlRow[ratingField] !== undefined) {
      var rf = toNumber(nhlRow[ratingField]);
      if (isFinite(rf)) return rf;
    }

    // Prefer seasonRating; fall back to overallRating then Rating.
    var r = toNumber(nhlRow.seasonRating);
    if (isFinite(r)) return r;
    r = toNumber(nhlRow.season_rating);
    if (isFinite(r)) return r;
    r = toNumber(nhlRow.overallRating);
    if (isFinite(r)) return r;
    r = toNumber(nhlRow.overall_rating);
    if (isFinite(r)) return r;
    r = toNumber(nhlRow.Rating);
    if (isFinite(r)) return r;
    r = toNumber(nhlRow.rating);
    return isFinite(r) ? r : null;
  }

  function getPlayerOverallTalentRatingFromNhlRow(nhlRow) {
    if (!nhlRow) return null;
    var rating = toNumber(nhlRow.overallRating);
    if (isFinite(rating)) return rating;
    rating = toNumber(nhlRow.overall_rating);
    if (isFinite(rating)) return rating;
    rating = toNumber(nhlRow.Rating);
    if (isFinite(rating)) return rating;
    rating = toNumber(nhlRow.rating);
    return isFinite(rating) ? rating : null;
  }

  function buildPreseasonPlayerTalentById(playerNhlRows, seasonKey, seasons) {
    var seasonIndexMap = computeSeasonIndexMap(seasons || []);
    var targetIndex = seasonIndexMap.get(String(seasonKey));
    var latestByPlayerId = new Map();
    (playerNhlRows || []).forEach(function (row) {
      if (!row) return;
      var playerId =
        row.playerId !== undefined && row.playerId !== null
          ? String(row.playerId)
          : "";
      var rowSeasonId =
        row.seasonId !== undefined && row.seasonId !== null
          ? String(row.seasonId)
          : "";
      var rowIndex = seasonIndexMap.get(rowSeasonId);
      if (
        !playerId ||
        rowIndex === undefined ||
        targetIndex === undefined ||
        rowIndex >= targetIndex
      )
        return;
      var previous = latestByPlayerId.get(playerId);
      if (!previous || rowIndex > previous.seasonIndex) {
        latestByPlayerId.set(playerId, {
          row: row,
          seasonIndex: rowIndex,
        });
      }
    });
    var playerTalentById = new Map();
    latestByPlayerId.forEach(function (entry, playerId) {
      var rating = getPlayerOverallTalentRatingFromNhlRow(entry.row);
      if (!isFinite(rating)) {
        rating = getPlayerSeasonTalentRating(entry.row, "seasonRating");
      }
      if (isFinite(rating) && rating > 0) {
        playerTalentById.set(playerId, rating);
      }
    });
    return playerTalentById;
  }

  function applyDefaults(options) {
    var opts = options || {};
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = opts[k] === undefined ? DEFAULTS[k] : opts[k];
    });
    return out;
  }

  function ensurePowerRankingColumns() {
    var r1 = ensureSheetColumns(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
      REQUIRED_TEAM_WEEK_COLUMNS,
    );
    var r2 = ensureSheetColumns(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamSeasonStatLine",
      REQUIRED_TEAM_SEASON_COLUMNS,
    );
    var r3 = ensureSheetColumns(
      SPREADSHEET_ID,
      "Matchup",
      REQUIRED_MATCHUP_COLUMNS,
    );
    return { teamWeek: r1, teamSeason: r2, matchup: r3 };
  }

  function assertRequiredUpsertKeys(updates, keyColumns, label) {
    var invalid = [];
    (updates || []).forEach(function (row, idx) {
      var missing = [];
      (keyColumns || []).forEach(function (key) {
        var value = row ? row[key] : "";
        if (
          value === undefined ||
          value === null ||
          String(value).trim() === ""
        ) {
          missing.push(key);
        }
      });
      if (missing.length) {
        invalid.push({
          index: idx,
          missing: missing,
          row: row || {},
        });
      }
    });

    if (!invalid.length) return;

    var sample = invalid.slice(0, 5).map(function (item) {
      return (
        "#" +
        item.index +
        " missing [" +
        item.missing.join(",") +
        "] row=" +
        JSON.stringify(item.row)
      );
    });
    throw new Error(
      label +
        " missing required upsert key values for " +
        invalid.length +
        " row(s): " +
        sample.join("; "),
    );
  }

  function sortWeeks(weeks) {
    return (weeks || []).slice().sort(function (a, b) {
      var as = toNumber(a && a.weekSortOrder);
      var bs = toNumber(b && b.weekSortOrder);
      if (as && bs && as !== bs) return as - bs;

      var ai = toNumber(a && a.weekIndex);
      var bi = toNumber(b && b.weekIndex);
      if (ai && bi && ai !== bi) return ai - bi;

      var ad = formatDateOnly(a && a.startDate);
      var bd = formatDateOnly(b && b.startDate);
      if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;

      return String(a && a.id) < String(b && b.id) ? -1 : 1;
    });
  }

  function buildLeagueTeamIds(seasonKey) {
    return fetchSheetAsObjects(SPREADSHEET_ID, "Team")
      .filter(function (t) {
        return String(t && t.seasonId) === String(seasonKey);
      })
      .map(function (t) {
        return String(t && t.id);
      })
      .filter(Boolean);
  }

  function computeZScores(valuesByTeam, higherBetter) {
    var vals = [];
    valuesByTeam.forEach(function (v) {
      if (v === null || v === undefined || v === "") return;
      var n = toNumber(v);
      if (!isFinite(n)) return;
      vals.push(n);
    });

    if (!vals.length) {
      return { mean: 0, std: 1 };
    }

    var mean = vals.reduce(function (a, b) {
      return a + b;
    }, 0);
    mean = mean / vals.length;

    var variance = 0;
    for (var i = 0; i < vals.length; i++) {
      variance += Math.pow(vals[i] - mean, 2);
    }
    variance = variance / Math.max(1, vals.length);
    var std = Math.sqrt(variance);
    if (!std || !isFinite(std)) std = 1;

    return {
      mean: mean,
      std: std,
      direction: higherBetter ? 1 : -1,
    };
  }

  function computeWeeklyStatScores(teamWeeksInWeekId, teamIds) {
    var rules = MATCHUP_CATEGORY_RULES || [];

    // Build per-category maps of team->value for this week.
    var categoryStats = rules.map(function (r) {
      var map = new Map();
      (teamIds || []).forEach(function (tid) {
        var row = teamWeeksInWeekId.get(String(tid));
        map.set(String(tid), row ? row[r.field] : null);
      });
      return {
        rule: r,
        valuesByTeam: map,
      };
    });

    // Precompute mean/std per category.
    var zMeta = categoryStats.map(function (c) {
      var m = computeZScores(c.valuesByTeam, !!c.rule.higherBetter);
      return { rule: c.rule, valuesByTeam: c.valuesByTeam, meta: m };
    });

    // Score per team: average directional z across categories.
    var scores = new Map();
    (teamIds || []).forEach(function (tid) {
      var sum = 0;
      var count = 0;
      zMeta.forEach(function (cat) {
        var raw = cat.valuesByTeam.get(String(tid));
        if (raw === null || raw === undefined || raw === "") return;
        var n = toNumber(raw);
        if (!isFinite(n)) return;
        var z = (n - cat.meta.mean) / cat.meta.std;
        z = (cat.meta.direction || 1) * z;
        sum += z;
        count += 1;
      });
      scores.set(String(tid), count ? sum / count : 0);
    });

    return scores;
  }

  function computeZFromArray(vals) {
    var clean = (vals || []).filter(function (n) {
      return n !== null && n !== undefined && n !== "" && isFinite(toNumber(n));
    });
    if (!clean.length) return { mean: 0, std: 1 };
    var mean =
      clean.reduce(function (a, b) {
        return a + toNumber(b);
      }, 0) / clean.length;
    var variance = 0;
    for (var i = 0; i < clean.length; i++) {
      variance += Math.pow(toNumber(clean[i]) - mean, 2);
    }
    variance = variance / Math.max(1, clean.length);
    var std = Math.sqrt(variance);
    if (!std || !isFinite(std)) std = 1;
    return { mean: mean, std: std };
  }

  function halfLifeDecay(weekNumber, halfLifeWeeks) {
    var hl = toNumber(halfLifeWeeks);
    if (!isFinite(hl) || hl <= 0) return 1;
    var w = toNumber(weekNumber);
    if (!isFinite(w) || w <= 1) return 1;
    return Math.pow(0.5, (w - 1) / hl);
  }

  function findPreviousSeasonId(seasonKey) {
    // Best-effort: use Season sheet ordering when present, else numeric decrement.
    var seasons = [];
    try {
      seasons = fetchSheetAsObjects(SPREADSHEET_ID, "Season", {
        coerceTypes: true,
      });
    } catch (e) {
      seasons = [];
    }

    if (seasons && seasons.length) {
      var sorted = seasons.slice().sort(function (a, b) {
        var ay = toNumber(a && (a.seasonYear || a.year || a.season));
        var by = toNumber(b && (b.seasonYear || b.year || b.season));
        if (isFinite(ay) && isFinite(by) && ay !== by) return ay - by;

        var ad = formatDateOnly(a && a.startDate);
        var bd = formatDateOnly(b && b.startDate);
        if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;

        return String(a && a.id) < String(b && b.id) ? -1 : 1;
      });

      var idx = -1;
      for (var i = 0; i < sorted.length; i++) {
        if (String(sorted[i] && sorted[i].id) === String(seasonKey)) {
          idx = i;
          break;
        }
      }
      if (idx > 0) {
        return String(sorted[idx - 1].id);
      }
    }

    var n = toNumber(seasonKey);
    if (isFinite(n)) return String(n - 1);
    return null;
  }

  function pickBestFinishWeekRowsForSeason(teamWeekRows, weeks, seasonId) {
    var rows = (teamWeekRows || []).filter(function (r) {
      return r && String(r.seasonId) === String(seasonId);
    });
    if (!rows.length) return [];

    var weekMetaById = new Map();
    (weeks || []).forEach(function (week) {
      if (!week || week.id === undefined || week.id === null) return;
      weekMetaById.set(String(week.id), week);
    });

    var byTeam = new Map();
    rows.forEach(function (r) {
      var tid =
        r.gshlTeamId !== undefined && r.gshlTeamId !== null
          ? String(r.gshlTeamId)
          : "";
      if (!tid) return;
      if (!byTeam.has(tid)) byTeam.set(tid, []);
      byTeam.get(tid).push(r);
    });

    var out = [];
    byTeam.forEach(function (list) {
      var sorted = list.slice().sort(function (a, b) {
        var aWeek = weekMetaById.get(String(a && a.weekId)) || null;
        var bWeek = weekMetaById.get(String(b && b.weekId)) || null;
        var aType = String(getWeekType(aWeek));
        var bType = String(getWeekType(bWeek));
        var aPriority =
          aType === String(SeasonType.PLAYOFFS)
            ? 2
            : aType === String(SeasonType.REGULAR_SEASON)
              ? 1
              : 0;
        var bPriority =
          bType === String(SeasonType.PLAYOFFS)
            ? 2
            : bType === String(SeasonType.REGULAR_SEASON)
              ? 1
              : 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
        var aEnd = formatDateOnly(aWeek && aWeek.endDate);
        var bEnd = formatDateOnly(bWeek && bWeek.endDate);
        if (aEnd && bEnd && aEnd !== bEnd) return aEnd < bEnd ? 1 : -1;
        return String(a && a.weekId).localeCompare(String(b && b.weekId));
      });
      if (sorted[0]) out.push(sorted[0]);
    });
    return out;
  }

  function clamp01(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return x;
  }

  function clamp(x, min, max) {
    if (x <= min) return min;
    if (x >= max) return max;
    return x;
  }

  // powerRating is a display-friendly projection of powerComposite.
  // Current model: fixed static scale (roughly z-space) in [-2.25, 1.75].
  // Legacy 0..100 weekly min/max normalization retained for existing rankings behavior.
  function powerRatingToCompositeSignal(powerRating) {
    var n = toNumber(powerRating);
    if (!isFinite(n)) return null;

    // Legacy 0..100 -> approximate z-space around 0.
    if (n >= 0 && n <= 100) return (n - 50) / 25;

    // New-scale ratings already live in composite units.
    return n;
  }

  function scaleCompositeToPowerRating(powerComposite) {
    var n = toNumber(powerComposite);
    if (!isFinite(n)) return 0;
    return 50 + 25 * n;
  }

  var runtimeTodayDate = "";

  function getTodayDateString() {
    return runtimeTodayDate || formatDateOnly(new Date());
  }

  function buildWeekStatusMap(weeks) {
    var today = getTodayDateString();
    var map = new Map();
    (weeks || []).forEach(function (week) {
      var weekId = week && week.id !== undefined ? String(week.id) : "";
      if (!weekId) return;

      var startDate = formatDateOnly(week.startDate);
      var endDate = formatDateOnly(week.endDate);
      var complete =
        week && week.isComplete === true
          ? true
          : !!(endDate && today && endDate < today);
      var active =
        !complete &&
        (week.isActive === true ||
          !!(
            startDate &&
            endDate &&
            today &&
            today >= startDate &&
            today <= endDate
          ));

      map.set(weekId, {
        isComplete: complete,
        isActive: active,
      });
    });
    return map;
  }

  function isMatchupEffectivelyComplete(matchup) {
    if (!matchup) return false;
    if (matchup.isComplete === true) return true;
    if (
      matchup.homeScore !== undefined &&
      matchup.homeScore !== null &&
      matchup.homeScore !== "" &&
      matchup.awayScore !== undefined &&
      matchup.awayScore !== null &&
      matchup.awayScore !== ""
    ) {
      return true;
    }
    return false;
  }

  function getRosterWeightForIndex(index) {
    if (index < 9) return 1;
    if (index < 14) return 0.8;
    if (index < 18) return 0.6;
    return 0.35;
  }

  function computeWeightedRosterAverage(ratings) {
    var sorted = (ratings || [])
      .map(function (value) {
        return toNumber(value);
      })
      .filter(function (value) {
        return isFinite(value) && value > 0;
      })
      .sort(function (a, b) {
        return b - a;
      });
    if (!sorted.length) return 0;

    var total = 0;
    var weightTotal = 0;
    for (var i = 0; i < sorted.length; i++) {
      var weight = getRosterWeightForIndex(i);
      total += sorted[i] * weight;
      weightTotal += weight;
    }
    return weightTotal ? total / weightTotal : 0;
  }

  function buildRollingPlayerTalentByWeek(
    weeks,
    playerWeekRows,
    baseTalentByPlayerId,
  ) {
    var rowsByWeekId = new Map();
    (playerWeekRows || []).forEach(function (row) {
      if (!row || row.weekId === undefined || row.weekId === null) return;
      var weekId = String(row.weekId);
      if (!rowsByWeekId.has(weekId)) rowsByWeekId.set(weekId, []);
      rowsByWeekId.get(weekId).push(row);
    });

    var historyByPlayerId = new Map();
    var talentByWeekPlayerKey = new Map();
    sortWeeks(weeks || []).forEach(function (week, weekIndex) {
      var weekId = String(week.id);
      var playerIds = new Set(Array.from(baseTalentByPlayerId.keys()));
      historyByPlayerId.forEach(function (_history, playerId) {
        playerIds.add(playerId);
      });

      playerIds.forEach(function (playerId) {
        var base = toNumber(baseTalentByPlayerId.get(playerId));
        var history = historyByPlayerId.get(playerId) || [];
        var weightedRating = 0;
        var ratingWeight = 0;
        var cumulativeGp = 0;
        history.forEach(function (entry) {
          var distance = Math.max(1, weekIndex - entry.weekIndex);
          var recencyWeight = Math.pow(0.72, distance - 1);
          var activityWeight = Math.max(1, toNumber(entry.GP));
          var weight = recencyWeight * activityWeight;
          weightedRating += toNumber(entry.rating) * weight;
          ratingWeight += weight;
          cumulativeGp += Math.max(0, toNumber(entry.GP));
        });
        var rolling = ratingWeight ? weightedRating / ratingWeight : null;
        var progress = clamp01(cumulativeGp / 84);
        var talent = null;
        if (isFinite(base) && isFinite(toNumber(rolling))) {
          talent = (1 - progress) * base + progress * toNumber(rolling);
        } else if (isFinite(toNumber(rolling))) {
          talent = toNumber(rolling);
        } else if (isFinite(base)) {
          talent = base;
        }
        if (isFinite(toNumber(talent)) && toNumber(talent) > 0) {
          talentByWeekPlayerKey.set(
            weekId + "::" + String(playerId),
            toNumber(talent),
          );
        }
      });

      (rowsByWeekId.get(weekId) || []).forEach(function (row) {
        var playerId =
          row.playerId !== undefined && row.playerId !== null
            ? String(row.playerId)
            : "";
        var rating = toNumber(row.Rating);
        var GP = toNumber(row.GP);
        if (
          !playerId ||
          !isFinite(rating) ||
          rating <= 0 ||
          !isFinite(GP) ||
          GP <= 0
        )
          return;
        if (!historyByPlayerId.has(playerId)) {
          historyByPlayerId.set(playerId, []);
        }
        historyByPlayerId.get(playerId).push({
          rating: rating,
          GP: GP,
          weekIndex: weekIndex,
        });
      });
    });
    return talentByWeekPlayerKey;
  }

  function buildRosterStrengthByWeekTeam(
    weeks,
    teamIds,
    playerDayRows,
    playerTalentByWeekPlayerKey,
  ) {
    var rowsByWeekTeamDate = new Map();
    var datesByWeekTeam = new Map();
    var rowsByTeamDate = new Map();
    var datesByTeam = new Map();

    (playerDayRows || []).forEach(function (row) {
      if (!row) return;
      var teamId =
        row.gshlTeamId !== undefined && row.gshlTeamId !== null
          ? String(row.gshlTeamId)
          : "";
      var weekId =
        row.weekId !== undefined && row.weekId !== null
          ? String(row.weekId)
          : "";
      var dateKey = formatDateOnly(row.date);
      var playerId =
        row.playerId !== undefined && row.playerId !== null
          ? String(row.playerId)
          : "";
      if (!teamId || !weekId || !dateKey || !playerId) return;

      var weekTeamDateKey = weekId + "::" + teamId + "::" + dateKey;
      if (!rowsByWeekTeamDate.has(weekTeamDateKey)) {
        rowsByWeekTeamDate.set(weekTeamDateKey, []);
      }
      rowsByWeekTeamDate.get(weekTeamDateKey).push(row);

      var weekTeamKey = weekId + "::" + teamId;
      if (!datesByWeekTeam.has(weekTeamKey))
        datesByWeekTeam.set(weekTeamKey, []);
      datesByWeekTeam.get(weekTeamKey).push(dateKey);

      var teamDateKey = teamId + "::" + dateKey;
      if (!rowsByTeamDate.has(teamDateKey)) rowsByTeamDate.set(teamDateKey, []);
      rowsByTeamDate.get(teamDateKey).push(row);

      if (!datesByTeam.has(teamId)) datesByTeam.set(teamId, []);
      datesByTeam.get(teamId).push(dateKey);
    });

    function pickLatestDate(dateList, capDate) {
      if (!dateList || !dateList.length || !capDate) return "";
      var unique = Array.from(new Set(dateList)).filter(function (dateKey) {
        return !!dateKey && dateKey <= capDate;
      });
      unique.sort();
      return unique.length ? unique[unique.length - 1] : "";
    }

    function pickFirstDateOn(dateList, exactDate) {
      if (!dateList || !dateList.length || !exactDate) return "";
      return dateList.some(function (dateKey) {
        return dateKey === exactDate;
      })
        ? exactDate
        : "";
    }

    function computeRosterStrengthFromRows(rows, weekId) {
      var ratings = [];
      var seenPlayerIds = new Set();
      (rows || []).forEach(function (row) {
        if (!row) return;
        var playerId =
          row.playerId !== undefined && row.playerId !== null
            ? String(row.playerId)
            : "";
        if (!playerId || seenPlayerIds.has(playerId)) return;
        seenPlayerIds.add(playerId);
        var rating = toNumber(
          playerTalentByWeekPlayerKey.get(
            String(weekId) + "::" + String(playerId),
          ),
        );
        if (isFinite(rating) && rating > 0) ratings.push(rating);
      });
      return computeWeightedRosterAverage(ratings);
    }

    var rosterStrengthByWeekTeamKey = new Map();
    (weeks || []).forEach(function (week) {
      var weekId =
        week && week.id !== undefined && week.id !== null
          ? String(week.id)
          : "";
      if (!weekId) return;
      var capDate = formatDateOnly(week.startDate);

      (teamIds || []).forEach(function (teamId) {
        var teamKey = String(teamId);
        var weekTeamKey = weekId + "::" + teamKey;
        var latestWeekDate = pickLatestDate(
          datesByWeekTeam.get(weekTeamKey),
          capDate,
        );
        var sourceRows = latestWeekDate
          ? rowsByWeekTeamDate.get(weekTeamKey + "::" + latestWeekDate)
          : null;

        if (!sourceRows || !sourceRows.length) {
          var latestTeamDate = pickLatestDate(
            datesByTeam.get(teamKey),
            capDate,
          );
          sourceRows = latestTeamDate
            ? rowsByTeamDate.get(teamKey + "::" + latestTeamDate)
            : null;
        }
        if (!sourceRows || !sourceRows.length) {
          var firstWeekDate = pickFirstDateOn(
            datesByWeekTeam.get(weekTeamKey),
            capDate,
          );
          sourceRows = firstWeekDate
            ? rowsByWeekTeamDate.get(weekTeamKey + "::" + firstWeekDate)
            : null;
        }

        rosterStrengthByWeekTeamKey.set(
          weekTeamKey,
          computeRosterStrengthFromRows(sourceRows, weekId),
        );
      });
    });

    return rosterStrengthByWeekTeamKey;
  }

  function buildTalentZMapForWeek(
    teamIds,
    weekId,
    rosterStrengthByWeekTeamKey,
  ) {
    var rosterStrengthVals = (teamIds || []).map(function (teamId) {
      return toNumber(
        rosterStrengthByWeekTeamKey.get(
          String(weekId) + "::" + String(teamId),
        ) || 0,
      );
    });
    var rosterStrengthMeta = computeZFromArray(rosterStrengthVals);
    var talentZByTeam = new Map();
    (teamIds || []).forEach(function (teamId) {
      var teamKey = String(teamId);
      var rosterStrength = toNumber(
        rosterStrengthByWeekTeamKey.get(String(weekId) + "::" + teamKey) || 0,
      );
      talentZByTeam.set(
        teamKey,
        (rosterStrength - rosterStrengthMeta.mean) / rosterStrengthMeta.std,
      );
    });
    return talentZByTeam;
  }

  function computeSeasonIndexMap(seasons) {
    var sorted = (seasons || []).slice().sort(function (a, b) {
      var ay = toNumber(a && (a.seasonYear || a.year || a.season));
      var by = toNumber(b && (b.seasonYear || b.year || b.season));
      if (isFinite(ay) && isFinite(by) && ay !== by) return ay - by;

      var ad = formatDateOnly(a && a.startDate);
      var bd = formatDateOnly(b && b.startDate);
      if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;

      return String(a && a.id).localeCompare(String(b && b.id));
    });

    var map = new Map();
    sorted.forEach(function (season, index) {
      if (!season || season.id === undefined || season.id === null) return;
      map.set(String(season.id), index);
    });
    return map;
  }

  function computeRecencyWeight(distance, halfLife) {
    var d = toNumber(distance);
    var hl = toNumber(halfLife);
    if (!isFinite(d) || d <= 0) return 1;
    if (!isFinite(hl) || hl <= 0) return 1;
    return Math.pow(0.5, d / hl);
  }

  function computeHistoryPriorMap(
    seasonKey,
    teamIds,
    currentFranchiseIdByTeamId,
    currentOwnerIdByTeamId,
    allTeams,
    allFranchises,
    allTeamSeasonRows,
    seasons,
    opts,
  ) {
    var seasonIndexMap = computeSeasonIndexMap(seasons);
    var currentSeasonIndex = seasonIndexMap.get(String(seasonKey));
    var ownerIdByFranchiseId = new Map();
    (allFranchises || []).forEach(function (franchise) {
      if (!franchise) return;
      var franchiseId =
        franchise.id !== undefined && franchise.id !== null
          ? String(franchise.id)
          : "";
      if (!franchiseId) return;
      var ownerId =
        franchise.ownerId !== undefined && franchise.ownerId !== null
          ? String(franchise.ownerId)
          : "";
      if (ownerId) ownerIdByFranchiseId.set(franchiseId, ownerId);
    });

    var historicalRows = [];
    (allTeamSeasonRows || []).forEach(function (row) {
      if (!row) return;
      var rowSeasonId =
        row.seasonId !== undefined && row.seasonId !== null
          ? String(row.seasonId)
          : "";
      if (!rowSeasonId || rowSeasonId === String(seasonKey)) return;
      if (currentSeasonIndex === undefined) return;
      var rowSeasonIndex = seasonIndexMap.get(rowSeasonId);
      if (rowSeasonIndex === undefined || rowSeasonIndex >= currentSeasonIndex)
        return;
      if (currentSeasonIndex - rowSeasonIndex > toNumber(opts.historySeasons))
        return;

      var rowTeamId =
        row.gshlTeamId !== undefined && row.gshlTeamId !== null
          ? String(row.gshlTeamId)
          : "";
      if (!rowTeamId) return;

      var teamRecord = (allTeams || []).find(function (team) {
        return (
          team &&
          String(team.id) === rowTeamId &&
          String(team.seasonId) === rowSeasonId
        );
      });
      if (!teamRecord) return;

      var franchiseId =
        teamRecord.franchiseId !== undefined && teamRecord.franchiseId !== null
          ? String(teamRecord.franchiseId)
          : "";
      var ownerId = ownerIdByFranchiseId.get(franchiseId) || "";
      var signal = null;
      if (isFinite(toNumber(row.powerComposite))) {
        signal = toNumber(row.powerComposite);
      } else {
        signal = powerRatingToCompositeSignal(row.powerRating);
      }
      if (!isFinite(toNumber(signal))) return;

      historicalRows.push({
        seasonId: rowSeasonId,
        seasonIndex: rowSeasonIndex,
        franchiseId: franchiseId,
        ownerId: ownerId,
        signal: toNumber(signal),
      });
    });

    var historyRaw = new Map();
    var historyHasData = new Map();
    teamIds.forEach(function (teamId) {
      var teamKey = String(teamId);
      var ownerId = currentOwnerIdByTeamId.get(teamKey) || "";
      var franchiseId = currentFranchiseIdByTeamId.get(teamKey) || "";
      var historySignal = 0;
      var historyWeight = 0;

      historicalRows.forEach(function (row) {
        var distance = currentSeasonIndex - row.seasonIndex;
        if (ownerId && row.ownerId === ownerId) {
          var ownerRecencyWeight = computeRecencyWeight(
            distance,
            opts.historyOwnerHalfLifeSeasons,
          );
          historySignal += row.signal * ownerRecencyWeight;
          historyWeight += ownerRecencyWeight;
          return;
        }
        if (franchiseId && row.franchiseId === franchiseId) {
          var franchiseRecencyWeight = computeRecencyWeight(
            distance,
            opts.historyFranchiseHalfLifeSeasons,
          );
          historySignal += row.signal * franchiseRecencyWeight;
          historyWeight += franchiseRecencyWeight;
        }
      });

      historyRaw.set(
        teamKey,
        historyWeight ? historySignal / historyWeight : 0,
      );
      historyHasData.set(teamKey, historyWeight > 0);
    });

    var historyVals = teamIds.map(function (teamId) {
      return historyRaw.get(String(teamId)) || 0;
    });
    var historyMeta = computeZFromArray(historyVals);

    var historyPrior = new Map();
    teamIds.forEach(function (teamId) {
      var teamKey = String(teamId);
      var historyValue = historyRaw.get(teamKey) || 0;
      var historyZ = historyHasData.get(teamKey)
        ? (historyValue - historyMeta.mean) / historyMeta.std
        : 0;
      historyPrior.set(teamKey, historyZ);
    });

    return historyPrior;
  }

  var GM_BASE_RATING = 250;
  var GM_ELO_WEIGHT = 0.15;
  var GM_BONUSES = {
    playoffAppearance: 8,
    finalsAppearance: 18,
    cup: 40,
    leadershipAward: 20,
    otherAward: 5,
    brophy: -10,
  };
  var GM_POWER_WEIGHTS = {
    numberOne: 1.5,
    topThree: 0.5,
    bottomThree: -0.5,
    lastPlace: -1.5,
  };

  function emptyGmRecord() {
    return { wins: 0, losses: 0, ties: 0 };
  }

  function makeGmState() {
    return {
      elo: GM_BASE_RATING,
      achievementBonus: 0,
      weeksAtNumberOne: 0,
      weeksInTopThree: 0,
      weeksInBottomThree: 0,
      weeksInLastPlace: 0,
      overall: emptyGmRecord(),
      conference: emptyGmRecord(),
      playoffs: emptyGmRecord(),
      playoffSeasonIds: new Set(),
      finalistSeasonIds: new Set(),
    };
  }

  function gmGames(record) {
    return record.wins + record.losses + record.ties;
  }

  function gmBayesianPercentage(record, priorGames) {
    var games = gmGames(record);
    return (
      (record.wins + record.ties * 0.5 + priorGames * 0.5) /
      (games + priorGames)
    );
  }

  function gmPerformanceAdjustment(state) {
    return (
      (gmBayesianPercentage(state.overall, 20) - 0.5) * 300 +
      (gmBayesianPercentage(state.conference, 10) - 0.5) * 80 +
      (gmBayesianPercentage(state.playoffs, 6) - 0.5) * 120
    );
  }

  function gmPowerAdjustment(state) {
    return (
      state.weeksAtNumberOne * GM_POWER_WEIGHTS.numberOne +
      state.weeksInTopThree * GM_POWER_WEIGHTS.topThree +
      state.weeksInBottomThree * GM_POWER_WEIGHTS.bottomThree +
      state.weeksInLastPlace * GM_POWER_WEIGHTS.lastPlace
    );
  }

  function gmLadderRating(state) {
    return (
      GM_BASE_RATING +
      (state.elo - GM_BASE_RATING) * GM_ELO_WEIGHT +
      state.achievementBonus +
      gmPowerAdjustment(state) +
      gmPerformanceAdjustment(state)
    );
  }

  function ensureGmState(states, ownerId) {
    var key = String(ownerId || "");
    if (!key) return null;
    if (!states.has(key)) states.set(key, makeGmState());
    return states.get(key);
  }

  function applyGmRecord(home, away, actualHome) {
    if (actualHome === 1) {
      home.wins += 1;
      away.losses += 1;
    } else if (actualHome === 0) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
    }
  }

  function isGmPlayoffType(gameType) {
    var value = String(gameType || "");
    return value === "QF" || value === "SF" || value === "F";
  }

  function gmMatchupK(gameType) {
    var value = String(gameType || "");
    if (value === "F") return 40;
    if (value === "SF") return 34;
    if (value === "QF") return 28;
    return 20;
  }

  function applyGmMatchup(states, matchup, ownerIdByTeamId, seasonId) {
    if (!matchup) return;
    var homeScore = parseScore(matchup.homeScore);
    var awayScore = parseScore(matchup.awayScore);
    if (homeScore === null || awayScore === null) return;
    var homeOwnerId =
      ownerIdByTeamId.get(String(matchup.homeTeamId || "")) || "";
    var awayOwnerId =
      ownerIdByTeamId.get(String(matchup.awayTeamId || "")) || "";
    if (!homeOwnerId || !awayOwnerId || homeOwnerId === awayOwnerId) return;
    var homeState = ensureGmState(states, homeOwnerId);
    var awayState = ensureGmState(states, awayOwnerId);
    if (!homeState || !awayState) return;

    var gameType = String(matchup.gameType || "");
    var actualHome =
      homeScore > awayScore
        ? 1
        : awayScore > homeScore
          ? 0
          : isGmPlayoffType(gameType)
            ? 1
            : 0.5;
    var expectedHome =
      1 / (1 + Math.pow(10, (awayState.elo - homeState.elo) / 400));
    var marginMultiplier =
      1 + Math.min(Math.abs(homeScore - awayScore), 4) * 0.08;
    var delta =
      gmMatchupK(gameType) * marginMultiplier * (actualHome - expectedHome);
    homeState.elo += delta;
    awayState.elo -= delta;

    if (gameType === "CC" || gameType === "NC") {
      applyGmRecord(homeState.overall, awayState.overall, actualHome);
    }
    if (gameType === "CC") {
      applyGmRecord(homeState.conference, awayState.conference, actualHome);
    }
    if (isGmPlayoffType(gameType)) {
      applyGmRecord(homeState.playoffs, awayState.playoffs, actualHome);
      [homeState, awayState].forEach(function (state) {
        if (!state.playoffSeasonIds.has(String(seasonId))) {
          state.playoffSeasonIds.add(String(seasonId));
          state.achievementBonus += GM_BONUSES.playoffAppearance;
        }
      });
    }
    if (gameType === "F") {
      [homeState, awayState].forEach(function (state) {
        if (!state.finalistSeasonIds.has(String(seasonId))) {
          state.finalistSeasonIds.add(String(seasonId));
          state.achievementBonus += GM_BONUSES.finalsAppearance;
        }
      });
    }
  }

  function applyGmPowerRanks(states, rankedRows, ownerIdByTeamId) {
    var rows = (rankedRows || []).filter(function (row) {
      var rank = toNumber(row && row.powerRk);
      return isFinite(rank) && rank > 0;
    });
    if (!rows.length) return;
    var lastRank = rows.reduce(function (maxRank, row) {
      return Math.max(maxRank, toNumber(row.powerRk));
    }, 0);
    var bottomThreeThreshold = Math.max(1, lastRank - 2);
    var bestRankByOwner = new Map();
    rows.forEach(function (row) {
      var ownerId = ownerIdByTeamId.get(String(row.gshlTeamId || "")) || "";
      var rank = toNumber(row.powerRk);
      if (!ownerId || !isFinite(rank) || rank <= 0) return;
      var previous = bestRankByOwner.get(ownerId);
      if (!isFinite(previous) || rank < previous) {
        bestRankByOwner.set(ownerId, rank);
      }
    });
    bestRankByOwner.forEach(function (rank, ownerId) {
      var state = ensureGmState(states, ownerId);
      if (!state) return;
      if (rank === 1) state.weeksAtNumberOne += 1;
      if (rank <= 3) state.weeksInTopThree += 1;
      if (rank >= bottomThreeThreshold) state.weeksInBottomThree += 1;
      if (rank === lastRank) state.weeksInLastPlace += 1;
    });
  }

  function applyGmSeasonAwards(states, awards, ownerIdByTeamId) {
    (awards || []).forEach(function (award) {
      if (!award) return;
      var ownerId =
        award.ownerId !== undefined && award.ownerId !== null
          ? String(award.ownerId)
          : ownerIdByTeamId.get(String(award.teamId || "")) || "";
      var state = ensureGmState(states, ownerId);
      if (!state) return;
      var awardName = String(award.award || "");
      if (awardName === "gshlCup") {
        state.achievementBonus += GM_BONUSES.cup;
      } else if (awardName === "brophy") {
        state.achievementBonus += GM_BONUSES.brophy;
      } else if (awardName === "jackAdams" || awardName === "gmoy") {
        state.achievementBonus += GM_BONUSES.leadershipAward;
      } else {
        state.achievementBonus += GM_BONUSES.otherAward;
      }
    });
  }

  function buildOwnerIdByTeamId(allTeams, allFranchises) {
    var ownerIdByFranchiseId = new Map();
    (allFranchises || []).forEach(function (franchise) {
      if (!franchise || franchise.id === undefined || franchise.id === null)
        return;
      ownerIdByFranchiseId.set(
        String(franchise.id),
        franchise.ownerId === undefined || franchise.ownerId === null
          ? ""
          : String(franchise.ownerId),
      );
    });
    var ownerIdByTeamId = new Map();
    (allTeams || []).forEach(function (team) {
      if (!team || team.id === undefined || team.id === null) return;
      var directOwner =
        team.ownerId === undefined || team.ownerId === null
          ? ""
          : String(team.ownerId);
      var franchiseOwner =
        ownerIdByFranchiseId.get(String(team.franchiseId || "")) || "";
      ownerIdByTeamId.set(String(team.id), directOwner || franchiseOwner);
    });
    return ownerIdByTeamId;
  }

  function buildInitialGmStates(
    seasonKey,
    seasons,
    allWeeks,
    allTeams,
    allFranchises,
    allMatchups,
    allAwards,
    allTeamWeekRows,
  ) {
    var states = new Map();
    var ownerIdByTeamId = buildOwnerIdByTeamId(allTeams, allFranchises);
    var seasonIndexMap = computeSeasonIndexMap(seasons);
    var targetIndex = seasonIndexMap.get(String(seasonKey));
    var priorSeasons = (seasons || [])
      .filter(function (season) {
        var index = seasonIndexMap.get(String(season && season.id));
        return (
          index !== undefined &&
          targetIndex !== undefined &&
          index < targetIndex
        );
      })
      .sort(function (a, b) {
        return (
          toNumber(seasonIndexMap.get(String(a.id))) -
          toNumber(seasonIndexMap.get(String(b.id)))
        );
      });

    priorSeasons.forEach(function (season) {
      var priorSeasonId = String(season.id);
      var priorWeeks = sortWeeks(
        (allWeeks || []).filter(function (week) {
          return String(week && week.seasonId) === priorSeasonId;
        }),
      );
      priorWeeks.forEach(function (week) {
        var weekId = String(week.id);
        (allMatchups || [])
          .filter(function (matchup) {
            return (
              String(matchup && matchup.seasonId) === priorSeasonId &&
              String(matchup && matchup.weekId) === weekId
            );
          })
          .forEach(function (matchup) {
            applyGmMatchup(states, matchup, ownerIdByTeamId, priorSeasonId);
          });
        applyGmPowerRanks(
          states,
          (allTeamWeekRows || []).filter(function (row) {
            return (
              String(row && row.seasonId) === priorSeasonId &&
              String(row && row.weekId) === weekId
            );
          }),
          ownerIdByTeamId,
        );
      });
      var seasonAwards = (allAwards || []).filter(function (award) {
        return String(award && award.seasonId) === priorSeasonId;
      });
      var hasCupAward = seasonAwards.some(function (award) {
        return String(award && award.award) === "gshlCup";
      });
      if (!hasCupAward) {
        var finalMatchup = (allMatchups || []).find(function (matchup) {
          return (
            String(matchup && matchup.seasonId) === priorSeasonId &&
            String(matchup && matchup.gameType) === "F" &&
            parseScore(matchup.homeScore) !== null &&
            parseScore(matchup.awayScore) !== null
          );
        });
        if (finalMatchup) {
          var winnerTeamId =
            parseScore(finalMatchup.homeScore) >=
            parseScore(finalMatchup.awayScore)
              ? String(finalMatchup.homeTeamId || "")
              : String(finalMatchup.awayTeamId || "");
          var winnerOwnerId = ownerIdByTeamId.get(winnerTeamId) || "";
          var winnerState = ensureGmState(states, winnerOwnerId);
          if (winnerState) winnerState.achievementBonus += GM_BONUSES.cup;
        }
      }
      applyGmSeasonAwards(states, seasonAwards, ownerIdByTeamId);
    });

    return {
      states: states,
      ownerIdByTeamId: ownerIdByTeamId,
    };
  }

  function buildGmMapsForWeek(teamIds, ownerIdByTeamId, states) {
    var ratingByTeam = new Map();
    var ratings = [];
    (teamIds || []).forEach(function (teamId) {
      var teamKey = String(teamId);
      var ownerId = ownerIdByTeamId.get(teamKey) || "";
      var state = ensureGmState(states, ownerId);
      var rating = state ? gmLadderRating(state) : GM_BASE_RATING;
      ratingByTeam.set(teamKey, rating);
      ratings.push(rating);
    });
    var meta = computeZFromArray(ratings);
    var zByTeam = new Map();
    ratingByTeam.forEach(function (rating, teamId) {
      zByTeam.set(teamId, (rating - meta.mean) / meta.std);
    });
    return {
      ratingByTeam: ratingByTeam,
      zByTeam: zByTeam,
    };
  }

  function computePregamePowerMaps(
    teamIds,
    eloByTeam,
    statEwmaByTeam,
    talentZByTeam,
    gmZByTeam,
    historyPriorByTeam,
    currentScoreByTeam,
    weekNumber,
    opts,
  ) {
    var eloVals = teamIds.map(function (teamId) {
      return toNumber(eloByTeam.get(String(teamId)));
    });
    var eloMeta = computeZFromArray(eloVals);
    var historyDecay = halfLifeDecay(
      weekNumber,
      opts.powerHistoryHalfLifeWeeks,
    );
    var compositeByTeam = new Map();
    var ratingByTeam = new Map();
    teamIds.forEach(function (teamId) {
      var teamKey = String(teamId);
      var eloZ =
        (toNumber(eloByTeam.get(teamKey)) - eloMeta.mean) / eloMeta.std;
      var statZ = toNumber(statEwmaByTeam.get(teamKey) || 0);
      var currentZ = toNumber(
        currentScoreByTeam && currentScoreByTeam.get
          ? currentScoreByTeam.get(teamKey) || 0
          : 0,
      );
      var talentZ = toNumber(talentZByTeam.get(teamKey) || 0);
      var gmZ = toNumber(gmZByTeam.get(teamKey) || 0);
      var historyZ =
        toNumber(historyPriorByTeam.get(teamKey) || 0) * historyDecay;
      var composite =
        toNumber(opts.wElo) * eloZ +
        toNumber(opts.wStat) * statZ +
        toNumber(opts.wCurrent || 0) * currentZ +
        toNumber(opts.wTalent) * talentZ +
        toNumber(opts.wGm || 0) * gmZ +
        toNumber(opts.wHistory) * historyZ;
      compositeByTeam.set(teamKey, composite);
      ratingByTeam.set(teamKey, scaleCompositeToPowerRating(composite));
    });
    return {
      compositeByTeam: compositeByTeam,
      ratingByTeam: ratingByTeam,
    };
  }

  function buildRankMapFromCompositeMap(compositeByTeam) {
    var entries = Array.from(compositeByTeam.entries())
      .map(function (entry) {
        return {
          teamId: String(entry[0]),
          powerComposite: toNumber(entry[1]),
        };
      })
      .sort(function (a, b) {
        return toNumber(b.powerComposite) - toNumber(a.powerComposite);
      });
    var rankByTeam = new Map();
    var previousComposite = null;
    var previousRank = 0;
    entries.forEach(function (entry, index) {
      var rank =
        previousComposite !== null &&
        Math.abs(entry.powerComposite - previousComposite) < 0.0000001
          ? previousRank
          : index + 1;
      rankByTeam.set(entry.teamId, rank);
      previousComposite = entry.powerComposite;
      previousRank = rank;
    });
    return rankByTeam;
  }

  function getWeekImportanceScore(weekType, roundIndex) {
    var normalizedWeekType = String(weekType || SeasonType.REGULAR_SEASON);
    if (normalizedWeekType === String(SeasonType.PLAYOFFS)) {
      return 68 + Math.max(0, toNumber(roundIndex) - 1) * 6;
    }
    if (normalizedWeekType === String(SeasonType.LOSERS_TOURNAMENT)) {
      return 48;
    }
    return 55;
  }

  function computePregameCompetitiveScore(homePower, awayPower) {
    return Math.max(
      0,
      100 - Math.abs(toNumber(homePower) - toNumber(awayPower)) * 1.35,
    );
  }

  function buildPregameMatchupRating(
    matchup,
    weekType,
    roundIndex,
    prePowerRatingByTeam,
    rosterStrengthByTeam,
    isFutureOrActive,
    opts,
  ) {
    if (!matchup) return null;
    var homeTeamId = String(matchup.homeTeamId || "");
    var awayTeamId = String(matchup.awayTeamId || "");
    if (!homeTeamId || !awayTeamId) return null;

    var homePower = toNumber(prePowerRatingByTeam.get(homeTeamId) || 0);
    var awayPower = toNumber(prePowerRatingByTeam.get(awayTeamId) || 0);
    var strengthScore = (homePower + awayPower) / 2;
    var competitiveScore = computePregameCompetitiveScore(homePower, awayPower);
    var importanceScore = getWeekImportanceScore(weekType, roundIndex);
    var rosterStrengthScore =
      (toNumber(rosterStrengthByTeam.get(homeTeamId) || 0) +
        toNumber(rosterStrengthByTeam.get(awayTeamId) || 0)) /
      2;

    var preRating =
      toNumber(opts.matchupPregameStrengthWeight) * strengthScore +
      toNumber(opts.matchupPregameCompetitiveWeight) * competitiveScore +
      toNumber(opts.matchupPregameImportanceWeight) * importanceScore +
      (isFutureOrActive
        ? toNumber(opts.matchupPregameRosterWeight) * rosterStrengthScore
        : 0);

    return {
      ratingPre: preRating,
      ratingCompetitive: competitiveScore,
      ratingImportance: importanceScore,
      ratingRosterStrength: rosterStrengthScore,
    };
  }

  function buildRealizedMatchupRating(
    homeSnapshot,
    awaySnapshot,
    matchup,
    opts,
  ) {
    if (!matchup || !homeSnapshot || !awaySnapshot) return null;
    var maxCats = (MATCHUP_CATEGORY_RULES || []).length || 10;
    var homeScore = parseScore(matchup.homeScore);
    var awayScore = parseScore(matchup.awayScore);
    if (homeScore === null || awayScore === null) return null;
    var scoreDiff = Math.abs(homeScore - awayScore);
    var competitiveScore = Math.max(0, 100 - (scoreDiff / maxCats) * 100);
    var strengthScore =
      (toNumber(homeSnapshot.powerRating) +
        toNumber(awaySnapshot.powerRating)) /
      2;
    var realizedRating =
      toNumber(opts.matchupRealizedStrengthWeight) * strengthScore +
      toNumber(opts.matchupRealizedCompetitiveWeight) * competitiveScore;
    return {
      ratingRealized: realizedRating,
      ratingCompetitive: competitiveScore,
    };
  }

  function hasTeamWeekPerformanceData(row) {
    if (!row) return false;
    var gp = toNumber(row.GP);
    if (isFinite(gp) && gp > 0) return true;

    for (var i = 0; i < (MATCHUP_CATEGORY_RULES || []).length; i++) {
      var field = MATCHUP_CATEGORY_RULES[i] && MATCHUP_CATEGORY_RULES[i].field;
      if (!field) continue;
      var value = row[field];
      if (value === undefined || value === null || value === "") continue;
      var numericValue = toNumber(value);
      if (isFinite(numericValue)) return true;
    }

    return false;
  }

  function computeMatchupPointsFromRow(m) {
    // Points rule:
    // - win = 3
    // - home win on a tie score (homeWin true && scores equal) = 2, away gets 1
    // - home loss on a tie score (same as above) = away gets 1
    // - loss = 0
    // If only scores exist (no flags), infer win/loss from score.
    if (!m) return null;

    var hs = parseScore(m.homeScore);
    var as = parseScore(m.awayScore);
    var hasScores = hs !== null && as !== null;
    var scoresEqual = hasScores && hs === as;

    if (m.homeWin === true) {
      if (scoresEqual) return { homePts: 2, awayPts: 1 };
      return { homePts: 3, awayPts: 0 };
    }
    if (m.awayWin === true) {
      // In this league model, tie-break home-win is represented via homeWin.
      // If awayWin is marked, treat as a normal win.
      return { homePts: 0, awayPts: 3 };
    }
    if (m.tie === true) {
      // Not expected often; keep neutral.
      return { homePts: 1.5, awayPts: 1.5 };
    }

    if (hasScores) {
      if (scoresEqual) return { homePts: 2, awayPts: 1 };
      return hs > as ? { homePts: 3, awayPts: 0 } : { homePts: 0, awayPts: 3 };
    }

    return null;
  }

  function buildMatchupMetricsForWeek(matchups) {
    // Returns:
    // - pointsByTeam: Map(teamId -> points)
    // - marginByTeam: Map(teamId -> scoreDiff)
    // - marginScoreByTeam: Map(teamId -> [0..1] score based on diff/maxCats)
    var pointsByTeam = new Map();
    var marginByTeam = new Map();
    var marginScoreByTeam = new Map();

    var maxCats = (MATCHUP_CATEGORY_RULES || []).length || 10;

    (matchups || []).forEach(function (m) {
      if (!m) return;
      var homeId =
        m.homeTeamId !== undefined && m.homeTeamId !== null
          ? String(m.homeTeamId)
          : "";
      var awayId =
        m.awayTeamId !== undefined && m.awayTeamId !== null
          ? String(m.awayTeamId)
          : "";
      if (!homeId || !awayId) return;

      var pts = computeMatchupPointsFromRow(m);
      if (pts) {
        pointsByTeam.set(
          homeId,
          (pointsByTeam.get(homeId) || 0) + toNumber(pts.homePts),
        );
        pointsByTeam.set(
          awayId,
          (pointsByTeam.get(awayId) || 0) + toNumber(pts.awayPts),
        );
      }

      var hs = parseScore(m.homeScore);
      var as = parseScore(m.awayScore);
      if (hs !== null && as !== null) {
        var diff = hs - as;
        marginByTeam.set(homeId, (marginByTeam.get(homeId) || 0) + diff);
        marginByTeam.set(awayId, (marginByTeam.get(awayId) || 0) - diff);

        var marginScoreHome = clamp01(0.5 + diff / (2 * maxCats));
        var marginScoreAway = 1 - marginScoreHome;
        // If multiple matchups existed, average them later by z-score; store the raw margin score sum.
        marginScoreByTeam.set(
          homeId,
          (marginScoreByTeam.get(homeId) || 0) + marginScoreHome,
        );
        marginScoreByTeam.set(
          awayId,
          (marginScoreByTeam.get(awayId) || 0) + marginScoreAway,
        );
      }
    });

    return {
      pointsByTeam: pointsByTeam,
      marginByTeam: marginByTeam,
      marginScoreByTeam: marginScoreByTeam,
    };
  }

  function expectedScore(eloA, eloB, scale) {
    var denom = 1 + Math.pow(10, (eloB - eloA) / scale);
    return 1 / denom;
  }

  function computeMatchupActualScore(m, marginWeight) {
    // Blend score margin with the win/loss points system.
    var w = toNumber(marginWeight);
    if (!isFinite(w)) w = 0.75;
    if (w < 0) w = 0;
    if (w > 1) w = 1;

    var maxCats = (MATCHUP_CATEGORY_RULES || []).length || 10;
    var hs = parseScore(m && m.homeScore);
    var as = parseScore(m && m.awayScore);

    var marginScore = null;
    if (hs !== null && as !== null && maxCats) {
      marginScore = clamp01(0.5 + (hs - as) / (2 * maxCats));
    }

    var pts = computeMatchupPointsFromRow(m);
    var pointsScore = pts ? clamp01(toNumber(pts.homePts) / 3) : null;

    if (marginScore === null && pointsScore === null) return null;
    if (marginScore === null) {
      return { home: pointsScore, away: 1 - pointsScore };
    }
    if (pointsScore === null) {
      return { home: marginScore, away: 1 - marginScore };
    }

    var blended = w * marginScore + (1 - w) * pointsScore;
    blended = clamp01(blended);
    return { home: blended, away: 1 - blended };
  }

  function computeKFactor(baseK, marginKMultiplier, m) {
    var hs = parseScore(m && m.homeScore);
    var as = parseScore(m && m.awayScore);
    var maxCats = (MATCHUP_CATEGORY_RULES || []).length || 10;

    if (hs === null || as === null || !maxCats) return baseK;
    var margin = Math.abs(hs - as) / maxCats;
    return baseK * (1 + marginKMultiplier * margin);
  }

  function getWeekType(week) {
    return (week && week.weekType) || SeasonType.REGULAR_SEASON;
  }

  function getMatchupWeekType(week, matchup) {
    // Losers tournament matchups can occur during playoff weeks.
    // Convention used in this codebase: `week.weekType` marks the period, while
    // `matchup.isPlayoff` marks whether a specific matchup is part of playoffs.
    var wt = getWeekType(week);
    if (matchup && matchup.isPlayoff === true) return SeasonType.PLAYOFFS;

    // If it's a playoff week but the matchup is explicitly not playoff, treat it as LT.
    if (String(wt) === String(SeasonType.PLAYOFFS) && matchup) {
      if (matchup.isPlayoff === false || matchup.isPlayoff === "FALSE") {
        return SeasonType.LOSERS_TOURNAMENT;
      }
    }
    return wt;
  }

  function getBaseKMultiplierForType(opts, weekType) {
    var mult = 1;
    if (opts && opts.eloWeekTypeKMultipliers) {
      var raw = opts.eloWeekTypeKMultipliers[String(weekType)];
      if (raw === undefined || raw === null)
        raw = opts.eloWeekTypeKMultipliers[weekType];
      var n = toNumber(raw);
      if (isFinite(n) && n > 0) mult = n;
    }
    return mult;
  }

  /**
   * Primary entry point.
   *
   * @param {string|number} seasonId
   * @param {Object=} options
   */
  function updatePowerRankingsForSeason(seasonId, options) {
    var seasonKey = normalizeSeasonId(seasonId, "updatePowerRankingsForSeason");
    var opts = applyDefaults(options);
    runtimeTodayDate = formatDateOnly(opts.todayDate);

    if (opts.logToConsole) {
      console.log(
        "[PowerRankingsAlgo] start season=",
        seasonKey,
        "weekTypes=",
        opts.weekTypes || (opts.seasonType ? [opts.seasonType] : "ALL"),
        "dryRun=",
        opts.dryRun,
      );
    }

    ensurePowerRankingColumns();

    var seasons =
      tryFetchSheetAsObjects(SPREADSHEET_ID, "Season", {
        coerceTypes: true,
      }) || [];
    var allTeams =
      tryFetchSheetAsObjects(SPREADSHEET_ID, "Team", {
        coerceTypes: true,
      }) || [];
    var allFranchises =
      tryFetchSheetAsObjects(SPREADSHEET_ID, "Franchise", {
        coerceTypes: true,
      }) || [];
    var allTeamWeekRows =
      tryFetchSheetAsObjects(TEAMSTATS_SPREADSHEET_ID, "TeamWeekStatLine", {
        coerceTypes: true,
      }) || [];
    var allTeamAwards =
      tryFetchSheetAsObjects(SPREADSHEET_ID, "TeamAwards", {
        coerceTypes: true,
      }) ||
      tryFetchSheetAsObjects(SPREADSHEET_ID, "TeamAward", {
        coerceTypes: true,
      }) ||
      [];
    var allPlayerWeekRows =
      tryFetchSheetAsObjects(PLAYERSTATS_SPREADSHEET_ID, "PlayerWeekStatLine", {
        coerceTypes: true,
      }) || [];
    var allMatchups =
      tryFetchSheetAsObjects(SPREADSHEET_ID, "Matchup", {
        coerceTypes: true,
      }) || [];

    var allWeeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week", {
      coerceTypes: true,
    });
    var weeks = allWeeks.filter(function (w) {
      return String(w && w.seasonId) === String(seasonKey);
    });

    // Optional filtering by weekType.
    var weekTypesSet = null;
    if (opts.weekTypes && opts.weekTypes.length) {
      weekTypesSet = new Set(
        opts.weekTypes.map(function (x) {
          return String(x);
        }),
      );
    } else if (opts.seasonType) {
      // Legacy option; keep for backwards compatibility.
      weekTypesSet = new Set([String(opts.seasonType)]);
    }

    weeks = sortWeeks(weeks);
    var allSeasonWeekStatusById = buildWeekStatusMap(weeks);
    weeks = weeks.filter(function (week) {
      var status = allSeasonWeekStatusById.get(String(week.id));
      return !!(status && (status.isComplete || status.isActive));
    });
    var selectedWeeks = weekTypesSet
      ? weeks.filter(function (week) {
          return weekTypesSet.has(String(getWeekType(week)));
        })
      : weeks;
    if (!selectedWeeks.length) {
      if (opts.logToConsole) {
        console.log("[PowerRankingsAlgo] no weeks found for season/type");
      }
      return {
        updatedWeekRows: 0,
        updatedSeasonRows: 0,
        dryRun: !!opts.dryRun,
      };
    }

    var weekIdSet = new Set(
      weeks
        .map(function (w) {
          return w && w.id !== undefined && w.id !== null ? String(w.id) : "";
        })
        .filter(Boolean),
    );

    var teamsForSeason = (allTeams || []).filter(function (t) {
      return String(t && t.seasonId) === String(seasonKey);
    });
    teamsForSeason.sort(function (a, b) {
      return String(a && a.id).localeCompare(String(b && b.id));
    });
    var teamIds = teamsForSeason
      .map(function (team) {
        return team && team.id !== undefined && team.id !== null
          ? String(team.id)
          : "";
      })
      .filter(Boolean);
    var teamIdSet = new Set(teamIds);
    var weekStatusById = allSeasonWeekStatusById;

    var ownerIdByFranchiseId = new Map();
    (allFranchises || []).forEach(function (franchise) {
      if (!franchise) return;
      var franchiseId =
        franchise.id !== undefined && franchise.id !== null
          ? String(franchise.id)
          : "";
      var ownerId =
        franchise.ownerId !== undefined && franchise.ownerId !== null
          ? String(franchise.ownerId)
          : "";
      if (franchiseId) ownerIdByFranchiseId.set(franchiseId, ownerId);
    });

    var currentFranchiseIdByTeamId = new Map();
    var currentOwnerIdByTeamId = new Map();
    teamsForSeason.forEach(function (t) {
      var tid = t && t.id !== undefined && t.id !== null ? String(t.id) : "";
      var fid =
        t && t.franchiseId !== undefined && t.franchiseId !== null
          ? String(t.franchiseId)
          : "";
      if (tid) {
        currentFranchiseIdByTeamId.set(tid, fid);
        currentOwnerIdByTeamId.set(tid, ownerIdByFranchiseId.get(fid) || "");
      }
    });

    var playerDayWorkbookId = resolvePlayerDayWorkbookId(seasonKey);
    var playerDayRows = playerDayWorkbookId
      ? tryFetchSheetAsObjects(playerDayWorkbookId, "PlayerDayStatLine", {
          coerceTypes: true,
        }) || []
      : [];
    playerDayRows = playerDayRows.filter(function (row) {
      if (!row) return false;
      return String(row.seasonId || "") === String(seasonKey);
    });

    var playerNhlSheetName = detectPlayerNhlSheetName();
    var playerNhlRows = playerNhlSheetName
      ? tryFetchSheetAsObjects(PLAYERSTATS_SPREADSHEET_ID, playerNhlSheetName, {
          coerceTypes: true,
        }) || []
      : [];
    var preseasonTalentByPlayerId = buildPreseasonPlayerTalentById(
      playerNhlRows,
      seasonKey,
      seasons,
    );
    var currentSeasonPlayerWeeks = allPlayerWeekRows.filter(function (row) {
      return String(row && row.seasonId) === String(seasonKey);
    });
    var rollingTalentByWeekPlayerKey = buildRollingPlayerTalentByWeek(
      weeks,
      currentSeasonPlayerWeeks,
      preseasonTalentByPlayerId,
    );
    var rosterStrengthByWeekTeamKey = buildRosterStrengthByWeekTeam(
      weeks,
      teamIds,
      playerDayRows,
      rollingTalentByWeekPlayerKey,
    );
    var firstWeekIdForSeed = weeks && weeks.length ? String(weeks[0].id) : "";
    var seedTalentZByTeam = buildTalentZMapForWeek(
      teamIds,
      firstWeekIdForSeed,
      rosterStrengthByWeekTeamKey,
    );

    if (opts.logToConsole) {
      console.log(
        "[PowerRankingsAlgo] roster strength inputs: playerDays=",
        (playerDayRows || []).length,
        "playerNhlRows=",
        (playerNhlRows || []).length,
        "preseasonTalentPlayers=",
        preseasonTalentByPlayerId.size,
        "teams=",
        teamIds.length,
      );
    }

    // Pull TeamWeekStatLine for this season and these weeks.
    var teamWeekRows = fetchSheetAsObjects(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
      { coerceTypes: true },
    ).filter(function (tw) {
      if (!tw) return false;
      if (String(tw && tw.seasonId) !== String(seasonKey)) return false;
      var wk =
        tw.weekId !== undefined && tw.weekId !== null ? String(tw.weekId) : "";
      if (!wk || !weekIdSet.has(wk)) return false;
      var tid =
        tw.gshlTeamId !== undefined && tw.gshlTeamId !== null
          ? String(tw.gshlTeamId)
          : "";
      return tid ? teamIdSet.has(tid) : false;
    });

    // Index: weekId -> teamId -> row
    var teamWeeksByWeekId = new Map();
    teamWeekRows.forEach(function (tw) {
      var wk = String(tw.weekId);
      var tid = String(tw.gshlTeamId);
      if (!teamWeeksByWeekId.has(wk)) teamWeeksByWeekId.set(wk, new Map());
      teamWeeksByWeekId.get(wk).set(tid, tw);
    });

    // Pull matchups for those weeks.
    var matchups = allMatchups.filter(function (m) {
      if (!m) return false;
      var wk =
        m.weekId !== undefined && m.weekId !== null ? String(m.weekId) : "";
      if (!wk || !weekIdSet.has(wk)) return false;
      // Only include matchups involving teams in this season.
      var home =
        m.homeTeamId !== undefined && m.homeTeamId !== null
          ? String(m.homeTeamId)
          : "";
      var away =
        m.awayTeamId !== undefined && m.awayTeamId !== null
          ? String(m.awayTeamId)
          : "";
      return home && away && teamIdSet.has(home) && teamIdSet.has(away);
    });

    var matchupsByWeekId = new Map();
    matchups.forEach(function (m) {
      var wk = String(m.weekId);
      if (!matchupsByWeekId.has(wk)) matchupsByWeekId.set(wk, []);
      matchupsByWeekId.get(wk).push(m);
    });

    var historicalSeasonRows = [];
    (seasons || []).forEach(function (season) {
      var historicalSeasonId =
        season && season.id !== undefined && season.id !== null
          ? String(season.id)
          : "";
      if (!historicalSeasonId || historicalSeasonId === String(seasonKey))
        return;
      historicalSeasonRows = historicalSeasonRows.concat(
        pickBestFinishWeekRowsForSeason(
          allTeamWeekRows,
          allWeeks,
          historicalSeasonId,
        ),
      );
    });

    var historyPriorByTeam = computeHistoryPriorMap(
      seasonKey,
      teamIds,
      currentFranchiseIdByTeamId,
      currentOwnerIdByTeamId,
      allTeams,
      allFranchises,
      historicalSeasonRows,
      seasons,
      opts,
    );
    var gmReplay = buildInitialGmStates(
      seasonKey,
      seasons,
      allWeeks,
      allTeams,
      allFranchises,
      allMatchups,
      allTeamAwards,
      allTeamWeekRows,
    );

    // Initialize Elo / EWMA state.
    var eloByTeam = new Map();
    var statEwmaByTeam = new Map();
    var previousWeekScoreByTeam = new Map();
    teamIds.forEach(function (tid) {
      var teamKey = String(tid);
      var talentZ = toNumber(seedTalentZByTeam.get(teamKey) || 0);
      var historyZ = toNumber(historyPriorByTeam.get(teamKey) || 0);

      var elo0 =
        toNumber(opts.baseElo) +
        toNumber(opts.seedEloTalentPointsPerZ) * talentZ +
        toNumber(opts.seedEloHistoryPointsPerZ) * historyZ;
      eloByTeam.set(teamKey, isFinite(elo0) ? elo0 : toNumber(opts.baseElo));

      // Week 1 has no completed current-season form.
      statEwmaByTeam.set(teamKey, 0);
      previousWeekScoreByTeam.set(teamKey, 0);
    });

    var weekUpdates = [];
    var matchupUpdates = [];

    // For season snapshots: track the last weekId per weekType encountered.
    var lastWeekIdByType = new Map();
    var weekUpdatesByWeekId = new Map();

    // For stepped playoff weighting: map weekId -> playoff round index (1..N).
    var playoffRoundIndexByWeekId = new Map();
    var playoffWeeks = weeks.filter(function (w) {
      return String(getWeekType(w)) === String(SeasonType.PLAYOFFS);
    });
    playoffWeeks = sortWeeks(playoffWeeks);
    playoffWeeks.forEach(function (w, idx) {
      playoffRoundIndexByWeekId.set(String(w.id), idx + 1);
    });

    // Iterate weeks in order.
    weeks.forEach(function (week, weekIdx) {
      var weekId = String(week.id);
      var weekNumber = toNumber(weekIdx) + 1;
      var weekType = (week && week.weekType) || SeasonType.REGULAR_SEASON;
      var emitWeek =
        !weekTypesSet || weekTypesSet.has(String(getWeekType(week)));
      var weekStatus = weekStatusById.get(weekId) || {
        isComplete: false,
        isActive: false,
      };
      if (emitWeek) {
        lastWeekIdByType.set(String(weekType), String(weekId));
      }
      var weekTeamMap = teamWeeksByWeekId.get(weekId) || new Map();
      var weekMatchups = matchupsByWeekId.get(weekId) || [];
      var playoffRoundIndex =
        playoffRoundIndexByWeekId.get(String(weekId)) || 1;
      var talentZByTeam = buildTalentZMapForWeek(
        teamIds,
        weekId,
        rosterStrengthByWeekTeamKey,
      );
      var gmMaps = buildGmMapsForWeek(
        teamIds,
        gmReplay.ownerIdByTeamId,
        gmReplay.states,
      );

      var prePowerMaps = computePregamePowerMaps(
        teamIds,
        eloByTeam,
        statEwmaByTeam,
        talentZByTeam,
        gmMaps.zByTeam,
        historyPriorByTeam,
        previousWeekScoreByTeam,
        weekNumber,
        opts,
      );
      var preCompositeByTeam = prePowerMaps.compositeByTeam;
      var preRatingByTeam = prePowerMaps.ratingByTeam;
      var preRankByTeam = buildRankMapFromCompositeMap(preCompositeByTeam);

      // Snapshot Elo at the start of the week (pre-matchup).
      var eloPreByTeam = new Map();
      var statEwmaPreByTeam = new Map();
      var previousWeekScorePreByTeam = new Map();
      teamIds.forEach(function (tid) {
        eloPreByTeam.set(String(tid), eloByTeam.get(String(tid)));
        statEwmaPreByTeam.set(
          String(tid),
          statEwmaByTeam.get(String(tid)) || 0,
        );
        previousWeekScorePreByTeam.set(
          String(tid),
          previousWeekScoreByTeam.get(String(tid)) || 0,
        );
      });

      // Track the per-team matchup parameters for this week (best-effort).
      var matchupParamsByTeam = new Map();
      var matchupUpdateById = new Map();
      weekMatchups.forEach(function (matchup) {
        var homeId = String(matchup.homeTeamId || "");
        var awayId = String(matchup.awayTeamId || "");
        if (!homeId || !awayId) return;

        var isComplete = isMatchupEffectivelyComplete(matchup);
        var pregame = buildPregameMatchupRating(
          matchup,
          weekType,
          playoffRoundIndex,
          preRatingByTeam,
          (function () {
            var rosterStrengthByTeamForWeek = new Map();
            teamIds.forEach(function (teamId) {
              rosterStrengthByTeamForWeek.set(
                String(teamId),
                toNumber(
                  rosterStrengthByWeekTeamKey.get(
                    weekId + "::" + String(teamId),
                  ) || 0,
                ),
              );
            });
            return rosterStrengthByTeamForWeek;
          })(),
          !isComplete,
          opts,
        );
        if (!pregame) return;

        matchupUpdateById.set(String(matchup.id), {
          id: String(matchup.id),
          homeTeamId: homeId,
          awayTeamId: awayId,
          ratingPre: pregame.ratingPre,
          ratingRealized: "",
          ratingCompetitive: pregame.ratingCompetitive,
          ratingImportance: pregame.ratingImportance,
          ratingRosterStrength: pregame.ratingRosterStrength,
          rating: pregame.ratingPre,
        });
      });

      // Matchup-derived weekly metrics.
      var matchupMetrics = buildMatchupMetricsForWeek(weekMatchups);

      // Weekly performance score (z-based) + EWMA update.
      var categoryZ = computeWeeklyStatScores(weekTeamMap, teamIds);

      // Matchup points z-score.
      var ptsVals = teamIds.map(function (tid) {
        var p = matchupMetrics.pointsByTeam.get(String(tid));
        return p === undefined ? 0 : toNumber(p);
      });
      var ptsMeta = computeZFromArray(ptsVals);
      var ptsZ = new Map();
      teamIds.forEach(function (tid) {
        var p = matchupMetrics.pointsByTeam.get(String(tid));
        var pn = p === undefined ? 0 : toNumber(p);
        ptsZ.set(String(tid), (pn - ptsMeta.mean) / ptsMeta.std);
      });

      // Matchup score margin z-score.
      var marginVals = teamIds.map(function (tid) {
        var d = matchupMetrics.marginByTeam.get(String(tid));
        return d === undefined ? 0 : toNumber(d);
      });
      var marginMeta = computeZFromArray(marginVals);
      var marginZ = new Map();
      teamIds.forEach(function (tid) {
        var d = matchupMetrics.marginByTeam.get(String(tid));
        var dn = d === undefined ? 0 : toNumber(d);
        marginZ.set(String(tid), (dn - marginMeta.mean) / marginMeta.std);
      });

      // Combine into a single weekly performance score.
      var weeklyPerfScore = new Map();
      var teamHasSignal = new Map();
      var wCat = toNumber(opts.perfCategoryWeight);
      var wPts = toNumber(opts.perfMatchupPointsWeight);
      var wMar = toNumber(opts.perfMatchupMarginWeight);
      if (!isFinite(wCat)) wCat = 0.5;
      if (!isFinite(wPts)) wPts = 0.25;
      if (!isFinite(wMar)) wMar = 0.25;

      teamIds.forEach(function (tid) {
        var key = String(tid);
        var row = weekTeamMap.get(key);
        var hasStatSignal = hasTeamWeekPerformanceData(row);
        var hasMatchupSignal =
          matchupMetrics.pointsByTeam.has(key) ||
          matchupMetrics.marginByTeam.has(key);
        var hasSignal = hasStatSignal || hasMatchupSignal;
        teamHasSignal.set(key, hasSignal);
        if (!hasSignal) {
          weeklyPerfScore.set(key, 0);
          return;
        }
        var s =
          wCat * toNumber(categoryZ.get(key)) +
          wPts * toNumber(ptsZ.get(key)) +
          wMar * toNumber(marginZ.get(key));
        weeklyPerfScore.set(key, s);
      });

      teamIds.forEach(function (tid) {
        var teamKey = String(tid);
        if (!weekStatus.isComplete) return;
        var curr = weeklyPerfScore.get(teamKey) || 0;
        previousWeekScoreByTeam.set(teamKey, curr);
        if (!teamHasSignal.get(teamKey)) return;
        var prev = statEwmaByTeam.get(teamKey) || 0;
        var next = opts.ewmaAlpha * curr + (1 - opts.ewmaAlpha) * prev;
        statEwmaByTeam.set(teamKey, next);
      });

      // Elo updates from matchups in this week.
      weekMatchups.forEach(function (m) {
        var homeId = String(m.homeTeamId);
        var awayId = String(m.awayTeamId);
        if (!homeId || !awayId) return;

        var homeElo = eloPreByTeam.get(homeId);
        var awayElo = eloPreByTeam.get(awayId);
        if (!isFinite(homeElo) || !isFinite(awayElo)) return;

        var expHome = expectedScore(homeElo, awayElo, opts.eloScale);
        var expAway = 1 - expHome;

        var matchupType = getMatchupWeekType(week, m);
        var baseTypeMult = getBaseKMultiplierForType(opts, matchupType);
        var typeMult = baseTypeMult;
        if (String(matchupType) === String(SeasonType.PLAYOFFS)) {
          var step = toNumber(opts.eloPlayoffRoundStep);
          if (!isFinite(step)) step = 0;
          typeMult = baseTypeMult + Math.max(0, playoffRoundIndex - 1) * step;
          if (!(isFinite(typeMult) && typeMult > 0)) typeMult = baseTypeMult;
        }
        var K =
          computeKFactor(opts.baseK, opts.marginKMultiplier, m) * typeMult;

        if (!matchupParamsByTeam.has(homeId)) {
          matchupParamsByTeam.set(homeId, {
            expected: expHome,
            K: K,
            opponentId: awayId,
          });
        }
        if (!matchupParamsByTeam.has(awayId)) {
          matchupParamsByTeam.set(awayId, {
            expected: expAway,
            K: K,
            opponentId: homeId,
          });
        }

        var actual = computeMatchupActualScore(m, opts.eloMarginWeight);
        if (
          !actual ||
          !weekStatus.isComplete ||
          !isMatchupEffectivelyComplete(m)
        )
          return;

        var newHome = homeElo + K * (actual.home - expHome);
        var newAway = awayElo + K * (actual.away - expAway);

        eloByTeam.set(homeId, newHome);
        eloByTeam.set(awayId, newAway);
      });

      // Build per-team week updates.
      var teamSnapshots = teamIds.map(function (tid) {
        var tidKey = String(tid);
        var pre = eloPreByTeam.get(tidKey);
        var post = eloByTeam.get(tidKey);
        var meta = matchupParamsByTeam.get(tidKey);
        return {
          seasonId: String(seasonKey),
          gshlTeamId: tidKey,
          weekId: weekId,
          powerElo: pre,
          powerEloPre: pre,
          powerEloPost: post,
          powerEloDelta:
            isFinite(toNumber(post)) && isFinite(toNumber(pre))
              ? toNumber(post) - toNumber(pre)
              : 0,
          powerEloExpected:
            meta && meta.expected !== undefined && meta.expected !== null
              ? meta.expected
              : "",
          powerEloK:
            meta && meta.K !== undefined && meta.K !== null ? meta.K : "",
          powerStatScore: previousWeekScorePreByTeam.get(tidKey) || 0,
          powerStatEwma: statEwmaPreByTeam.get(tidKey) || 0,
          powerTalent:
            rosterStrengthByWeekTeamKey.get(weekId + "::" + tidKey) || 0,
          gmLadderRating: isFinite(toNumber(gmMaps.ratingByTeam.get(tidKey)))
            ? toNumber(gmMaps.ratingByTeam.get(tidKey))
            : GM_BASE_RATING,
          powerGmScore: gmMaps.zByTeam.get(tidKey) || 0,
          powerHistoryPrior: historyPriorByTeam.get(tidKey) || 0,
          powerComposite: preCompositeByTeam.get(tidKey) || 0,
          powerRating: preRatingByTeam.get(tidKey) || 0,
          powerRk: preRankByTeam.get(tidKey) || "",
        };
      });
      if (emitWeek) {
        weekUpdates = weekUpdates.concat(teamSnapshots);
        weekUpdatesByWeekId.set(weekId, teamSnapshots.slice());
      }

      var snapshotByTeamId = new Map();
      teamSnapshots.forEach(function (snapshot) {
        snapshotByTeamId.set(String(snapshot.gshlTeamId), snapshot);
      });

      if (emitWeek)
        weekMatchups.forEach(function (matchup) {
          var matchupId =
            matchup && matchup.id !== undefined && matchup.id !== null
              ? String(matchup.id)
              : "";
          if (!matchupId || !matchupUpdateById.has(matchupId)) return;

          var baseUpdate = matchupUpdateById.get(matchupId);
          var complete = isMatchupEffectivelyComplete(matchup);
          var homeRank =
            preRankByTeam.get(String(baseUpdate.homeTeamId || "")) || "";
          var awayRank =
            preRankByTeam.get(String(baseUpdate.awayTeamId || "")) || "";
          if (!complete) {
            matchupUpdates.push({
              id: matchupId,
              homeRank: homeRank,
              awayRank: awayRank,
              ratingPre: baseUpdate.ratingPre,
              ratingRealized: baseUpdate.ratingRealized,
              ratingCompetitive: baseUpdate.ratingCompetitive,
              ratingImportance: baseUpdate.ratingImportance,
              ratingRosterStrength: baseUpdate.ratingRosterStrength,
              rating: baseUpdate.rating,
            });
            return;
          }

          var homeSnapshot = snapshotByTeamId.get(
            String(matchup.homeTeamId || ""),
          );
          var awaySnapshot = snapshotByTeamId.get(
            String(matchup.awayTeamId || ""),
          );
          var realized = buildRealizedMatchupRating(
            homeSnapshot,
            awaySnapshot,
            matchup,
            opts,
          );
          if (!realized) {
            matchupUpdates.push({
              id: matchupId,
              homeRank: homeRank,
              awayRank: awayRank,
              ratingPre: baseUpdate.ratingPre,
              ratingRealized: baseUpdate.ratingRealized,
              ratingCompetitive: baseUpdate.ratingCompetitive,
              ratingImportance: baseUpdate.ratingImportance,
              ratingRosterStrength: baseUpdate.ratingRosterStrength,
              rating: baseUpdate.rating,
            });
            return;
          }

          var finalRating =
            toNumber(opts.matchupPregameBlend) *
              toNumber(baseUpdate.ratingPre) +
            toNumber(opts.matchupRealizedBlend) *
              toNumber(realized.ratingRealized);
          var finalCompetitive =
            toNumber(opts.matchupPregameBlend) *
              toNumber(baseUpdate.ratingCompetitive) +
            toNumber(opts.matchupRealizedBlend) *
              toNumber(realized.ratingCompetitive);

          matchupUpdates.push({
            id: matchupId,
            homeRank: homeRank,
            awayRank: awayRank,
            ratingPre: baseUpdate.ratingPre,
            ratingRealized: realized.ratingRealized,
            ratingCompetitive: finalCompetitive,
            ratingImportance: baseUpdate.ratingImportance,
            ratingRosterStrength: baseUpdate.ratingRosterStrength,
            rating: finalRating,
          });
        });

      if (weekStatus.isComplete) {
        weekMatchups.forEach(function (matchup) {
          if (!isMatchupEffectivelyComplete(matchup)) return;
          applyGmMatchup(
            gmReplay.states,
            matchup,
            gmReplay.ownerIdByTeamId,
            seasonKey,
          );
        });
        applyGmPowerRanks(
          gmReplay.states,
          teamSnapshots,
          gmReplay.ownerIdByTeamId,
        );
      }
    });

    assertRequiredUpsertKeys(
      weekUpdates,
      ["gshlTeamId", "weekId", "seasonId"],
      "TeamWeekStatLine power updates",
    );
    assertRequiredUpsertKeys(matchupUpdates, ["id"], "Matchup power updates");

    var seasonUpdates = [];
    lastWeekIdByType.forEach(function (wkId, wt) {
      var rowsForType = weekUpdatesByWeekId.get(String(wkId)) || [];
      rowsForType.forEach(function (u) {
        seasonUpdates.push({
          gshlTeamId: u.gshlTeamId,
          seasonId: String(seasonKey),
          seasonType: String(wt),
          powerRk: u.powerRk,
        });
      });
    });

    if (opts.dryRun) {
      return {
        updatedWeekRows: weekUpdates.length,
        updatedSeasonRows: seasonUpdates.length,
        updatedMatchupRows: matchupUpdates.length,
        dryRun: true,
        weekUpdates: opts.returnRows ? weekUpdates : undefined,
        seasonUpdates: opts.returnRows ? seasonUpdates : undefined,
        matchupUpdates: opts.returnRows ? matchupUpdates : undefined,
      };
    }

    // Write TeamWeekStatLine updates.
    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
      ["gshlTeamId", "weekId", "seasonId"],
      weekUpdates,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
        merge: true,
      },
    );

    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamSeasonStatLine",
      ["gshlTeamId", "seasonId", "seasonType"],
      seasonUpdates,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
        merge: true,
      },
    );

    upsertSheetByKeys(SPREADSHEET_ID, "Matchup", ["id"], matchupUpdates, {
      idColumn: "id",
      createdAtColumn: "createdAt",
      updatedAtColumn: "updatedAt",
      merge: true,
    });

    if (opts.logToConsole) {
      console.log(
        "[PowerRankingsAlgo] updated TeamWeekStatLine rows=",
        weekUpdates.length,
        "TeamSeasonStatLine rows=",
        seasonUpdates.length,
        "Matchup rows=",
        matchupUpdates.length,
      );
    }

    return {
      updatedWeekRows: weekUpdates.length,
      updatedSeasonRows: seasonUpdates.length,
      updatedMatchupRows: matchupUpdates.length,
      dryRun: false,
      weekUpdates: opts.returnRows ? weekUpdates : undefined,
      seasonUpdates: opts.returnRows ? seasonUpdates : undefined,
      matchupUpdates: opts.returnRows ? matchupUpdates : undefined,
    };
  }

  return {
    ensurePowerRankingColumns: ensurePowerRankingColumns,
    updatePowerRankingsForSeason: updatePowerRankingsForSeason,
  };
})();
