/**
 * GSHL Yahoo Scraper
 *
 * Fetches team rosters from Yahoo Fantasy Hockey and processes player data
 */

// @ts-nocheck

function ensurePlayerRatings(statLines) {
  if (!Array.isArray(statLines)) return;
  statLines.forEach(function (line) {
    if (
      !line ||
      (line.Rating !== undefined && line.Rating !== null && line.Rating !== "")
    ) {
      return;
    }
    var ratingResult = RankingEngine.rankPerformance(line);
    if (ratingResult && ratingResult.score !== undefined) {
      line.Rating = ratingResult.score;
    }
  });
}

function updatePlayerDays() {
  const now = new Date();
  if (shouldSkipYahooScrapeWindow(now)) return;

  try {
    const targetDate = getTargetDateForScraping();
    const prevDate = getPreviousDate(targetDate);
    const context = loadYahooScrapeContext(targetDate);
    const lookups = createScraperLookups(context, targetDate, prevDate);
    const seasonIdStr = context.season.id.toString();
    const weekIdStr = context.week.id.toString();
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

    upsertSheetByKeys(
      CURRENT_PLAYERDAY_SPREADSHEET_ID,
      "PlayerDayStatLine",
      ["playerId", "gshlTeamId", "date"],
      playerDays,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
        deleteMissing: { date: targetDate },
      },
    );

    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamDayStatLine",
      ["gshlTeamId", "date"],
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
  const season = fetchSheetAsObjects(SPREADSHEET_ID, "Season").find((s) =>
    isDateInRange(targetDate, s.startDate, s.endDate),
  );
  const week = fetchSheetAsObjects(SPREADSHEET_ID, "Week").find((s) =>
    isDateInRange(targetDate, s.startDate, s.endDate),
  );
  const players = fetchSheetAsObjects(SPREADSHEET_ID, "Player").filter(
    (p) => p.isActive,
  );
  const franchises = fetchSheetAsObjects(SPREADSHEET_ID, "Franchise").filter(
    (f) => f.isActive,
  );
  const teams = fetchSheetAsObjects(SPREADSHEET_ID, "Team").filter(
    (t) => t.seasonId === season.id,
  );
  const existingPlayerDays = fetchSheetAsObjects(
    CURRENT_PLAYERDAY_SPREADSHEET_ID,
    "PlayerDayStatLine",
  );

  return {
    season,
    week,
    players,
    franchises,
    teams,
    existingPlayerDays,
  };
}

function createScraperLookups(context, targetDate, prevDate) {
  const playersByYahooId = new Map();
  context.players.forEach((player) => {
    playersByYahooId.set(player.yahooId, player);
  });

  const teamsByFranchiseId = new Map();
  context.teams.forEach((team) => {
    teamsByFranchiseId.set(team.franchiseId, team);
  });

  const { yesterdayMap, existingMap } = buildExistingPlayerDayMaps(
    context.existingPlayerDays,
    targetDate,
    prevDate,
  );

  return {
    playersByYahooId,
    teamsByFranchiseId,
    yesterdayMap,
    existingMap,
  };
}

