/**
 * GSHL Yahoo Scraper
 *
 * Fetches team rosters from Yahoo Fantasy Hockey and processes player data
 */

// @ts-nocheck

var YahooScraper = YahooScraper || {};

(function (ns) {
  "use strict";

  const TEAM_DAY_TOTAL_FIELDS = [
    "GP",
    "MG",
    "IR",
    "IRplus",
    "GS",
    "G",
    "A",
    "P",
    "PM",
    "PIM",
    "PPP",
    "SOG",
    "HIT",
    "BLK",
    "W",
    "GA",
    "SV",
    "SA",
    "SO",
    "TOI",
    "ADD",
    "MS",
    "BS",
  ];

  function ensurePlayerRatings(statLines) {
    if (!Array.isArray(statLines)) return;
    statLines.forEach(function (line) {
      if (
        !line ||
        (line.Rating !== undefined &&
          line.Rating !== null &&
          line.Rating !== "")
      ) {
        return;
      }
      var ratingResult = RankingEngine.rankPerformance(line);
      if (ratingResult && ratingResult.score !== undefined) {
        line.Rating = ratingResult.score;
        line.rating = line.Rating;
      }
    });
  }

  function rankRowsIfAvailable(rows, sheetName, outputField) {
    if (
      !rows ||
      !rows.length ||
      typeof RankingEngine === "undefined" ||
      !RankingEngine ||
      typeof RankingEngine.rankRows !== "function"
    ) {
      return rows || [];
    }

    var rankedRows = RankingEngine.rankRows(rows, {
      sheetName: sheetName,
      outputField: outputField || "Rating",
      mutate: true,
    });

    (rankedRows || []).forEach(function (row) {
      if (!row) return;
      if (row.Rating !== undefined) row.rating = row.Rating;
      else if (row.rating !== undefined) row.Rating = row.rating;
    });

    return rankedRows;
  }

  function buildPlayerWeekRatingKey(row) {
    return [
      normalizeSheetKey(row && row.gshlTeamId),
      normalizeSheetKey(row && row.playerId),
      normalizeSheetKey(row && row.weekId),
      normalizeSheetKey(row && row.seasonId),
    ].join("|");
  }

  function mergePlayerWeeksForRating(rawRows, updatedRows, selectedWeekIdSet) {
    var byKey = new Map();
    (rawRows || []).forEach(function (row) {
      if (!row) return;
      if (
        selectedWeekIdSet &&
        !selectedWeekIdSet.has(String(row.weekId))
      ) {
        return;
      }
      byKey.set(buildPlayerWeekRatingKey(row), row);
    });
    (updatedRows || []).forEach(function (row) {
      if (!row) return;
      byKey.set(buildPlayerWeekRatingKey(row), row);
    });
    return Array.from(byKey.values());
  }

  function updatePlayerDays() {
    const now = new Date();
    if (shouldSkipYahooScrapeWindow(now)) return;

    try {
      const targetDate = GshlUtils.core.date.getTargetDateForScraping();
      const prevDate = GshlUtils.core.date.getPreviousDate(targetDate);
      const context = loadYahooScrapeContext(targetDate);
      const lookups = createScraperLookups(context, targetDate, prevDate);
      const seasonIdStr = context.season.id.toString();
      const weekIdStr = context.week.id.toString();
      const playerDayWorkbookId = context.playerDayWorkbookId;
      const playerDays = [];
      const teamDays = [];

      context.franchises.forEach(function (franchise) {
        const result = processFranchiseRoster(
          franchise,
          context,
          lookups,
          targetDate,
          seasonIdStr,
          weekIdStr,
        );
        if (!result) return;
        if (result.playerRows && result.playerRows.length) {
          playerDays.push(...result.playerRows);
        }
        if (result.teamRow) {
          teamDays.push(result.teamRow);
        }
      });

      ensurePlayerRatings(playerDays);

      GshlUtils.sheets.write.upsertSheetByKeys(
        playerDayWorkbookId,
        "PlayerDayStatLine",
        ["gshlTeamId", "playerId", "date", "weekId", "seasonId"],
        playerDays,
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
          deleteMissing: { date: targetDate },
        },
      );

      GshlUtils.sheets.write.upsertSheetByKeys(
        TEAMSTATS_SPREADSHEET_ID,
        "TeamDayStatLine",
        ["gshlTeamId", "date", "weekId", "seasonId"],
        teamDays,
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
        },
      );
    } catch (error) {
      throw error;
    }
  }

  function shouldSkipYahooScrapeWindow(now) {
    const hour = now.getHours();
    const mins = now.getMinutes();
    return (
      (hour > 1 && hour < 4) ||
      (hour === 4 && mins > 20) ||
      (hour > 4 && hour < 8) ||
      (hour === 8 && mins > 20) ||
      (hour > 8 && hour < 12)
    );
  }

  function loadYahooScrapeContext(targetDate) {
    const season = GshlUtils.sheets.read
      .fetchSheetAsObjects(SPREADSHEET_ID, "Season")
      .find((s) =>
        GshlUtils.core.date.isDateInRange(targetDate, s.startDate, s.endDate),
      );
    const week = GshlUtils.sheets.read
      .fetchSheetAsObjects(SPREADSHEET_ID, "Week")
      .find((s) =>
        GshlUtils.core.date.isDateInRange(targetDate, s.startDate, s.endDate),
      );

    if (!season) {
      throw new Error(
        "[YahooScraper] No Season row found for targetDate=" + targetDate,
      );
    }

    if (!week) {
      throw new Error(
        "[YahooScraper] No Week row found for targetDate=" + targetDate,
      );
    }

    const players = GshlUtils.sheets.read
      .fetchSheetAsObjects(SPREADSHEET_ID, "Player")
      .filter((p) => p.isActive);
    const franchises = GshlUtils.sheets.read
      .fetchSheetAsObjects(SPREADSHEET_ID, "Franchise")
      .filter((f) => f.isActive);
    const teams = GshlUtils.sheets.read
      .fetchSheetAsObjects(SPREADSHEET_ID, "Team")
      .filter((t) => t.seasonId === season.id);
    const matchups = GshlUtils.sheets.read
      .fetchSheetAsObjects(SPREADSHEET_ID, "Matchup")
      .filter((m) => m && String(m.seasonId) === String(season.id));

    const playerDayWorkbookId = getPlayerDayWorkbookIdForSeason(season.id);

    const existingPlayerDays = GshlUtils.sheets.read.fetchSheetAsObjects(
      playerDayWorkbookId,
      "PlayerDayStatLine",
    );

    return {
      season,
      week,
      players,
      franchises,
      teams,
      matchups,
      existingPlayerDays,
      playerDayWorkbookId,
    };
  }

  function createScraperLookups(context, targetDate, prevDate) {
    const playersByYahooId = new Map();
    context.players.forEach((player) => {
      if (!player || player.yahooId === undefined || player.yahooId === null)
        return;
      playersByYahooId.set(String(player.yahooId), player);
    });

    const teamsByFranchiseId = new Map();
    context.teams.forEach((team) => {
      teamsByFranchiseId.set(team.franchiseId, team);
    });

    const playerDayState = buildPlayerDayLookupState(
      context.existingPlayerDays,
      targetDate,
      prevDate,
    );
    const matchupGameTypesByTeamWeek = buildMatchupGameTypeMap(
      context.matchups,
    );

    return {
      playersByYahooId,
      teamsByFranchiseId,
      yesterdayMap: playerDayState.yesterdayMap,
      existingMap: playerDayState.existingMap,
      rowPresence: playerDayState.rowPresence,
      datePresence: playerDayState.datePresence,
      matchupGameTypesByTeamWeek,
    };
  }

  function computeAddForPlayerDay(playerDay, lookups) {
    if (
      typeof LineupBuilder !== "undefined" &&
      LineupBuilder &&
      LineupBuilder.internals &&
      typeof LineupBuilder.internals.computeAddValue === "function"
    ) {
      return LineupBuilder.internals.computeAddValue(
        playerDay,
        lookups && lookups.rowPresence,
        lookups && lookups.datePresence,
      );
    }

    if (!playerDay || !lookups) return "";
    const dateKey = GshlUtils.core.date.formatDateOnly(playerDay.date);
    const previousDate = GshlUtils.core.date.getPreviousDate(dateKey);
    if (
      !lookups.datePresence ||
      !lookups.datePresence.has(String(previousDate))
    ) {
      return "";
    }
    const key = `${playerDay.playerId}|${playerDay.gshlTeamId}|${previousDate}`;
    return lookups.rowPresence && lookups.rowPresence.has(key) ? "" : 1;
  }

  function buildMatchupGameTypeMap(matchups) {
    const matchupGameTypesByTeamWeek = new Map();
    (matchups || []).forEach(function (matchup) {
      if (!matchup) return;
      const weekKey = normalizeSheetKey(matchup.weekId);
      if (!weekKey) return;
      const gameType =
        matchup.gameType === undefined || matchup.gameType === null
          ? ""
          : String(matchup.gameType);
      const homeTeamKey = normalizeSheetKey(matchup.homeTeamId);
      const awayTeamKey = normalizeSheetKey(matchup.awayTeamId);
      if (homeTeamKey) {
        matchupGameTypesByTeamWeek.set(
          buildTeamWeekLookupKey(homeTeamKey, weekKey),
          gameType,
        );
      }
      if (awayTeamKey) {
        matchupGameTypesByTeamWeek.set(
          buildTeamWeekLookupKey(awayTeamKey, weekKey),
          gameType,
        );
      }
    });
    return matchupGameTypesByTeamWeek;
  }

  function buildTeamWeekLookupKey(teamId, weekId) {
    return normalizeSheetKey(teamId) + "|" + normalizeSheetKey(weekId);
  }

  function getMatchupGameTypeFromLookups(lookups, matchups, teamId, weekId) {
    if (
      lookups &&
      lookups.matchupGameTypesByTeamWeek &&
      typeof lookups.matchupGameTypesByTeamWeek.get === "function"
    ) {
      const key = buildTeamWeekLookupKey(teamId, weekId);
      if (lookups.matchupGameTypesByTeamWeek.has(key)) {
        return lookups.matchupGameTypesByTeamWeek.get(key);
      }
    }
    return getMatchupGameTypeForTeamWeek(matchups, teamId, weekId);
  }

  function computeLineupFlagsForPlayer(player) {
    if (
      typeof LineupBuilder !== "undefined" &&
      LineupBuilder &&
      LineupBuilder.internals &&
      typeof LineupBuilder.internals.computeLineupFlags === "function"
    ) {
      return LineupBuilder.internals.computeLineupFlags(player);
    }

    var dailyPos =
      player && player.dailyPos !== undefined && player.dailyPos !== null
        ? String(player.dailyPos).trim()
        : "";
    var fullPos =
      player && player.fullPos !== undefined && player.fullPos !== null
        ? String(player.fullPos).trim()
        : "";
    var bestPos =
      player && player.bestPos !== undefined && player.bestPos !== null
        ? String(player.bestPos).trim()
        : "";
    function isStart(pos) {
      return (
        pos === "LW" ||
        pos === "C" ||
        pos === "RW" ||
        pos === "D" ||
        pos === "G" ||
        pos === "Util"
      );
    }
    var dailyPosIsStart = isStart(dailyPos);
    var played = String(player && player.GP) === "1";
    var isGoalie = String((player && player.posGroup) || "") === "G";
    return {
      GS: dailyPosIsStart && played ? 1 : "",
      MS: played && !isGoalie && !dailyPosIsStart && isStart(fullPos) ? 1 : "",
      BS: played && dailyPosIsStart && bestPos === "BN" ? 1 : "",
    };
  }

  function buildPlayerDayLookupState(
    existingPlayerDays,
    targetDate,
    prevDate,
  ) {
    const yesterdayMap = new Map();
    const existingMap = new Map();
    const rowPresence = new Set();
    const datePresence = new Set();
    const targetKey = GshlUtils.core.date.formatDateOnly(targetDate);
    const prevKey = GshlUtils.core.date.formatDateOnly(prevDate);
    (existingPlayerDays || []).forEach((playerDay) => {
      if (!playerDay) return;
      const key = `${playerDay.playerId}_${playerDay.gshlTeamId}`;
      const normalizedDate = GshlUtils.core.date.formatDateOnly(playerDay.date);
      if (!normalizedDate) return;
      if (
        (targetKey || prevKey) &&
        normalizedDate !== targetKey &&
        normalizedDate !== prevKey
      ) {
        return;
      }

      datePresence.add(String(normalizedDate));
      if (playerDay.playerId && playerDay.gshlTeamId) {
        rowPresence.add(
          `${playerDay.playerId}|${playerDay.gshlTeamId}|${normalizedDate}`,
        );
      }

      if (normalizedDate === prevKey) {
        yesterdayMap.set(key, playerDay);
      } else if (normalizedDate === targetKey) {
        existingMap.set(key, playerDay);
      }
    });
    return {
      yesterdayMap,
      existingMap,
      rowPresence,
      datePresence,
    };
  }

  function processFranchiseRoster(
    franchise,
    context,
    lookups,
    targetDate,
    seasonIdStr,
    weekIdStr,
  ) {
    const gshlTeam = lookups.teamsByFranchiseId.get(franchise.id);
    if (!gshlTeam) return null;

    const rosterEntries = buildRosterEntries(
      targetDate,
      gshlTeam,
      context.season,
      seasonIdStr,
      weekIdStr,
      lookups,
    );

    const lineup = finalizeLineupAssignments(rosterEntries, {
      gameType: getMatchupGameTypeFromLookups(
        lookups,
        context.matchups,
        gshlTeam && gshlTeam.id,
        weekIdStr,
      ),
    });
    ensurePlayerRatings(lineup);
    const teamDayStatLine = buildTeamDayStatLine(
      lineup,
      gshlTeam,
      context.season,
      targetDate,
      seasonIdStr,
      weekIdStr,
    );

    return { playerRows: lineup, teamRow: teamDayStatLine };
  }

  function buildRosterEntries(
    targetDate,
    gshlTeam,
    season,
    seasonIdStr,
    weekIdStr,
    lookups,
  ) {
    const normalizeNhlPosValue =
      GshlUtils.yahoo &&
      GshlUtils.yahoo.roster &&
      GshlUtils.yahoo.roster.normalizeNhlPosValue;
    const resolvePosGroupFromNhlPos =
      GshlUtils.yahoo &&
      GshlUtils.yahoo.roster &&
      GshlUtils.yahoo.roster.resolvePosGroupFromNhlPos;

    return (
      GshlUtils.yahoo.roster.yahooTableScraper(
        targetDate,
        gshlTeam.yahooId,
        season.id,
      ) || []
    )
      .map((playerRow) => {
        if (!playerRow || playerRow.playerName === "") return null;
        const yahooKey =
          playerRow.yahooId === undefined || playerRow.yahooId === null
            ? ""
            : String(playerRow.yahooId);
        const playerRecord = yahooKey
          ? lookups.playersByYahooId.get(yahooKey)
          : null;
        if (!playerRecord) return null;

        const playerId = playerRecord.id.toString();
        const lookupKey = `${playerId}_${gshlTeam.id.toString()}`;
        const existing = lookups.existingMap.get(lookupKey);

        playerRow.id = existing ? existing.id : undefined;
        playerRow.date = targetDate;
        playerRow.playerId = playerId;
        playerRow.seasonId = seasonIdStr;
        playerRow.weekId = weekIdStr;
        playerRow.gshlTeamId = gshlTeam.id;
        const normalizedNhlPos =
          typeof normalizeNhlPosValue === "function"
            ? normalizeNhlPosValue(playerRow.nhlPos)
            : playerRow.nhlPos
              ? String(playerRow.nhlPos)
              : "";
        playerRow.nhlPos = normalizedNhlPos;
        playerRow.posGroup =
          typeof resolvePosGroupFromNhlPos === "function"
            ? resolvePosGroupFromNhlPos(normalizedNhlPos)
            : normalizedNhlPos.toUpperCase().includes("G")
              ? "G"
              : normalizedNhlPos.toUpperCase().includes("D")
                ? "D"
                : "F";
        playerRow.bestPos = "";
        playerRow.fullPos = "";
        const rating = RankingEngine.rankPerformance(playerRow);
        playerRow.Rating =
          rating && rating.score !== undefined ? rating.score : "";
        playerRow.ADD = computeAddForPlayerDay(playerRow, lookups);
        playerRow.BS = "";
        playerRow.MS = "";
        return playerRow;
      })
      .filter(Boolean);
  }

  function getMatchupGameTypeForTeamWeek(matchups, teamId, weekId) {
    var teamKey =
      teamId === undefined || teamId === null ? "" : String(teamId).trim();
    var weekKey =
      weekId === undefined || weekId === null ? "" : String(weekId).trim();
    if (!teamKey || !weekKey || !Array.isArray(matchups)) return "";

    var matchup = matchups.find(function (m) {
      if (!m) return false;
      var matchupWeekId =
        m.weekId === undefined || m.weekId === null ? "" : String(m.weekId);
      if (matchupWeekId !== weekKey) return false;
      return (
        String(m.homeTeamId) === teamKey || String(m.awayTeamId) === teamKey
      );
    });

    return matchup &&
      matchup.gameType !== undefined &&
      matchup.gameType !== null
      ? String(matchup.gameType)
      : "";
  }

  function isLosersTournamentGame(gameType) {
    return String(gameType || "") === "LT";
  }

  function applyAutomaticLtLineup(optimizedRoster, gameType) {
    if (!Array.isArray(optimizedRoster) || !isLosersTournamentGame(gameType)) {
      return optimizedRoster;
    }

    optimizedRoster.forEach(function (player) {
      if (!player) return;
      var assignedBestPos =
        player.bestPos !== undefined && player.bestPos !== null
          ? String(player.bestPos)
          : "";
      player.dailyPos = assignedBestPos;
      player.bestPos = assignedBestPos;
      player.fullPos = assignedBestPos;
      var flags = computeLineupFlagsForPlayer(player);
      player.GS = flags.GS;
      player.MS = flags.MS;
      player.BS = flags.BS;
    });

    return optimizedRoster;
  }

  function finalizeLineupAssignments(rosterEntries, options) {
    var opts = options || {};
    return applyAutomaticLtLineup(
      LineupBuilder.optimizeLineup(rosterEntries),
      opts.gameType,
    ).map((player) => {
      var flags = computeLineupFlagsForPlayer(player);
      player.GS = flags.GS;
      player.BS = flags.BS;
      player.MS = flags.MS;
      player.nhlPos = player.nhlPos.toString();
      return player;
    });
  }

  function buildTeamDayStatLine(
    lineup,
    gshlTeam,
    season,
    targetDate,
    seasonIdStr,
    weekIdStr,
  ) {
    const skaterStart = lineup.some(
      (player) => player.posGroup !== "G" && player.GP === "1",
    );
    const goalieStart = lineup.some(
      (player) => player.posGroup === "G" && player.GP === "1",
    );
    const totals = buildLineupStatTotals(lineup);

    const teamDayStatLine = {
      date: targetDate,
      gshlTeamId: gshlTeam.id,
      seasonId: seasonIdStr,
      weekId: weekIdStr,
      GP: String(totals.GP),
      MG: String(totals.MG),
      IR: String(totals.IR),
      IRplus: String(totals.IRplus),
      GS: String(totals.GS),
      G: skaterStart ? String(totals.G) : "",
      A: skaterStart ? String(totals.A) : "",
      P: skaterStart ? String(totals.P) : "",
      PM: +season.id <= 6 && skaterStart ? String(totals.PM) : "",
      PIM: +season.id <= 4 && skaterStart ? String(totals.PIM) : "",
      PPP: skaterStart ? String(totals.PPP) : "",
      SOG: skaterStart ? String(totals.SOG) : "",
      HIT: skaterStart ? String(totals.HIT) : "",
      BLK: skaterStart ? String(totals.BLK) : "",
      W: goalieStart ? String(totals.W) : "",
      GA: goalieStart ? String(totals.GA) : "",
      GAA: goalieStart
        ? ((totals.GA / totals.TOI) * 60).toFixed(5).toString()
        : "",
      SV: goalieStart ? String(totals.SV) : "",
      SA: goalieStart ? String(totals.SA) : "",
      SVP: goalieStart
        ? (totals.SV / totals.SA).toFixed(6).toString()
        : "",
      SO: +season.id <= 4 && goalieStart ? String(totals.SO) : "",
      TOI: goalieStart ? String(totals.TOI) : "",
      Rating: "",
      ADD: String(totals.ADD),
      MS: String(totals.MS),
      BS: String(totals.BS),
    };

    const teamRating = RankingEngine.rankPerformance(teamDayStatLine);
    teamDayStatLine.Rating =
      teamRating && teamRating.score !== undefined ? teamRating.score : "";

    return teamDayStatLine;
  }

  function buildLineupStatTotals(lineup) {
    const totals = {};
    TEAM_DAY_TOTAL_FIELDS.forEach(function (field) {
      totals[field] = 0;
    });
    (lineup || []).forEach(function (player) {
      TEAM_DAY_TOTAL_FIELDS.forEach(function (field) {
        totals[field] += +(player && player[field]);
      });
    });
    return totals;
  }

  ns.updatePlayerDays = updatePlayerDays;
  ns.internals = ns.internals || {};
  ns.internals.shouldSkipYahooScrapeWindow = shouldSkipYahooScrapeWindow;
  ns.internals.loadYahooScrapeContext = loadYahooScrapeContext;
  ns.internals.createScraperLookups = createScraperLookups;
  ns.internals.buildRosterEntries = buildRosterEntries;
  ns.internals.getMatchupGameTypeForTeamWeek = getMatchupGameTypeForTeamWeek;
  ns.internals.isLosersTournamentGame = isLosersTournamentGame;
  ns.internals.applyAutomaticLtLineup = applyAutomaticLtLineup;
  ns.internals.finalizeLineupAssignments = finalizeLineupAssignments;
  ns.internals.buildTeamDayStatLine = buildTeamDayStatLine;
  ns.internals.buildLineupStatTotals = buildLineupStatTotals;

  function normalizeYahooLineupPosition(pos) {
    var normalized =
      pos === undefined || pos === null ? "" : String(pos).trim();
    if (!normalized) return "";

    normalized = normalized
      .replace(/&nbsp;/gi, " ")
      .replace(/&#160;/gi, " ")
      .replace(/&#43;/gi, "+")
      .replace(/&#x2b;/gi, "+")
      .replace(/&plus;/gi, "+")
      .replace(/\s+/g, " ")
      .replace(/[^A-Za-z0-9+]/g, "")
      .trim();
    var upper = normalized.toUpperCase();

    if (upper === "C") return "C";
    if (upper === "LW") return "LW";
    if (upper === "RW") return "RW";
    if (upper === "UTIL" || upper === "U") return "Util";
    if (upper === "G") return "G";
    if (upper === "D") return "D";
    if (upper === "IR" || upper === "IL") return "IR";
    if (upper === "IR+" || upper === "IRPLUS" || upper === "IL+") return "IR+";
    if (upper === "ILPLUS") return "IR+";
    if (upper === "BN" || upper === "BENCH") return "BN";

    return "";
  }

  function buildPlayerDayLineupRepairKey(teamId, date, playerId, weekId) {
    return [
      normalizeSheetKey(teamId),
      GshlUtils.core.date.formatDateOnly(date),
      normalizeSheetKey(playerId),
      normalizeSheetKey(weekId),
    ].join("|");
  }

  function resolveYahooRosterSeasonYear(season, seasonId, options) {
    var opts = options || {};
    if (opts.seasonYear !== undefined && opts.seasonYear !== null) {
      return String(opts.seasonYear).trim();
    }
    if (opts.year !== undefined && opts.year !== null) {
      return String(opts.year).trim();
    }
    var seasonNumber = Number(seasonId);
    if (isFinite(seasonNumber)) return String(2013 + seasonNumber);
    if (season && season.year !== undefined && season.year !== null) {
      return String(season.year).trim();
    }
    return "";
  }

  function computeRepairedGs(playerDay, newDailyPos) {
    var next = Object.assign({}, playerDay, { dailyPos: newDailyPos });
    if (
      typeof LineupBuilder !== "undefined" &&
      LineupBuilder &&
      LineupBuilder.internals &&
      typeof LineupBuilder.internals.computeLineupFlags === "function"
    ) {
      return LineupBuilder.internals.computeLineupFlags(next).GS;
    }
    return computeLineupFlagsForPlayer(next).GS;
  }

  function repairStoredLineupsFromYahooInternal(seasonId, weekNums, options) {
    var opts = options || {};
    var seasonKey =
      GshlUtils.core &&
      GshlUtils.core.parse &&
      typeof GshlUtils.core.parse.normalizeSeasonId === "function"
        ? GshlUtils.core.parse.normalizeSeasonId(
            seasonId,
            "repairStoredLineupsFromYahooInternal",
          )
        : normalizeSheetKey(seasonId);
    if (!seasonKey) {
      throw new Error("repairStoredLineupsFromYahooInternal requires a seasonId");
    }

    var weekNumList = normalizeMatchupScrapeValueList(
      weekNums || opts.weekNums,
    );
    if (!weekNumList.length) {
      throw new Error("repairStoredLineupsFromYahooInternal requires weekNums");
    }

    var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
    var season = fetchSheetAsObjects(SPREADSHEET_ID, "Season", {
      coerceTypes: true,
    }).find(function (row) {
      return String(row && row.id) === seasonKey;
    });
    if (!season) {
      throw new Error(
        "repairStoredLineupsFromYahooInternal could not find Season.id=" + seasonKey,
      );
    }

    var weekNumSet = new Set(weekNumList);
    var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week", {
      coerceTypes: true,
    }).filter(function (week) {
      return (
        String(week && week.seasonId) === seasonKey &&
        weekNumSet.has(String(week && week.weekNum))
      );
    });
    var weeksByWeekNum = new Map();
    weeks.forEach(function (week) {
      weeksByWeekNum.set(String(week.weekNum), week);
    });
    var missingWeekNums = weekNumList.filter(function (weekNum) {
      return !weeksByWeekNum.has(String(weekNum));
    });
    if (missingWeekNums.length) {
      throw new Error(
        "repairStoredLineupsFromYahooInternal could not find Week.weekNum values for seasonId=" +
          seasonKey +
          ": " +
          missingWeekNums.join(","),
      );
    }
    weeks = weekNumList.map(function (weekNum) {
      return weeksByWeekNum.get(String(weekNum));
    });
    if (!weeks.length) {
      throw new Error(
        "repairStoredLineupsFromYahooInternal found no Week rows for seasonId=" +
          seasonKey +
          " weekNums=" +
          weekNumList.join(","),
      );
    }

    var weekIdSet = new Set(
      weeks.map(function (week) {
        return String(week.id);
      }),
    );
    var teams = fetchSheetAsObjects(SPREADSHEET_ID, "Team", {
      coerceTypes: true,
    }).filter(function (team) {
      return String(team && team.seasonId) === seasonKey;
    });
    var playersByYahooId = new Map();
    fetchSheetAsObjects(SPREADSHEET_ID, "Player", {
      coerceTypes: true,
    }).forEach(function (player) {
      var yahooId = normalizeSheetKey(player && player.yahooId);
      if (!yahooId) return;
      playersByYahooId.set(yahooId, player);
    });

    var playerDayWorkbookId =
      (opts.playerDayWorkbookId && String(opts.playerDayWorkbookId)) ||
      getPlayerDayWorkbookIdForSeason(seasonKey);
    var playerDays = fetchSheetAsObjects(
      playerDayWorkbookId,
      "PlayerDayStatLine",
      { coerceTypes: true },
    ).filter(function (playerDay) {
      return (
        String(playerDay && playerDay.seasonId) === seasonKey &&
        weekIdSet.has(String(playerDay && playerDay.weekId))
      );
    });

    var playerDaysByKey = new Map();
    playerDays.forEach(function (playerDay) {
      var key = buildPlayerDayLineupRepairKey(
        playerDay && playerDay.gshlTeamId,
        playerDay && playerDay.date,
        playerDay && playerDay.playerId,
        playerDay && playerDay.weekId,
      );
      if (key) playerDaysByKey.set(key, playerDay);
    });

    var summary = {
      seasonId: seasonKey,
      weekNums: weekNumList,
      weekIds: weeks.map(function (week) {
        return String(week.id);
      }),
      dryRun: !!opts.dryRun,
      scanned: {
        weeks: weeks.length,
        teams: teams.length,
        teamDates: 0,
        yahooRows: 0,
      },
      updatedRows: 0,
      missingPlayers: [],
      missingPlayerDayRows: [],
      skippedTeams: [],
      failedFetches: [],
      aborted: false,
      abortReason: "",
      cursorIndex:
        opts.cursorIndex === undefined || opts.cursorIndex === null
          ? 0
          : Number(opts.cursorIndex),
      nextCursorIndex: null,
      processedTeamDates: 0,
      complete: false,
      changes: [],
    };
    summary.cursorIndex =
      isFinite(summary.cursorIndex) && summary.cursorIndex > 0
        ? Math.floor(summary.cursorIndex)
        : 0;
    var missingPlayerKeys = new Set();
    var missingPlayerDayKeys = new Set();
    var skippedTeamKeys = new Set();

    function addMissingPlayer(scrapedPlayer, team, week, date) {
      var key =
        normalizeSheetKey(scrapedPlayer && scrapedPlayer.yahooId) +
        "|" +
        normalizeSheetKey(team && team.yahooId) +
        "|" +
        date;
      if (missingPlayerKeys.has(key)) return;
      missingPlayerKeys.add(key);
      summary.missingPlayers.push({
        yahooId: normalizeSheetKey(scrapedPlayer && scrapedPlayer.yahooId),
        playerName: scrapedPlayer && scrapedPlayer.playerName,
        yahooTeamId: normalizeSheetKey(team && team.yahooId),
        gshlTeamId: normalizeSheetKey(team && team.id),
        weekId: normalizeSheetKey(week && week.id),
        date: date,
      });
    }

    function addMissingPlayerDay(scrapedPlayer, player, team, week, date) {
      var key =
        normalizeSheetKey(player && player.id) +
        "|" +
        normalizeSheetKey(team && team.id) +
        "|" +
        normalizeSheetKey(week && week.id) +
        "|" +
        date;
      if (missingPlayerDayKeys.has(key)) return;
      missingPlayerDayKeys.add(key);
      summary.missingPlayerDayRows.push({
        playerId: normalizeSheetKey(player && player.id),
        playerName:
          (player && (player.fullName || player.playerName || player.name)) ||
          (scrapedPlayer && scrapedPlayer.playerName) ||
          "",
        yahooId: normalizeSheetKey(scrapedPlayer && scrapedPlayer.yahooId),
        gshlTeamId: normalizeSheetKey(team && team.id),
        yahooTeamId: normalizeSheetKey(team && team.yahooId),
        weekId: normalizeSheetKey(week && week.id),
        date: date,
      });
    }

    var seasonYear = resolveYahooRosterSeasonYear(season, seasonKey, opts);
    var requestDelayMs =
      opts.requestDelayMs === undefined || opts.requestDelayMs === null
        ? 0
        : Number(opts.requestDelayMs);
    requestDelayMs =
      isFinite(requestDelayMs) && requestDelayMs > 0 ? requestDelayMs : 0;
    var retryCount =
      opts.retryCount === undefined || opts.retryCount === null
        ? 0
        : Number(opts.retryCount);
    retryCount = isFinite(retryCount) && retryCount > 0 ? retryCount : 0;
    var retryDelayMs =
      opts.retryDelayMs === undefined || opts.retryDelayMs === null
        ? 0
        : Number(opts.retryDelayMs);
    retryDelayMs =
      isFinite(retryDelayMs) && retryDelayMs > 0 ? retryDelayMs : 0;
    var continueOnFetchError = !!opts.continueOnFetchError;
    var maxTeamDates =
      opts.maxTeamDates === undefined || opts.maxTeamDates === null
        ? 30
        : Number(opts.maxTeamDates);
    maxTeamDates =
      isFinite(maxTeamDates) && maxTeamDates > 0 ? Math.floor(maxTeamDates) : 0;
    var maxRuntimeMs =
      opts.maxRuntimeMs === undefined || opts.maxRuntimeMs === null
        ? 300000
        : Number(opts.maxRuntimeMs);
    maxRuntimeMs =
      isFinite(maxRuntimeMs) && maxRuntimeMs > 0 ? Math.floor(maxRuntimeMs) : 0;
    summary.maxTeamDates = maxTeamDates;
    summary.maxRuntimeMs = maxRuntimeMs;

    var runStartedAt = Date.now();
    var taskIndex = 0;

    function shouldPauseBeforeNextTask() {
      if (summary.processedTeamDates <= 0) return false;
      if (maxTeamDates && summary.processedTeamDates >= maxTeamDates) {
        return true;
      }
      return maxRuntimeMs && Date.now() - runStartedAt >= maxRuntimeMs;
    }

    function sleepIfAvailable(ms) {
      if (
        ms &&
        typeof Utilities !== "undefined" &&
        Utilities &&
        typeof Utilities.sleep === "function"
      ) {
        Utilities.sleep(ms);
      }
    }

    function fetchRosterRowsForRepair(date, yahooTeamId, team, week) {
      var attempts = retryCount + 1;
      var lastError = null;
      for (var attempt = 1; attempt <= attempts; attempt++) {
        try {
          if (attempt > 1) sleepIfAvailable(retryDelayMs);
          return GshlUtils.yahoo.roster.yahooTableScraper(
            date,
            yahooTeamId,
            seasonKey,
            Object.assign({}, opts, {
              seasonYear: seasonYear,
              seasonCode: opts.seasonCode,
              leagueId: opts.leagueId,
            }),
          );
        } catch (err) {
          lastError = err;
          console.log(
            "[YahooScraper] Roster fetch failed attempt " +
              attempt +
              "/" +
              attempts +
              " teamId=" +
              normalizeSheetKey(team && team.id) +
              " yahooTeamId=" +
              yahooTeamId +
              " weekId=" +
              normalizeSheetKey(week && week.id) +
              " date=" +
              date +
              ": " +
              (err && err.message ? err.message : String(err)),
          );
        }
      }

      summary.failedFetches.push({
        gshlTeamId: normalizeSheetKey(team && team.id),
        yahooTeamId: yahooTeamId,
        weekId: normalizeSheetKey(week && week.id),
        date: date,
        error: lastError && lastError.message ? lastError.message : String(lastError),
      });
      if (!continueOnFetchError) {
        summary.aborted = true;
        summary.abortReason = "fetchError";
      }
      return null;
    }

    weeks.forEach(function (week) {
      if (summary.aborted) return;
      var dates = GshlUtils.core.date.getDatesInRangeInclusive(
        week.startDate,
        week.endDate,
      );
      teams.forEach(function (team) {
        if (summary.aborted) return;
        var yahooTeamId = normalizeSheetKey(team && team.yahooId);
        if (!yahooTeamId) {
          var skippedKey = normalizeSheetKey(team && team.id);
          if (!skippedTeamKeys.has(skippedKey)) {
            skippedTeamKeys.add(skippedKey);
            summary.skippedTeams.push({
              gshlTeamId: skippedKey,
              reason: "missing yahooId",
            });
          }
          return;
        }

        dates.forEach(function (date) {
          if (summary.aborted) return;
          var currentTaskIndex = taskIndex++;
          if (currentTaskIndex < summary.cursorIndex) return;
          if (shouldPauseBeforeNextTask()) {
            summary.aborted = true;
            summary.abortReason = "chunkLimit";
            summary.nextCursorIndex = currentTaskIndex;
            return;
          }
          summary.scanned.teamDates++;
          summary.processedTeamDates++;
          sleepIfAvailable(requestDelayMs);
          var rosterRows = fetchRosterRowsForRepair(
            date,
            yahooTeamId,
            team,
            week,
          );
          if (!rosterRows) return;
          summary.scanned.yahooRows += Array.isArray(rosterRows)
            ? rosterRows.length
            : 0;

          (rosterRows || []).forEach(function (scrapedPlayer) {
            var yahooId = normalizeSheetKey(
              scrapedPlayer && scrapedPlayer.yahooId,
            );
            if (!yahooId) return;

            var player = playersByYahooId.get(yahooId);
            if (!player) {
              addMissingPlayer(scrapedPlayer, team, week, date);
              return;
            }

            var playerDayKey = buildPlayerDayLineupRepairKey(
              team && team.id,
              date,
              player && player.id,
              week && week.id,
            );
            var playerDay = playerDaysByKey.get(playerDayKey);
            if (!playerDay) {
              addMissingPlayerDay(scrapedPlayer, player, team, week, date);
              return;
            }

            var oldDailyPos = normalizeYahooLineupPosition(playerDay.dailyPos);
            var newDailyPos = normalizeYahooLineupPosition(
              scrapedPlayer.dailyPos,
            );
            if (!newDailyPos || oldDailyPos === newDailyPos) return;

            var oldGs =
              playerDay.GS === undefined || playerDay.GS === null
                ? ""
                : playerDay.GS;
            var newGs = computeRepairedGs(playerDay, newDailyPos);
            summary.changes.push({
              playerDayId: normalizeSheetKey(playerDay.id),
              playerId: normalizeSheetKey(player && player.id),
              playerName:
                (player &&
                  (player.fullName || player.playerName || player.name)) ||
                scrapedPlayer.playerName ||
                "",
              gshlTeamId: normalizeSheetKey(team && team.id),
              yahooTeamId: yahooTeamId,
              date: date,
              weekId: normalizeSheetKey(week && week.id),
              oldDailyPos: oldDailyPos,
              newDailyPos: newDailyPos,
              oldGS: oldGs,
              newGS: newGs,
            });
          });
        });
      });
    });

    if (!summary.aborted) {
      summary.complete = true;
    }
    summary.updatedRows = summary.changes.length;
    if (opts.dryRun || !summary.changes.length) {
      return summary;
    }

    writeOldLineupRepairChanges(playerDayWorkbookId, summary.changes);
    return summary;
  }

  function writeOldLineupRepairChanges(playerDayWorkbookId, changes) {
    var openSheet = GshlUtils.sheets.open.getSheetByName;
    var getHeaders = GshlUtils.sheets.read.getHeadersFromSheet;
    var getColIndex = GshlUtils.sheets.read.getColIndex;
    var groupAndApply = GshlUtils.sheets.write.groupAndApplyColumnUpdates;
    var sheet = openSheet(playerDayWorkbookId, "PlayerDayStatLine", true);
    var headers = getHeaders(sheet);
    var idCol = getColIndex(headers, "id", true) + 1;
    var dailyPosCol = getColIndex(headers, "dailyPos", true) + 1;
    var gsCol = getColIndex(headers, "GS", true) + 1;
    var updatedAtCol = getColIndex(headers, "updatedAt", true) + 1;

    var lastRow = sheet.getLastRow();
    var idToRowIndex = {};
    var duplicateIds = [];
    if (lastRow >= 2) {
      var idValues = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
      for (var r = 0; r < idValues.length; r++) {
        var rawId = idValues[r][0];
        if (rawId === undefined || rawId === null || rawId === "") continue;
        var key = String(rawId);
        var rowIndex = r + 2;
        if (idToRowIndex[key] === undefined) {
          idToRowIndex[key] = rowIndex;
        } else if (duplicateIds.length < 20) {
          duplicateIds.push({
            id: key,
            firstRowIndex: idToRowIndex[key],
            dupRowIndex: rowIndex,
          });
        }
      }
    }

    if (duplicateIds.length) {
      throw new Error(
        "PlayerDayStatLine sheet has duplicate 'id' values; fix the sheet and rerun. Example duplicates: " +
          JSON.stringify(duplicateIds),
      );
    }

    var now = new Date();
    var resolved = [];
    var missingIds = [];
    changes.forEach(function (change) {
      var id = normalizeSheetKey(change && change.playerDayId);
      var rowIndex = id ? idToRowIndex[id] : 0;
      if (!rowIndex) {
        missingIds.push(id || "(blank)");
        return;
      }
      resolved.push({
        rowIndex: rowIndex,
        dailyPos: change.newDailyPos,
        GS: change.newGS,
        updatedAt: now,
      });
    });

    if (missingIds.length) {
      throw new Error(
        "Could not map PlayerDayStatLine id(s) to sheet rows: " +
          missingIds.slice(0, 20).join(","),
      );
    }

    groupAndApply(
      sheet,
      dailyPosCol,
      resolved.map(function (update) {
        return { rowIndex: update.rowIndex, value: update.dailyPos };
      }),
    );
    groupAndApply(
      sheet,
      gsCol,
      resolved.map(function (update) {
        return { rowIndex: update.rowIndex, value: update.GS };
      }),
    );
    groupAndApply(
      sheet,
      updatedAtCol,
      resolved.map(function (update) {
        return { rowIndex: update.rowIndex, value: update.updatedAt };
      }),
    );
  }

  function normalizeYahooMatchupPlayerName(rawName) {
    if (!rawName) return "";
    var s = String(rawName);
    s = s.replace(/Player Note/gi, " ");
    s = s.replace(/No new player Notes?/gi, " ");
    // Remove common Yahoo status markers.
    s = s.replace(/\bPPD\b/g, " ");
    s = s.replace(/\b(IL\+|IR\+|IR)\b/g, " ");
    // Remove trailing records like "W," / "L," that can appear inline.
    s = s.replace(/\b(W|L),\b/g, " ");
    s = s.replace(/\b[A-Z]{2,3}\s*-\s*[A-Z+]+\b/g, " ");
    // Remove parentheses metadata e.g. "(WSH - RW)".
    s = s.replace(/\([^)]*\)/g, " ");
    s = s.replace(/\s+/g, " ").trim();

    // Apply repo-normalization if available.
    try {
      if (GshlUtils && GshlUtils.core && GshlUtils.core.text) {
        var normalizeName = GshlUtils.core.text.normalizeName;
        if (typeof normalizeName === "function") return normalizeName(s);
      }
    } catch (_e) {
      // ignore
    }

    return s
      .toLowerCase()
      .replace(/^matt(?=\s|$)/, "matthew")
      .replace(/^josh(?=\s|$)/, "joshua")
      .replace(/[^a-z]/g, "")
      .trim();
  }

  function getYahooMatchupNameKeys(rawName) {
    if (!rawName) return [];
    var raw = String(rawName).trim();
    if (!raw) return [];

    var keys = [];
    function addKey(value) {
      var key = normalizeYahooMatchupPlayerName(value);
      if (key && keys.indexOf(key) === -1) keys.push(key);
    }

    addKey(raw);

    var firstSpace = raw.indexOf(" ");
    if (firstSpace > 0) {
      var firstName = raw.slice(0, firstSpace);
      var lastName = raw.slice(firstSpace + 1).trim();
      var aliasMap = {
        josh: ["joshua"],
        joshua: ["josh"],
        matt: ["matthew"],
        matthew: ["matt"],
      };
      var firstNameKey = firstName.toLowerCase();
      var aliases = aliasMap[firstNameKey] || [];
      aliases.forEach(function (alias) {
        addKey(alias + " " + lastName);
      });
    }

    return keys;
  }

  function logUnmatchedYahooMatchupPlayer(
    playerDay,
    player,
    team,
    date,
    matchupRows,
  ) {
    var candidateNames = [
      player && player.fullName,
      player && player.playerName,
      player && player.name,
    ].filter(Boolean);
    var candidateKeys = [];
    candidateNames.forEach(function (name) {
      getYahooMatchupNameKeys(name).forEach(function (key) {
        if (candidateKeys.indexOf(key) === -1) candidateKeys.push(key);
      });
    });

    var availableRows = (matchupRows || [])
      .map(function (row) {
        return row && row[2] ? String(row[2]).trim() : "";
      })
      .filter(Boolean);

    console.log(
      "[YahooScraper] Stale PlayerDay row missing from Yahoo daily matchup table; row will be removed on write" +
        " teamId=" +
        normalizeSheetKey(team && team.id) +
        " weekId=" +
        normalizeSheetKey(playerDay && playerDay.weekId) +
        " date=" +
        (date || "") +
        " playerId=" +
        normalizeSheetKey(playerDay && playerDay.playerId) +
        " posGroup=" +
        String((playerDay && playerDay.posGroup) || "") +
        " names=" +
        candidateNames.join(" | ") +
        " keys=" +
        candidateKeys.join(",") +
        " yahooRows=" +
        availableRows.join(" | "),
    );
  }

  function buildPlayersByNormalizedName(players) {
    var map = new Map();
    (players || []).forEach(function (p) {
      if (!p) return;
      var candidates = [p.fullName, p.playerName, p.name];
      candidates.forEach(function (c) {
        getYahooMatchupNameKeys(c).forEach(function (key) {
          if (!map.has(key)) map.set(key, p);
        });
      });
    });
    return map;
  }

  function resolvePlayerFromMatchupRowName(rowName, playersByName, players) {
    var keys = getYahooMatchupNameKeys(rowName);
    if (!keys.length) return null;
    if (playersByName) {
      for (var idx = 0; idx < keys.length; idx++) {
        if (playersByName.has(keys[idx])) return playersByName.get(keys[idx]);
      }
    }

    // Fallback: contains match (handles middle initials / suffixes).
    var best = null;
    (players || []).some(function (p) {
      var candidateKeys = [];
      [p && p.fullName, p && p.playerName, p && p.name].forEach(
        function (name) {
          getYahooMatchupNameKeys(name).forEach(function (key) {
            if (candidateKeys.indexOf(key) === -1) candidateKeys.push(key);
          });
        },
      );
      var matched = candidateKeys.some(function (candidateKey) {
        return keys.some(function (rowKey) {
          return (
            candidateKey === rowKey ||
            candidateKey.includes(rowKey) ||
            rowKey.includes(candidateKey)
          );
        });
      });
      if (matched) {
        best = p;
        return true;
      }
      return false;
    });
    return best;
  }

  function matchesYahooMatchupRowName(rowName, player) {
    if (!player) return false;
    var rowKeys = getYahooMatchupNameKeys(rowName);
    if (!rowKeys.length) return false;

    var candidates = [player.fullName, player.playerName, player.name]
      .reduce(function (keys, value) {
        getYahooMatchupNameKeys(value).forEach(function (key) {
          if (keys.indexOf(key) === -1) keys.push(key);
        });
        return keys;
      }, [])
      .filter(Boolean);

    return candidates.some(function (candidate) {
      return rowKeys.some(function (rowKey) {
        return (
          candidate === rowKey ||
          candidate.includes(rowKey) ||
          rowKey.includes(candidate)
        );
      });
    });
  }

  function wasInExistingDailyLineup(player) {
    try {
      if (
        typeof LineupBuilder !== "undefined" &&
        LineupBuilder &&
        LineupBuilder.internals &&
        typeof LineupBuilder.internals.wasInDailyLineup === "function"
      ) {
        return LineupBuilder.internals.wasInDailyLineup(player);
      }
    } catch (_e) {
      // ignore and use local fallback
    }

    var dailyPos =
      player && player.dailyPos !== undefined && player.dailyPos !== null
        ? String(player.dailyPos).trim().toUpperCase()
        : "";
    return (
      !!dailyPos &&
      dailyPos !== "BN" &&
      dailyPos !== "IR" &&
      dailyPos !== "IR+" &&
      dailyPos !== "IL+"
    );
  }

  function applyDailyParticipationFlags(player, playedGame) {
    var gp = playedGame ? "1" : null;
    player.GP = gp;
    var flags = computeLineupFlagsForPlayer(player);
    player.GS = flags.GS;
    player.BS = flags.BS;
    player.MS = flags.MS;
  }

  /**
   * Yahoo Matchup Table Scraper (GAS)
   *
   * Fetches a Yahoo Fantasy Hockey matchup page and parses all HTML <table> elements
   * into a structured JS object (stored in a variable + returned).
   *
   * Notes:
   * - Many Yahoo league pages require authentication.
   * - If you get back a login page, set a Script Property `YAHOO_COOKIE` to a valid
   *   cookie header value from a logged-in browser session.
   *   (Apps Script: Project Settings → Script properties)
   */

  /**
   * Entry point for matchup scraping.
   *
   * Loads Weeks/Teams/Players + existing stat lines from Sheets, scrapes Yahoo matchup
   * pages, and upserts updated stat lines back into the appropriate spreadsheets.
   *
   * Notes:
   * - Behavior is controlled by the local toggles (`skipDays`, `seasonStats`) inside.
   * - This function is intended to be run manually from the Apps Script editor.
   */
  function normalizeMatchupScrapeValueList(values) {
    if (values === undefined || values === null) return [];
    if (!Array.isArray(values)) values = [values];
    return values
      .map((value) =>
        value === undefined || value === null ? "" : String(value).trim(),
      )
      .filter(Boolean);
  }

  function normalizeSheetKey(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  function getYahooSeasonCodeById(seasonId, override) {
    const seasonCodeById = {
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
      12: "",
      13: "",
    };

    const overrideValue =
      override === undefined || override === null
        ? ""
        : String(override).trim();
    if (overrideValue) return overrideValue;

    const seasonIdNum = Number(seasonId);
    const mapped = seasonCodeById[seasonIdNum] || "";
    if (mapped) return mapped;

    if (typeof YAHOO_LEAGUE_ID !== "undefined" && YAHOO_LEAGUE_ID) {
      return String(YAHOO_LEAGUE_ID);
    }

    return "";
  }

  function buildYahooMatchupUrl(params) {
    const seasonId =
      params && params.seasonId !== undefined ? params.seasonId : "";
    const seasonCodeRaw =
      params && params.seasonCode !== undefined && params.seasonCode !== null
        ? String(params.seasonCode)
        : "";
    const seasonCode = seasonCodeRaw.replace(/^\/+|\/+$/g, "").trim();
    const weekId =
      params && params.weekId !== undefined ? String(params.weekId) : "";
    const teamAId =
      params && params.teamAId !== undefined ? String(params.teamAId) : "";
    const teamBId =
      params && params.teamBId !== undefined ? String(params.teamBId) : "";
    const date = params && params.date ? String(params.date) : "";

    if (!seasonCode) {
      throw new Error(
        "[YahooScraper] Missing Yahoo league code for seasonId=" +
          String(seasonId) +
          ". Provide options.seasonCode or set YAHOO_LEAGUE_ID.",
      );
    }

    let url =
      "https://hockey.fantasysports.yahoo.com/" +
      (2013 + +seasonId) +
      "/hockey/" +
      seasonCode +
      "/matchup?week=" +
      weekId +
      "&mid1=" +
      teamAId +
      "&mid2=" +
      teamBId;

    if (date) {
      url += "&date=" + date;
    }

    return url;
  }

  function getPlayerDayWorkbookIdForSeason(seasonId) {
    if (
      GshlUtils.domain &&
      GshlUtils.domain.workbooks &&
      typeof GshlUtils.domain.workbooks.getPlayerDayWorkbookId === "function"
    ) {
      return GshlUtils.domain.workbooks.getPlayerDayWorkbookId(seasonId);
    }
    throw new Error(
      "[YahooScraper] PlayerDay workbook resolver is unavailable for seasonId=" +
        seasonId,
    );
  }

  function getWeeksToProcessForMatchupScrape(fetchSheetAsObjects, options) {
    const allWeeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week");
    const requestedWeekIds = normalizeMatchupScrapeValueList(options.weekIds);
    const requestedWeekNums = normalizeMatchupScrapeValueList(options.weekNums);
    let seasonKey =
      options.seasonId === undefined || options.seasonId === null
        ? ""
        : String(options.seasonId).trim();
    let weeks = [];

    if (requestedWeekIds.length) {
      const weekIdSet = new Set(requestedWeekIds);
      weeks = allWeeks.filter((week) => weekIdSet.has(String(week.id)));
      if (!weeks.length) {
        throw new Error(
          "[YahooScraper] No Week rows found for weekIds=" +
            requestedWeekIds.join(","),
        );
      }

      const seasonIds = Array.from(
        new Set(
          weeks
            .map((week) =>
              week && week.seasonId !== undefined && week.seasonId !== null
                ? String(week.seasonId)
                : "",
            )
            .filter(Boolean),
        ),
      );

      if (seasonIds.length !== 1) {
        throw new Error(
          "[YahooScraper] Week ids must belong to exactly one season",
        );
      }

      if (seasonKey && seasonKey !== seasonIds[0]) {
        throw new Error(
          "[YahooScraper] seasonId does not match the provided weekIds",
        );
      }

      seasonKey = seasonIds[0];
      weeks = requestedWeekIds
        .map((weekId) => weeks.find((week) => String(week.id) === weekId))
        .filter(Boolean);
      return { seasonKey, weeks };
    }

    if (!seasonKey) {
      throw new Error(
        "[YahooScraper] seasonId is required when weekIds are not provided",
      );
    }

    weeks = allWeeks.filter((week) => String(week.seasonId) === seasonKey);
    if (requestedWeekNums.length) {
      const weekNumSet = new Set(requestedWeekNums);
      weeks = weeks.filter((week) => weekNumSet.has(String(week.weekNum)));
      weeks = requestedWeekNums
        .map((weekNum) =>
          weeks.find((week) => String(week.weekNum) === weekNum),
        )
        .filter(Boolean);
    }

    if (!weeks.length) {
      throw new Error(
        "[YahooScraper] No Week rows found for seasonId=" + seasonKey,
      );
    }

    return { seasonKey, weeks };
  }

  function runMatchupTableScrape(options) {
    const fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
    const upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;
    const opts = options || {};
    const skipDays = opts.skipDays === undefined ? true : !!opts.skipDays;
    const writePlayerDays =
      opts.writePlayerDays === undefined ? !skipDays : !!opts.writePlayerDays;
    const seasonStats = !!opts.seasonStats;
    const createMissingWeeks =
      opts.createMissingWeeks === undefined ? true : !!opts.createMissingWeeks;
    const updateDailyPos =
      opts.updateDailyPos === undefined ? false : !!opts.updateDailyPos;
    const resolvedWeekContext = getWeeksToProcessForMatchupScrape(
      fetchSheetAsObjects,
      opts,
    );
    const seasonKey = resolvedWeekContext.seasonKey;
    const weeks = resolvedWeekContext.weeks;
    const seasonIdNum = Number(seasonKey);
    const hasPM = seasonIdNum <= 6;
    const seasonCode = getYahooSeasonCodeById(seasonKey, opts.seasonCode);
    if (!seasonCode) {
      throw new Error(
        "[YahooScraper] Could not resolve Yahoo league code for seasonId=" +
          seasonKey +
          ". Provide options.seasonCode or set YAHOO_LEAGUE_ID.",
      );
    }
    const players = seasonStats
      ? []
      : fetchSheetAsObjects(SPREADSHEET_ID, "Player");
    const playersByNormalizedName = buildPlayersByNormalizedName(players);
    const teams = fetchSheetAsObjects(SPREADSHEET_ID, "Team").filter(
      (team) => String(team.seasonId) === seasonKey,
    );
    const playerDayWorkbookId = getPlayerDayWorkbookIdForSeason(seasonKey);
    const selectedWeekIdSet = new Set(weeks.map((week) => String(week.id)));
    const selectedDateSet = new Set();
    weeks.forEach((week) => {
      GshlUtils.core.date
        .getDatesInRangeInclusive(week.startDate, week.endDate)
        .forEach((date) => selectedDateSet.add(String(date)));
    });
    const rawPlayerDays =
      skipDays && !seasonStats
        ? []
        : fetchSheetAsObjects(playerDayWorkbookId, "PlayerDayStatLine").filter(
            (row) =>
              (String(row.seasonId) === seasonKey &&
                selectedWeekIdSet.has(String(row.weekId))) ||
              selectedDateSet.has(GshlUtils.core.date.formatDateOnly(row.date)),
          );
    const rawPlayerWeeks = fetchSheetAsObjects(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerWeekStatLine",
    ).filter(
      (row) =>
        String(row.seasonId) === seasonKey &&
        selectedWeekIdSet.has(String(row.weekId)),
    );
    const rawTeamWeeks = fetchSheetAsObjects(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
    ).filter(
      (row) =>
        String(row.seasonId) === seasonKey &&
        selectedWeekIdSet.has(String(row.weekId)),
    );

    const playerById = new Map(
      players.map((player) => [String(player.id), player]),
    );
    const teamByYahooId = new Map(
      teams.map((team) => [String(team.yahooId), team]),
    );
    const playerDaysByWeekId = new Map();
    rawPlayerDays.forEach((playerDay) => {
      const weekKey = String(playerDay.weekId);
      const list = playerDaysByWeekId.get(weekKey) ?? [];
      list.push(playerDay);
      playerDaysByWeekId.set(weekKey, list);
    });
    const playerWeeksByWeekId = new Map();
    rawPlayerWeeks.forEach((playerWeek) => {
      const weekKey = String(playerWeek.weekId);
      const list = playerWeeksByWeekId.get(weekKey) ?? [];
      list.push(playerWeek);
      playerWeeksByWeekId.set(weekKey, list);
    });
    const teamWeeksByWeekId = new Map();
    rawTeamWeeks.forEach((teamWeek) => {
      const weekKey = String(teamWeek.weekId);
      const list = teamWeeksByWeekId.get(weekKey) ?? [];
      list.push(teamWeek);
      teamWeeksByWeekId.set(weekKey, list);
    });

    const teamWeeksOutput = [];
    const playerWeeksOutput = [];
    const playerDaysOutput = [];
    const manualAddWarnings = [];
    const manualAddWarningKeySet = new Set();
    let playerDaysWriteResult = null;

    if (seasonStats) {
      updateTeamStatsFromWeeks(
        seasonKey,
        weeks,
        teams,
        rawPlayerDays,
        rawPlayerWeeks,
        rawTeamWeeks,
      );
      updatePlayerStatsForSeasonCustom(seasonKey, rawPlayerWeeks);
    } else {
      weeks.forEach((week) => {
        console.log(
          "[YahooScraper] Matchup scrape - WeekId",
          String(week.id),
          "WeekNum",
          String(week.weekNum),
        );

        const weekKey = String(week.id);
        const weekDateSet = new Set(
          GshlUtils.core.date.getDatesInRangeInclusive(
            week.startDate,
            week.endDate,
          ),
        );
        const playerDaysForWeekMap = new Map();
        function addPlayerDayForWeek(playerDay) {
          if (!playerDay) return;
          const key =
            normalizeSheetKey(playerDay.id) ||
            buildPlayerDayExistenceKey(
              playerDay.gshlTeamId,
              playerDay.playerId,
              playerDay.date,
            );
          if (key) playerDaysForWeekMap.set(key, playerDay);
        }
        (playerDaysByWeekId.get(weekKey) ?? []).forEach(addPlayerDayForWeek);
        rawPlayerDays.forEach((playerDay) => {
          if (
            weekDateSet.has(
              GshlUtils.core.date.formatDateOnly(playerDay && playerDay.date),
            )
          ) {
            addPlayerDayForWeek(playerDay);
          }
        });
        const playerDaysForWeek = Array.from(playerDaysForWeekMap.values());
        const playerWeeksForWeek = playerWeeksByWeekId.get(weekKey) ?? [];
        const teamWeeksForWeek = teamWeeksByWeekId.get(weekKey) ?? [];

        scrapeYahooMatchupTablesforWeek(
          String(week.weekNum),
          seasonKey,
          seasonCode,
          week,
          playerById,
          players,
          playersByNormalizedName,
          teamByYahooId,
          playerDaysForWeek,
          playerWeeksForWeek,
          teamWeeksForWeek,
          playerDaysOutput,
          playerWeeksOutput,
          teamWeeksOutput,
          skipDays,
          hasPM,
          createMissingWeeks,
          updateDailyPos,
          manualAddWarnings,
          manualAddWarningKeySet,
        );
      });

      if (!skipDays && writePlayerDays) {
        rankRowsIfAvailable(playerDaysOutput, "PlayerDayStatLine", "Rating");
        const weekWriteResults = [];
        weeks.forEach((week) => {
          const weekId = String(week.id);
          const weekRows = playerDaysOutput.filter(
            (row) => String(row && row.weekId) === weekId,
          );
          if (!weekRows.length) {
            console.log(
              "[YahooScraper] Skipping PlayerDay deleteMissing write for weekId=" +
                weekId +
                " because no daily matchup rows were scraped",
            );
            weekWriteResults.push({
              weekId: weekId,
              weekNum: String(week.weekNum),
              writeResult: null,
            });
            return;
          }

          weekWriteResults.push({
            weekId: weekId,
            weekNum: String(week.weekNum),
            writeResult: upsertSheetByKeys(
              playerDayWorkbookId,
              "PlayerDayStatLine",
              ["gshlTeamId", "playerId", "date", "weekId", "seasonId"],
              weekRows,
              {
                idColumn: "id",
                createdAtColumn: "createdAt",
                updatedAtColumn: "updatedAt",
                deleteMissing: { seasonId: seasonKey, weekId: weekId },
              },
            ),
          });
        });
        playerDaysWriteResult =
          weekWriteResults.length === 1
            ? weekWriteResults[0].writeResult
            : weekWriteResults;
      }

      if (skipDays) {
        const playerWeeksToWrite = mergePlayerWeeksForRating(
          rawPlayerWeeks,
          playerWeeksOutput,
          selectedWeekIdSet,
        );
        rankRowsIfAvailable(
          playerWeeksToWrite,
          "PlayerWeekStatLine",
          "Rating",
        );

        upsertSheetByKeys(
          PLAYERSTATS_SPREADSHEET_ID,
          "PlayerWeekStatLine",
          ["gshlTeamId", "playerId", "weekId", "seasonId"],
          playerWeeksToWrite,
          { idColumn: "id", updatedAtColumn: "updatedAt" },
        );
        upsertSheetByKeys(
          TEAMSTATS_SPREADSHEET_ID,
          "TeamWeekStatLine",
          ["gshlTeamId", "weekId", "seasonId"],
          teamWeeksOutput,
          { idColumn: "id", updatedAtColumn: "updatedAt" },
        );
      }
    }

    return {
      seasonId: seasonKey,
      weekIds: weeks.map((week) => String(week.id)),
      weekNums: weeks.map((week) => String(week.weekNum)),
      mode: skipDays ? "weekly" : "daily",
      playerDays: playerDaysOutput,
      playerDaysWrite: playerDaysWriteResult,
      manualAddWarnings: manualAddWarnings,
      playerWeeks: playerWeeksOutput,
      teamWeeks: teamWeeksOutput,
    };
  }

  function updateWeekStatsFromWeekIds(weekIds, options) {
    const opts = options || {};
    return runMatchupTableScrape({
      weekIds: weekIds,
      seasonId: opts.seasonId,
      seasonCode: opts.seasonCode,
      createMissingWeeks:
        opts.createMissingWeeks === undefined ? true : opts.createMissingWeeks,
      skipDays: true,
      seasonStats: false,
    });
  }

  function updatePlayerDaysFromWeekIds(weekIds, options) {
    const opts = options || {};
    return runMatchupTableScrape({
      weekIds: weekIds,
      seasonId: opts.seasonId,
      seasonCode: opts.seasonCode,
      skipDays: false,
      seasonStats: false,
      writePlayerDays:
        opts.writePlayerDays === undefined ? true : !!opts.writePlayerDays,
      updateDailyPos:
        opts.updateDailyPos === undefined ? true : !!opts.updateDailyPos,
    });
  }

  function updateWeekStatsFromWeekId(weekId, options) {
    return updateWeekStatsFromWeekIds([weekId], options);
  }

  function updatePlayerDaysFromWeekId(weekId, options) {
    return updatePlayerDaysFromWeekIds([weekId], options);
  }

  function scrapeYahooMatchupTables() {
    return runMatchupTableScrape({
      seasonId: "10",
      weekNums: ["1", "2"],
      skipDays: false,
      seasonStats: false,
      createMissingWeeks: true,
      updateDailyPos: true,
    });
  }

  /**
   * Scrapes Yahoo matchup pages in weekly mode (no daily pages) for the provided
   * season + week numbers, and upserts PlayerWeekStatLine + TeamWeekStatLine.
   *
   * Internal matchup-table scrape path retained for non-production support work.
   *
   * @param {string|number} seasonId GSHL season id.
   * @param {Array<string|number>} weekNumsArray Week numbers to scrape (e.g. ["1","2"]).
   * @param {Object=} options Optional overrides.
   * @param {string=} options.seasonCode Yahoo league code override.
   * @param {boolean=} options.createMissingWeeks Whether to create missing week rows.
   */
  function scrapeYahooWeeklyMatchupTables(seasonId, weekNumsArray, options) {
    return runMatchupTableScrape({
      seasonId: seasonId,
      weekNums: weekNumsArray,
      seasonCode: options && options.seasonCode,
      createMissingWeeks:
        options && typeof options.createMissingWeeks === "boolean"
          ? options.createMissingWeeks
          : true,
      skipDays: true,
      seasonStats: false,
    });
  }

  function updateWeeksFromMatchupTables(seasonId, weekNumsArray, options) {
    return scrapeYahooWeeklyMatchupTables(seasonId, weekNumsArray, options);
  }

  /**
   * Scrapes all Yahoo matchup pairs for a given week.
   *
   * When `skipDays` is false, scrapes each date within the week (daily pages).
   * When `skipDays` is true, scrapes the weekly matchup summary pages.
   *
   * All updates are appended into the provided output arrays.
   */
  function scrapeYahooMatchupTablesforWeek(
    weekNum,
    seasonId,
    seasonCode,
    week,
    playerById,
    players,
    playersByNormalizedName,
    teamByYahooId,
    rawPlayerDays,
    rawPlayerWeeks,
    rawTeamWeeks,
    playerDaysOutput,
    playerWeeksOutput,
    teamWeeksOutput,
    skipDays,
    hasPM,
    createMissingWeeks,
    updateDailyPos,
    manualAddWarnings,
    manualAddWarningKeySet,
  ) {
    const getDatesInRangeInclusive =
      GshlUtils.core.date.getDatesInRangeInclusive;

    const dates = getDatesInRangeInclusive(week.startDate, week.endDate);
    const playerDaysByDate = new Map();
    rawPlayerDays.forEach((pd) => {
      const dateKey = GshlUtils.core.date.formatDateOnly(pd.date);
      if (!dateKey) return;
      const list = playerDaysByDate.get(dateKey) ?? [];
      list.push(pd);
      playerDaysByDate.set(dateKey, list);
    });
    const matchupPairs = [
      ["1", "2"],
      ["3", "4"],
      ["5", "6"],
      ["7", "8"],
      ["9", "10"],
      ["11", "12"],
      ["13", "14"],
      ["15", "16"],
    ];
    matchupPairs.forEach((pair) => {
      if (skipDays) {
        processTwoTeamMatchupWeekPage(
          seasonCode,
          pair[0],
          pair[1],
          seasonId,
          String(weekNum),
          String(week.id),
          week.gameDays,
          week.weekType,
          playerById,
          players,
          playersByNormalizedName,
          rawPlayerWeeks,
          rawTeamWeeks,
          teamByYahooId,
          playerWeeksOutput,
          teamWeeksOutput,
          hasPM,
          createMissingWeeks,
        );
      } else {
        dates.forEach((d) => {
          const playerDays = playerDaysByDate.get(d) ?? [];
          processTwoTeamMatchupDatePage(
            seasonCode,
            pair[0],
            pair[1],
            seasonId,
            weekNum,
            String(week.id),
            d,
            playerById,
            players,
            playersByNormalizedName,
            playerDays,
            teamByYahooId,
            playerDaysOutput,
            hasPM,
            updateDailyPos,
            manualAddWarnings,
            manualAddWarningKeySet,
          );
        });
      }
    });
    return;
  }

  /**
   * Fetches a weekly Yahoo matchup page for two teams and processes both sides.
   *
   * @param {string} seasonCode Yahoo league code for the season.
   * @param {string} teamAId Yahoo matchup team id (mid1).
   * @param {string} teamBId Yahoo matchup team id (mid2).
   * @param {string} seasonId GSHL season id (string).
   * @param {string|number} weekId Yahoo matchup week id (week query param).
   * @param {Map<string, Object>} playerById Player lookup map by player id.
   * @param {Object[]} playerWeeks Existing player-week stat lines for the week.
   * @param {Object[]} teamWeeks Existing team-week stat lines for the week.
   * @param {Map<string, Object>} teamByYahooId Team lookup map by Yahoo team id.
   * @param {Object[]} playerWeeksOutput Output array to append updated player-week stat lines.
   * @param {Object[]} teamWeeksOutput Output array to append updated team-week stat lines.
   */
  function processTwoTeamMatchupWeekPage(
    seasonCode,
    teamAId,
    teamBId,
    seasonId,
    yahooWeekNum,
    gshlWeekId,
    weekGameDays,
    weekSeasonType,
    playerById,
    players,
    playersByNormalizedName,
    playerWeeks,
    teamWeeks,
    teamByYahooId,
    playerWeeksOutput,
    teamWeeksOutput,
    hasPM,
    createMissingWeeks,
  ) {
    let url = buildYahooMatchupUrl({
      seasonId: seasonId,
      seasonCode: seasonCode,
      weekId: yahooWeekNum,
      teamAId: teamAId,
      teamBId: teamBId,
    });
    let matchupTables = fetchYahooMatchupTables(url).tables;
    matchupTables = [
      matchupTables[1],
      ...matchupTables.slice(
        matchupTables.length - 3,
        matchupTables.length - 1,
      ),
    ];
    let teamAMatchupTables = [
      matchupTables[0].rows[0],
      matchupTables[1].rows.map((x) => x.slice(0, 10)),
      matchupTables[2].rows.map((x) => x.slice(0, 6)),
    ];
    let teamBMatchupTables = [
      matchupTables[0].rows[1],
      matchupTables[1].rows.map((x) => x.slice(11)),
      matchupTables[2].rows.map((x) => x.slice(7)),
    ];
    processTeamMatchupWeek(
      gshlWeekId,
      weekGameDays,
      weekSeasonType,
      playerById,
      players,
      playersByNormalizedName,
      playerWeeks,
      teamWeeks,
      teamAMatchupTables,
      teamByYahooId.get(String(teamAId)),
      playerWeeksOutput,
      teamWeeksOutput,
      hasPM,
      createMissingWeeks,
    );
    processTeamMatchupWeek(
      gshlWeekId,
      weekGameDays,
      weekSeasonType,
      playerById,
      players,
      playersByNormalizedName,
      playerWeeks,
      teamWeeks,
      teamBMatchupTables,
      teamByYahooId.get(String(teamBId)),
      playerWeeksOutput,
      teamWeeksOutput,
      hasPM,
      createMissingWeeks,
    );
  }

  /**
   * Fetches a daily Yahoo matchup page for two teams and processes both sides.
   *
   * @param {string} seasonCode Yahoo league code for the season.
   * @param {string} teamAId Yahoo matchup team id (mid1).
   * @param {string} teamBId Yahoo matchup team id (mid2).
   * @param {string} seasonId GSHL season id (string).
   * @param {string|number} yahooWeekNum Yahoo matchup week id (week query param).
   * @param {string|number} gshlWeekId GSHL Week.id for PlayerDay rows.
   * @param {string} d Date string (YYYY-MM-DD) used in Yahoo `date` query param.
   * @param {Map<string, Object>} playerById Player lookup map by player id.
   * @param {Object[]} players Player rows from the Player sheet.
   * @param {Map<string, Object>} playersByNormalizedName Player lookup by normalized name.
   * @param {Object[]} playerDays Existing player-day stat lines for the date.
   * @param {Map<string, Object>} teamByYahooId Team lookup map by Yahoo team id.
   * @param {Object[]} playerDaysOutput Output array to append updated player-day stat lines.
   */
  function processTwoTeamMatchupDatePage(
    seasonCode,
    teamAId,
    teamBId,
    seasonId,
    yahooWeekNum,
    gshlWeekId,
    d,
    playerById,
    players,
    playersByNormalizedName,
    playerDays,
    teamByYahooId,
    playerDaysOutput,
    hasPM,
    updateDailyPos,
    manualAddWarnings,
    manualAddWarningKeySet,
  ) {
    let url = buildYahooMatchupUrl({
      seasonId: seasonId,
      seasonCode: seasonCode,
      weekId: yahooWeekNum,
      date: d,
      teamAId: teamAId,
      teamBId: teamBId,
    });
    let matchupResult = fetchYahooMatchupTables(url);
    let matchupTables =
      matchupResult && Array.isArray(matchupResult.tables)
        ? matchupResult.tables
        : [];
    let candidateTables = matchupTables.filter(
      (table) => table && Array.isArray(table.rows) && table.rows.length,
    );

    let slicedTables = candidateTables.slice(
      candidateTables.length - 3,
      candidateTables.length - 1,
    );
    if (slicedTables.length < 2) {
      slicedTables = candidateTables.slice(-2);
    }

    if (
      slicedTables.length < 2 ||
      !slicedTables[0] ||
      !Array.isArray(slicedTables[0].rows) ||
      !slicedTables[1] ||
      !Array.isArray(slicedTables[1].rows)
    ) {
      console.log(
        "[YahooScraper] Skipping daily matchup page with unexpected table layout: " +
          url +
          " tableCount=" +
          matchupTables.length +
          " candidateCount=" +
          candidateTables.length,
      );
      return;
    }

    matchupTables = slicedTables;
    let teamAMatchupTables = [
      matchupTables[0].rows.map((x) => [x[10], ...x.slice(0, 10)]),
      matchupTables[1].rows.map((x) => [x[6], ...x.slice(0, 6)]),
    ];
    let teamBMatchupTables = [
      matchupTables[0].rows.map((x) => x.slice(10)),
      matchupTables[1].rows.map((x) => x.slice(6)),
    ];
    processTeamMatchupDate(
      playerById,
      players,
      playersByNormalizedName,
      playerDays,
      teamAMatchupTables,
      d,
      teamByYahooId.get(String(teamAId)),
      seasonId,
      gshlWeekId,
      playerDaysOutput,
      hasPM,
      updateDailyPos,
      manualAddWarnings,
      manualAddWarningKeySet,
    );
    processTeamMatchupDate(
      playerById,
      players,
      playersByNormalizedName,
      playerDays,
      teamBMatchupTables,
      d,
      teamByYahooId.get(String(teamBId)),
      seasonId,
      gshlWeekId,
      playerDaysOutput,
      hasPM,
      updateDailyPos,
      manualAddWarnings,
      manualAddWarningKeySet,
    );
  }

  /**
   * Applies scraped weekly matchup tables to the team/week + player/week stat lines.
   *
   * Mutates the existing stat line objects and appends them to the provided output arrays.
   *
   * @param {Map<string, Object>} playerById Player lookup map by player id.
   * @param {Object[]} playerWeeks Existing player-week stat lines for the week.
   * @param {Object[]} teamWeeks Existing team-week stat lines for the week.
   * @param {Array} matchupTables Parsed Yahoo table slices for one team.
   * @param {Object} team Team row (from the Team sheet).
   * @param {Object[]} playerWeeksOutput Output array to append updated player-week stat lines.
   * @param {Object[]} teamWeeksOutput Output array to append updated team-week stat lines.
   */
  function processTeamMatchupWeek(
    weekId,
    weekGameDays,
    weekSeasonType,
    playerById,
    players,
    playersByNormalizedName,
    playerWeeks,
    teamWeeks,
    matchupTables,
    team,
    playerWeeksOutput,
    teamWeeksOutput,
    hasPM,
    createMissingWeeks,
  ) {
    if (!team) return;

    const teamId = normalizeSheetKey(team.id);
    const weekKey = normalizeSheetKey(weekId);

    let teamPlayerWeeks = playerWeeks.filter(
      (pd) =>
        normalizeSheetKey(pd && pd.gshlTeamId) === teamId &&
        normalizeSheetKey(pd && pd.weekId) === weekKey,
    );
    let teamWeek = teamWeeks.find(
      (pd) =>
        normalizeSheetKey(pd && pd.gshlTeamId) === teamId &&
        normalizeSheetKey(pd && pd.weekId) === weekKey,
    );

    if (!teamWeek) {
      if (!createMissingWeeks) return;
      teamWeek = {
        seasonId: team.seasonId,
        gshlTeamId: teamId,
        weekId: weekKey,
      };
    }

    if (
      weekGameDays !== undefined &&
      weekGameDays !== null &&
      weekGameDays !== "" &&
      (teamWeek.days === undefined ||
        teamWeek.days === null ||
        teamWeek.days === "")
    ) {
      teamWeek.days = weekGameDays;
    }

    var resolvedWeekSeasonType =
      weekSeasonType === undefined || weekSeasonType === null
        ? ""
        : String(weekSeasonType);

    const teamStats = matchupTables[0].slice(1, hasPM ? 15 : 14);
    const idx = {
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
      SVPGuard: hasPM ? 13 : 12,
    };

    if (
      +teamWeek.G !== +teamStats[idx.G] &&
      teamStats[idx.G] &&
      teamStats[idx.G] !== "" &&
      teamStats[idx.G] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - Goals " +
          teamWeek.G +
          " -> " +
          teamStats[idx.G],
      );
      teamWeek.G = +teamStats[idx.G];
    }

    if (
      +teamWeek.A !== +teamStats[idx.A] &&
      teamStats[idx.G] &&
      teamStats[idx.A] !== "" &&
      teamStats[idx.A] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - Assists " +
          teamWeek.A +
          " -> " +
          teamStats[idx.A],
      );
      teamWeek.A = +teamStats[idx.A];
    }

    if (
      +teamWeek.P !== +teamStats[idx.P] &&
      teamStats[idx.G] &&
      teamStats[idx.P] !== "" &&
      teamStats[idx.P] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - Points " +
          teamWeek.P +
          " -> " +
          teamStats[idx.P],
      );
      teamWeek.P = +teamStats[idx.P];
    }

    if (
      hasPM &&
      +teamWeek.PM !== +teamStats[idx.PM] &&
      teamStats[idx.G] &&
      teamStats[idx.PM] !== "" &&
      teamStats[idx.PM] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - Plus Minus " +
          teamWeek.PM +
          " -> " +
          teamStats[idx.PM],
      );
      teamWeek.PM = +teamStats[idx.PM];
    }

    if (
      +teamWeek.PPP !== +teamStats[idx.PPP] &&
      teamStats[idx.G] &&
      teamStats[idx.PPP] !== "" &&
      teamStats[idx.PPP] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - Powerplay Points " +
          teamWeek.PPP +
          " -> " +
          teamStats[idx.PPP],
      );
      teamWeek.PPP = +teamStats[idx.PPP];
    }

    if (
      +teamWeek.SOG !== +teamStats[idx.SOG] &&
      teamStats[idx.G] &&
      teamStats[idx.SOG] !== "" &&
      teamStats[idx.SOG] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - Shots " +
          teamWeek.SOG +
          " -> " +
          teamStats[idx.SOG],
      );
      teamWeek.SOG = +teamStats[idx.SOG];
    }

    if (
      +teamWeek.HIT !== +teamStats[idx.HIT] &&
      teamStats[idx.G] &&
      teamStats[idx.HIT] !== "" &&
      teamStats[idx.HIT] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - Hits " +
          teamWeek.HIT +
          " -> " +
          teamStats[idx.HIT],
      );
      teamWeek.HIT = +teamStats[idx.HIT];
    }

    if (
      +teamWeek.BLK !== +teamStats[idx.BLK] &&
      teamStats[idx.G] &&
      teamStats[idx.BLK] !== "" &&
      teamStats[idx.BLK] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - Blocks " +
          teamWeek.BLK +
          " -> " +
          teamStats[idx.BLK],
      );
      teamWeek.BLK = +teamStats[idx.BLK];
    }

    if (
      +teamWeek.W !== +teamStats[idx.W] &&
      teamStats[idx.G] &&
      teamStats[idx.W] !== "" &&
      teamStats[idx.W] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - Wins " +
          teamWeek.W +
          " -> " +
          teamStats[idx.W],
      );
      teamWeek.W = +teamStats[idx.W];
    }

    if (
      +teamWeek.GA !== +teamStats[idx.GA] &&
      teamStats[idx.G] &&
      teamStats[idx.GA] !== "" &&
      teamStats[idx.GA] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - GA " +
          teamWeek.GA +
          " -> " +
          teamStats[idx.GA],
      );
      teamWeek.GA = +teamStats[idx.GA];
    }

    if (
      +teamWeek.SV !== +teamStats[idx.SV] &&
      teamStats[idx.G] &&
      teamStats[idx.SV] !== "" &&
      teamStats[idx.SV] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - SV " +
          teamWeek.SV +
          " -> " +
          teamStats[idx.SV],
      );
      teamWeek.SV = +teamStats[idx.SV];
    }

    if (
      +teamWeek.SA !== +teamStats[idx.SA] &&
      teamStats[idx.G] &&
      teamStats[idx.SA] !== "" &&
      teamStats[idx.SA] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - SA " +
          teamWeek.SA +
          " -> " +
          teamStats[idx.SA],
      );
      teamWeek.SA = +teamStats[idx.SA];
    }

    if (
      +teamWeek.GAA !== +teamStats[idx.GAA] &&
      teamStats[idx.G] &&
      teamStats[idx.GAA] !== "" &&
      teamStats[idx.GAA] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - GAA " +
          teamWeek.GAA +
          " -> " +
          teamStats[idx.GAA],
      );
      teamWeek.GAA = teamStats[idx.GAA];
    }

    if (
      +teamWeek.SVP !== +(+teamStats[idx.SV] / +teamStats[idx.SA]).toFixed(5) &&
      teamStats[idx.G] &&
      teamStats[idx.SVPGuard] !== "" &&
      teamStats[idx.SVPGuard] !== "-"
    ) {
      console.log(
        matchupTables[0][0] +
          " - SVP " +
          teamWeek.SVP +
          " -> " +
          (+teamStats[idx.SV] / +teamStats[idx.SA]).toFixed(5),
      );
      teamWeek.SVP = +(+teamStats[idx.SV] / +teamStats[idx.SA]).toFixed(5);
    }

    var updatedTeamGP = 0;
    var updatedTeamMG = 0;
    var updatedTeamIR = 0;
    var updatedTeamIRplus = 0;
    var updatedTeamGA = 0;
    var updatedTeamSV = 0;
    var updatedTeamSA = 0;
    var updatedTeamTOI = 0;
    var updatedTeamADD = 0;
    var updatedTeamMS = 0;
    var updatedTeamBS = 0;

    if (teamPlayerWeeks.length === 0) {
      if (createMissingWeeks) {
        matchupTables[1].map((row) => {
          if (row[1] === "(Empty)") return null;
          const plyr = resolvePlayerFromMatchupRowName(
            row[1],
            playersByNormalizedName,
            players,
          );
          if (!plyr) {
            console.log("Missing Player: " + row);
            return null;
          }

          const out = {
            playerId: plyr.id,
            gshlTeamId: teamId,
            weekId: weekKey,
            seasonId: team.seasonId,
            seasonType: resolvedWeekSeasonType,
            yahooId:
              plyr.yahooId === undefined || plyr.yahooId === null
                ? ""
                : String(plyr.yahooId),
            playerName: plyr.fullName || plyr.playerName || plyr.name || "",
            posGroup:
              plyr.posGroup ||
              (plyr.nhlPos &&
              GshlUtils.yahoo &&
              GshlUtils.yahoo.roster &&
              typeof GshlUtils.yahoo.roster.resolvePosGroupFromNhlPos ===
                "function"
                ? GshlUtils.yahoo.roster.resolvePosGroupFromNhlPos(plyr.nhlPos)
                : "F"),
          };
          out.G = +row[2];
          out.A = +row[3];
          out.P = +row[4];
          if (hasPM) out.PM = +row[5];
          out.PPP = +row[hasPM ? 6 : 5];
          out.SOG = +row[hasPM ? 7 : 6];
          out.HIT = +row[hasPM ? 8 : 7];
          out.BLK = +row[hasPM ? 9 : 8];
          playerWeeksOutput.push(out);
          return out;
        });

        matchupTables[2].map((row) => {
          const plyr = resolvePlayerFromMatchupRowName(
            row[1],
            playersByNormalizedName,
            players,
          );
          if (!plyr) {
            console.log("Missing Player: " + row);
            return null;
          }

          const out = {
            playerId: plyr.id,
            gshlTeamId: teamId,
            weekId: weekKey,
            seasonId: team.seasonId,
            seasonType: resolvedWeekSeasonType,
            yahooId:
              plyr.yahooId === undefined || plyr.yahooId === null
                ? ""
                : String(plyr.yahooId),
            playerName: plyr.fullName || plyr.playerName || plyr.name || "",
            posGroup: "G",
          };
          out.W = +row[2];
          out.GAA = row[3];
          out.SVP = +row[4];
          playerWeeksOutput.push(out);
          return out;
        });
      }
    } else {
      teamPlayerWeeks = teamPlayerWeeks.map((pd) => {
        const plyr = playerById.get(String(pd.playerId));
        if (!plyr) {
          console.log("Missing Player: " + pd);
          return null;
        }

        // Ensure non-stat metadata is present (matchup tables do not contain this).
        if (
          pd.seasonType === undefined ||
          pd.seasonType === null ||
          pd.seasonType === ""
        ) {
          pd.seasonType = resolvedWeekSeasonType;
        }
        if (
          pd.yahooId === undefined ||
          pd.yahooId === null ||
          pd.yahooId === ""
        ) {
          pd.yahooId =
            plyr.yahooId === undefined || plyr.yahooId === null
              ? ""
              : String(plyr.yahooId);
        }
        if (
          pd.playerName === undefined ||
          pd.playerName === null ||
          pd.playerName === ""
        ) {
          pd.playerName = plyr.fullName || plyr.playerName || plyr.name || "";
        }

        if (!pd.posGroup) {
          pd.posGroup =
            plyr.posGroup ||
            (plyr.nhlPos &&
            GshlUtils.yahoo &&
            GshlUtils.yahoo.roster &&
            typeof GshlUtils.yahoo.roster.resolvePosGroupFromNhlPos ===
              "function"
              ? GshlUtils.yahoo.roster.resolvePosGroupFromNhlPos(plyr.nhlPos)
              : "F");
        }

        updatedTeamGP += +pd.GP || 0;
        updatedTeamMG += +pd.MG || 0;
        updatedTeamIR += +pd.IR || 0;
        updatedTeamIRplus += +pd.IRplus || 0;
        updatedTeamGA += +pd.GA || 0;
        updatedTeamSV += +pd.SV || 0;
        updatedTeamSA += +pd.SA || 0;
        updatedTeamTOI += +pd.TOI || 0;
        updatedTeamADD += +pd.ADD || 0;
        updatedTeamMS += +pd.MS || 0;
        updatedTeamBS += +pd.BS || 0;

        if (pd.posGroup === "G") {
          const goalieStats = matchupTables[2].find(
            (b) =>
              b[1].split("W,")[0].split("L,")[0].split("PPD")[0].trim() ===
              plyr.fullName,
          );
          if (goalieStats) {
            if (
              +pd.W !== +goalieStats[2] &&
              goalieStats[2] &&
              goalieStats[2] !== "" &&
              goalieStats[2] !== "-"
            ) {
              console.log(
                plyr.fullName + " - Wins " + pd.W + " -> " + goalieStats[2],
              );
              pd.W = +goalieStats[2];
            }
            if (
              pd.GAA !== +goalieStats[3] &&
              goalieStats[2] &&
              goalieStats[3] !== "" &&
              goalieStats[3] !== "-"
            ) {
              console.log(
                plyr.fullName +
                  " - Goals Against Avg " +
                  pd.GAA +
                  " -> " +
                  goalieStats[3],
              );
              pd.GAA = goalieStats[3];
            }
            if (
              pd.SVP !== +goalieStats[4] &&
              goalieStats[2] &&
              goalieStats[4] !== "" &&
              goalieStats[4] !== "-"
            ) {
              console.log(
                plyr.fullName +
                  " - Save Percentage " +
                  pd.SVP +
                  " -> " +
                  goalieStats[4],
              );
              pd.SVP = +goalieStats[4];
            }
            playerWeeksOutput.push(pd);
          } else {
            +pd.GP > 0
              ? console.log(
                  plyr.fullName +
                    " - " +
                    pd.GP +
                    " - " +
                    pd.GS +
                    " / " +
                    pd.gshlTeamId +
                    " / " +
                    pd.weekId,
                )
              : null;
            pd.W = null;
            pd.GAA = null;
            pd.SVP = null;
            return pd;
          }
          return pd;
        }

        const skaterStats = matchupTables[1].find(
          (b) =>
            b[1].split("W,")[0].split("L,")[0].split("PPD")[0].trim() ===
            plyr.fullName,
        );

        if (skaterStats) {
          const pmIdx = hasPM ? 5 : null;
          const pppIdx = hasPM ? 6 : 5;
          const sogIdx = hasPM ? 7 : 6;
          const hitIdx = hasPM ? 8 : 7;
          const blkIdx = hasPM ? 9 : 8;

          if (
            +pd.G !== +skaterStats[2] &&
            skaterStats[2] &&
            skaterStats[2] !== "" &&
            skaterStats[2] !== "-"
          ) {
            console.log(
              plyr.fullName + " - Goals " + pd.G + " -> " + skaterStats[2],
            );
            pd.G = +skaterStats[2];
          }
          if (
            +pd.A !== +skaterStats[3] &&
            skaterStats[2] &&
            skaterStats[3] !== "" &&
            skaterStats[3] !== "-"
          ) {
            console.log(
              plyr.fullName + " - Assists " + pd.A + " -> " + skaterStats[3],
            );
            pd.A = +skaterStats[3];
          }
          if (
            +pd.P !== +skaterStats[4] &&
            skaterStats[2] &&
            skaterStats[4] !== "" &&
            skaterStats[4] !== "-"
          ) {
            console.log(
              plyr.fullName + " - Points " + pd.P + " -> " + skaterStats[4],
            );
            pd.P = +skaterStats[4];
          }
          if (
            hasPM &&
            +pd.PM !== +skaterStats[pmIdx] &&
            skaterStats[2] &&
            skaterStats[pmIdx] !== "" &&
            skaterStats[pmIdx] !== "-"
          ) {
            console.log(
              plyr.fullName +
                " - Plus Minus " +
                pd.PM +
                " -> " +
                skaterStats[pmIdx],
            );
            pd.PM = +skaterStats[pmIdx];
          }
          if (
            +pd.PPP !== +skaterStats[pppIdx] &&
            skaterStats[2] &&
            skaterStats[pppIdx] !== "" &&
            skaterStats[pppIdx] !== "-"
          ) {
            console.log(
              plyr.fullName +
                " - Powerplay Points " +
                pd.PPP +
                " -> " +
                skaterStats[pppIdx],
            );
            pd.PPP = +skaterStats[pppIdx];
          }
          if (
            +pd.SOG !== +skaterStats[sogIdx] &&
            skaterStats[2] &&
            skaterStats[sogIdx] !== "" &&
            skaterStats[sogIdx] !== "-"
          ) {
            console.log(
              plyr.fullName +
                " - Shots " +
                pd.SOG +
                " -> " +
                skaterStats[sogIdx],
            );
            pd.SOG = +skaterStats[sogIdx];
          }
          if (
            +pd.HIT !== +skaterStats[hitIdx] &&
            skaterStats[2] &&
            skaterStats[hitIdx] !== "" &&
            skaterStats[hitIdx] !== "-"
          ) {
            console.log(
              plyr.fullName +
                " - Hits " +
                pd.HIT +
                " -> " +
                skaterStats[hitIdx],
            );
            pd.HIT = +skaterStats[hitIdx];
          }
          if (
            +pd.BLK !== +skaterStats[blkIdx] &&
            skaterStats[2] &&
            skaterStats[blkIdx] !== "" &&
            skaterStats[blkIdx] !== "-"
          ) {
            console.log(
              plyr.fullName +
                " - Blocks " +
                pd.BLK +
                " -> " +
                skaterStats[blkIdx],
            );
            pd.BLK = +skaterStats[blkIdx];
          }
          playerWeeksOutput.push(pd);
        } else {
          +pd.GP > 0
            ? console.log(
                plyr.fullName +
                  " - " +
                  pd.GP +
                  " - " +
                  pd.GS +
                  " / " +
                  pd.gshlTeamId +
                  " / " +
                  pd.weekId,
              )
            : null;
          pd.G = null;
          pd.A = null;
          pd.P = null;
          if (hasPM) pd.PM = null;
          pd.PPP = null;
          pd.SOG = null;
          pd.HIT = null;
          pd.BLK = null;
          return pd;
        }
        return pd;
      });

      // Only override these totals when player-week rows exist to aggregate from.
      teamWeek.GA = updatedTeamGA;
      teamWeek.SV = updatedTeamSV;
      teamWeek.SA = updatedTeamSA;
    }

    teamWeek.GP = updatedTeamGP;
    teamWeek.MG = updatedTeamMG;
    teamWeek.IR = updatedTeamIR;
    teamWeek.IRplus = updatedTeamIRplus;
    teamWeek.TOI = updatedTeamTOI;
    teamWeek.ADD = updatedTeamADD;
    teamWeek.MS = updatedTeamMS;
    teamWeek.BS = updatedTeamBS;

    teamWeeksOutput.push(teamWeek);
  }

  /**
   * Applies scraped daily matchup tables to player/day stat lines for one team.
   *
   * Mutates the existing stat line objects and appends them to the provided output array.
   */
  function getMatchupRowPlayerName(row) {
    return row && row[2] !== undefined && row[2] !== null
      ? String(row[2]).trim()
      : "";
  }

  function normalizeMatchupStatValue(value) {
    if (value === undefined || value === null) return "";
    var text = String(value).trim();
    return !text || text === "-" ? "" : text;
  }

  function getMatchupRowDailyPos(row) {
    return normalizeYahooLineupPosition(row && row[0]);
  }

  function buildPlayerDayExistenceKey(teamId, playerId, date) {
    return [
      normalizeSheetKey(teamId),
      normalizeSheetKey(playerId),
      GshlUtils.core.date.formatDateOnly(date) || normalizeSheetKey(date),
    ].join("|");
  }

  function getPlayerDisplayName(player) {
    return (
      (player && (player.fullName || player.playerName || player.name)) || ""
    );
  }

  function getPlayerYahooId(player) {
    return player && player.yahooId !== undefined && player.yahooId !== null
      ? String(player.yahooId)
      : "";
  }

  function buildManualPlayerDayWarningKey(
    teamId,
    date,
    playerId,
    rowName,
    rowType,
  ) {
    return [
      normalizeSheetKey(teamId),
      GshlUtils.core.date.formatDateOnly(date) || normalizeSheetKey(date),
      normalizeSheetKey(playerId),
      normalizeYahooMatchupPlayerName(rowName),
      normalizeSheetKey(rowType),
    ].join("|");
  }

  function collectManualPlayerDayWarningsFromMatchupRows(
    rows,
    rowType,
    players,
    playersByNormalizedName,
    team,
    weekId,
    date,
    existingKeySet,
    outputKeySet,
    manualAddWarnings,
    manualAddWarningKeySet,
  ) {
    (rows || []).forEach(function (row) {
      var rowName = getMatchupRowPlayerName(row);
      if (!rowName || rowName === "(Empty)") return;

      var player = resolvePlayerFromMatchupRowName(
        rowName,
        playersByNormalizedName,
        players,
      );
      if (!player || !player.id) {
        var unresolvedWarningKey = buildManualPlayerDayWarningKey(
          team && team.id,
          date,
          "",
          rowName,
          rowType,
        );
        if (manualAddWarningKeySet.has(unresolvedWarningKey)) return;
        manualAddWarningKeySet.add(unresolvedWarningKey);
        var unresolvedWarning = {
          type: "MANUAL_PLAYER_DAY_ADD_REQUIRED",
          seasonId: normalizeSheetKey(team && team.seasonId),
          weekId: normalizeSheetKey(weekId),
          gshlTeamId: normalizeSheetKey(team && team.id),
          date: GshlUtils.core.date.formatDateOnly(date) || normalizeSheetKey(date),
          playerId: "",
          playerName: rowName,
          rowType: rowType,
          dailyPos: getMatchupRowDailyPos(row),
          reason: "yahoo-player-not-resolved-to-player-sheet",
        };
        manualAddWarnings.push(unresolvedWarning);
        console.log(
          "[YahooScraper] Manual PlayerDay add required; could not resolve Yahoo daily player" +
            " teamId=" +
            normalizeSheetKey(team && team.id) +
            " weekId=" +
            normalizeSheetKey(weekId) +
            " date=" +
            unresolvedWarning.date +
            " rowType=" +
            rowType +
            " playerName=" +
            rowName,
        );
        return;
      }

      var key = buildPlayerDayExistenceKey(team && team.id, player.id, date);
      if (existingKeySet.has(key) || outputKeySet.has(key)) return;
      var warningKey = buildManualPlayerDayWarningKey(
        team && team.id,
        date,
        player.id,
        rowName,
        rowType,
      );
      if (manualAddWarningKeySet.has(warningKey)) return;
      manualAddWarningKeySet.add(warningKey);

      var warning = {
        type: "MANUAL_PLAYER_DAY_ADD_REQUIRED",
        seasonId: normalizeSheetKey(team && team.seasonId),
        weekId: normalizeSheetKey(weekId),
        gshlTeamId: normalizeSheetKey(team && team.id),
        date: GshlUtils.core.date.formatDateOnly(date) || normalizeSheetKey(date),
        playerId: normalizeSheetKey(player.id),
        playerName: getPlayerDisplayName(player) || rowName,
        rowType: rowType,
        dailyPos: getMatchupRowDailyPos(row),
        reason: "player-in-yahoo-daily-table-but-missing-playerday-row",
      };
      manualAddWarnings.push(warning);
      console.log(
        "[YahooScraper] Manual PlayerDay add required" +
          " teamId=" +
          warning.gshlTeamId +
          " weekId=" +
          warning.weekId +
          " date=" +
          warning.date +
          " playerId=" +
          warning.playerId +
          " rowType=" +
          warning.rowType +
          " dailyPos=" +
          warning.dailyPos +
          " playerName=" +
          warning.playerName,
      );
    });
  }

  function processTeamMatchupDate(
    playerById,
    players,
    playersByNormalizedName,
    playerDays,
    matchupTables,
    date,
    team,
    seasonId,
    weekId,
    playerDaysOutput,
    hasPM,
    updateDailyPos,
    manualAddWarnings,
    manualAddWarningKeySet,
  ) {
    if (!team) return;
    const teamId = normalizeSheetKey(team.id);
    let teamPlayerDays = playerDays.filter(
      (pd) => normalizeSheetKey(pd && pd.gshlTeamId) === teamId,
    );
    const existingKeySet = new Set();
    teamPlayerDays.forEach((pd) => {
      if (!pd || !pd.playerId) return;
      existingKeySet.add(
        buildPlayerDayExistenceKey(teamId, pd.playerId, pd.date || date),
      );
    });
    const outputKeySet = new Set();
    (playerDaysOutput || []).forEach((pd) => {
      if (!pd || !pd.playerId || !pd.gshlTeamId || !pd.date) return;
      outputKeySet.add(
        buildPlayerDayExistenceKey(pd.gshlTeamId, pd.playerId, pd.date),
      );
    });

    teamPlayerDays = teamPlayerDays.map((pd) => {
      const plyr = playerById.get(String(pd.playerId));
      if (!plyr) {
        console.log(pd);
        return pd;
      }
      if (pd.posGroup === "G") {
        const stats = matchupTables[1].find((b) =>
          matchesYahooMatchupRowName(b && b[2], plyr),
        );
        if (stats) {
          applyDailyParticipationFlags(
            pd,
            !!(stats[3] && stats[3] !== "" && stats[3] !== "-"),
          );
          if (
            +pd.W !== +stats[3] &&
            stats[3] &&
            stats[3] !== "" &&
            stats[3] !== "-"
          ) {
            console.log(plyr.fullName + " - Wins " + pd.W + " -> " + stats[3]);
            pd.W = +stats[3];
          }
          if (
            pd.GAA != stats[4] &&
            stats[3] &&
            stats[4] !== "" &&
            stats[4] !== "-"
          ) {
            console.log(
              plyr.fullName +
                " - Goals Against Avg " +
                pd.GAA +
                " -> " +
                stats[4],
            );
            pd.GAA = +stats[4];
          }
          if (
            pd.SVP != stats[5] &&
            stats[3] &&
            stats[5] !== "" &&
            stats[5] !== "-"
          ) {
            console.log(
              plyr.fullName +
                " - Save Percentage " +
                pd.SVP +
                " -> " +
                stats[5],
            );
            pd.SVP = +stats[5];
          }
          if (updateDailyPos) {
            var goalieDailyPos = getMatchupRowDailyPos(stats);
            if (goalieDailyPos) {
              pd.dailyPos = goalieDailyPos;
              var updatedGoalieFlags = computeLineupFlagsForPlayer(pd);
              pd.GS = updatedGoalieFlags.GS;
              pd.MS = updatedGoalieFlags.MS;
              pd.BS = updatedGoalieFlags.BS;
            }
          }
          playerDaysOutput.push(pd);
        } else {
          +pd.GP > 0
            ? console.log(
                plyr.fullName +
                  " - " +
                  pd.GP +
                  " - " +
                  pd.GS +
                  " / " +
                  pd.gshlTeamId +
                  " / " +
                  pd.weekId,
              )
            : null;
          logUnmatchedYahooMatchupPlayer(
            pd,
            plyr,
            team,
            date,
            matchupTables[1],
          );
        }
        return pd;
      }
      const stats = matchupTables[0].find((b) =>
        matchesYahooMatchupRowName(b && b[2], plyr),
      );
      if (stats) {
        applyDailyParticipationFlags(
          pd,
          !!(stats[3] && stats[3] !== "" && stats[3] !== "-"),
        );
        if (
          +pd.G !== +stats[3] &&
          stats[3] &&
          stats[3] !== "" &&
          stats[3] !== "-"
        ) {
          console.log(plyr.fullName + " - Goals " + pd.G + " -> " + stats[3]);
          pd.G = +stats[3];
        }
        if (
          +pd.A !== +stats[4] &&
          stats[3] &&
          stats[4] !== "" &&
          stats[4] !== "-"
        ) {
          console.log(plyr.fullName + " - Assists " + pd.A + " -> " + stats[4]);
          pd.A = +stats[4];
        }
        if (
          +pd.P !== +stats[5] &&
          stats[3] &&
          stats[5] !== "" &&
          stats[5] !== "-"
        ) {
          console.log(plyr.fullName + " - Points " + pd.P + " -> " + stats[5]);
          pd.P = +stats[5];
        }
        if (
          +pd.PPP !== +stats[hasPM ? 7 : 6] &&
          stats[3] &&
          stats[hasPM ? 7 : 6] !== "" &&
          stats[hasPM ? 7 : 6] !== "-"
        ) {
          console.log(
            plyr.fullName +
              " - Powerplay Points " +
              pd.PPP +
              " -> " +
              stats[hasPM ? 7 : 6],
          );
          pd.PPP = +stats[hasPM ? 7 : 6];
        }
        if (
          hasPM &&
          +pd.PM !== +stats[6] &&
          stats[3] &&
          stats[6] !== "" &&
          stats[6] !== "-"
        ) {
          console.log(
            plyr.fullName + " - Plus Minus " + pd.PM + " -> " + stats[6],
          );
          pd.PM = +stats[6];
        }
        if (
          +pd.SOG !== +stats[hasPM ? 8 : 7] &&
          stats[3] &&
          stats[hasPM ? 8 : 7] !== "" &&
          stats[hasPM ? 8 : 7] !== "-"
        ) {
          console.log(
            plyr.fullName +
              " - Shots " +
              pd.SOG +
              " -> " +
              stats[hasPM ? 8 : 7],
          );
          pd.SOG = +stats[hasPM ? 8 : 7];
        }
        if (
          +pd.HIT !== +stats[hasPM ? 9 : 8] &&
          stats[3] &&
          stats[hasPM ? 9 : 8] !== "" &&
          stats[hasPM ? 9 : 8] !== "-"
        ) {
          console.log(
            plyr.fullName + " - Hits " + pd.HIT + " -> " + stats[hasPM ? 9 : 8],
          );
          pd.HIT = +stats[hasPM ? 9 : 8];
        }
        if (
          +pd.BLK !== +stats[hasPM ? 10 : 9] &&
          stats[3] &&
          stats[hasPM ? 10 : 9] !== "" &&
          stats[hasPM ? 10 : 9] !== "-"
        ) {
          console.log(
            plyr.fullName +
              " - Blocks " +
              pd.BLK +
              " -> " +
              stats[hasPM ? 10 : 9],
          );
          pd.BLK = +stats[hasPM ? 10 : 9];
        }
        if (updateDailyPos) {
          var skaterDailyPos = getMatchupRowDailyPos(stats);
          if (skaterDailyPos) {
            pd.dailyPos = skaterDailyPos;
            var updatedFlags = computeLineupFlagsForPlayer(pd);
            pd.GS = updatedFlags.GS;
            pd.MS = updatedFlags.MS;
            pd.BS = updatedFlags.BS;
          }
        }
        playerDaysOutput.push(pd);
      } else {
        +pd.GP > 0
          ? console.log(
              plyr.fullName +
                " - " +
                pd.GP +
                " - " +
                pd.GS +
                " / " +
                pd.gshlTeamId +
                " / " +
                pd.weekId,
            )
          : null;
        logUnmatchedYahooMatchupPlayer(pd, plyr, team, date, matchupTables[0]);
      }
      return pd;
    });

    collectManualPlayerDayWarningsFromMatchupRows(
      matchupTables[0],
      "skater",
      players,
      playersByNormalizedName,
      team,
      weekId,
      date,
      existingKeySet,
      outputKeySet,
      manualAddWarnings,
      manualAddWarningKeySet,
    );
    collectManualPlayerDayWarningsFromMatchupRows(
      matchupTables[1],
      "goalie",
      players,
      playersByNormalizedName,
      team,
      weekId,
      date,
      existingKeySet,
      outputKeySet,
      manualAddWarnings,
      manualAddWarningKeySet,
    );
  }

  /**
   * Rebuilds derived team stats (day/week/season) and matchup results from existing stat lines.
   *
   * This is used by the `seasonStats` workflow.
   */
  function updateTeamStatsFromWeeks(
    seasonId,
    weeks,
    teams,
    playerDays,
    playerWeeks,
    teamWeeks,
  ) {
    const fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
    const upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;
    const formatDateOnly = GshlUtils.core.date.formatDateOnly;
    const isStarter = GshlUtils.domain.players.isStarter;
    const { parseScore, toBool, toNumber, formatNumber } = GshlUtils.core.parse;
    const { SeasonType, TEAM_STAT_FIELDS } = GshlUtils.core.constants;
    const TEAM_ALWAYS_SUM_FIELDS = [
      "GP",
      "MG",
      "IR",
      "IRplus",
      "GS",
      "ADD",
      "MS",
      "BS",
    ];
    const TEAM_SKATER_STARTER_FIELDS = [
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
    const TEAM_GOALIE_STARTER_FIELDS = ["W", "GA", "SV", "SA", "SO", "TOI"];

    const weekTypeMap = new Map();
    weeks.forEach((week) => {
      weekTypeMap.set(
        week.id.toString(),
        week.weekType || SeasonType.REGULAR_SEASON,
      );
    });
    const franchises = fetchSheetAsObjects(SPREADSHEET_ID, "Franchise");
    const franchiseConfMap = new Map();
    franchises.forEach((franchise) => {
      const franchiseId = franchise.id?.toString();
      if (!franchiseId) return;
      const franchiseConfId = franchise.confId?.toString();
      if (franchiseConfId) {
        franchiseConfMap.set(franchiseId, franchiseConfId);
      }
    });
    const teamConfMap = new Map();
    teams.forEach((team) => {
      const teamId = team.id?.toString();
      if (!teamId) return;
      const teamConfId = team.confId?.toString();
      const franchiseId = team.franchiseId?.toString();
      const fallbackConfId = franchiseId
        ? franchiseConfMap.get(franchiseId)
        : null;
      const resolvedConfId = teamConfId || fallbackConfId;
      if (resolvedConfId) {
        teamConfMap.set(teamId, resolvedConfId);
      }
    });
    const matchups = fetchSheetAsObjects(SPREADSHEET_ID, "Matchup")
      .filter((m) => m.seasonId === seasonId)
      .map((m) => {
        const homeTeam = teams.find((t) => +t.id === +m.homeTeamId);
        const awayTeam = teams.find((t) => +t.id === +m.awayTeamId);
        const homeWeek = teamWeeks.find(
          (tw) => +tw.gshlTeamId === +homeTeam.id && +tw.weekId === +m.weekId,
        );
        const homeGSg = playerWeeks
          .filter(
            (pd) =>
              pd.posGroup === "G" &&
              +pd.gshlTeamId === +homeTeam.id &&
              +pd.weekId === +m.weekId,
          )
          .reduce((p, c) => (p += +c.GS), 0);
        const awayWeek = teamWeeks.find(
          (tw) => +tw.gshlTeamId === +awayTeam.id && +tw.weekId === +m.weekId,
        );
        const awayGSg = playerWeeks
          .filter(
            (pd) =>
              pd.posGroup === "G" &&
              +pd.gshlTeamId === +awayTeam.id &&
              +pd.weekId === +m.weekId,
          )
          .reduce((p, c) => (p += +c.GS), 0);
        var homeScore = 0;
        var awayScore = 0;
        homeWeek.G > awayWeek.G
          ? homeScore++
          : homeWeek.G < awayWeek.G
            ? awayScore++
            : null;
        homeWeek.A > awayWeek.A
          ? homeScore++
          : homeWeek.A < awayWeek.A
            ? awayScore++
            : null;
        homeWeek.P > awayWeek.P
          ? homeScore++
          : homeWeek.P < awayWeek.P
            ? awayScore++
            : null;
        homeWeek.PPP > awayWeek.PPP
          ? homeScore++
          : homeWeek.PPP < awayWeek.PPP
            ? awayScore++
            : null;
        homeWeek.SOG > awayWeek.SOG
          ? homeScore++
          : homeWeek.SOG < awayWeek.SOG
            ? awayScore++
            : null;
        homeWeek.HIT > awayWeek.HIT
          ? homeScore++
          : homeWeek.HIT < awayWeek.HIT
            ? awayScore++
            : null;
        homeWeek.BLK > awayWeek.BLK
          ? homeScore++
          : homeWeek.BLK < awayWeek.BLK
            ? awayScore++
            : null;
        if (homeGSg >= 2 && awayGSg >= 2) {
          homeWeek.W > awayWeek.W
            ? homeScore++
            : homeWeek.W < awayWeek.W
              ? awayScore++
              : null;
          homeWeek.GAA < awayWeek.GAA
            ? homeScore++
            : homeWeek.GAA > awayWeek.GAA
              ? awayScore++
              : null;
          homeWeek.SVP > awayWeek.SVP
            ? homeScore++
            : homeWeek.SVP < awayWeek.SVP
              ? awayScore++
              : null;
        } else {
          if (homeGSg >= 2 && awayGSg < 2) {
            homeScore++;
            homeScore++;
            homeScore++;
          } else if (homeGSg < 2 && awayGSg >= 2) {
            awayScore++;
            awayScore++;
            awayScore++;
          }
        }
        return {
          id: m.id,
          seasonId: m.seasonId,
          weekId: m.weekId?.toString(),
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          homeScore: parseScore(homeScore),
          awayScore: parseScore(awayScore),
          homeWin: homeScore >= awayScore ? toBool("TRUE") : toBool("FALSE"),
          awayWin: homeScore < awayScore ? toBool("TRUE") : toBool("FALSE"),
          tie: toBool("FALSE"),
          isComplete: toBool("TRUE"),
        };
      });

    const teamDayMap = new Map();
    playerDays.forEach((pd) => {
      const teamId = pd.gshlTeamId?.toString();
      const weekId = pd.weekId?.toString();
      if (!teamId || !weekId) return;
      const dateKey = formatDateOnly(pd.date);
      const mapKey = `${teamId}_${dateKey}`;
      if (!teamDayMap.has(mapKey)) {
        teamDayMap.set(
          mapKey,
          StatsAggregator.internals.createTeamDayBucket(
            seasonId,
            teamId,
            weekId,
            dateKey,
          ),
        );
      }
      const bucket = teamDayMap.get(mapKey);

      TEAM_ALWAYS_SUM_FIELDS.forEach((field) => {
        bucket[field] += toNumber(pd[field]);
      });

      if (!isStarter(pd)) return;

      if (String(pd.posGroup || "") === "G") {
        TEAM_GOALIE_STARTER_FIELDS.forEach((field) => {
          bucket[field] += toNumber(pd[field]);
        });
        return;
      }

      TEAM_SKATER_STARTER_FIELDS.forEach((field) => {
        bucket[field] += toNumber(pd[field]);
      });
    });

    if (!teamDayMap.size) return;

    const teamDayAggregates = Array.from(teamDayMap.values());
    const teamDayRows = teamDayAggregates.map(
      StatsAggregator.internals.buildTeamDayRow,
    );

    const teamWeekMap = new Map();
    teamDayAggregates.forEach((day) => {
      const key = `${day.weekId}_${day.gshlTeamId}`;
      if (!teamWeekMap.has(key)) {
        teamWeekMap.set(
          key,
          StatsAggregator.internals.createTeamWeekBucket(day),
        );
      }
      const weekBucket = teamWeekMap.get(key);
      weekBucket.days = weeks.find((x) => x.id === day.weekId).gameDays;
      TEAM_STAT_FIELDS.forEach((field) => {
        weekBucket[field] += day[field];
      });
    });

    const teamWeekAggregates = Array.from(teamWeekMap.values());
    const teamWeekRows = teamWeekAggregates
      .map((x) => {
        const gsG = playerWeeks
          .filter(
            (pd) =>
              pd.posGroup === "G" &&
              +pd.gshlTeamId === +x.gshlTeamIds &&
              +pd.weekId === +x.weekId,
          )
          .reduce((p, c) => (p += +c.GS), 0);
        if (gsG < 2) {
          x.W = "";
          x.GA = "";
          x.GAA = "";
          x.SV = "";
          x.SA = "";
          x.SVP = "";
          x.TOI = "";
        }
        return x;
      })
      .map(buildTeamWeekCustomRow);

    const teamSeasonStats = calculateTeamSeasonCustomStats(
      teamWeeks,
      matchups,
      teamConfMap,
      playerWeeks,
      weeks,
    );
    const teamSeasonRows = teamSeasonStats.map(
      StatsAggregator.internals.buildTeamSeasonRow,
    );

    upsertSheetByKeys(SPREADSHEET_ID, "Matchup", ["id"], matchups, {
      idColumn: "id",
      createdAtColumn: "createdAt",
      updatedAtColumn: "updatedAt",
    });

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
  }

  /**
   * Formats a TeamWeek stat bucket into the custom row shape expected by sheets.
   */
  function buildTeamWeekCustomRow(week) {
    const { formatNumber } = GshlUtils.core.parse;

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
      ADD: formatNumber(week.ADD),
      MS: formatNumber(week.MS),
      BS: formatNumber(week.BS),
    };
  }

  /**
   * Aggregates season-level team stats from weekly stats + matchups, then ranks teams.
   *
   * @returns {Object[]} TeamSeasonStatLine rows.
   */
  function calculateTeamSeasonCustomStats(
    teamWeeks,
    matchups,
    teamConfMap,
    playerWeeks,
    allWeeks,
  ) {
    const { SeasonType, TEAM_STAT_FIELDS } = GshlUtils.core.constants;
    const { toNumber } = GshlUtils.core.parse;

    const weekIdsBySeasonType = new Map();
    weekIdsBySeasonType.set(
      SeasonType.REGULAR_SEASON,
      new Set(
        allWeeks
          .filter(
            (w) =>
              (w.weekType || SeasonType.REGULAR_SEASON) ===
              SeasonType.REGULAR_SEASON,
          )
          .map((w) => w.id.toString()),
      ),
    );
    weekIdsBySeasonType.set(
      SeasonType.PLAYOFFS,
      new Set(
        allWeeks
          .filter((w) => w.weekType === SeasonType.PLAYOFFS)
          .map((w) => w.id.toString()),
      ),
    );
    weekIdsBySeasonType.set(
      SeasonType.LOSERS_TOURNAMENT,
      new Set(
        allWeeks
          .filter((w) => w.weekType === SeasonType.LOSERS_TOURNAMENT)
          .map((w) => w.id.toString()),
      ),
    );

    const weekTypeMap = new Map(
      allWeeks.map((w) => [
        w.id.toString(),
        w.weekType || SeasonType.REGULAR_SEASON,
      ]),
    );

    const teamGroups = new Map();
    teamWeeks.forEach((week) => {
      const weekType =
        weekTypeMap.get(week.weekId) || SeasonType.REGULAR_SEASON;
      const key = `${week.gshlTeamId}:${weekType}`;
      if (!teamGroups.has(key)) {
        teamGroups.set(key, { weeks: [], seasonType: weekType });
      }
      teamGroups.get(key).weeks.push(week);
    });

    const teamSeasonStats = [];

    teamGroups.forEach((group, key) => {
      const teamId = key.split(":")[0];
      if (!group.weeks.length) return;
      const seasonId = group.weeks[0].seasonId;
      const aggregated = {
        days: 0,
        GP: 0,
        MG: 0,
        IR: 0,
        IRplus: 0,
        GS: 0,
        G: 0,
        A: 0,
        P: 0,
        PM: 0,
        PIM: 0,
        PPP: 0,
        SOG: 0,
        HIT: 0,
        BLK: 0,
        W: 0,
        GA: 0,
        SV: 0,
        SA: 0,
        SO: 0,
        TOI: 0,
        ADD: 0,
        MS: 0,
        BS: 0,
      };

      group.weeks.forEach((week) => {
        aggregated.days += week.days;
        TEAM_STAT_FIELDS.forEach((field) => {
          aggregated[field] += toNumber(week[field]);
        });
      });

      const GAA =
        aggregated.TOI > 0 ? (aggregated.GA / aggregated.TOI) * 60 : 0;
      const SVP = aggregated.SA > 0 ? aggregated.SV / aggregated.SA : 0;

      const seasonType = group.seasonType;
      const weekIdsInSeasonType =
        weekIdsBySeasonType.get(seasonType) ||
        weekIdsBySeasonType.get(SeasonType.REGULAR_SEASON) ||
        new Set();

      const teamMatchups = matchups.filter((m) => {
        if (!weekIdsInSeasonType.has(m.weekId)) return false;
        if (!matchupHasOutcome(m)) return false;
        return m.homeTeamId === teamId || m.awayTeamId === teamId;
      });
      const playerWeeksData = playerWeeks.filter(
        (m) =>
          !weekIdsInSeasonType.has(m.weekId) &&
          (m.homeTeamId === teamId || m.awayTeamId === teamId),
      );

      const sortedMatchups = [...teamMatchups].sort((a, b) =>
        a.weekId.localeCompare(b.weekId),
      );

      let teamW = 0;
      let teamHW = 0;
      let teamHL = 0;
      let teamL = 0;
      let teamCCW = 0;
      let teamCCHW = 0;
      let teamCCHL = 0;
      let teamCCL = 0;
      const recentResults = [];

      sortedMatchups.forEach((matchup) => {
        const isHome = matchup.homeTeamId === teamId;
        const opponentId = isHome ? matchup.awayTeamId : matchup.homeTeamId;
        const opponentConf = teamConfMap.get(opponentId);
        const teamConf = teamConfMap.get(teamId);
        const isConference =
          teamConf && opponentConf && teamConf === opponentConf;
        const homeScore = matchup.homeScore;
        const awayScore = matchup.awayScore;
        const hasScores = homeScore !== null && awayScore !== null;
        let isHomeWin = matchup.homeWin;
        let isAwayWin = matchup.awayWin;
        const scoresWereEqual = hasScores && homeScore === awayScore;
        let result = null;

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

      let streak = "";
      if (recentResults.length > 0) {
        const lastResult = recentResults[recentResults.length - 1];
        let streakCount = 1;
        for (let i = recentResults.length - 2; i >= 0; i--) {
          if (recentResults[i] === lastResult) {
            streakCount++;
          } else {
            break;
          }
        }
        streak = `${streakCount}${lastResult}`;
      }

      const playersUsed = playerWeeksData.filter(
        (x) => +x.gshlTeamId === +teamId,
      ).length;

      teamSeasonStats.push({
        id: `${teamId}-${seasonId}-${seasonType}`,
        seasonId,
        seasonType,
        gshlTeamId: teamId,
        days: aggregated.days,
        GP: aggregated.GP,
        MG: aggregated.MG,
        IR: aggregated.IR,
        IRplus: aggregated.IRplus,
        GS: aggregated.GS,
        G: aggregated.G,
        A: aggregated.A,
        P: aggregated.P,
        PM: aggregated.PM,
        PIM: aggregated.PIM,
        PPP: aggregated.PPP,
        SOG: aggregated.SOG,
        HIT: aggregated.HIT,
        BLK: aggregated.BLK,
        W: aggregated.W,
        GA: aggregated.GA,
        GAA,
        SV: aggregated.SV,
        SA: aggregated.SA,
        SVP,
        SO: aggregated.SO,
        TOI: aggregated.TOI,
        Rating: 0,
        ADD: aggregated.ADD,
        MS: aggregated.MS,
        BS: aggregated.BS,
        streak,
        powerRk: 0,
        powerRating: 0,
        prevPowerRk: 0,
        prevPowerRating: 0,
        teamW,
        teamHW,
        teamHL,
        teamL,
        teamCCW,
        teamCCHW,
        teamCCHL,
        teamCCL,
        overallRk: 0,
        conferenceRk: null,
        wildcardRk: null,
        playersUsed,
        norrisRating: null,
        norrisRk: null,
        vezinaRating: null,
        vezinaRk: null,
        calderRating: null,
        calderRk: null,
        jackAdamsRating: null,
        jackAdamsRk: null,
        GMOYRating: null,
        GMOYRk: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    return calculateRankings(
      teamSeasonStats,
      teamConfMap,
      matchups,
      weekIdsBySeasonType,
    );
  }

  /**
   * Builds and upserts player season stat lines:
   * - split by team (PlayerSplitStatLine)
   * - totals across teams (PlayerTotalStatLine)
   */
  function updatePlayerStatsForSeasonCustom(seasonId, playerWeeks) {
    const upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;

    const playerSplits = [];
    const playerTotals = [];

    const playerSplitsMap = new Map();
    const playerTotalsMap = new Map();
    playerWeeks.forEach((pw) => {
      const totalKey = `${pw.playerId}|${pw.seasonType}`;
      if (!playerTotalsMap.has(totalKey)) {
        playerTotalsMap.set(totalKey, []);
      }
      playerTotalsMap.get(totalKey).push(pw);

      const splitKey = `${pw.playerId}|${pw.gshlTeamId}|${pw.seasonType}`;
      if (!playerSplitsMap.has(splitKey)) {
        playerSplitsMap.set(splitKey, []);
      }
      playerSplitsMap.get(splitKey).push(pw);
    });

    playerSplitsMap.forEach((weeks, splitKey) => {
      if (!weeks.length) return;
      const firstWeek = weeks[0];
      const [playerId, gshlTeamId, seasonType] = splitKey.split("|");
      const playerSplitStatLine = {
        playerId,
        gshlTeamId,
        seasonId,
        seasonType,
        nhlPos: Array.from(
          new Set(weeks.map((a) => a.nhlPos.split(",")).flat()),
        ).toString(),
        posGroup: firstWeek.posGroup,
        nhlTeam: Array.from(
          new Set(weeks.map((a) => a.nhlTeam.split(",")).flat()),
        ).toString(),
        days: weeks.reduce((p, c) => (p += +c.days), 0).toString(),
        GP: weeks.reduce((p, c) => (p += +c.GP), 0).toString(),
        MG: weeks.reduce((p, c) => (p += +c.MG), 0).toString(),
        IR: weeks.reduce((p, c) => (p += +c.IR), 0).toString(),
        IRplus: weeks.reduce((p, c) => (p += +c.IRplus), 0).toString(),
        GS: weeks.reduce((p, c) => (p += +c.GS), 0).toString(),
        G:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.G), 0).toString(),
        A:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.A), 0).toString(),
        P:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.P), 0).toString(),
        PM:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.PM), 0).toString(),
        PIM:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.PIM), 0).toString(),
        PPP:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.PPP), 0).toString(),
        SOG:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.SOG), 0).toString(),
        HIT:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.HIT), 0).toString(),
        BLK:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.BLK), 0).toString(),
        W:
          firstWeek.posGroup !== "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.W), 0).toString(),
        GA:
          firstWeek.posGroup !== "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.GA), 0).toString(),
        SV:
          firstWeek.posGroup !== "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.SV), 0).toString(),
        SA:
          firstWeek.posGroup !== "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.SA), 0).toString(),
        SO:
          firstWeek.posGroup !== "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.SO), 0).toString(),
        TOI:
          firstWeek.posGroup !== "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.TOI), 0).toString(),
        ADD: weeks.reduce((p, c) => (p += +c.ADD), 0).toString(),
        MS: weeks.reduce((p, c) => (p += +c.MS), 0).toString(),
        BS: weeks.reduce((p, c) => (p += +c.BS), 0).toString(),
      };
      playerSplitStatLine.GAA =
        +playerSplitStatLine.TOI > 0
          ? ((playerSplitStatLine.GA / playerSplitStatLine.TOI) * 60)
              .toFixed(5)
              .toString()
          : "";
      playerSplitStatLine.SVP =
        +playerSplitStatLine.SA > 0
          ? (playerSplitStatLine.SV / playerSplitStatLine.SA)
              .toFixed(6)
              .toString()
          : "";
      playerSplits.push(playerSplitStatLine);
    });

    playerTotalsMap.forEach((weeks, totalKey) => {
      if (!weeks.length) return;
      const firstWeek = weeks[0];
      const [playerId, seasonType] = totalKey.split("|");
      const playerTotalStatLine = {
        playerId,
        seasonId,
        seasonType,
        gshlTeamIds: Array.from(
          new Set(weeks.map((a) => a.gshlTeamId.split(",")).flat()),
        ).toString(),
        nhlPos: Array.from(
          new Set(weeks.map((a) => a.nhlPos.split(",")).flat()),
        ).toString(),
        posGroup: firstWeek.posGroup,
        nhlTeam: Array.from(
          new Set(weeks.map((a) => a.nhlTeam.split(",")).flat()),
        ).toString(),
        days: weeks.reduce((p, c) => (p += +c.days), 0).toString(),
        GP: weeks.reduce((p, c) => (p += +c.GP), 0).toString(),
        MG: weeks.reduce((p, c) => (p += +c.MG), 0).toString(),
        IR: weeks.reduce((p, c) => (p += +c.IR), 0).toString(),
        IRplus: weeks.reduce((p, c) => (p += +c.IRplus), 0).toString(),
        GS: weeks.reduce((p, c) => (p += +c.GS), 0).toString(),
        G:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.G), 0).toString(),
        A:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.A), 0).toString(),
        P:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.P), 0).toString(),
        PM:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.PM), 0).toString(),
        PIM:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.PIM), 0).toString(),
        PPP:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.PPP), 0).toString(),
        SOG:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.SOG), 0).toString(),
        HIT:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.HIT), 0).toString(),
        BLK:
          firstWeek.posGroup === "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.BLK), 0).toString(),
        W:
          firstWeek.posGroup !== "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.W), 0).toString(),
        GA:
          firstWeek.posGroup !== "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.GA), 0).toString(),
        SV:
          firstWeek.posGroup !== "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.SV), 0).toString(),
        SA:
          firstWeek.posGroup !== "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.SA), 0).toString(),
        SO:
          firstWeek.posGroup !== "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.SO), 0).toString(),
        TOI:
          firstWeek.posGroup !== "G"
            ? ""
            : weeks.reduce((p, c) => (p += +c.TOI), 0).toString(),
        ADD: weeks.reduce((p, c) => (p += +c.ADD), 0).toString(),
        MS: weeks.reduce((p, c) => (p += +c.MS), 0).toString(),
        BS: weeks.reduce((p, c) => (p += +c.BS), 0).toString(),
      };
      playerTotalStatLine.GAA =
        +playerTotalStatLine.TOI > 0
          ? ((playerTotalStatLine.GA / playerTotalStatLine.TOI) * 60)
              .toFixed(5)
              .toString()
          : "";
      playerTotalStatLine.SVP =
        +playerTotalStatLine.SA > 0
          ? (playerTotalStatLine.SV / playerTotalStatLine.SA)
              .toFixed(6)
              .toString()
          : "";
      playerTotals.push(playerTotalStatLine);
    });

    rankRowsIfAvailable(playerSplits, "PlayerSplitStatLine", "Rating");
    rankRowsIfAvailable(playerTotals, "PlayerTotalStatLine", "Rating");

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
  }

  /**
   * Fetches the provided Yahoo URL and parses all tables.
   * @param {string} url
   * @param {{cookie?: string, headers?: Object}} [options]
   * @returns {{url: string, fetchedAt: string, httpStatus: number, tables: Array<{index: number, caption: string, headers: string[], rows: string[][]}>}}
   */
  function fetchYahooMatchupTables(url, options) {
    if (!url) throw new Error("fetchYahooMatchupTables: url is required");

    var response = fetchYahooHtml(url, options);
    var html = response.html;

    var tableHtmlList = extractHtmlTables(html);
    var tables = tableHtmlList.map(function (tableHtml, idx) {
      var parsed = parseHtmlTable(tableHtml);
      return {
        index: idx,
        caption: parsed.caption,
        headers: parsed.headers,
        rows: parsed.rows,
      };
    });

    return {
      url: url,
      fetchedAt: new Date().toISOString(),
      httpStatus: response.status,
      tables: tables,
    };
  }

  /**
   * Fetches a Yahoo page and returns the HTTP status + HTML.
   *
   * Supports optional cookie/header overrides. If no cookie is supplied, attempts
   * to read `YAHOO_COOKIE` from Script Properties.
   */
  function fetchYahooHtml(url, options) {
    var opts = options || {};
    var headers = {};

    // Caller-supplied headers win.
    if (opts.headers) {
      Object.keys(opts.headers).forEach(function (k) {
        headers[k] = opts.headers[k];
      });
    }

    // Best-effort cookie support via Script Properties.
    if (!headers.Cookie) {
      var cookie = opts.cookie || getYahooCookieFromScriptProperties();
      if (cookie) headers.Cookie = cookie;
    }

    // A reasonable UA helps avoid some anti-bot responses.
    if (!headers["User-Agent"]) {
      headers["User-Agent"] =
        "Mozilla/5.0 (compatible; GSHL-AppsScript/1.0; +https://hockey.fantasysports.yahoo.com/)";
    }

    var res = UrlFetchApp.fetch(url, {
      method: "get",
      followRedirects: true,
      muteHttpExceptions: true,
      headers: headers,
    });

    var status = res.getResponseCode();
    var html = res.getContentText() || "";

    return { status: status, html: html };
  }

  /**
   * Reads the Yahoo auth cookie (`YAHOO_COOKIE`) from Script Properties.
   *
   * Uses `getScriptPropertiesSnapshot()` if present, otherwise falls back to
   * `PropertiesService.getScriptProperties()`.
   */
  function getYahooCookieFromScriptProperties() {
    try {
      // Prefer the repo’s cached property snapshot helper if available.
      if (typeof getScriptPropertiesSnapshot === "function") {
        var props = getScriptPropertiesSnapshot() || {};
        var v = props.YAHOO_COOKIE;
        return v ? String(v) : "";
      }

      // Fallback: direct read.
      var props2 =
        PropertiesService.getScriptProperties().getProperties() || {};
      return props2.YAHOO_COOKIE ? String(props2.YAHOO_COOKIE) : "";
    } catch (_err) {
      return "";
    }
  }

  /**
   * Extracts raw <table> HTML blocks from a document.
   * @returns {string[]}
   */
  function extractHtmlTables(html) {
    if (!html) return [];
    var matches = html.match(/<table\b[\s\S]*?<\/table>/gi);
    return matches || [];
  }

  /**
   * Parses a <table> HTML block into caption/headers/rows.
   * @returns {{caption: string, headers: string[], rows: string[][]}}
   */
  function parseHtmlTable(tableHtml) {
    var caption = "";
    var captionMatch = tableHtml.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
    if (captionMatch) caption = htmlToText(captionMatch[1]);

    // Extract rows.
    var rowMatches = tableHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    var rows = [];
    var headers = [];

    rowMatches.forEach(function (rowHtml) {
      var cellMatches =
        rowHtml.match(/<(th|td)\b[^>]*>([\s\S]*?)<\/(th|td)>/gi) || [];

      if (!cellMatches.length) return;

      var cells = cellMatches.map(function (cellHtml) {
        // Strip the outer tag, keep inner.
        var innerMatch = cellHtml.match(
          /<(th|td)\b[^>]*>([\s\S]*?)<\/(th|td)>/i,
        );
        return innerMatch ? htmlToText(innerMatch[2]) : htmlToText(cellHtml);
      });

      // If the row contains THs, treat it as header-ish.
      var hasTh = /<th\b/i.test(rowHtml);
      if (hasTh && headers.length === 0) {
        headers = cells;
        return;
      }

      rows.push(cells);
    });

    // Some tables put headers in <thead> and <th> rows after an initial <th> stub.
    // If we still have no headers but we have rows, use the first row as headers.
    if (headers.length === 0 && rows.length > 0) {
      headers = rows[0];
      rows = rows.slice(1);
    }

    return { caption: caption, headers: headers, rows: rows };
  }

  /**
   * Converts HTML snippets to plain text.
   *
   * Uses `cleanText()` if available (repo helper), then decodes common entities.
   */
  function htmlToText(html) {
    const cleanText = GshlUtils.yahoo.html.cleanText;

    if (!html) return "";

    // Leverage the repo’s existing helper if loaded.
    if (typeof cleanText === "function") {
      // cleanText already strips tags + trims (but doesn't decode common entities)
      return decodeHtmlEntities(
        cleanText(String(html).replace(/<br\s*\/?\s*>/gi, "\n")),
      );
    }

    var s = String(html);
    s = s.replace(/<br\s*\/?\s*>/gi, "\n");
    s = s.replace(/<[^>]*>/g, "");
    s = s.trim();
    return decodeHtmlEntities(s);
  }

  /**
   * Decodes a subset of common HTML entities (named + numeric).
   */
  function decodeHtmlEntities(text) {
    if (!text) return "";
    var s = String(text);

    // Common named entities
    s = s
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Numeric entities: decimal (&#123;) and hex (&#x1A;)
    s = s.replace(/&#(\d+);/g, function (_m, dec) {
      var code = Number(dec);
      if (!isFinite(code)) return "";
      try {
        return String.fromCharCode(code);
      } catch (_e) {
        return "";
      }
    });

    s = s.replace(/&#x([0-9a-fA-F]+);/g, function (_m, hex) {
      var code = parseInt(hex, 16);
      if (!isFinite(code)) return "";
      try {
        return String.fromCharCode(code);
      } catch (_e) {
        return "";
      }
    });

    return s;
  }

})(YahooScraper);
