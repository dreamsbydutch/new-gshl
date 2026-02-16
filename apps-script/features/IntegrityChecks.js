// @ts-nocheck

/**
 * Automated integrity checks for Google Sheet stat pipelines.
 *
 * Usage:
 *   IntegrityChecks.run({ targetDate: "2025-11-17" });
 *   IntegrityChecks.run(); // defaults to today's date + active week
 *
 * Options:
 * - targetDate/date: ISO-ish date string for context selection
 * - seasonId: optional season override
 * - dryRun: when true, skip writing to ValidationLog sheet
 */
var IntegrityChecks = (function () {
  "use strict";

  var CHECK_IDS = {
    PLAYER_DAY_DUPLICATE_KEYS: "PLAYER_DAY_DUPLICATE_KEYS",
    TEAM_WEEK_COVERAGE: "TEAM_WEEK_COVERAGE",
    MATCHUP_COMPLETION: "MATCHUP_COMPLETION",
  };

  var DEFAULT_MATCHUP_PAIRS = [
    ["1", "2"],
    ["3", "4"],
    ["5", "6"],
    ["7", "8"],
    ["9", "10"],
    ["11", "12"],
    ["13", "14"],
  ];

  function run(options) {
    var safeOptions = options || {};
    var ctx = buildContext(safeOptions);
    var checkFns = [
      checkPlayerDayDuplicateKeys,
      checkTeamWeekCoverage,
      checkMatchupCompletion,
    ];

    var results = checkFns.map(function (fn) {
      try {
        return fn(ctx);
      } catch (err) {
        var key = fn && fn.name ? fn.name : "UNKNOWN_CHECK";
        var message = "Validation crashed: " + err;
        console.log("[ERROR] " + key + " - " + message);
        return buildCheckResult(key, "ERROR", message, []);
      }
    });

    logValidationResults(results, ctx, safeOptions);
    return results;
  }

  function listChecks() {
    return Object.keys(CHECK_IDS).map(function (k) {
      return CHECK_IDS[k];
    });
  }

  function runCheck(checkId, options) {
    var safeOptions = options || {};
    var ctx = buildContext(safeOptions);

    var fn = getCheckFn(checkId);
    if (!fn) {
      var unknown = buildCheckResult(
        "UNKNOWN_CHECK",
        "ERROR",
        "Unknown checkId: " + checkId,
        [],
      );
      logValidationResults([unknown], ctx, safeOptions);
      return unknown;
    }

    var result = null;
    try {
      result = fn(ctx);
    } catch (err) {
      result = buildCheckResult(
        checkId,
        "ERROR",
        "Validation crashed: " + err,
        [],
      );
    }

    logValidationResults([result], ctx, safeOptions);
    return result;
  }

  function runChecks(checkIds, options) {
    var safeOptions = options || {};
    var ids =
      Array.isArray(checkIds) && checkIds.length ? checkIds : listChecks();
    var ctx = buildContext(safeOptions);

    var results = ids.map(function (id) {
      var fn = getCheckFn(id);
      if (!fn) {
        return buildCheckResult(
          "UNKNOWN_CHECK",
          "ERROR",
          "Unknown checkId: " + id,
          [],
        );
      }
      try {
        return fn(ctx);
      } catch (err) {
        return buildCheckResult(id, "ERROR", "Validation crashed: " + err, []);
      }
    });

    logValidationResults(results, ctx, safeOptions);
    return results;
  }

  function getCheckFn(checkId) {
    if (checkId === CHECK_IDS.PLAYER_DAY_DUPLICATE_KEYS)
      return checkPlayerDayDuplicateKeys;
    if (checkId === CHECK_IDS.TEAM_WEEK_COVERAGE) return checkTeamWeekCoverage;
    if (checkId === CHECK_IDS.MATCHUP_COMPLETION) return checkMatchupCompletion;
    return null;
  }

  function buildContext(options) {
    var todayDateString = GshlUtils.core.date.formatDateOnly(new Date());
    var targetDate = GshlUtils.core.date.formatDateOnly(
      options.targetDate || options.date || todayDateString,
    );

    var seasons = GshlUtils.sheets.read.fetchSheetAsObjects(
      SPREADSHEET_ID,
      "Season",
    );

    var season = null;
    if (options.seasonId) {
      var seasonIdStr = options.seasonId.toString();
      season = seasons.find(function (s) {
        return s && s.id && s.id.toString() === seasonIdStr;
      });
    }

    if (!season) {
      season =
        seasons.find(function (s) {
          return GshlUtils.core.date.isDateInRange(
            targetDate,
            s.startDate,
            s.endDate,
          );
        }) || null;
    }

    if (!season && seasons.length) {
      season = seasons[seasons.length - 1];
    }

    var seasonIdString = season && season.id ? season.id.toString() : null;

    var weekRecords = GshlUtils.sheets.read.fetchSheetAsObjects(
      SPREADSHEET_ID,
      "Week",
    );
    var filteredWeeks = seasonIdString
      ? weekRecords.filter(function (w) {
          return w && w.seasonId && w.seasonId.toString() === seasonIdString;
        })
      : weekRecords;

    var activeWeek = filteredWeeks.find(function (week) {
      return GshlUtils.core.date.isDateInRange(
        targetDate,
        week.startDate,
        week.endDate,
      );
    });
    var activeWeekId =
      activeWeek && activeWeek.id ? activeWeek.id.toString() : null;

    var playerDays = GshlUtils.sheets.read
      .fetchSheetAsObjects(
        CURRENT_PLAYERDAY_SPREADSHEET_ID,
        "PlayerDayStatLine",
      )
      .filter(function (pd) {
        if (activeWeekId) {
          return pd.weekId && pd.weekId.toString() === activeWeekId;
        }
        return GshlUtils.core.date.formatDateOnly(pd.date) === targetDate;
      });

    var teamWeekStats = GshlUtils.sheets.read.fetchSheetAsObjects(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
    );
    if (seasonIdString) {
      teamWeekStats = teamWeekStats.filter(function (row) {
        return row.seasonId && row.seasonId.toString() === seasonIdString;
      });
    }

    var matchups = GshlUtils.sheets.read.fetchSheetAsObjects(
      SPREADSHEET_ID,
      "Matchup",
    );
    if (seasonIdString) {
      matchups = matchups.filter(function (m) {
        return m.seasonId && m.seasonId.toString() === seasonIdString;
      });
    }

    var teams = GshlUtils.sheets.read.fetchSheetAsObjects(
      SPREADSHEET_ID,
      "Team",
    );
    if (seasonIdString) {
      teams = teams.filter(function (team) {
        return team.seasonId && team.seasonId.toString() === seasonIdString;
      });
    }

    return {
      targetDate: targetDate,
      todayDateString: todayDateString,
      season: season,
      seasonId: seasonIdString,
      weeks: filteredWeeks,
      activeWeek: activeWeek,
      playerDays: playerDays,
      teamWeekStats: teamWeekStats,
      matchups: matchups,
      teams: teams,
    };
  }

  function checkPlayerDayDuplicateKeys(context) {
    var duplicates = [];
    var issueMap = {};

    context.playerDays.forEach(function (pd) {
      var playerId = pd.playerId ? pd.playerId.toString() : "";
      var teamId = pd.gshlTeamId ? pd.gshlTeamId.toString() : "";
      var dateStr = GshlUtils.core.date.formatDateOnly(pd.date);
      if (!playerId || !teamId || !dateStr) return;

      var key = playerId + "|" + teamId + "|" + dateStr;
      if (!issueMap[key]) {
        issueMap[key] = {
          playerId: playerId,
          gshlTeamId: teamId,
          date: dateStr,
          count: 0,
        };
      }
      issueMap[key].count++;
    });

    Object.keys(issueMap).forEach(function (key) {
      if (issueMap[key].count > 1) {
        duplicates.push(issueMap[key]);
      }
    });

    var status = duplicates.length ? "FAIL" : "PASS";
    var message = duplicates.length
      ? duplicates.length + " duplicate player-day keys found"
      : "No duplicate player-day keys detected";
    return buildCheckResult(
      CHECK_IDS.PLAYER_DAY_DUPLICATE_KEYS,
      status,
      message,
      duplicates,
    );
  }

  function checkTeamWeekCoverage(context) {
    if (!context.activeWeek) {
      return buildCheckResult(
        CHECK_IDS.TEAM_WEEK_COVERAGE,
        "PASS",
        "No active week detected for target date; skipping",
        [],
      );
    }

    var coverageSet = new Set(
      context.teamWeekStats.map(function (row) {
        var weekId = row.weekId ? row.weekId.toString() : "";
        var teamId = row.gshlTeamId ? row.gshlTeamId.toString() : "";
        return weekId + "|" + teamId;
      }),
    );
    var missingKeySet = new Set();
    var missing = [];

    context.playerDays.forEach(function (pd) {
      var weekId = pd.weekId ? pd.weekId.toString() : context.activeWeek.id;
      var teamId = pd.gshlTeamId ? pd.gshlTeamId.toString() : null;
      if (!weekId || !teamId) return;

      var key = weekId + "|" + teamId;
      if (!coverageSet.has(key) && !missingKeySet.has(key)) {
        missingKeySet.add(key);
        missing.push({
          weekId: weekId,
          gshlTeamId: teamId,
        });
      }
    });

    var status = missing.length ? "FAIL" : "PASS";
    var message = missing.length
      ? missing.length + " team/week aggregates missing"
      : "All team/week aggregates present";
    return buildCheckResult(
      CHECK_IDS.TEAM_WEEK_COVERAGE,
      status,
      message,
      missing,
    );
  }

  function checkMatchupCompletion(context) {
    if (!context.weeks || !context.weeks.length) {
      return buildCheckResult(
        CHECK_IDS.MATCHUP_COMPLETION,
        "PASS",
        "No week data available; skipping",
        [],
      );
    }

    var weekMap = new Map(
      context.weeks.map(function (week) {
        return [week.id ? week.id.toString() : "", week];
      }),
    );

    var issues = [];
    context.matchups.forEach(function (matchup) {
      var weekId = matchup.weekId ? matchup.weekId.toString() : "";
      var week = weekMap.get(weekId);
      if (!week) return;

      if (
        !GshlUtils.domain.weeks.isWeekCompleteRecord(
          week,
          context.todayDateString,
        )
      ) {
        return;
      }

      var homeScoreMissing =
        matchup.homeScore === null || matchup.homeScore === "";
      var awayScoreMissing =
        matchup.awayScore === null || matchup.awayScore === "";
      var homeWinMissing = matchup.homeWin === null || matchup.homeWin === "";
      var awayWinMissing = matchup.awayWin === null || matchup.awayWin === "";

      if (
        homeScoreMissing ||
        awayScoreMissing ||
        homeWinMissing ||
        awayWinMissing
      ) {
        issues.push({
          matchupId: matchup.id,
          weekId: weekId,
          homeTeamId: matchup.homeTeamId,
          awayTeamId: matchup.awayTeamId,
          missingFields: [
            homeScoreMissing ? "homeScore" : null,
            awayScoreMissing ? "awayScore" : null,
            homeWinMissing ? "homeWin" : null,
            awayWinMissing ? "awayWin" : null,
          ].filter(Boolean),
        });
      }
    });

    var status = issues.length ? "FAIL" : "PASS";
    var message = issues.length
      ? issues.length + " completed matchups missing scores/wins"
      : "All completed matchups have scores and win flags";
    return buildCheckResult(
      CHECK_IDS.MATCHUP_COMPLETION,
      status,
      message,
      issues,
    );
  }

  function buildCheckResult(key, status, message, issues) {
    return {
      key: key,
      status: status,
      message: message,
      issues: issues || [],
    };
  }

  function logValidationResults(results, context, options) {
    if (!results || !results.length) return;

    var logVerbose = GshlUtils.core.log.verbose;
    var isDryRunModeEnabled = GshlUtils.core.env.isDryRunModeEnabled;

    results.forEach(function (result) {
      var tag = result.status === "PASS" ? "[OK]" : "[WARN]";
      console.log(tag + " " + result.key + " - " + result.message);

      if (result.status !== "PASS" && result.issues && result.issues.length) {
        logVerbose(
          "Sample issues for " +
            result.key +
            ": " +
            JSON.stringify(result.issues.slice(0, 5)),
        );
      }
    });

    var forceDryRun = options && options.dryRun;
    var isDryRun = forceDryRun || isDryRunModeEnabled();
    if (isDryRun) {
      logVerbose(
        "[dry-run] Skipping ValidationLog sheet writes for " +
          results.length +
          " result(s)",
      );
      return;
    }

    var sheet = getOrCreateValidationSheet();
    ensureValidationLogHeaders(sheet);

    var nowIso = new Date().toISOString();
    var rows = results.map(function (result) {
      return [
        nowIso,
        context.targetDate,
        result.key,
        result.status,
        result.message,
        result.issues ? result.issues.length : 0,
        result.issues && result.issues.length
          ? JSON.stringify(result.issues.slice(0, 5))
          : "",
      ];
    });

    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  }

  function getOrCreateValidationSheet() {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("ValidationLog");
    if (!sheet) {
      sheet = ss.insertSheet("ValidationLog");
    }
    return sheet;
  }

  function ensureValidationLogHeaders(sheet) {
    if (sheet.getLastRow() > 0) return;
    var headers = [
      "timestamp",
      "targetDate",
      "checkKey",
      "status",
      "summary",
      "issueCount",
      "sampleIssues",
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  function assert(condition, message) {
    if (condition) return;
    throw new Error(message || "Assertion failed");
  }

  function validateEnvironment() {
    var issues = [];
    if (typeof GshlUtils === "undefined")
      issues.push("Missing global: GshlUtils");
    if (typeof SPREADSHEET_ID === "undefined")
      issues.push("Missing global: SPREADSHEET_ID");
    if (typeof CURRENT_PLAYERDAY_SPREADSHEET_ID === "undefined") {
      issues.push("Missing global: CURRENT_PLAYERDAY_SPREADSHEET_ID");
    }
    if (typeof TEAMSTATS_SPREADSHEET_ID === "undefined") {
      issues.push("Missing global: TEAMSTATS_SPREADSHEET_ID");
    }
    return issues;
  }

  function normalizeYahooMatchupPlayerName(rawName) {
    if (!rawName) return "";
    var s = String(rawName);
    s = s.replace(/\bPPD\b/g, " ");
    s = s.replace(/\b(IL\+|IR\+|IR)\b/g, " ");
    s = s.replace(/\b(W|L),\b/g, " ");
    s = s.replace(/\([^)]*\)/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    try {
      if (GshlUtils && GshlUtils.core && GshlUtils.core.text) {
        var normalizeName = GshlUtils.core.text.normalizeName;
        if (typeof normalizeName === "function") return normalizeName(s);
      }
    } catch (_e) {
      // ignore
    }
    return s.toLowerCase();
  }

  function buildPlayersByNormalizedName(players) {
    var map = new Map();
    (players || []).forEach(function (p) {
      if (!p) return;
      var candidates = [p.fullName, p.playerName, p.name];
      candidates.forEach(function (c) {
        var key = normalizeYahooMatchupPlayerName(c);
        if (!key) return;
        if (!map.has(key)) map.set(key, p);
      });
    });
    return map;
  }

  function resolvePlayerFromMatchupRowName(rowName, playersByName, players) {
    var key = normalizeYahooMatchupPlayerName(rowName);
    if (!key) return null;
    if (playersByName && playersByName.has(key)) return playersByName.get(key);

    var best = null;
    (players || []).some(function (p) {
      var full = normalizeYahooMatchupPlayerName(p && p.fullName);
      if (!full) return false;
      if (full === key || full.includes(key) || key.includes(full)) {
        best = p;
        return true;
      }
      return false;
    });
    return best;
  }

  function resolveSeasonCodeForYahoo(seasonId, options) {
    var seasonIdNum = Number(seasonId);
    var seasonCodeOverride =
      options && options.seasonCode ? String(options.seasonCode) : "";
    if (seasonCodeOverride) return seasonCodeOverride;

    var seasonCodeById = {
      1: "32199",
      2: "15588",
      3: "14315",
      4: "2537",
      5: "22201",
      6: "75888",
      7: "8673",
      8: "31325",
      9: "52650",
      10: "45850",
      11: "47379",
    };

    var mapped = seasonCodeById[seasonIdNum] || "";
    if (mapped) return mapped;

    if (typeof YAHOO_LEAGUE_ID !== "undefined" && YAHOO_LEAGUE_ID) {
      return String(YAHOO_LEAGUE_ID);
    }
    return "";
  }

  function isNullish(v) {
    return v === null || v === undefined || v === "";
  }

  function toNumberOrNull(value) {
    if (isNullish(value)) return null;
    if (value === "-") return null;
    var num = Number(value);
    return isFinite(num) ? num : null;
  }

  function numbersDiffer(a, b, tolerance) {
    if (a === null && b === null) return false;
    if (a === null || b === null) return true;
    var tol = typeof tolerance === "number" ? tolerance : 0;
    return Math.abs(a - b) > tol;
  }

  function parseWeeklyMatchupTablesForTeam(teamMatchupTables, hasPM) {
    if (!teamMatchupTables || !teamMatchupTables.length) return null;
    var headerRow = teamMatchupTables[0] || [];
    var teamLabel = headerRow[0] ? String(headerRow[0]) : "";
    var teamStats = headerRow.slice(1, hasPM ? 15 : 14);
    var idx = {
      G: 0,
      A: 1,
      P: 2,
      PM: hasPM ? 3 : null,
      PPP: hasPM ? 4 : 3,
      SOG: hasPM ? 5 : 4,
      HIT: hasPM ? 6 : 5,
      BLK: hasPM ? 7 : 6,
      W: hasPM ? 8 : 7,
      GA: hasPM ? 9 : 8,
      GAA: hasPM ? 10 : 9,
      SV: hasPM ? 11 : 10,
      SA: hasPM ? 12 : 11,
    };

    var out = {
      teamLabel: teamLabel,
      team: {
        G: toNumberOrNull(teamStats[idx.G]),
        A: toNumberOrNull(teamStats[idx.A]),
        P: toNumberOrNull(teamStats[idx.P]),
        PM: hasPM ? toNumberOrNull(teamStats[idx.PM]) : null,
        PPP: toNumberOrNull(teamStats[idx.PPP]),
        SOG: toNumberOrNull(teamStats[idx.SOG]),
        HIT: toNumberOrNull(teamStats[idx.HIT]),
        BLK: toNumberOrNull(teamStats[idx.BLK]),
        W: toNumberOrNull(teamStats[idx.W]),
        GA: toNumberOrNull(teamStats[idx.GA]),
        GAA: toNumberOrNull(teamStats[idx.GAA]),
        SV: toNumberOrNull(teamStats[idx.SV]),
        SA: toNumberOrNull(teamStats[idx.SA]),
        SVP: null,
      },
      skaters: [],
      goalies: [],
    };

    if (out.team.SV !== null && out.team.SA !== null && out.team.SA !== 0) {
      out.team.SVP = Number((out.team.SV / out.team.SA).toFixed(5));
    }

    var skaterRows = teamMatchupTables[1] || [];
    skaterRows.forEach(function (row) {
      if (!row || !row.length) return;
      var playerName = row[1] ? String(row[1]) : "";
      if (!playerName || playerName === "(Empty)") return;
      var pmIdx = hasPM ? 5 : null;
      var pppIdx = hasPM ? 6 : 5;
      var sogIdx = hasPM ? 7 : 6;
      var hitIdx = hasPM ? 8 : 7;
      var blkIdx = hasPM ? 9 : 8;
      out.skaters.push({
        playerName: playerName,
        stats: {
          G: toNumberOrNull(row[2]),
          A: toNumberOrNull(row[3]),
          P: toNumberOrNull(row[4]),
          PM: hasPM ? toNumberOrNull(row[pmIdx]) : null,
          PPP: toNumberOrNull(row[pppIdx]),
          SOG: toNumberOrNull(row[sogIdx]),
          HIT: toNumberOrNull(row[hitIdx]),
          BLK: toNumberOrNull(row[blkIdx]),
        },
      });
    });

    var goalieRows = teamMatchupTables[2] || [];
    goalieRows.forEach(function (row) {
      if (!row || !row.length) return;
      var goalieName = row[1] ? String(row[1]).trim() : "";
      if (!goalieName || goalieName === "(Empty)") return;
      out.goalies.push({
        playerName: goalieName,
        stats: {
          W: toNumberOrNull(row[2]),
          GAA: toNumberOrNull(row[3]),
          SVP: toNumberOrNull(row[4]),
        },
      });
    });

    return out;
  }

  /**
   * Scrape Yahoo weekly matchup tables for a season and compare against
   * TeamWeekStatLine + PlayerWeekStatLine in Sheets.
   *
   * Returns a discrepancy report; does not write any stat updates.
   *
   * @param {string|number} seasonId
   * @param {Object=} options
   * @param {Array<string|number>=} options.weekNums Week numbers to check (defaults to all weeks in season)
   * @param {string=} options.seasonCode Yahoo league code override
   * @param {number=} options.floatTolerance Tolerance for float comparisons (GAA/SVP)
   * @param {boolean=} options.logToConsole When true, prints a short summary
   * @param {boolean=} options.verbose When true, prints every mismatch line-by-line (default true)
   * @param {boolean=} options.progress When true, prints week/matchup scrape progress (default true)
   */
  function scrapeAndCheckMatchupTables(seasonId, options) {
    var safeOptions = options || {};

    var seasonKey =
      seasonId === undefined || seasonId === null
        ? ""
        : typeof seasonId === "string"
          ? seasonId.trim()
          : String(seasonId);
    if (!seasonKey) {
      throw new Error(
        "IntegrityChecks.scrapeAndCheckMatchupTables requires a seasonId",
      );
    }

    if (typeof YahooScraper === "undefined" || !YahooScraper) {
      throw new Error(
        "YahooScraper is not defined. Ensure YahooScraper.js is loaded before IntegrityChecks.js",
      );
    }
    if (
      !YahooScraper.matchups ||
      !YahooScraper.matchups.fetchYahooMatchupTables
    ) {
      throw new Error(
        "YahooScraper.matchups.fetchYahooMatchupTables is not available. Ensure YahooScraper.matchups is exported",
      );
    }

    var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;

    var seasonIdNum = Number(seasonKey);
    var hasPM = seasonIdNum <= 6;
    var floatTolerance =
      typeof safeOptions.floatTolerance === "number"
        ? safeOptions.floatTolerance
        : 1e-4;
    var logToConsole =
      safeOptions.logToConsole === undefined ||
      safeOptions.logToConsole === null
        ? true
        : !!safeOptions.logToConsole;

    var verbose =
      safeOptions.verbose === undefined || safeOptions.verbose === null
        ? true
        : !!safeOptions.verbose;

    var progress =
      safeOptions.progress === undefined || safeOptions.progress === null
        ? true
        : !!safeOptions.progress;

    var seasonCode = resolveSeasonCodeForYahoo(seasonKey, safeOptions);
    if (!seasonCode) {
      throw new Error(
        "Unable to resolve Yahoo seasonCode/league id for seasonId=" +
          seasonKey +
          ". Provide options.seasonCode or set YAHOO_LEAGUE_ID.",
      );
    }

    var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
      function (w) {
        return (
          w && w.seasonId !== undefined && String(w.seasonId) === seasonKey
        );
      },
    );
    if (!weeks.length) {
      return {
        seasonId: seasonKey,
        weeksChecked: 0,
        issues: [],
        summary: {
          teamMismatches: 0,
          playerMismatches: 0,
          missingPlayers: 0,
          missingTeamWeeks: 0,
        },
        note: "No Week rows found for season",
      };
    }

    var requestedWeekNums = Array.isArray(safeOptions.weekNums)
      ? safeOptions.weekNums
          .map(function (w) {
            return String(w);
          })
          .filter(Boolean)
      : [];
    var weeksToCheck = requestedWeekNums.length
      ? weeks.filter(function (w) {
          var weekNum = w && w.weekNum !== undefined ? String(w.weekNum) : "";
          return weekNum && requestedWeekNums.indexOf(weekNum) >= 0;
        })
      : weeks.slice();

    var teams = fetchSheetAsObjects(SPREADSHEET_ID, "Team").filter(
      function (t) {
        return (
          t && t.seasonId !== undefined && String(t.seasonId) === seasonKey
        );
      },
    );
    var teamByYahooId = new Map(
      teams
        .filter(function (t) {
          return (
            t &&
            t.yahooId !== undefined &&
            t.yahooId !== null &&
            t.yahooId !== ""
          );
        })
        .map(function (t) {
          return [String(t.yahooId), t];
        }),
    );

    var players = fetchSheetAsObjects(SPREADSHEET_ID, "Player");
    var playersByNormalizedName = buildPlayersByNormalizedName(players);

    var rawTeamWeeks = fetchSheetAsObjects(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
    ).filter(function (tw) {
      return (
        tw && tw.seasonId !== undefined && String(tw.seasonId) === seasonKey
      );
    });
    var rawPlayerWeeks = fetchSheetAsObjects(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerWeekStatLine",
    ).filter(function (pw) {
      return (
        pw && pw.seasonId !== undefined && String(pw.seasonId) === seasonKey
      );
    });

    var teamWeekIndex = new Map();
    rawTeamWeeks.forEach(function (tw) {
      var weekId =
        tw.weekId !== undefined && tw.weekId !== null ? String(tw.weekId) : "";
      var teamId =
        tw.gshlTeamId !== undefined && tw.gshlTeamId !== null
          ? String(tw.gshlTeamId)
          : "";
      if (!weekId || !teamId) return;
      teamWeekIndex.set(weekId + "|" + teamId, tw);
    });

    var playerWeekIndex = new Map();
    rawPlayerWeeks.forEach(function (pw) {
      var weekId =
        pw.weekId !== undefined && pw.weekId !== null ? String(pw.weekId) : "";
      var teamId =
        pw.gshlTeamId !== undefined && pw.gshlTeamId !== null
          ? String(pw.gshlTeamId)
          : "";
      var playerId =
        pw.playerId !== undefined && pw.playerId !== null
          ? String(pw.playerId)
          : "";
      if (!weekId || !teamId || !playerId) return;
      playerWeekIndex.set(weekId + "|" + teamId + "|" + playerId, pw);
    });

    var issues = [];
    var counts = {
      teamMismatches: 0,
      playerMismatches: 0,
      missingPlayers: 0,
      missingTeamWeeks: 0,
    };

    function formatMeta(meta) {
      if (!meta) return "";
      var parts = [];
      if (meta.weekNum) parts.push("week=" + meta.weekNum);
      if (meta.weekId) parts.push("weekId=" + meta.weekId);
      if (meta.gshlTeamId) parts.push("teamId=" + meta.gshlTeamId);
      if (meta.yahooTeamId) parts.push("yahooTeamId=" + meta.yahooTeamId);
      if (meta.teamLabel) parts.push('team="' + meta.teamLabel + '"');
      if (meta.playerId) parts.push("playerId=" + meta.playerId);
      if (meta.playerName) parts.push('player="' + meta.playerName + '"');
      return parts.length ? " (" + parts.join(" ") + ")" : "";
    }

    function logIssueLine(issue) {
      if (!logToConsole || !verbose) return;
      var meta = issue && issue.meta ? issue.meta : null;
      var prefix = "[IntegrityChecks][MatchupTables]";
      var metaStr = formatMeta(meta);

      if (
        issue.type === "TEAM_STAT_MISMATCH" ||
        issue.type === "PLAYER_STAT_MISMATCH"
      ) {
        console.log(
          prefix +
            " " +
            issue.type +
            metaStr +
            " field=" +
            issue.field +
            " yahoo=" +
            issue.yahooValue +
            " sheet=" +
            issue.dbValue,
        );
        return;
      }

      if (
        issue.type === "TEAM_STAT_MISSING" ||
        issue.type === "PLAYER_STAT_MISSING"
      ) {
        console.log(
          prefix +
            " " +
            issue.type +
            metaStr +
            " field=" +
            issue.field +
            " yahoo=" +
            issue.yahooValue +
            " sheet=<missing>",
        );
        return;
      }

      if (
        issue.type === "TEAM_WEEK_MISSING" ||
        issue.type === "PLAYER_WEEK_MISSING" ||
        issue.type === "PLAYER_NOT_RESOLVED" ||
        issue.type === "TEAM_NOT_RESOLVED" ||
        issue.type === "SCRAPE_PARSE_ERROR" ||
        issue.type === "TEAM_PARSE_ERROR"
      ) {
        console.log(prefix + " " + issue.type + metaStr);
        return;
      }

      if (issue.type === "SCRAPE_ERROR") {
        console.log(
          prefix + " SCRAPE_ERROR" + metaStr + " error=" + issue.error,
        );
        return;
      }

      console.log(prefix + " " + (issue.type || "ISSUE") + metaStr);
    }

    function pushIssue(issue) {
      issues.push(issue);
      if (
        issue.type === "TEAM_STAT_MISMATCH" ||
        issue.type === "TEAM_STAT_MISSING"
      )
        counts.teamMismatches++;
      if (
        issue.type === "PLAYER_STAT_MISMATCH" ||
        issue.type === "PLAYER_STAT_MISSING"
      )
        counts.playerMismatches++;
      if (
        issue.type === "PLAYER_NOT_RESOLVED" ||
        issue.type === "PLAYER_WEEK_MISSING"
      )
        counts.missingPlayers++;
      if (issue.type === "TEAM_WEEK_MISSING") counts.missingTeamWeeks++;

      logIssueLine(issue);
    }

    function compareFields(scope, expected, actualRow, fields, meta) {
      fields.forEach(function (field) {
        var yahooVal =
          expected && Object.prototype.hasOwnProperty.call(expected, field)
            ? expected[field]
            : null;
        var dbRaw = actualRow ? actualRow[field] : null;
        var dbVal = toNumberOrNull(dbRaw);

        var tol = field === "GAA" || field === "SVP" ? floatTolerance : 0;
        // Only compare fields that Yahoo actually provides.
        if (yahooVal === null) return;
        if (actualRow && yahooVal !== null && dbVal === null) {
          pushIssue({
            type: scope + "_STAT_MISSING",
            field: field,
            yahooValue: yahooVal,
            dbValue: dbRaw,
            meta: meta,
          });
          return;
        }
        if (!actualRow && yahooVal !== null) {
          // handled by caller
          return;
        }
        if (numbersDiffer(yahooVal, dbVal, tol)) {
          pushIssue({
            type: scope + "_STAT_MISMATCH",
            field: field,
            yahooValue: yahooVal,
            dbValue: dbRaw,
            meta: meta,
          });
        }
      });
    }

    function buildWeeklyMatchupUrl(yahooWeekNum, teamAId, teamBId) {
      var year = 2013 + seasonIdNum;
      return (
        "https://hockey.fantasysports.yahoo.com/" +
        year +
        "/hockey/" +
        seasonCode +
        "/matchup?week=" +
        String(yahooWeekNum) +
        "&mid1=" +
        String(teamAId) +
        "&mid2=" +
        String(teamBId)
      );
    }

    function parseTwoTeamWeekPage(url) {
      var tablesResult = YahooScraper.matchups.fetchYahooMatchupTables(url);
      var tables =
        tablesResult && tablesResult.tables ? tablesResult.tables : [];
      if (!tables || tables.length < 4) return null;

      var sliced = [tables[1]].concat(
        tables.slice(tables.length - 3, tables.length - 1),
      );
      if (sliced.length < 3) return null;

      var teamATables = [
        sliced[0].rows[0],
        sliced[1].rows.map(function (x) {
          return x.slice(0, 10);
        }),
        sliced[2].rows.map(function (x) {
          return x.slice(0, 6);
        }),
      ];
      var teamBTables = [
        sliced[0].rows[1],
        sliced[1].rows.map(function (x) {
          return x.slice(11);
        }),
        sliced[2].rows.map(function (x) {
          return x.slice(7);
        }),
      ];
      return { teamATables: teamATables, teamBTables: teamBTables };
    }

    weeksToCheck.forEach(function (week) {
      var weekNum =
        week && week.weekNum !== undefined ? String(week.weekNum) : "";
      var weekId = week && week.id !== undefined ? String(week.id) : "";
      if (!weekNum || !weekId) return;

      if (logToConsole && progress) {
        console.log(
          "[IntegrityChecks][MatchupTables] Checking week " +
            weekNum +
            " (weekId=" +
            weekId +
            ")",
        );
      }

      DEFAULT_MATCHUP_PAIRS.forEach(function (pair) {
        var teamAId = pair[0];
        var teamBId = pair[1];

        var url = buildWeeklyMatchupUrl(weekNum, teamAId, teamBId);

        var parsed = null;
        try {
          parsed = parseTwoTeamWeekPage(url);
        } catch (err) {
          pushIssue({
            type: "SCRAPE_ERROR",
            error: String(err),
            meta: {
              seasonId: seasonKey,
              weekNum: weekNum,
              weekId: weekId,
              url: url,
            },
          });
          return;
        }

        if (!parsed) {
          pushIssue({
            type: "SCRAPE_PARSE_ERROR",
            meta: {
              seasonId: seasonKey,
              weekNum: weekNum,
              weekId: weekId,
              url: url,
            },
          });
          return;
        }

        [
          { yahooTeamId: teamAId, tables: parsed.teamATables },
          { yahooTeamId: teamBId, tables: parsed.teamBTables },
        ].forEach(function (side) {
          var team = teamByYahooId.get(String(side.yahooTeamId)) || null;
          if (!team) {
            pushIssue({
              type: "TEAM_NOT_RESOLVED",
              meta: {
                seasonId: seasonKey,
                weekNum: weekNum,
                weekId: weekId,
                yahooTeamId: side.yahooTeamId,
                url: url,
              },
            });
            return;
          }

          var parsedTeam = parseWeeklyMatchupTablesForTeam(side.tables, hasPM);
          if (!parsedTeam) {
            pushIssue({
              type: "TEAM_PARSE_ERROR",
              meta: {
                seasonId: seasonKey,
                weekNum: weekNum,
                weekId: weekId,
                gshlTeamId: String(team.id),
                yahooTeamId: side.yahooTeamId,
                url: url,
              },
            });
            return;
          }

          var teamWeekRow =
            teamWeekIndex.get(weekId + "|" + String(team.id)) || null;
          if (!teamWeekRow) {
            pushIssue({
              type: "TEAM_WEEK_MISSING",
              meta: {
                seasonId: seasonKey,
                weekNum: weekNum,
                weekId: weekId,
                gshlTeamId: String(team.id),
                yahooTeamId: side.yahooTeamId,
                teamLabel: parsedTeam.teamLabel,
                url: url,
              },
            });
          } else {
            var teamFields = hasPM
              ? [
                  "G",
                  "A",
                  "P",
                  "PM",
                  "PPP",
                  "SOG",
                  "HIT",
                  "BLK",
                  "W",
                  "GA",
                  "GAA",
                  "SV",
                  "SA",
                  "SVP",
                ]
              : [
                  "G",
                  "A",
                  "P",
                  "PPP",
                  "SOG",
                  "HIT",
                  "BLK",
                  "W",
                  "GA",
                  "GAA",
                  "SV",
                  "SA",
                  "SVP",
                ];
            compareFields("TEAM", parsedTeam.team, teamWeekRow, teamFields, {
              seasonId: seasonKey,
              weekNum: weekNum,
              weekId: weekId,
              gshlTeamId: String(team.id),
              yahooTeamId: side.yahooTeamId,
              teamLabel: parsedTeam.teamLabel,
              url: url,
            });
          }

          var allPlayerRows = parsedTeam.skaters.concat(parsedTeam.goalies);
          allPlayerRows.forEach(function (row) {
            if (!row || !row.playerName) return;
            var playerName = String(row.playerName).trim();
            if (!playerName || playerName === "(Empty)") return;
            var player = resolvePlayerFromMatchupRowName(
              playerName,
              playersByNormalizedName,
              players,
            );

            if (!player) {
              pushIssue({
                type: "PLAYER_NOT_RESOLVED",
                meta: {
                  seasonId: seasonKey,
                  weekNum: weekNum,
                  weekId: weekId,
                  gshlTeamId: String(team.id),
                  yahooTeamId: side.yahooTeamId,
                  playerName: playerName,
                  url: url,
                },
              });
              return;
            }

            var key = weekId + "|" + String(team.id) + "|" + String(player.id);
            var playerWeekRow = playerWeekIndex.get(key) || null;
            if (!playerWeekRow) {
              pushIssue({
                type: "PLAYER_WEEK_MISSING",
                meta: {
                  seasonId: seasonKey,
                  weekNum: weekNum,
                  weekId: weekId,
                  gshlTeamId: String(team.id),
                  yahooTeamId: side.yahooTeamId,
                  playerId: String(player.id),
                  playerName: row.playerName,
                  url: url,
                },
              });
              return;
            }

            var fields =
              row.stats && Object.prototype.hasOwnProperty.call(row.stats, "W")
                ? ["W", "GAA", "SVP"]
                : hasPM
                  ? ["G", "A", "P", "PM", "PPP", "SOG", "HIT", "BLK"]
                  : ["G", "A", "P", "PPP", "SOG", "HIT", "BLK"];

            compareFields("PLAYER", row.stats, playerWeekRow, fields, {
              seasonId: seasonKey,
              weekNum: weekNum,
              weekId: weekId,
              gshlTeamId: String(team.id),
              yahooTeamId: side.yahooTeamId,
              playerId: String(player.id),
              playerName: row.playerName,
              url: url,
            });
          });
        });
      });
    });

    if (logToConsole) {
      console.log(
        "[IntegrityChecks] Matchup table integrity for season " +
          seasonKey +
          " checked weeks=" +
          weeksToCheck.length +
          " issues=" +
          issues.length,
      );
    }

    return {
      seasonId: seasonKey,
      seasonCode: seasonCode,
      weeksChecked: weeksToCheck.length,
      issues: issues,
      summary: counts,
    };
  }

  function smokeTest(options) {
    var envIssues = validateEnvironment();
    assert(
      envIssues.length === 0,
      "Environment issues: " + envIssues.join(", "),
    );

    var safeOptions = options || {};
    var merged = {
      targetDate: safeOptions.targetDate || safeOptions.date,
      seasonId: safeOptions.seasonId,
      dryRun: true,
    };

    var results = run(merged);
    assert(Array.isArray(results), "Expected results array");
    results.forEach(function (r) {
      assert(r && r.key, "Missing result.key");
      assert(r && r.status, "Missing result.status");
      assert(r && typeof r.message === "string", "Missing result.message");
      assert(r && Array.isArray(r.issues), "Expected result.issues array");
    });

    return { ok: true, results: results };
  }

  return {
    CHECK_IDS: CHECK_IDS,
    run: run,
    runIntegrityChecks: run,
    listChecks: listChecks,
    runCheck: runCheck,
    runChecks: runChecks,
    buildContext: buildContext,
    scrapeAndCheckMatchupTables: scrapeAndCheckMatchupTables,
    checks: {
      playerDayDuplicateKeys: checkPlayerDayDuplicateKeys,
      teamWeekCoverage: checkTeamWeekCoverage,
      matchupCompletion: checkMatchupCompletion,
    },
    tests: {
      assert: assert,
      validateEnvironment: validateEnvironment,
      smoke: smokeTest,
    },
  };
})();