function buildExistingPlayerDayMaps(existingPlayerDays, targetDate, prevDate) {
  const yesterdayMap = new Map();
  const existingMap = new Map();
  existingPlayerDays.forEach((playerDay) => {
    const key = `${playerDay.playerId}_${playerDay.gshlTeamId}`;
    const normalizedDate = formatDateOnly(playerDay.date);
    if (normalizedDate === prevDate) {
      yesterdayMap.set(key, playerDay);
    } else if (normalizedDate === targetDate) {
      existingMap.set(key, playerDay);
    }
  });
  return { yesterdayMap, existingMap };
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

  const lineup = finalizeLineupAssignments(rosterEntries);
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
  return (yahooTableScraper(targetDate, gshlTeam.yahooId, season.id) || [])
    .map((playerRow) => {
      if (!playerRow || playerRow.playerName === "") return null;
      const playerRecord = lookups.playersByYahooId.get(playerRow.yahooId);
      if (!playerRecord) return null;

      const playerId = playerRecord.id.toString();
      const lookupKey = `${playerId}_${gshlTeam.id.toString()}`;
      const yest = lookups.yesterdayMap.get(lookupKey);
      const existing = lookups.existingMap.get(lookupKey);

      playerRow.id = existing ? existing.id : undefined;
      playerRow.date = targetDate;
      playerRow.playerId = playerId;
      playerRow.seasonId = seasonIdStr;
      playerRow.weekId = weekIdStr;
      playerRow.gshlTeamId = gshlTeam.id;
      playerRow.posGroup = playerRow.nhlPos.includes("G")
        ? "G"
        : playerRow.nhlPos.includes("D")
          ? "D"
          : "F";
      playerRow.bestPos = "";
      playerRow.fullPos = "";
      const rating = RankingEngine.rankPerformance(playerRow);
      playerRow.Rating =
        rating && rating.score !== undefined ? rating.score : "";
      playerRow.ADD = !yest ? 1 : "";
      playerRow.BS = "";
      playerRow.MS = "";
      return playerRow;
    })
    .filter(Boolean);
}

function finalizeLineupAssignments(rosterEntries) {
  return optimizeLineup(rosterEntries).map((player) => {
    player.BS = player.GS === "1" && player.bestPos === "BN" ? 1 : "";
    player.MS =
      player.GP === "1" && player.GS !== "1" && player.fullPos !== "BN"
        ? 1
        : "";
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

  const teamDayStatLine = {
    date: targetDate,
    gshlTeamId: gshlTeam.id,
    seasonId: seasonIdStr,
    weekId: weekIdStr,
    GP: String(sumStat(lineup, "GP")),
    MG: String(sumStat(lineup, "MG")),
    IR: String(sumStat(lineup, "IR")),
    IRplus: String(sumStat(lineup, "IRplus")),
    GS: String(sumStat(lineup, "GS")),
    G: skaterStart ? String(sumStat(lineup, "G")) : "",
    A: skaterStart ? String(sumStat(lineup, "A")) : "",
    P: skaterStart ? String(sumStat(lineup, "P")) : "",
    PM: +season.id <= 6 && skaterStart ? String(sumStat(lineup, "PM")) : "",
    PIM: +season.id <= 4 && skaterStart ? String(sumStat(lineup, "PIM")) : "",
    PPP: skaterStart ? String(sumStat(lineup, "PPP")) : "",
    SOG: skaterStart ? String(sumStat(lineup, "SOG")) : "",
    HIT: skaterStart ? String(sumStat(lineup, "HIT")) : "",
    BLK: skaterStart ? String(sumStat(lineup, "BLK")) : "",
    W: goalieStart ? String(sumStat(lineup, "W")) : "",
    GA: goalieStart ? String(sumStat(lineup, "GA")) : "",
    GAA: goalieStart
      ? ((sumStat(lineup, "GA") / sumStat(lineup, "TOI")) * 60)
          .toFixed(5)
          .toString()
      : "",
    SV: goalieStart ? String(sumStat(lineup, "SV")) : "",
    SA: goalieStart ? String(sumStat(lineup, "SA")) : "",
    SVP: goalieStart
      ? (sumStat(lineup, "SV") / sumStat(lineup, "SA")).toFixed(6).toString()
      : "",
    SO: +season.id <= 4 && goalieStart ? String(sumStat(lineup, "SO")) : "",
    TOI: goalieStart ? String(sumStat(lineup, "TOI")) : "",
    Rating: "",
    ADD: String(sumStat(lineup, "ADD")),
    MS: String(sumStat(lineup, "MS")),
    BS: String(sumStat(lineup, "BS")),
  };

  const teamRating = RankingEngine.rankPerformance(teamDayStatLine);
  teamDayStatLine.Rating =
    teamRating && teamRating.score !== undefined ? teamRating.score : "";

  return teamDayStatLine;
}

function sumStat(lineup, field) {
  return lineup.reduce(function (total, player) {
    return total + +player[field];
  }, 0);
}
