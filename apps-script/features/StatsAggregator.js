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

  function safeSplitCsv(value) {
    if (!value) return [];
    return String(value)
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
    return (sv / sa).toFixed(6);
  }

  function sumField(rows, field, toNumber) {
    var sum = 0;
    for (var i = 0; i < rows.length; i++) {
      sum += toNumber(rows[i] && rows[i][field]);
    }
    return sum;
  }

  function sumFieldsInto(target, rows, fields, toNumber) {
    fields.forEach(function (field) {
      target[field] = (target[field] || 0) + sumField(rows, field, toNumber);
    });
  }

  function blankFields(target, fields) {
    fields.forEach(function (f) {
      target[f] = "";
    });
  }

  // ============================================================================
  // PLAYER AGGREGATION
  // ============================================================================

  /**
   * Builds PlayerSplitStatLine + PlayerTotalStatLine from PlayerWeekStatLine.
   *
   * Use this for “week-first” seasons where PlayerWeek is the lowest reliable layer.
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

      var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
        function (w) {
          return String(w && w.seasonId) === String(season.id);
        },
      );

      var weekTypeMap = new Map();
      weeks.forEach(function (week) {
        weekTypeMap.set(
          String(week.id),
          week.weekType || SeasonType.REGULAR_SEASON,
        );
      });

      var playerWeeks = fetchSheetAsObjects(
        PLAYERSTATS_SPREADSHEET_ID,
        "PlayerWeekStatLine",
      ).filter(function (pw) {
        return String(pw && pw.seasonId) === String(season.id);
      });

      if (!playerWeeks.length) {
        console.log(
          "[StatsAggregator] No PlayerWeekStatLine rows found for season",
          seasonKey,
        );
        return;
      }

      function resolveSeasonTypeForWeekRow(pw) {
        var raw = pw && pw.seasonType ? String(pw.seasonType) : "";
        if (raw) return raw;
        var fromWeek = weekTypeMap.get(String(pw && pw.weekId));
        return fromWeek || SeasonType.REGULAR_SEASON;
      }

      function buildPlayerAggregateFromWeeks(base, weeksArr, opts) {
        var isGoalie = base.posGroup === "G";

        var agg = {
          playerId: opts.playerId,
          seasonId: season.id,
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

        TEAM_STAT_FIELDS.forEach(function (field) {
          var sum = weeksArr.reduce(function (p, c) {
            return p + toNumber(c && c[field]);
          }, 0);

          if (isGoalie) {
            if (
              field === "G" ||
              field === "A" ||
              field === "P" ||
              field === "PM" ||
              field === "PIM" ||
              field === "PPP" ||
              field === "SOG" ||
              field === "HIT" ||
              field === "BLK"
            ) {
              agg[field] = "";
            } else {
              agg[field] = formatNumber(sum);
            }
          } else {
            if (
              field === "W" ||
              field === "GA" ||
              field === "SV" ||
              field === "SA" ||
              field === "SO" ||
              field === "TOI"
            ) {
              agg[field] = "";
            } else {
              agg[field] = formatNumber(sum);
            }
          }
        });

        if (isGoalie) {
          agg.GAA = computeGAA(agg.GA, agg.TOI);
          agg.SVP = computeSVP(agg.SV, agg.SA);
        } else {
          agg.GAA = "";
          agg.SVP = "";
        }

        return agg;
      }

      var playerSplitsMap = new Map();
      var playerTotalsMap = new Map();

      playerWeeks.forEach(function (pw) {
        if (!pw) return;
        var seasonType = resolveSeasonTypeForWeekRow(pw);
        var totalKey = String(pw.playerId) + "|" + String(seasonType);
        if (!playerTotalsMap.has(totalKey)) playerTotalsMap.set(totalKey, []);
        playerTotalsMap.get(totalKey).push(pw);

        var splitKey =
          String(pw.playerId) +
          "|" +
          String(pw.gshlTeamId) +
          "|" +
          String(seasonType);
        if (!playerSplitsMap.has(splitKey)) playerSplitsMap.set(splitKey, []);
        playerSplitsMap.get(splitKey).push(pw);
      });

      var playerSplits = [];
      var playerTotals = [];

      playerSplitsMap.forEach(function (weeksArr, splitKey) {
        if (!weeksArr || !weeksArr.length) return;
        var firstWeek = weeksArr[0];
        var parts = splitKey.split("|");
        var playerId = parts[0];
        var gshlTeamId = parts[1];
        var seasonType = parts[2];

        var row = buildPlayerAggregateFromWeeks(firstWeek, weeksArr, {
          playerId: playerId,
          gshlTeamId: gshlTeamId,
          seasonType: seasonType,
        });
        playerSplits.push(row);
      });

      playerTotalsMap.forEach(function (weeksArr, totalKey) {
        if (!weeksArr || !weeksArr.length) return;
        var firstWeek = weeksArr[0];
        var parts = totalKey.split("|");
        var playerId = parts[0];
        var seasonType = parts[1];

        var gshlTeamIds = weeksArr.map(function (w) {
          return w && w.gshlTeamId;
        });

        var row = buildPlayerAggregateFromWeeks(firstWeek, weeksArr, {
          playerId: playerId,
          gshlTeamIds: gshlTeamIds,
          seasonType: seasonType,
        });
        playerTotals.push(row);
      });

      upsertSheetByKeys(
        PLAYERSTATS_SPREADSHEET_ID,
        "PlayerSplitStatLine",
        ["playerId", "gshlTeamId", "seasonId", "seasonType"],
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
        "[StatsAggregator] Updated player splits/totals from existing weeks for season",
        seasonKey,
        "(splits:",
        playerSplits.length,
        "totals:",
        playerTotals.length,
        ")",
      );
    };

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

    var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
      function (w) {
        return String(w && w.seasonId) === String(season.id);
      },
    );

    var playerDayWorkbookId = getPlayerDayWorkbookId(season.id);
    var playerDays = fetchSheetAsObjects(
      playerDayWorkbookId,
      "PlayerDayStatLine",
    ).filter(function (pd) {
      return String(pd.seasonId) === String(season.id);
    });

    var playerWeeks = [];
    var playerSplits = [];
    var playerTotals = [];

    // Days -> Weeks
    weeks.forEach(function (week) {
      var weekSeasonType = week.weekType || SeasonType.REGULAR_SEASON;
      var weekPlayerDays = playerDays.filter(function (pd) {
        return String(pd.weekId) === String(week.id);
      });

      var playerDayMap = new Map();
      weekPlayerDays.forEach(function (pd) {
        var key = String(pd.playerId) + "_" + String(pd.gshlTeamId);
        if (!playerDayMap.has(key)) {
          playerDayMap.set(key, []);
        }
        playerDayMap.get(key).push(pd);
      });

      playerDayMap.forEach(function (days, playerKey) {
        if (!days || !days.length) return;

        var starts = days.filter(function (a) {
          return isStarter(a);
        });

        var playerId = playerKey.split("_")[0];
        var gshlTeamId = playerKey.split("_")[1];

        var posGroup =
          days[0] && days[0].posGroup ? String(days[0].posGroup) : "";
        var isGoalie = posGroup === "G";

        var row = {
          playerId: playerId,
          gshlTeamId: gshlTeamId,
          seasonId: season.id,
          weekId: week.id,
          seasonType: weekSeasonType,
          nhlPos: uniqCsv(
            days.map(function (a) {
              return a && a.nhlPos;
            }),
          ),
          posGroup: posGroup,
          nhlTeam: uniqCsv(
            days.map(function (a) {
              return a && a.nhlTeam;
            }),
          ),
          days: formatNumber(days.length),
          Rating: "",
        };

        // Always-summed fields (include non-starters too)
        row.GP = formatNumber(sumField(days, "GP", toNumber));
        row.MG = formatNumber(sumField(days, "MG", toNumber));
        row.IR = formatNumber(sumField(days, "IR", toNumber));
        row.IRplus = formatNumber(sumField(days, "IRplus", toNumber));
        row.GS = formatNumber(sumField(days, "GS", toNumber));
        row.ADD = formatNumber(sumField(days, "ADD", toNumber));
        row.MS = formatNumber(sumField(days, "MS", toNumber));
        row.BS = formatNumber(sumField(days, "BS", toNumber));

        if (isGoalie) {
          // Goalie-only stats come from starters.
          row.W = formatNumber(sumField(starts, "W", toNumber));
          row.GA = formatNumber(sumField(starts, "GA", toNumber));
          row.SV = formatNumber(sumField(starts, "SV", toNumber));
          row.SA = formatNumber(sumField(starts, "SA", toNumber));
          row.SO = formatNumber(sumField(starts, "SO", toNumber));
          row.TOI = formatNumber(sumField(starts, "TOI", toNumber));

          // Blank skater stats.
          blankFields(row, [
            "G",
            "A",
            "P",
            "PM",
            "PIM",
            "PPP",
            "SOG",
            "HIT",
            "BLK",
          ]);

          row.GAA = computeGAA(row.GA, row.TOI);
          row.SVP = computeSVP(row.SV, row.SA);
        } else {
          // Skater-only stats come from starters.
          row.G = formatNumber(sumField(starts, "G", toNumber));
          row.A = formatNumber(sumField(starts, "A", toNumber));
          row.P = formatNumber(sumField(starts, "P", toNumber));
          row.PM = formatNumber(sumField(starts, "PM", toNumber));
          row.PIM = formatNumber(sumField(starts, "PIM", toNumber));
          row.PPP = formatNumber(sumField(starts, "PPP", toNumber));
          row.SOG = formatNumber(sumField(starts, "SOG", toNumber));
          row.HIT = formatNumber(sumField(starts, "HIT", toNumber));
          row.BLK = formatNumber(sumField(starts, "BLK", toNumber));

          // Blank goalie stats.
          blankFields(row, ["W", "GA", "SV", "SA", "SO", "TOI", "GAA", "SVP"]);
        }

        // Ensure all TEAM_STAT_FIELDS exist at least as blanks/strings.
        TEAM_STAT_FIELDS.forEach(function (field) {
          if (row[field] === undefined) row[field] = "";
        });

        playerWeeks.push(row);
      });
    });

    // Weeks -> Splits + Totals
    var playerSplitsMap = new Map();
    var playerTotalsMap = new Map();

    playerWeeks.forEach(function (pw) {
      var totalKey = String(pw.playerId) + "|" + String(pw.seasonType);
      if (!playerTotalsMap.has(totalKey)) playerTotalsMap.set(totalKey, []);
      playerTotalsMap.get(totalKey).push(pw);

      var splitKey =
        String(pw.playerId) +
        "|" +
        String(pw.gshlTeamId) +
        "|" +
        String(pw.seasonType);
      if (!playerSplitsMap.has(splitKey)) playerSplitsMap.set(splitKey, []);
      playerSplitsMap.get(splitKey).push(pw);
    });

    function buildPlayerAggregateFromWeeks(base, weeksArr, opts) {
      var isGoalie = base.posGroup === "G";

      var agg = {
        playerId: opts.playerId,
        seasonId: season.id,
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

      // Sum numeric stat fields from week rows.
      TEAM_STAT_FIELDS.forEach(function (field) {
        var sum = weeksArr.reduce(function (p, c) {
          return p + toNumber(c && c[field]);
        }, 0);

        // Keep skater/goalie blanking behavior.
        if (isGoalie) {
          if (
            field === "G" ||
            field === "A" ||
            field === "P" ||
            field === "PM" ||
            field === "PIM" ||
            field === "PPP" ||
            field === "SOG" ||
            field === "HIT" ||
            field === "BLK"
          ) {
            agg[field] = "";
          } else {
            agg[field] = formatNumber(sum);
          }
        } else {
          if (
            field === "W" ||
            field === "GA" ||
            field === "SV" ||
            field === "SA" ||
            field === "SO" ||
            field === "TOI"
          ) {
            agg[field] = "";
          } else {
            agg[field] = formatNumber(sum);
          }
        }
      });

      // Derived goalie rates (only when goalie)
      if (isGoalie) {
        agg.GAA = computeGAA(agg.GA, agg.TOI);
        agg.SVP = computeSVP(agg.SV, agg.SA);
      } else {
        agg.GAA = "";
        agg.SVP = "";
      }

      return agg;
    }

    playerSplitsMap.forEach(function (weeksArr, splitKey) {
      if (!weeksArr || !weeksArr.length) return;
      var firstWeek = weeksArr[0];
      var parts = splitKey.split("|");
      var playerId = parts[0];
      var gshlTeamId = parts[1];
      var seasonType = parts[2];

      var row = buildPlayerAggregateFromWeeks(firstWeek, weeksArr, {
        playerId: playerId,
        gshlTeamId: gshlTeamId,
        seasonType: seasonType,
      });

      playerSplits.push(row);
    });

    playerTotalsMap.forEach(function (weeksArr, totalKey) {
      if (!weeksArr || !weeksArr.length) return;
      var firstWeek = weeksArr[0];
      var parts = totalKey.split("|");
      var playerId = parts[0];
      var seasonType = parts[1];

      var gshlTeamIds = weeksArr.map(function (w) {
        return w && w.gshlTeamId;
      });

      var row = buildPlayerAggregateFromWeeks(firstWeek, weeksArr, {
        playerId: playerId,
        gshlTeamIds: gshlTeamIds,
        seasonType: seasonType,
      });

      playerTotals.push(row);
    });

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
      },
    );

    upsertSheetByKeys(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerSplitStatLine",
      ["playerId", "gshlTeamId", "seasonId", "seasonType"],
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
        weekTypeMap.set(weekId, week.weekType || SeasonType.REGULAR_SEASON);
        var dates =
          getDatesInRangeInclusive(week.startDate, week.endDate) || [];
        weekDayCountMap.set(weekId, dates.length || 0);
      });

      var seasonIdStr = String(season.id);
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
          };
          TEAM_STAT_FIELDS.forEach(function (f) {
            init[f] = 0;
          });
          teamWeekMap.set(key, init);
        }

        var bucket = teamWeekMap.get(key);
        TEAM_STAT_FIELDS.forEach(function (field) {
          bucket[field] += toNumber(pw[field]);
        });
      });

      var teamWeekAggregates = Array.from(teamWeekMap.values());
      var teamWeekRows = teamWeekAggregates.map(buildTeamWeekRow);

      // TeamWeek -> TeamSeason (by seasonType)
      var teamSeasonMap = new Map();

      teamWeekAggregates.forEach(function (weekAgg) {
        var seasonType =
          weekTypeMap.get(String(weekAgg.weekId)) || SeasonType.REGULAR_SEASON;
        var key = String(weekAgg.gshlTeamId) + ":" + String(seasonType);
        if (!teamSeasonMap.has(key)) {
          var init = {
            seasonId: seasonIdStr,
            seasonType: seasonType,
            gshlTeamId: String(weekAgg.gshlTeamId),
            days: 0,
          };
          TEAM_STAT_FIELDS.forEach(function (f) {
            init[f] = 0;
          });
          teamSeasonMap.set(key, init);
        }

        var bucket = teamSeasonMap.get(key);
        bucket.days += Number(weekAgg.days) || 0;
        TEAM_STAT_FIELDS.forEach(function (f) {
          bucket[f] += Number(weekAgg[f]) || 0;
        });
      });

      var teamSeasonAggregates = Array.from(teamSeasonMap.values()).map(
        function (agg) {
          agg.GAA = agg.TOI > 0 ? (agg.GA / agg.TOI) * 60 : 0;
          agg.SVP = agg.SA > 0 ? agg.SV / agg.SA : 0;
          return agg;
        },
      );

      var teamSeasonRows = teamSeasonAggregates.map(buildTeamSeasonRow);

      upsertSheetByKeys(
        TEAMSTATS_SPREADSHEET_ID,
        "TeamWeekStatLine",
        ["gshlTeamId", "weekId"],
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
        ["gshlTeamId", "seasonId", "seasonType"],
        teamSeasonRows,
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
        },
      );

      console.log(
        "[StatsAggregator] Updated week-first team aggregates for season",
        seasonKey,
        "(weeks:",
        teamWeekRows.length,
        "seasons:",
        teamSeasonRows.length,
        ")",
      );
    };

  function createTeamDayBucket(seasonId, teamId, weekId, date) {
    var TEAM_STAT_FIELDS = GshlUtils.core.constants.TEAM_STAT_FIELDS;

    var bucket = {
      seasonId: seasonId,
      gshlTeamId: teamId,
      weekId: weekId,
      date: date,
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
    };

    TEAM_STAT_FIELDS.forEach(function (field) {
      bucket[field] = 0;
    });

    return bucket;
  }

  function buildTeamDayRow(day) {
    var formatNumber = GshlUtils.core.parse.formatNumber;

    var GAA = day.TOI > 0 ? ((day.GA / day.TOI) * 60).toFixed(5) : "";
    var SVP = day.SA > 0 ? (day.SV / day.SA).toFixed(6) : "";

    return {
      seasonId: day.seasonId,
      gshlTeamId: day.gshlTeamId,
      weekId: day.weekId,
      date: day.date,
      GP: formatNumber(day.GP),
      MG: formatNumber(day.MG),
      IR: formatNumber(day.IR),
      IRplus: formatNumber(day.IRplus),
      GS: formatNumber(day.GS),
      G: formatNumber(day.G),
      A: formatNumber(day.A),
      P: formatNumber(day.P),
      PM: formatNumber(day.PM),
      PIM: formatNumber(day.PIM),
      PPP: formatNumber(day.PPP),
      SOG: formatNumber(day.SOG),
      HIT: formatNumber(day.HIT),
      BLK: formatNumber(day.BLK),
      W: formatNumber(day.W),
      GA: formatNumber(day.GA),
      GAA: GAA,
      SV: formatNumber(day.SV),
      SA: formatNumber(day.SA),
      SVP: SVP,
      SO: formatNumber(day.SO),
      TOI: formatNumber(day.TOI),
      Rating: "",
      ADD: formatNumber(day.ADD),
      MS: formatNumber(day.MS),
      BS: formatNumber(day.BS),
    };
  }

  function buildTeamWeekRow(week) {
    var formatNumber = GshlUtils.core.parse.formatNumber;

    var GAA = week.TOI > 0 ? ((week.GA / week.TOI) * 60).toFixed(5) : "";
    var SVP = week.SA > 0 ? (week.SV / week.SA).toFixed(6) : "";

    return {
      seasonId: week.seasonId,
      gshlTeamId: week.gshlTeamId,
      weekId: week.weekId,
      days: formatNumber(week.days),
      GP: formatNumber(week.GP),
      MG: formatNumber(week.MG),
      IR: formatNumber(week.IR),
      IRplus: formatNumber(week.IRplus),
      GS: formatNumber(week.GS),
      G: formatNumber(week.G),
      A: formatNumber(week.A),
      P: formatNumber(week.P),
      PM: formatNumber(week.PM),
      PIM: formatNumber(week.PIM),
      PPP: formatNumber(week.PPP),
      SOG: formatNumber(week.SOG),
      HIT: formatNumber(week.HIT),
      BLK: formatNumber(week.BLK),
      W: formatNumber(week.W),
      GA: formatNumber(week.GA),
      GAA: GAA,
      SV: formatNumber(week.SV),
      SA: formatNumber(week.SA),
      SVP: SVP,
      SO: formatNumber(week.SO),
      TOI: formatNumber(week.TOI),
      Rating: "",
      yearToDateRating: "",
      powerRating: "",
      powerRk: "",
      ADD: formatNumber(week.ADD),
      MS: formatNumber(week.MS),
      BS: formatNumber(week.BS),
    };
  }

  function buildTeamSeasonRow(seasonStat) {
    var formatNumber = GshlUtils.core.parse.formatNumber;

    var GAA = seasonStat.GAA ? seasonStat.GAA.toFixed(5).toString() : "";
    var SVP = seasonStat.SVP ? seasonStat.SVP.toFixed(6).toString() : "";

    // Keep schema-compatible fields, but this module does not compute standings.
    return {
      seasonId: seasonStat.seasonId,
      seasonType: seasonStat.seasonType,
      gshlTeamId: seasonStat.gshlTeamId,
      days: formatNumber(seasonStat.days),
      GP: formatNumber(seasonStat.GP),
      MG: formatNumber(seasonStat.MG),
      IR: formatNumber(seasonStat.IR),
      IRplus: formatNumber(seasonStat.IRplus),
      GS: formatNumber(seasonStat.GS),
      G: formatNumber(seasonStat.G),
      A: formatNumber(seasonStat.A),
      P: formatNumber(seasonStat.P),
      PM: formatNumber(seasonStat.PM),
      PIM: formatNumber(seasonStat.PIM),
      PPP: formatNumber(seasonStat.PPP),
      SOG: formatNumber(seasonStat.SOG),
      HIT: formatNumber(seasonStat.HIT),
      BLK: formatNumber(seasonStat.BLK),
      W: formatNumber(seasonStat.W),
      GA: formatNumber(seasonStat.GA),
      GAA: GAA,
      SV: formatNumber(seasonStat.SV),
      SA: formatNumber(seasonStat.SA),
      SVP: SVP,
      SO: formatNumber(seasonStat.SO),
      TOI: formatNumber(seasonStat.TOI),
      Rating: "",
      ADD: formatNumber(seasonStat.ADD),
      MS: formatNumber(seasonStat.MS),
      BS: formatNumber(seasonStat.BS),
      streak: "",
      powerRk: "",
      powerRating: "",
      prevPowerRk: "",
      prevPowerRating: "",
      teamW: "",
      teamHW: "",
      teamHL: "",
      teamL: "",
      teamCCW: "",
      teamCCHW: "",
      teamCCHL: "",
      teamCCL: "",
      overallRk: "",
      conferenceRk: "",
      wildcardRk: "",
      playersUsed: "",
      norrisRating: "",
      norrisRk: "",
      vezinaRating: "",
      vezinaRk: "",
      calderRating: "",
      calderRk: "",
      jackAdamsRating: "",
      jackAdamsRk: "",
      GMOYRating: "",
      GMOYRk: "",
    };
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
    var formatDateOnly = GshlUtils.core.date.formatDateOnly;
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

    var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
      function (w) {
        return String(w && w.seasonId) === String(season.id);
      },
    );
    if (!weeks.length) return;

    var weekTypeMap = new Map();
    weeks.forEach(function (week) {
      weekTypeMap.set(
        String(week.id),
        week.weekType || SeasonType.REGULAR_SEASON,
      );
    });

    var seasonIdStr = String(season.id);
    var playerWB = getPlayerDayWorkbookId(seasonIdStr);
    var playerDays = fetchSheetAsObjects(playerWB, "PlayerDayStatLine").filter(
      function (pd) {
        return String(pd.seasonId) === seasonIdStr && isStarter(pd);
      },
    );

    if (!playerDays.length) {
      console.log(
        "[StatsAggregator] No starter player days for season",
        seasonKey,
      );
      return;
    }

    // PlayerDay -> TeamDay
    var teamDayMap = new Map();

    playerDays.forEach(function (pd) {
      if (!isStarter(pd)) return;
      var teamId = pd.gshlTeamId && String(pd.gshlTeamId);
      var weekId = pd.weekId && String(pd.weekId);
      if (!teamId || !weekId) return;
      var dateKey = formatDateOnly(pd.date);
      if (!dateKey) return;

      var mapKey = teamId + "_" + dateKey;
      if (!teamDayMap.has(mapKey)) {
        teamDayMap.set(
          mapKey,
          createTeamDayBucket(seasonIdStr, teamId, weekId, dateKey),
        );
      }
      var bucket = teamDayMap.get(mapKey);
      TEAM_STAT_FIELDS.forEach(function (field) {
        bucket[field] += toNumber(pd[field]);
      });
    });

    if (!teamDayMap.size) return;

    var teamDayAggregates = Array.from(teamDayMap.values());
    var teamDayRows = teamDayAggregates.map(buildTeamDayRow);

    // TeamDay -> TeamWeek
    var teamWeekMap = new Map();

    teamDayAggregates.forEach(function (day) {
      var key = String(day.weekId) + "_" + String(day.gshlTeamId);
      if (!teamWeekMap.has(key)) {
        teamWeekMap.set(key, createTeamWeekBucket(day));
      }
      var weekBucket = teamWeekMap.get(key);
      weekBucket.days += 1;
      TEAM_STAT_FIELDS.forEach(function (field) {
        weekBucket[field] += day[field];
      });
    });

    var teamWeekAggregates = Array.from(teamWeekMap.values());
    var teamWeekRows = teamWeekAggregates.map(buildTeamWeekRow);

    // TeamWeek -> TeamSeason (by seasonType)
    var teamSeasonMap = new Map();

    teamWeekAggregates.forEach(function (weekAgg) {
      var seasonType =
        weekTypeMap.get(String(weekAgg.weekId)) || SeasonType.REGULAR_SEASON;
      var key = String(weekAgg.gshlTeamId) + ":" + String(seasonType);
      if (!teamSeasonMap.has(key)) {
        var init = {
          seasonId: seasonIdStr,
          seasonType: seasonType,
          gshlTeamId: String(weekAgg.gshlTeamId),
          days: 0,
        };
        TEAM_STAT_FIELDS.forEach(function (f) {
          init[f] = 0;
        });
        teamSeasonMap.set(key, init);
      }

      var bucket = teamSeasonMap.get(key);
      bucket.days += Number(weekAgg.days) || 0;
      TEAM_STAT_FIELDS.forEach(function (f) {
        bucket[f] += Number(weekAgg[f]) || 0;
      });
    });

    var teamSeasonAggregates = Array.from(teamSeasonMap.values()).map(
      function (agg) {
        agg.GAA = agg.TOI > 0 ? (agg.GA / agg.TOI) * 60 : 0;
        agg.SVP = agg.SA > 0 ? agg.SV / agg.SA : 0;
        return agg;
      },
    );

    var teamSeasonRows = teamSeasonAggregates.map(buildTeamSeasonRow);

    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamDayStatLine",
      ["gshlTeamId", "date"],
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
      ["gshlTeamId", "weekId"],
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
      ["gshlTeamId", "seasonId", "seasonType"],
      teamSeasonRows,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
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
  };

  // Expose internals needed by other modules (e.g. YahooScraper)
  ns.internals = {
    createTeamDayBucket: createTeamDayBucket,
    createTeamWeekBucket: createTeamWeekBucket,
    buildTeamDayRow: buildTeamDayRow,
    buildTeamWeekRow: buildTeamWeekRow,
    buildTeamSeasonRow: buildTeamSeasonRow,
  };

  return ns;
})();
