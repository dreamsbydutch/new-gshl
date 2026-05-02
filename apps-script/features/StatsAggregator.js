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
        week && week.id !== undefined && week.id !== null ? String(week.id) : "";
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
        week && week.id !== undefined && week.id !== null ? String(week.id) : "";
      if (!weekId) return;
      map.set(weekId, week.weekType || fallback);
    });
    return map;
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

  function addPlayerDayToWeekBucket(bucket, playerDay, isStarter, toNumber) {
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

    if (!isStarter) return;

    if (String(bucket.posGroup || playerDay.posGroup || "") === "G") {
      addFieldsToBucket(
        bucket,
        playerDay,
        TEAM_GOALIE_STARTER_FIELDS,
        toNumber,
      );
      return;
    }

    addFieldsToBucket(bucket, playerDay, TEAM_SKATER_STARTER_FIELDS, toNumber);
  }

  function buildPlayerWeekRowFromBucket(bucket, statFields, formatNumber) {
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
        row[field] = formatNumber(bucket[field]);
      });
      blankFields(row, TEAM_SKATER_STARTER_FIELDS);
      row.GAA = computeGAA(row.GA, row.TOI);
      row.SVP = computeSVP(row.SV, row.SA);
    } else {
      TEAM_SKATER_STARTER_FIELDS.forEach(function (field) {
        row[field] = formatNumber(bucket[field]);
      });
      blankFields(row, TEAM_GOALIE_STARTER_FIELDS.concat(["GAA", "SVP"]));
    }

    statFields.forEach(function (field) {
      if (row[field] === undefined) row[field] = "";
    });

    return row;
  }

  function buildPlayerAggregateFromWeeks(base, weeksArr, opts, context) {
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

      if (isGoalie && SKATER_STARTER_FIELD_SET.has(field)) {
        agg[field] = "";
      } else if (!isGoalie && GOALIE_STARTER_FIELD_SET.has(field)) {
        agg[field] = "";
      } else {
        agg[field] = formatNumber(sum);
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

  function buildPlayerSplitsAndTotalsFromWeeks(playerWeeks, context) {
    var SeasonType = GshlUtils.core.constants.SeasonType;
    var playerSplitsMap = new Map();
    var playerTotalsMap = new Map();

    function resolveSeasonTypeForWeekRow(pw) {
      var raw = pw && pw.seasonType ? String(pw.seasonType) : "";
      if (raw) return raw;
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

      var playerAggregates = buildPlayerSplitsAndTotalsFromWeeks(playerWeeks, {
        seasonId: season.id,
        weekTypeMap: weekTypeMap,
        defaultSeasonType: SeasonType.REGULAR_SEASON,
        statFields: TEAM_STAT_FIELDS,
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
        ["gshlTeamId", "playerId", "seasonId", "seasonType"],
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

    var weekTypeMap = new Map();
    weeks.forEach(function (week) {
      weekTypeMap.set(
        String(week.id),
        week.weekType || SeasonType.REGULAR_SEASON,
      );
    });

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
        isStarter(pd),
        toNumber,
      );
    });

    var playerWeeks = Array.from(playerWeekMap.values()).map(function (bucket) {
      return buildPlayerWeekRowFromBucket(
        bucket,
        TEAM_STAT_FIELDS,
        formatNumber,
      );
    });

    var playerAggregates = buildPlayerSplitsAndTotalsFromWeeks(playerWeeks, {
      seasonId: season.id,
      weekTypeMap: weekTypeMap,
      defaultSeasonType: SeasonType.REGULAR_SEASON,
      statFields: TEAM_STAT_FIELDS,
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
      ["gshlTeamId", "playerId", "weekId", "seasonId"],
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
      ["gshlTeamId", "playerId", "seasonId", "seasonType"],
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

  ns.updatePlayerStatsForWeekIds = function updatePlayerStatsForWeekIds(
    seasonId,
    weekIds,
  ) {
    var seasonKey = requireSeason(seasonId, "updatePlayerStatsForWeekIds");
    var selectedWeekIds = requireWeekIds(weekIds, "updatePlayerStatsForWeekIds");

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

    var seasonIdStr = String(season.id);
    var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(function (w) {
      return String(w && w.seasonId) === seasonIdStr;
    });
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
        isStarter(pd),
        toNumber,
      );
    });

    var playerWeeks = Array.from(playerWeekMap.values()).map(function (bucket) {
      return buildPlayerWeekRowFromBucket(
        bucket,
        TEAM_STAT_FIELDS,
        formatNumber,
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
          row.gshlTeamId === undefined || row.gshlTeamId === null
            ? ""
            : String(row.gshlTeamId),
          row.playerId === undefined || row.playerId === null
            ? ""
            : String(row.playerId),
          row.weekId === undefined || row.weekId === null ? "" : String(row.weekId),
          row.seasonId === undefined || row.seasonId === null
            ? ""
            : String(row.seasonId),
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
      ["gshlTeamId", "playerId", "seasonId", "seasonType"],
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

      var teamSeasonRows = buildTeamSeasonRowsFromWeekAggregates(
        teamWeekAggregates,
        weekTypeMap,
        seasonIdStr,
        SeasonType.REGULAR_SEASON,
        TEAM_STAT_FIELDS,
      );

      upsertSheetByKeys(
        TEAMSTATS_SPREADSHEET_ID,
        "TeamWeekStatLine",
        ["gshlTeamId", "weekId", "seasonId"],
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
  ) {
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
        bucket[field] += Number(weekAgg[field]) || 0;
      });
    });

    return Array.from(teamSeasonMap.values()).map(buildTeamSeasonRow);
  }

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
      ADD: formatNumber(week.ADD),
      MS: formatNumber(week.MS),
      BS: formatNumber(week.BS),
    };
  }

  function buildTeamSeasonRow(seasonStat) {
    var formatNumber = GshlUtils.core.parse.formatNumber;

    var GAA = computeGAA(seasonStat.GA, seasonStat.TOI);
    var SVP = computeSVP(seasonStat.SV, seasonStat.SA);

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
        return String(pd.seasonId) === seasonIdStr;
      },
    );

    if (!playerDays.length) {
      console.log("[StatsAggregator] No player days for season", seasonKey);
      return;
    }

    // PlayerDay -> TeamDay
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

      if (!isStarter(pd)) return;

      if (String(pd.posGroup || "") === "G") {
        TEAM_GOALIE_STARTER_FIELDS.forEach(function (field) {
          bucket[field] += toNumber(pd[field]);
        });
        return;
      }

      TEAM_SKATER_STARTER_FIELDS.forEach(function (field) {
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

    var teamSeasonRows = buildTeamSeasonRowsFromWeekAggregates(
      teamWeekAggregates,
      weekTypeMap,
      seasonIdStr,
      SeasonType.REGULAR_SEASON,
      TEAM_STAT_FIELDS,
    );

    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamDayStatLine",
      ["gshlTeamId", "date", "weekId", "seasonId"],
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
      ["gshlTeamId", "weekId", "seasonId"],
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

    var seasonIdStr = String(season.id);
    var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(function (w) {
      return String(w && w.seasonId) === seasonIdStr;
    });
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

      if (!isStarter(pd)) return;

      if (String(pd.posGroup || "") === "G") {
        TEAM_GOALIE_STARTER_FIELDS.forEach(function (field) {
          bucket[field] += toNumber(pd[field]);
        });
        return;
      }

      TEAM_SKATER_STARTER_FIELDS.forEach(function (field) {
        bucket[field] += toNumber(pd[field]);
      });
    });

    var teamDayAggregates = Array.from(teamDayMap.values());
    var teamDayRows = teamDayAggregates.map(buildTeamDayRow);

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

    var teamWeekRows = Array.from(teamWeekMap.values()).map(buildTeamWeekRow);

    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamDayStatLine",
      ["gshlTeamId", "date", "weekId", "seasonId"],
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
      ["gshlTeamId", "weekId", "seasonId"],
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
          row.gshlTeamId === undefined || row.gshlTeamId === null
            ? ""
            : String(row.gshlTeamId),
          row.weekId === undefined || row.weekId === null ? "" : String(row.weekId),
          row.seasonId === undefined || row.seasonId === null
            ? ""
            : String(row.seasonId),
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
