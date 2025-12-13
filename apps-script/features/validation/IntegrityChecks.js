// @ts-nocheck

/**
 * Automated integrity checks for Google Sheet stat pipelines.
 *
 * Usage:
 *   runIntegrityChecks({ targetDate: "2025-11-17" });
 *   runIntegrityChecks(); // defaults to today's date + active week
 */
function runIntegrityChecks(options) {
  var ctx = buildValidationContext(options || {});
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

  logValidationResults(results, ctx);
  return results;
}

function buildValidationContext(options) {
  var todayDateString = formatDateOnly(new Date());
  var targetDate = formatDateOnly(
    options.targetDate || options.date || todayDateString,
  );
  var seasons = fetchSheetAsObjects(SPREADSHEET_ID, "Season");
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
        return isDateInRange(targetDate, s.startDate, s.endDate);
      }) || null;
  }
  if (!season && seasons.length) {
    season = seasons[seasons.length - 1];
  }
  var seasonIdString = season && season.id ? season.id.toString() : null;

  var weekRecords = fetchSheetAsObjects(SPREADSHEET_ID, "Week");
  var filteredWeeks = seasonIdString
    ? weekRecords.filter(function (w) {
        return w && w.seasonId && w.seasonId.toString() === seasonIdString;
      })
    : weekRecords;
  var activeWeek = filteredWeeks.find(function (week) {
    return isDateInRange(targetDate, week.startDate, week.endDate);
  });
  var activeWeekId =
    activeWeek && activeWeek.id ? activeWeek.id.toString() : null;

  var playerDays = fetchSheetAsObjects(
    CURRENT_PLAYERDAY_SPREADSHEET_ID,
    "PlayerDayStatLine",
  ).filter(function (pd) {
    if (activeWeekId) {
      return pd.weekId && pd.weekId.toString() === activeWeekId;
    }
    return formatDateOnly(pd.date) === targetDate;
  });

  var teamWeekStats = fetchSheetAsObjects(
    TEAMSTATS_SPREADSHEET_ID,
    "TeamWeekStatLine",
  );
  if (seasonIdString) {
    teamWeekStats = teamWeekStats.filter(function (row) {
      return row.seasonId && row.seasonId.toString() === seasonIdString;
    });
  }

  var matchups = fetchSheetAsObjects(SPREADSHEET_ID, "Matchup");
  if (seasonIdString) {
    matchups = matchups.filter(function (m) {
      return m.seasonId && m.seasonId.toString() === seasonIdString;
    });
  }

  var teams = fetchSheetAsObjects(SPREADSHEET_ID, "Team");
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
    var dateStr = formatDateOnly(pd.date);
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
    "PLAYER_DAY_DUPLICATE_KEYS",
    status,
    message,
    duplicates,
  );
}

function checkTeamWeekCoverage(context) {
  if (!context.activeWeek) {
    return buildCheckResult(
      "TEAM_WEEK_COVERAGE",
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
  return buildCheckResult("TEAM_WEEK_COVERAGE", status, message, missing);
}

function checkMatchupCompletion(context) {
  if (!context.weeks || !context.weeks.length) {
    return buildCheckResult(
      "MATCHUP_COMPLETION",
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
    if (!isWeekCompleteRecord(week, context.todayDateString)) return;
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
  return buildCheckResult("MATCHUP_COMPLETION", status, message, issues);
}

function buildCheckResult(key, status, message, issues) {
  return {
    key: key,
    status: status,
    message: message,
    issues: issues || [],
  };
}

function logValidationResults(results, context) {
  if (!results || !results.length) return;
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

  var isDryRun =
    typeof isDryRunModeEnabled === "function" && isDryRunModeEnabled();
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
