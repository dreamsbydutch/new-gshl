// @ts-nocheck

/**
 * MatchupHandler (Apps Script)
 * ---------------------------
 * Updates matchup scores/outcomes from TeamWeekStatLine rows and updates
 * standings-related fields in TeamSeasonStatLine.
 *
 * Design goals:
 * - Single exported global object (minimize top-level functions)
 * - Deterministic, read-only computations (no scraping)
 * - Safe merging writes via upsertSheetByKeys
 */

var MatchupHandler = (function buildMatchupHandler() {
  "use strict";

  if (typeof GshlUtils === "undefined") {
    throw new Error(
      "GshlUtils is not defined. Ensure GshlUtils.js is loaded before MatchupHandler.js",
    );
  }

  var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
  var upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;
  var formatDateOnly = GshlUtils.core.date.formatDateOnly;
  var getTodayDateString = GshlUtils.core.date.getTodayDateString;
  var isWeekCompleteRecord = GshlUtils.domain.weeks.isWeekCompleteRecord;
  var matchupHasOutcome = GshlUtils.domain.matchups.matchupHasOutcome;
  var toBool = GshlUtils.core.parse.toBool;
  var toNumber = GshlUtils.core.parse.toNumber;
  var parseScore = GshlUtils.core.parse.parseScore;
  var normalizeSeasonId = GshlUtils.core.parse.normalizeSeasonId;

  var SeasonType = GshlUtils.core.constants.SeasonType;
  var MATCHUP_CATEGORY_RULES = GshlUtils.core.constants.MATCHUP_CATEGORY_RULES;
  var GOALIE_CATEGORY_SET = GshlUtils.core.constants.GOALIE_CATEGORY_SET;
  var GOALIE_START_MINIMUM = GshlUtils.core.constants.GOALIE_START_MINIMUM;

  function buildWeekStatusMap(weeks) {
    var today = getTodayDateString();
    var map = new Map();
    (weeks || []).forEach(function (week) {
      var weekId = week && week.id !== undefined ? String(week.id) : "";
      if (!weekId) return;

      var startDate = formatDateOnly(week.startDate);
      var endDate = formatDateOnly(week.endDate);

      var complete = false;
      if (week.isComplete === true) {
        complete = true;
      } else {
        complete = isWeekCompleteRecord(week, today);
      }

      var active = false;
      if (!complete && startDate && endDate && today) {
        active = today >= startDate && today <= endDate;
      }

      map.set(weekId, {
        week: week,
        weekType: week.weekType || SeasonType.REGULAR_SEASON,
        isComplete: complete,
        isActive: active,
      });
    });
    return map;
  }

  function buildTeamConferenceMap(teams) {
    var franchises = fetchSheetAsObjects(SPREADSHEET_ID, "Franchise");
    var franchiseConfMap = new Map();
    (franchises || []).forEach(function (franchise) {
      var franchiseId =
        franchise && franchise.id !== undefined ? String(franchise.id) : "";
      if (!franchiseId) return;
      var confId =
        franchise.confId !== undefined && franchise.confId !== null
          ? String(franchise.confId)
          : "";
      if (confId) franchiseConfMap.set(franchiseId, confId);
    });

    var teamConfMap = new Map();
    (teams || []).forEach(function (team) {
      var teamId = team && team.id !== undefined ? String(team.id) : "";
      if (!teamId) return;
      var teamConfId =
        team.confId !== undefined && team.confId !== null
          ? String(team.confId)
          : "";
      var franchiseId =
        team.franchiseId !== undefined && team.franchiseId !== null
          ? String(team.franchiseId)
          : "";
      var fallbackConfId = franchiseId ? franchiseConfMap.get(franchiseId) : "";
      var resolved = teamConfId || fallbackConfId;
      if (resolved) teamConfMap.set(teamId, resolved);
    });

    return teamConfMap;
  }

  function buildGoalieStartsByTeamWeek(playerWeeks) {
    var map = new Map();
    (playerWeeks || []).forEach(function (pw) {
      if (!pw) return;
      if ((pw.posGroup || "").toString() !== "G") return;
      var teamId =
        pw.gshlTeamId !== undefined && pw.gshlTeamId !== null
          ? String(pw.gshlTeamId)
          : "";
      var weekId =
        pw.weekId !== undefined && pw.weekId !== null ? String(pw.weekId) : "";
      if (!teamId || !weekId) return;
      var key = teamId + "|" + weekId;
      var prev = map.has(key) ? map.get(key) : 0;
      map.set(key, prev + toNumber(pw.GS));
    });
    return map;
  }

  function computeTeamPointsFromRecord(teamW, teamHW, teamHL) {
    // Team points formula:
    // ((W-HW)*3)+(HW*2)+(HL*1)
    var W = toNumber(teamW);
    var HW = toNumber(teamHW);
    var HL = toNumber(teamHL);
    return (W - HW) * 3 + HW * 2 + HL;
  }

  function buildCategoriesForMap(matchups, weekIdsInType) {
    var map = new Map();
    (matchups || []).forEach(function (m) {
      if (!m) return;
      var weekId =
        m.weekId !== undefined && m.weekId !== null ? String(m.weekId) : "";
      if (!weekId || !weekIdsInType || !weekIdsInType.has(weekId)) return;
      if (!matchupHasOutcome(m)) return;

      var homeId =
        m.homeTeamId !== undefined && m.homeTeamId !== null
          ? String(m.homeTeamId)
          : "";
      var awayId =
        m.awayTeamId !== undefined && m.awayTeamId !== null
          ? String(m.awayTeamId)
          : "";
      if (!homeId || !awayId) return;

      map.set(homeId, (map.get(homeId) || 0) + toNumber(m.homeScore));
      map.set(awayId, (map.get(awayId) || 0) + toNumber(m.awayScore));
    });
    return map;
  }

  function computeHeadToHeadStatsForGroup(teamIdSet, matchups, weekIdsInType) {
    var stats = new Map();
    teamIdSet.forEach(function (teamId) {
      stats.set(teamId, {
        h2hW: 0,
        h2hHW: 0,
        h2hHL: 0,
        h2hTeamPoints: 0,
        h2hCatsFor: 0,
      });
    });

    (matchups || []).forEach(function (m) {
      if (!m) return;
      var weekId =
        m.weekId !== undefined && m.weekId !== null ? String(m.weekId) : "";
      if (!weekId || !weekIdsInType || !weekIdsInType.has(weekId)) return;
      if (!matchupHasOutcome(m)) return;

      var homeId =
        m.homeTeamId !== undefined && m.homeTeamId !== null
          ? String(m.homeTeamId)
          : "";
      var awayId =
        m.awayTeamId !== undefined && m.awayTeamId !== null
          ? String(m.awayTeamId)
          : "";
      if (!homeId || !awayId) return;
      if (!teamIdSet.has(homeId) || !teamIdSet.has(awayId)) return;

      var homeStat = stats.get(homeId);
      var awayStat = stats.get(awayId);
      if (!homeStat || !awayStat) return;

      var homeScore = m.homeScore;
      var awayScore = m.awayScore;
      var hasScores = homeScore !== null && awayScore !== null;
      var scoresWereEqual = hasScores && homeScore === awayScore;

      homeStat.h2hCatsFor += toNumber(m.homeScore);
      awayStat.h2hCatsFor += toNumber(m.awayScore);

      if (m.tie === true) return;

      if (m.homeWin === true) {
        homeStat.h2hW += 1;
        if (scoresWereEqual) {
          homeStat.h2hHW += 1;
          awayStat.h2hHL += 1;
        }
      } else if (m.awayWin === true) {
        awayStat.h2hW += 1;
      }
    });

    stats.forEach(function (val) {
      val.h2hTeamPoints = computeTeamPointsFromRecord(
        val.h2hW,
        val.h2hHW,
        val.h2hHL,
      );
    });

    return stats;
  }

  function sortEntriesWithTiebreakers(
    entries,
    matchups,
    weekIdsInType,
    categoriesForMap,
  ) {
    var sorted = (entries || []).slice();

    // Primary sort: wins then team points.
    sorted.sort(function (a, b) {
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (a.teamPoints !== b.teamPoints) return b.teamPoints - a.teamPoints;
      return String(a.teamId).localeCompare(String(b.teamId));
    });

    // Resolve tie groups (same wins + teamPoints) via head-to-head mini-league.
    var i = 0;
    while (i < sorted.length) {
      var j = i + 1;
      while (
        j < sorted.length &&
        sorted[j].wins === sorted[i].wins &&
        sorted[j].teamPoints === sorted[i].teamPoints
      ) {
        j++;
      }

      if (j - i > 1) {
        var group = sorted.slice(i, j);
        var teamIdSet = new Set(
          group.map(function (e) {
            return e.teamId;
          }),
        );
        var h2hStats = computeHeadToHeadStatsForGroup(
          teamIdSet,
          matchups,
          weekIdsInType,
        );

        group.sort(function (a, b) {
          var aH2H = h2hStats.get(a.teamId) || {
            h2hW: 0,
            h2hTeamPoints: 0,
            h2hCatsFor: 0,
          };
          var bH2H = h2hStats.get(b.teamId) || {
            h2hW: 0,
            h2hTeamPoints: 0,
            h2hCatsFor: 0,
          };

          if (aH2H.h2hW !== bH2H.h2hW) return bH2H.h2hW - aH2H.h2hW;
          if (aH2H.h2hTeamPoints !== bH2H.h2hTeamPoints)
            return bH2H.h2hTeamPoints - aH2H.h2hTeamPoints;
          if (aH2H.h2hCatsFor !== bH2H.h2hCatsFor)
            return bH2H.h2hCatsFor - aH2H.h2hCatsFor;

          var aCatsFor = categoriesForMap.get(a.teamId) || 0;
          var bCatsFor = categoriesForMap.get(b.teamId) || 0;
          if (aCatsFor !== bCatsFor) return bCatsFor - aCatsFor;

          if (a.powerRating !== b.powerRating)
            return b.powerRating - a.powerRating;

          return String(a.teamId).localeCompare(String(b.teamId));
        });

        for (var k = 0; k < group.length; k++) {
          sorted[i + k] = group[k];
        }
      }

      i = j;
    }

    return sorted;
  }

  function computeMatchupScore(
    homeWeek,
    awayWeek,
    homeGoalieStarts,
    awayGoalieStarts,
  ) {
    var homeScore = 0;
    var awayScore = 0;

    var homeHasGoalies = (homeGoalieStarts || 0) >= GOALIE_START_MINIMUM;
    var awayHasGoalies = (awayGoalieStarts || 0) >= GOALIE_START_MINIMUM;

    (MATCHUP_CATEGORY_RULES || []).forEach(function (rule) {
      if (!rule || !rule.field) return;
      var field = rule.field;

      var isGoalieCategory =
        GOALIE_CATEGORY_SET && GOALIE_CATEGORY_SET.has(field);
      if (isGoalieCategory) {
        if (!homeHasGoalies && !awayHasGoalies) {
          return;
        }
        if (homeHasGoalies && !awayHasGoalies) {
          homeScore += 1;
          return;
        }
        if (!homeHasGoalies && awayHasGoalies) {
          awayScore += 1;
          return;
        }
      }

      var homeVal = toNumber(homeWeek ? homeWeek[field] : null);
      var awayVal = toNumber(awayWeek ? awayWeek[field] : null);

      // If values are null-ish, treat as 0 for comparison.
      if (!isFinite(homeVal)) homeVal = 0;
      if (!isFinite(awayVal)) awayVal = 0;

      if (homeVal === awayVal) return;

      var homeWins;
      if (rule.higherBetter === false) {
        homeWins = homeVal < awayVal;
      } else {
        homeWins = homeVal > awayVal;
      }

      if (homeWins) homeScore += 1;
      else awayScore += 1;
    });

    return {
      homeScore: homeScore,
      awayScore: awayScore,
    };
  }

  function updateMatchupsFromTeamWeeks(seasonId) {
    var seasonKey = normalizeSeasonId(
      seasonId,
      "MatchupHandler.updateMatchupsFromTeamWeeks",
    );

    var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
      function (w) {
        return w && String(w.seasonId) === seasonKey;
      },
    );
    var weekStatusMap = buildWeekStatusMap(weeks);

    var matchups = fetchSheetAsObjects(SPREADSHEET_ID, "Matchup").filter(
      function (m) {
        return m && String(m.seasonId) === seasonKey;
      },
    );

    if (!matchups.length) {
      console.log("[MatchupHandler] No matchups found for season", seasonKey);
      return { updated: 0, inserted: 0, cleared: 0, total: 0 };
    }

    var teams = fetchSheetAsObjects(SPREADSHEET_ID, "Team").filter(
      function (t) {
        return t && String(t.seasonId) === seasonKey;
      },
    );

    var teamWeeks = fetchSheetAsObjects(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
    ).filter(function (tw) {
      return tw && String(tw.seasonId) === seasonKey;
    });

    var playerWeeks = fetchSheetAsObjects(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerWeekStatLine",
    ).filter(function (pw) {
      return pw && String(pw.seasonId) === seasonKey;
    });

    var goalieStartsMap = buildGoalieStartsByTeamWeek(playerWeeks);

    var updatedRows = [];

    matchups.forEach(function (m) {
      var weekId =
        m.weekId !== undefined && m.weekId !== null ? String(m.weekId) : "";
      if (!weekId) return;

      var status = weekStatusMap.get(weekId);
      if (!status) return;
      if (!status.isActive && !status.isComplete) return;

      var homeTeamId =
        m.homeTeamId !== undefined && m.homeTeamId !== null
          ? String(m.homeTeamId)
          : "";
      var awayTeamId =
        m.awayTeamId !== undefined && m.awayTeamId !== null
          ? String(m.awayTeamId)
          : "";
      if (!homeTeamId || !awayTeamId) return;

      var homeWeek = teamWeeks.find(function (tw) {
        return (
          String(tw.gshlTeamId) === homeTeamId && String(tw.weekId) === weekId
        );
      });
      var awayWeek = teamWeeks.find(function (tw) {
        return (
          String(tw.gshlTeamId) === awayTeamId && String(tw.weekId) === weekId
        );
      });

      if (!homeWeek || !awayWeek) {
        return;
      }

      var homeGoalieStarts =
        goalieStartsMap.get(homeTeamId + "|" + weekId) || 0;
      var awayGoalieStarts =
        goalieStartsMap.get(awayTeamId + "|" + weekId) || 0;

      var scores = computeMatchupScore(
        homeWeek,
        awayWeek,
        homeGoalieStarts,
        awayGoalieStarts,
      );

      var update = {
        id: m.id,
        seasonId: m.seasonId,
        weekId: m.weekId,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeScore: parseScore(scores.homeScore),
        awayScore: parseScore(scores.awayScore),
      };

      if (status.isComplete) {
        update.isComplete = toBool(true);
        update.tie = toBool(false);
        update.homeWin = toBool(scores.homeScore >= scores.awayScore);
        update.awayWin = toBool(scores.homeScore < scores.awayScore);
      }

      updatedRows.push(update);
    });

    if (!updatedRows.length) {
      console.log(
        "[MatchupHandler] No active/complete matchups to update for season",
        seasonKey,
      );
      return { updated: 0, inserted: 0, cleared: 0, total: 0 };
    }

    console.log(
      "[MatchupHandler] Updating",
      updatedRows.length,
      "matchups for season",
      seasonKey,
    );

    return upsertSheetByKeys(SPREADSHEET_ID, "Matchup", ["id"], updatedRows, {
      idColumn: "id",
      createdAtColumn: "createdAt",
      updatedAtColumn: "updatedAt",
    });
  }

  function updateTeamSeasonStandings(seasonId) {
    var seasonKey = normalizeSeasonId(
      seasonId,
      "MatchupHandler.updateTeamSeasonStandings",
    );

    var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
      function (w) {
        return w && String(w.seasonId) === seasonKey;
      },
    );
    var weekStatusMap = buildWeekStatusMap(weeks);

    var weekTypeMap = new Map();
    weeks.forEach(function (w) {
      weekTypeMap.set(String(w.id), w.weekType || SeasonType.REGULAR_SEASON);
    });

    var weekIdsBySeasonType = new Map();
    weekIdsBySeasonType.set(
      SeasonType.REGULAR_SEASON,
      new Set(
        weeks
          .filter(function (w) {
            return (
              (w.weekType || SeasonType.REGULAR_SEASON) ===
              SeasonType.REGULAR_SEASON
            );
          })
          .map(function (w) {
            return String(w.id);
          }),
      ),
    );
    weekIdsBySeasonType.set(
      SeasonType.PLAYOFFS,
      new Set(
        weeks
          .filter(function (w) {
            return w.weekType === SeasonType.PLAYOFFS;
          })
          .map(function (w) {
            return String(w.id);
          }),
      ),
    );
    weekIdsBySeasonType.set(
      SeasonType.LOSERS_TOURNAMENT,
      new Set(
        weeks
          .filter(function (w) {
            return w.weekType === SeasonType.LOSERS_TOURNAMENT;
          })
          .map(function (w) {
            return String(w.id);
          }),
      ),
    );

    var teams = fetchSheetAsObjects(SPREADSHEET_ID, "Team").filter(
      function (t) {
        return t && String(t.seasonId) === seasonKey;
      },
    );

    var teamConfMap = buildTeamConferenceMap(teams);

    var matchups = fetchSheetAsObjects(SPREADSHEET_ID, "Matchup").filter(
      function (m) {
        return m && String(m.seasonId) === seasonKey;
      },
    );

    var teamSeasons = fetchSheetAsObjects(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamSeasonStatLine",
    ).filter(function (ts) {
      return ts && String(ts.seasonId) === seasonKey;
    });

    if (!teamSeasons.length) {
      console.log(
        "[MatchupHandler] No TeamSeasonStatLine rows found for season",
        seasonKey,
      );
      return { updated: 0, inserted: 0, cleared: 0, total: 0 };
    }

    var updates = [];

    var regularSeasonWeekIds =
      weekIdsBySeasonType.get(SeasonType.REGULAR_SEASON) || new Set();
    var categoriesForMap = buildCategoriesForMap(
      matchups,
      regularSeasonWeekIds,
    );
    var rankingEntries = [];

    teamSeasons.forEach(function (ts) {
      var teamId =
        ts.gshlTeamId !== undefined && ts.gshlTeamId !== null
          ? String(ts.gshlTeamId)
          : "";
      if (!teamId) return;

      var seasonType = ts.seasonType || SeasonType.REGULAR_SEASON;
      var weekIdsInType =
        weekIdsBySeasonType.get(seasonType) ||
        weekIdsBySeasonType.get(SeasonType.REGULAR_SEASON) ||
        new Set();

      var teamMatchups = matchups.filter(function (m) {
        if (!m) return false;
        var weekId =
          m.weekId !== undefined && m.weekId !== null ? String(m.weekId) : "";
        if (!weekId || !weekIdsInType.has(weekId)) return false;
        if (!matchupHasOutcome(m)) return false;
        return (
          String(m.homeTeamId) === teamId || String(m.awayTeamId) === teamId
        );
      });

      teamMatchups.sort(function (a, b) {
        return String(a.weekId).localeCompare(String(b.weekId));
      });

      var teamW = 0;
      var teamHW = 0;
      var teamHL = 0;
      var teamL = 0;
      var teamCCW = 0;
      var teamCCHW = 0;
      var teamCCHL = 0;
      var teamCCL = 0;
      var recentResults = [];

      teamMatchups.forEach(function (matchup) {
        var isHome = String(matchup.homeTeamId) === teamId;
        var opponentId = isHome
          ? String(matchup.awayTeamId)
          : String(matchup.homeTeamId);
        var opponentConf = teamConfMap.get(opponentId);
        var teamConf = teamConfMap.get(teamId);
        var isConference =
          teamConf && opponentConf && teamConf === opponentConf;

        var homeScore = matchup.homeScore;
        var awayScore = matchup.awayScore;
        var hasScores = homeScore !== null && awayScore !== null;
        var scoresWereEqual = hasScores && homeScore === awayScore;

        var isHomeWin = !!matchup.homeWin;
        var isAwayWin = !!matchup.awayWin;

        var result = null;

        if (isHome && isHomeWin) {
          teamW++;
          if (isConference) teamCCW++;
          if (scoresWereEqual) {
            teamHW++;
            if (isConference) teamCCHW++;
          }
          result = "W";
        } else if (!isHome && isAwayWin) {
          teamW++;
          if (isConference) teamCCW++;
          result = "W";
        } else if (isHome && isAwayWin) {
          teamL++;
          if (isConference) teamCCL++;
          result = "L";
        } else if (!isHome && isHomeWin) {
          teamL++;
          if (isConference) teamCCL++;
          if (scoresWereEqual) {
            teamHL++;
            if (isConference) teamCCHL++;
          }
          result = "L";
        }

        if (result) {
          recentResults.push(result);
        }
      });

      var streak = "";
      if (recentResults.length > 0) {
        var lastResult = recentResults[recentResults.length - 1];
        var streakCount = 1;
        for (var i = recentResults.length - 2; i >= 0; i--) {
          if (recentResults[i] === lastResult) {
            streakCount++;
          } else {
            break;
          }
        }
        streak = streakCount + lastResult;
      }

      var update = {
        gshlTeamId: ts.gshlTeamId,
        seasonId: ts.seasonId,
        seasonType: ts.seasonType || SeasonType.REGULAR_SEASON,
        teamW: teamW,
        teamHW: teamHW,
        teamHL: teamHL,
        teamL: teamL,
        teamCCW: teamCCW,
        teamCCHW: teamCCHW,
        teamCCHL: teamCCHL,
        teamCCL: teamCCL,
        streak: streak,
      };

      // Preserve id if present (helps some sheets that use id column)
      if (ts.id) update.id = ts.id;

      // Default: clear ranks for non-regular-season rows.
      if (
        (update.seasonType || SeasonType.REGULAR_SEASON) !==
        SeasonType.REGULAR_SEASON
      ) {
        update.overallRk = null;
        update.conferenceRk = null;
        update.wildcardRk = null;
      }

      updates.push(update);

      if (
        (update.seasonType || SeasonType.REGULAR_SEASON) ===
        SeasonType.REGULAR_SEASON
      ) {
        rankingEntries.push({
          teamId: teamId,
          confId: teamConfMap.get(teamId) || "",
          update: update,
          wins: toNumber(teamW),
          teamPoints: computeTeamPointsFromRecord(teamW, teamHW, teamHL),
          powerRating: toNumber(ts.powerRating),
        });
      }
    });

    // Apply ranks (regular season only)
    if (rankingEntries.length) {
      var overallSorted = sortEntriesWithTiebreakers(
        rankingEntries,
        matchups,
        regularSeasonWeekIds,
        categoriesForMap,
      );
      overallSorted.forEach(function (entry, idx) {
        entry.update.overallRk = idx + 1;
      });

      var entriesByConf = new Map();
      rankingEntries.forEach(function (entry) {
        var confId = entry.confId || "";
        if (!confId) return;
        if (!entriesByConf.has(confId)) entriesByConf.set(confId, []);
        entriesByConf.get(confId).push(entry);
      });

      entriesByConf.forEach(function (confEntries) {
        var confSorted = sortEntriesWithTiebreakers(
          confEntries,
          matchups,
          regularSeasonWeekIds,
          categoriesForMap,
        );
        confSorted.forEach(function (entry, idx) {
          entry.update.conferenceRk = idx + 1;
        });
      });

      var wildcardPool = rankingEntries.filter(function (entry) {
        return (entry.confId || "") && toNumber(entry.update.conferenceRk) > 3;
      });

      if (wildcardPool.length) {
        var wildcardSorted = sortEntriesWithTiebreakers(
          wildcardPool,
          matchups,
          regularSeasonWeekIds,
          categoriesForMap,
        );
        wildcardSorted.forEach(function (entry, idx) {
          entry.update.wildcardRk = idx + 1;
        });
      }

      // Clear wildcardRk for non-wildcard teams / missing conference.
      rankingEntries.forEach(function (entry) {
        if (!(entry.confId || "")) {
          entry.update.conferenceRk = null;
          entry.update.wildcardRk = null;
          return;
        }
        if (!(toNumber(entry.update.conferenceRk) > 3)) {
          entry.update.wildcardRk = null;
        }
      });
    }

    if (!updates.length) {
      console.log(
        "[MatchupHandler] No TeamSeasonStatLine rows to update for season",
        seasonKey,
      );
      return { updated: 0, inserted: 0, cleared: 0, total: 0 };
    }

    console.log(
      "[MatchupHandler] Updating standings for",
      updates.length,
      "team season rows for season",
      seasonKey,
    );

    return upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamSeasonStatLine",
      ["gshlTeamId", "seasonId", "seasonType"],
      updates,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
      },
    );
  }

  /**
   * Update Matchup.homeRank / Matchup.awayRank from TeamWeekStatLine.powerRk.
   *
   * Writes only when a rank is available for the matchup's week/team.
   *
   * @param {string|number} seasonId
   * @param {Object=} options
   * @param {boolean=} options.logToConsole
   */
  function updateMatchupRanksFromPowerRankings(seasonId, options) {
    var seasonKey = normalizeSeasonId(
      seasonId,
      "MatchupHandler.updateMatchupRanksFromPowerRankings",
    );

    var opts = options || {};
    var logToConsole =
      opts.logToConsole === undefined ? true : !!opts.logToConsole;

    var matchups = fetchSheetAsObjects(SPREADSHEET_ID, "Matchup").filter(
      function (m) {
        return m && String(m.seasonId) === seasonKey;
      },
    );

    if (!matchups.length) {
      if (logToConsole)
        console.log("[MatchupHandler] No matchups found for season", seasonKey);
      return { updated: 0, inserted: 0, cleared: 0, total: 0 };
    }

    var teamWeeks = fetchSheetAsObjects(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
    ).filter(function (tw) {
      return tw && String(tw.seasonId) === seasonKey;
    });

    var rankByTeamWeek = new Map();
    teamWeeks.forEach(function (tw) {
      var tid = tw && tw.gshlTeamId !== undefined ? String(tw.gshlTeamId) : "";
      var wid = tw && tw.weekId !== undefined ? String(tw.weekId) : "";
      if (!tid || !wid) return;
      var rk = toNumber(tw.powerRk);
      if (!isFinite(rk) || rk <= 0) return;
      rankByTeamWeek.set(tid + "|" + wid, Math.round(rk));
    });

    var updates = [];
    matchups.forEach(function (m) {
      var id = m && m.id !== undefined && m.id !== null ? String(m.id) : "";
      var weekId =
        m && m.weekId !== undefined && m.weekId !== null
          ? String(m.weekId)
          : "";
      var homeTeamId =
        m && m.homeTeamId !== undefined && m.homeTeamId !== null
          ? String(m.homeTeamId)
          : "";
      var awayTeamId =
        m && m.awayTeamId !== undefined && m.awayTeamId !== null
          ? String(m.awayTeamId)
          : "";
      if (!id || !weekId || !homeTeamId || !awayTeamId) return;

      var homeRk = rankByTeamWeek.get(homeTeamId + "|" + weekId);
      var awayRk = rankByTeamWeek.get(awayTeamId + "|" + weekId);
      if (homeRk === undefined && awayRk === undefined) return;

      var u = { id: id };
      if (homeRk !== undefined) u.homeRank = homeRk;
      if (awayRk !== undefined) u.awayRank = awayRk;
      updates.push(u);
    });

    if (!updates.length) {
      if (logToConsole)
        console.log(
          "[MatchupHandler] No matchup rank updates available for season",
          seasonKey,
        );
      return { updated: 0, inserted: 0, cleared: 0, total: 0 };
    }

    if (logToConsole) {
      console.log(
        "[MatchupHandler] Updating",
        updates.length,
        "matchup rank row(s) for season",
        seasonKey,
      );
    }

    return upsertSheetByKeys(SPREADSHEET_ID, "Matchup", ["id"], updates, {
      idColumn: "id",
      createdAtColumn: "createdAt",
      updatedAtColumn: "updatedAt",
    });
  }

  function updateMatchupsAndStandings(seasonId) {
    var seasonKey = normalizeSeasonId(
      seasonId,
      "MatchupHandler.updateMatchupsAndStandings",
    );
    var matchupResult = updateMatchupsFromTeamWeeks(seasonKey);
    var standingsResult = updateTeamSeasonStandings(seasonKey);
    return {
      matchups: matchupResult,
      standings: standingsResult,
    };
  }

  return {
    updateMatchupsFromTeamWeeks: updateMatchupsFromTeamWeeks,
    updateMatchupRanksFromPowerRankings: updateMatchupRanksFromPowerRankings,
    updateTeamSeasonStandings: updateTeamSeasonStandings,
    updateMatchupsAndStandings: updateMatchupsAndStandings,
  };
})();
