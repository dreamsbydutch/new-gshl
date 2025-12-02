// @ts-nocheck

const SeasonType = {
  REGULAR_SEASON: "RS",
  PLAYOFFS: "PO",
  LOSERS_TOURNAMENT: "LT",
};

const TEAM_STAT_FIELDS = [
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

const MATCHUP_CATEGORY_RULES = [
  { field: "G", higherBetter: true },
  { field: "A", higherBetter: true },
  { field: "P", higherBetter: true },
  { field: "PPP", higherBetter: true },
  { field: "SOG", higherBetter: true },
  { field: "HIT", higherBetter: true },
  { field: "BLK", higherBetter: true },
  { field: "W", higherBetter: true },
  { field: "GAA", higherBetter: false },
  { field: "SVP", higherBetter: true },
];

const GOALIE_CATEGORY_SET = new Set(["W", "GAA", "SVP"]);
const GOALIE_START_MINIMUM = 2;

const PLAYER_DAY_STAT_FIELDS = [
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
  "TOI",
];

function getTodayDateString() {
  return formatDateOnly(new Date());
}

function isWeekCompleteRecord(week, todayDateString) {
  if (!week) return false;
  var endDateStr = formatDateOnly(week.endDate);
  if (!endDateStr) return false;
  if (!todayDateString) return false;
  return todayDateString > endDateStr;
}

function getPlayerDayWorkbookId(seasonId) {
  const seasonNumber = Number(seasonId);
  if (isNaN(seasonNumber)) return CURRENT_PLAYERDAY_SPREADSHEET_ID;
  if (seasonNumber <= 5) return PLAYERDAY_WORKBOOKS.PLAYERDAYS_1_5;
  if (seasonNumber <= 10) return PLAYERDAY_WORKBOOKS.PLAYERDAYS_6_10;
  return PLAYERDAY_WORKBOOKS.PLAYERDAYS_11_15;
}

function normalizeNhlPosValue(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(",");
  return value.toString();
}

function resolvePosGroupFromNhlPos(nhlPos) {
  const normalized = normalizeNhlPosValue(nhlPos).toUpperCase();
  if (normalized.includes("G")) return "G";
  if (normalized.includes("D")) return "D";
  return "F";
}
function buildMissingPlayerDayRow(
  scrapedPlayer,
  playerRecord,
  teamId,
  seasonId,
  weekId,
  dateStr,
) {
  if (!scrapedPlayer || !playerRecord || !playerRecord.id) return null;
  if (!teamId || !seasonId || !dateStr) return null;

  const playerIdStr = playerRecord.id.toString();
  const normalizedNhlPos = normalizeNhlPosValue(scrapedPlayer.nhlPos);
  const row = {
    ...scrapedPlayer,
    playerId: playerIdStr,
    gshlTeamId: teamId,
    seasonId,
    weekId: weekId || "",
    date: dateStr,
    posGroup: resolvePosGroupFromNhlPos(normalizedNhlPos),
    bestPos: "",
    fullPos: "",
    IR: "",
    IRplus: "",
    ADD: "",
    MS: "",
    BS: "",
    nhlPos: normalizedNhlPos,
    yahooId:
      scrapedPlayer.yahooId ||
      (playerRecord.yahooId && playerRecord.yahooId.toString()) ||
      "",
    playerName:
      scrapedPlayer.playerName ||
      playerRecord.playerName ||
      playerRecord.fullName ||
      playerRecord.name ||
      "",
  };

  row.Rating = "";
  return row;
}

/**
 * Process Season 12 in batches
 * Run this function, then check logs for next command if it times out
 */
function updateSeason() {
  console.log(1);
  updatePlayerStatsForSeason("12");
  console.log(2);
  updateTeamStatsForSeason("12");
  console.log(3);
  updateMatchupsFromTeamWeeks("12");
  console.log(4);
  updateTeamStatsForSeason("12");
  console.log(5);
  // const now = new Date("2025-11-17");
  // while (now <= new Date("2025-11-17")) {
  //   console.log(
  //     `Updating player days for date: ${now.toISOString().split("T")[0]}`,
  //   );
  //   updatePastPlayerDays(now.toISOString().split("T")[0]);
  //   now.setDate(now.getDate() + 1);
  // }
}

function updatePastPlayerDays(targetDate) {
  const dateStr = formatDateOnly(targetDate);
  if (!dateStr) {
    console.log("A target date (YYYY-MM-DD) is required.");
    return;
  }

  const seasons = fetchSheetAsObjects(SPREADSHEET_ID, "Season");
  const season = seasons.find((s) =>
    isDateInRange(dateStr, s.startDate, s.endDate),
  );
  if (!season) {
    console.log(`No season found that covers ${dateStr}.`);
    return;
  }

  const seasonIdStr = season.id?.toString();
  if (!seasonIdStr) {
    console.log(`Season id missing for season covering ${dateStr}.`);
    return;
  }
  const workbookId = getPlayerDayWorkbookId(season.id);

  const weekRecords = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
    (w) => w.seasonId?.toString() === seasonIdStr,
  );
  const activeWeek = weekRecords.find((w) =>
    isDateInRange(dateStr, w.startDate, w.endDate),
  );
  const weekIdStr = activeWeek?.id?.toString() || "";
  if (!weekIdStr) {
    console.log(
      `No week record found for ${dateStr} in season ${seasonIdStr}; inserted rows will omit weekId.`,
    );
  }

  const teams = fetchSheetAsObjects(SPREADSHEET_ID, "Team").filter(
    (team) => team.seasonId?.toString() === seasonIdStr,
  );
  if (!teams.length) {
    console.log(`No teams found for season ${seasonIdStr}.`);
    return;
  }

  const players = fetchSheetAsObjects(SPREADSHEET_ID, "Player");
  const playersByYahooId = new Map();
  players.forEach((player) => {
    const yahooId = player.yahooId && player.yahooId.toString();
    if (yahooId) {
      playersByYahooId.set(yahooId, player);
    }
  });

  const playerDays = fetchSheetAsObjects(
    workbookId,
    "PlayerDayStatLine",
  ).filter(
    (pd) =>
      formatDateOnly(pd.date) === dateStr &&
      pd.seasonId?.toString() === seasonIdStr,
  );

  if (!playerDays.length) {
    console.log(`No PlayerDay rows found for ${dateStr}.`);
    return;
  }

  const playerDayByKey = new Map();
  playerDays.forEach((pd) => {
    const playerId = pd.playerId?.toString();
    const teamId = pd.gshlTeamId?.toString();
    if (!playerId || !teamId) return;
    playerDayByKey.set(`${playerId}_${teamId}`, pd);
  });

  const updates = [];
  const inserts = [];
  const seasonNumber = Number(season.id);

  teams.forEach((team) => {
    const yahooTeamId = team.yahooId;
    if (!yahooTeamId) return;
    const teamIdStr = team.id && team.id.toString();
    if (!teamIdStr) return;

    let roster = [];
    try {
      roster = yahooTableScraper(dateStr, yahooTeamId, seasonNumber) || [];
    } catch (error) {
      console.log(
        `Failed to fetch Yahoo data for team ${team.id} (${yahooTeamId}) on ${dateStr}: ${error}`,
      );
      return;
    }

    roster.forEach((scraped) => {
      if (!scraped || !scraped.yahooId) return;
      const player = playersByYahooId.get(scraped.yahooId.toString());
      if (!player || !player.id) return;

      const playerIdStr = player.id.toString();
      const key = `${playerIdStr}_${teamIdStr}`;
      const existingRow = playerDayByKey.get(key);

      if (!existingRow) {
        const newRow = buildMissingPlayerDayRow(
          scraped,
          player,
          teamIdStr,
          seasonIdStr,
          weekIdStr,
          dateStr,
        );
        if (!newRow) {
          console.log(
            `Unable to create PlayerDay row for player ${playerIdStr} on ${dateStr} (team ${teamIdStr}).`,
          );
          return;
        }
        const ratingResult = rankPerformance(newRow);
        newRow.Rating =
          ratingResult && ratingResult.score !== undefined
            ? ratingResult.score
            : "";
        inserts.push(newRow);
        playerDayByKey.set(key, newRow);
        console.log(
          `Inserted missing PlayerDay row for player ${playerIdStr} on ${dateStr} (team ${teamIdStr}).`,
        );
        return;
      }

      const mergedRow = Object.assign({}, existingRow);
      PLAYER_DAY_STAT_FIELDS.forEach((field) => {
        if (scraped[field] !== undefined) {
          mergedRow[field] =
            scraped[field] === null || scraped[field] === undefined
              ? ""
              : scraped[field];
        }
      });

      const ratingResult = rankPerformance(mergedRow);
      const ratingScore =
        ratingResult && ratingResult.score !== undefined
          ? ratingResult.score
          : "";

      const updatePayload = {
        id: existingRow.id,
        Rating: ratingScore,
      };

      PLAYER_DAY_STAT_FIELDS.forEach((field) => {
        if (mergedRow[field] !== undefined) {
          updatePayload[field] =
            mergedRow[field] === null || mergedRow[field] === undefined
              ? ""
              : mergedRow[field];
        }
      });

      updates.push(updatePayload);
    });
  });

  if (!updates.length && !inserts.length) {
    console.log(`No player-day updates generated for ${dateStr}.`);
    return;
  }

  const payload = updates.concat(inserts);

  upsertSheetByKeys(workbookId, "PlayerDayStatLine", ["id"], payload, {
    merge: true,
    idColumn: "id",
    updatedAtColumn: "updatedAt",
  });

  console.log(
    `Updated ${updates.length} and inserted ${inserts.length} PlayerDay rows for ${dateStr} (season ${seasonIdStr}).`,
  );
}

function updateMatchupsFromTeamWeeks(seasonId) {
  const seasonKey = seasonId?.toString();
  if (!seasonKey) {
    console.log("Season ID is required");
    return;
  }

  const matchups = fetchSheetAsObjects(SPREADSHEET_ID, "Matchup").filter(
    (m) => m.seasonId?.toString() === seasonKey,
  );
  if (!matchups.length) {
    console.log(`No matchups found for season ${seasonKey}`);
    return;
  }

  const weekRecords = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
    (w) => w.seasonId?.toString() === seasonKey,
  );
  const todayDateString = getTodayDateString();
  const weekCompletionMap = new Map();
  weekRecords.forEach((week) => {
    const id = week.id?.toString();
    if (!id) return;
    weekCompletionMap.set(id, isWeekCompleteRecord(week, todayDateString));
  });

  const playerWeeks = fetchSheetAsObjects(
    PLAYERSTATS_SPREADSHEET_ID,
    "PlayerWeekStatLine",
  ).filter((m) => m.seasonId?.toString() === seasonKey);
  if (!playerWeeks.length) {
    console.log(`No player weeks found for season ${seasonKey}`);
    return;
  }

  const teamWeeks = fetchSheetAsObjects(
    TEAMSTATS_SPREADSHEET_ID,
    "TeamWeekStatLine",
  ).filter((tw) => tw.seasonId?.toString() === seasonKey);

  if (!teamWeeks.length) {
    console.log(`No team week stats found for season ${seasonKey}`);
    return;
  }

  const teamWeekMap = new Map();
  teamWeeks.forEach((tw) => {
    const key = `${tw.weekId}_${tw.gshlTeamId}`;
    teamWeekMap.set(key, tw);
  });

  const updates = [];

  matchups.forEach((matchup) => {
    const weekId = matchup.weekId?.toString();
    if (!weekId) return;
    const weekIsComplete = !!weekCompletionMap.get(weekId);
    const homeKey = `${weekId}_${matchup.homeTeamId}`;
    const awayKey = `${weekId}_${matchup.awayTeamId}`;
    const homeStats = teamWeekMap.get(homeKey);
    const awayStats = teamWeekMap.get(awayKey);

    if (!homeStats || !awayStats) {
      console.log(
        `Missing team week stats for matchup ${matchup.id} (week ${weekId})`,
      );
      return;
    }

    let homeScore = 0;
    let awayScore = 0;
    const homeGoalieStarts = playerWeeks
      .filter(
        (a) =>
          a.weekId === weekId &&
          a.gshlTeamId === matchup.homeTeamId &&
          a.posGroup === "G",
      )
      .reduce((p, c) => (p += +c.GS), 0);
    const awayGoalieStarts = playerWeeks
      .filter(
        (a) =>
          a.weekId === weekId &&
          a.gshlTeamId === matchup.awayTeamId &&
          a.posGroup === "G",
      )
      .reduce((p, c) => (p += +c.GS), 0);
    const homeGoalieEligible = homeGoalieStarts >= GOALIE_START_MINIMUM;
    const awayGoalieEligible = awayGoalieStarts >= GOALIE_START_MINIMUM;

    MATCHUP_CATEGORY_RULES.forEach(({ field, higherBetter }) => {
      if (GOALIE_CATEGORY_SET.has(field)) {
        if (!homeGoalieEligible && !awayGoalieEligible) {
          return;
        }

        if (!homeGoalieEligible && awayGoalieEligible) {
          awayScore++;
          return;
        }

        if (homeGoalieEligible && !awayGoalieEligible) {
          homeScore++;
          return;
        }
      }

      const homeVal = parseFloat(homeStats[field]) || 0;
      const awayVal = parseFloat(awayStats[field]) || 0;

      if (higherBetter) {
        if (homeVal > awayVal) homeScore++;
        else if (awayVal > homeVal) awayScore++;
      } else {
        if (homeVal < awayVal) homeScore++;
        else if (awayVal < homeVal) awayScore++;
      }
    });

    let homeWin = null;
    let awayWin = null;
    if (weekIsComplete) {
      homeWin = homeScore >= awayScore;
      awayWin = awayScore > homeScore;
    }

    updates.push({
      id: matchup.id,
      homeScore: homeScore.toString(),
      awayScore: awayScore.toString(),
      homeWin,
      awayWin,
      updatedAt: new Date().toISOString(),
    });
  });

  if (!updates.length) {
    console.log("No matchup updates to apply.");
    return;
  }

  upsertSheetByKeys(SPREADSHEET_ID, "Matchup", ["id"], updates, {
    merge: true,
    updatedAtColumn: "updatedAt",
  });

  console.log(`Updated ${updates.length} matchups for season ${seasonKey}.`);
}

function updatePlayerStatsForSeason(seasonId) {
  const season = fetchSheetAsObjects(SPREADSHEET_ID, "Season").find(
    (s) => s.id === seasonId.toString(),
  );
  const weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
    (w) => w.seasonId === season.id,
  );
  const playerDayWorkbookId = getPlayerDayWorkbookId(season.id);
  const playerDays = fetchSheetAsObjects(
    playerDayWorkbookId,
    "PlayerDayStatLine",
  ).filter((pd) => +pd.seasonId === +season.id);
  const playerWeeks = [];
  const playerSplits = [];
  const playerTotals = [];

  weeks.forEach((week) => {
    const weekSeasonType = week.weekType || SeasonType.REGULAR_SEASON;
    const weekPlayerDays = playerDays.filter((pd) => pd.weekId === week.id);
    const playerDayMap = new Map();
    weekPlayerDays.forEach((pd) => {
      const key = pd.playerId + "_" + pd.gshlTeamId;
      if (!playerDayMap.has(key)) {
        playerDayMap.set(key, []);
      }
      playerDayMap.get(key).push(pd);
    });

    playerDayMap.forEach((days, playerKey) => {
      const starts = days.filter((a) => isStarter(a));
      const playerWeekStatLine = {
        playerId: playerKey.split("_")[0],
        gshlTeamId: playerKey.split("_")[1],
        seasonId: season.id,
        weekId: week.id,
        seasonType: weekSeasonType,
        nhlPos: Array.from(
          new Set(days.map((a) => a.nhlPos.split(",")).flat()),
        ).toString(),
        posGroup: days[0].posGroup,
        nhlTeam: Array.from(
          new Set(days.map((a) => a.nhlTeam.split(",")).flat()),
        ).toString(),
        days: days.length.toString(),
        GP: days.reduce((p, c) => (p += +c.GP), 0).toString(),
        MG: days.reduce((p, c) => (p += +c.MG), 0).toString(),
        IR: days.reduce((p, c) => (p += +c.IR), 0).toString(),
        IRplus: days.reduce((p, c) => (p += +c.IRplus), 0).toString(),
        GS: days.reduce((p, c) => (p += +c.GS), 0).toString(),
        G:
          days[0].posGroup === "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.G), 0).toString(),
        A:
          days[0].posGroup === "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.A), 0).toString(),
        P:
          days[0].posGroup === "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.P), 0).toString(),
        PM:
          days[0].posGroup === "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.PM), 0).toString(),
        PIM:
          days[0].posGroup === "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.PIM), 0).toString(),
        PPP:
          days[0].posGroup === "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.PPP), 0).toString(),
        SOG:
          days[0].posGroup === "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.SOG), 0).toString(),
        HIT:
          days[0].posGroup === "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.HIT), 0).toString(),
        BLK:
          days[0].posGroup === "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.BLK), 0).toString(),
        W:
          days[0].posGroup !== "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.W), 0).toString(),
        GA:
          days[0].posGroup !== "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.GA), 0).toString(),
        SV:
          days[0].posGroup !== "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.SV), 0).toString(),
        SA:
          days[0].posGroup !== "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.SA), 0).toString(),
        SO:
          days[0].posGroup !== "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.SO), 0).toString(),
        TOI:
          days[0].posGroup !== "G"
            ? ""
            : starts.reduce((p, c) => (p += +c.TOI), 0).toString(),
        ADD: days.reduce((p, c) => (p += +c.ADD), 0).toString(),
        MS: days.reduce((p, c) => (p += +c.MS), 0).toString(),
        BS: days.reduce((p, c) => (p += +c.BS), 0).toString(),
      };
      playerWeekStatLine.GAA =
        +playerWeekStatLine.TOI > 0
          ? ((playerWeekStatLine.GA / playerWeekStatLine.TOI) * 60)
              .toFixed(5)
              .toString()
          : "";
      playerWeekStatLine.SVP =
        +playerWeekStatLine.SA > 0
          ? (playerWeekStatLine.SV / playerWeekStatLine.SA)
              .toFixed(6)
              .toString()
          : "";
      playerWeekStatLine.Rating = rankPerformance(playerWeekStatLine).score;
      playerWeeks.push(playerWeekStatLine);
    });
  });

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
      seasonId: season.id,
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
    playerSplitStatLine.Rating = rankPerformance(playerSplitStatLine).score;
    playerSplits.push(playerSplitStatLine);
  });

  playerTotalsMap.forEach((weeks, totalKey) => {
    if (!weeks.length) return;
    const firstWeek = weeks[0];
    const [playerId, seasonType] = totalKey.split("|");
    const playerTotalStatLine = {
      playerId,
      seasonId: season.id,
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
    playerTotalStatLine.Rating = rankPerformance(playerTotalStatLine).score;
    playerTotals.push(playerTotalStatLine);
  });

  // Upsert player weeks - this will update existing rows and insert new ones
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
}

function updateTeamStatsForSeason(seasonId) {
  const season = fetchSheetAsObjects(SPREADSHEET_ID, "Season").find(
    (s) => s.id === seasonId.toString(),
  );
  if (!season) {
    console.log(`Season not found for id ${seasonId}`);
    return;
  }

  const weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
    (w) => w.seasonId === season.id,
  );
  if (!weeks.length) return;

  const weekTypeMap = new Map();
  weeks.forEach((week) => {
    weekTypeMap.set(
      week.id.toString(),
      week.weekType || SeasonType.REGULAR_SEASON,
    );
  });

  const seasonIdStr = season.id.toString();
  const teams = fetchSheetAsObjects(SPREADSHEET_ID, "Team").filter(
    (t) => t.seasonId === seasonIdStr,
  );
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

  const playerWB = getPlayerDayWorkbookId(seasonIdStr);
  const playerDays = fetchSheetAsObjects(playerWB, "PlayerDayStatLine").filter(
    (pd) => pd.seasonId === seasonIdStr && isStarter(pd),
  );
  if (!playerDays.length) return;

  const matchups = fetchSheetAsObjects(SPREADSHEET_ID, "Matchup")
    .filter((m) => m.seasonId === seasonIdStr)
    .map((m) => ({
      id: m.id,
      seasonId: m.seasonId,
      weekId: m.weekId?.toString(),
      homeTeamId: m.homeTeamId?.toString(),
      awayTeamId: m.awayTeamId?.toString(),
      homeScore: parseScore(m.homeScore),
      awayScore: parseScore(m.awayScore),
      homeWin: toBool(m.homeWin),
      awayWin: toBool(m.awayWin),
    }));

  const teamDayMap = new Map();
  const playerUsageMap = new Map();
  playerDays.forEach((pd) => {
    if (!isStarter(pd)) return;
    const teamId = pd.gshlTeamId?.toString();
    const weekId = pd.weekId?.toString();
    if (!teamId || !weekId) return;
    const seasonTypeForDay =
      weekTypeMap.get(weekId) || SeasonType.REGULAR_SEASON;
    const usageKey = `${teamId}:${seasonTypeForDay}`;
    if (!playerUsageMap.has(usageKey)) {
      playerUsageMap.set(usageKey, new Set());
    }
    if (pd.playerId) {
      playerUsageMap.get(usageKey).add(pd.playerId.toString());
    }
    const dateKey = formatDateOnly(pd.date);
    const mapKey = `${teamId}_${dateKey}`;
    if (!teamDayMap.has(mapKey)) {
      teamDayMap.set(
        mapKey,
        createTeamDayBucket(seasonIdStr, teamId, weekId, dateKey),
      );
    }
    const bucket = teamDayMap.get(mapKey);
    TEAM_STAT_FIELDS.forEach((field) => {
      bucket[field] += toNumber(pd[field]);
    });
  });

  if (!teamDayMap.size) return;

  const teamDayAggregates = Array.from(teamDayMap.values());
  const teamDayRows = teamDayAggregates.map(buildTeamDayRow);

  const teamWeekMap = new Map();
  teamDayAggregates.forEach((day) => {
    const key = `${day.weekId}_${day.gshlTeamId}`;
    if (!teamWeekMap.has(key)) {
      teamWeekMap.set(key, createTeamWeekBucket(day));
    }
    const weekBucket = teamWeekMap.get(key);
    weekBucket.days += 1;
    TEAM_STAT_FIELDS.forEach((field) => {
      weekBucket[field] += day[field];
    });
  });

  const teamWeekAggregates = Array.from(teamWeekMap.values());
  const teamWeekRows = teamWeekAggregates.map(buildTeamWeekRow);

  const teamSeasonStats = calculateTeamSeasonStats(
    teamWeekAggregates,
    matchups,
    teamConfMap,
    playerUsageMap,
    weeks,
  );
  const teamSeasonRows = teamSeasonStats.map(buildTeamSeasonRow);

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
}

function createTeamDayBucket(seasonId, teamId, weekId, date) {
  const bucket = {
    seasonId,
    gshlTeamId: teamId,
    weekId,
    date,
  };
  TEAM_STAT_FIELDS.forEach((field) => {
    bucket[field] = 0;
  });
  return bucket;
}

function createTeamWeekBucket(day) {
  const bucket = {
    seasonId: day.seasonId,
    gshlTeamId: day.gshlTeamId,
    weekId: day.weekId,
    days: 0,
  };
  TEAM_STAT_FIELDS.forEach((field) => {
    bucket[field] = 0;
  });
  return bucket;
}

function buildTeamDayRow(day) {
  const GAA = day.TOI > 0 ? ((day.GA / day.TOI) * 60).toFixed(5) : "";
  const SVP = day.SA > 0 ? (day.SV / day.SA).toFixed(6) : "";
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
    GAA,
    SV: formatNumber(day.SV),
    SA: formatNumber(day.SA),
    SVP,
    SO: formatNumber(day.SO),
    TOI: formatNumber(day.TOI),
    Rating: "",
    ADD: formatNumber(day.ADD),
    MS: formatNumber(day.MS),
    BS: formatNumber(day.BS),
  };
}

function buildTeamWeekRow(week) {
  const GAA = week.TOI > 0 ? ((week.GA / week.TOI) * 60).toFixed(5) : "";
  const SVP = week.SA > 0 ? (week.SV / week.SA).toFixed(6) : "";
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
    GAA,
    SV: formatNumber(week.SV),
    SA: formatNumber(week.SA),
    SVP,
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
  const GAA = seasonStat.GAA ? seasonStat.GAA.toFixed(5).toString() : "";
  const SVP = seasonStat.SVP ? seasonStat.SVP.toFixed(6).toString() : "";
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
    GAA,
    SV: formatNumber(seasonStat.SV),
    SA: formatNumber(seasonStat.SA),
    SVP,
    SO: formatNumber(seasonStat.SO),
    TOI: formatNumber(seasonStat.TOI),
    Rating: "",
    ADD: formatNumber(seasonStat.ADD),
    MS: formatNumber(seasonStat.MS),
    BS: formatNumber(seasonStat.BS),
    streak: seasonStat.streak || "",
    powerRk: formatNumber(seasonStat.powerRk),
    powerRating: formatNumber(seasonStat.powerRating),
    prevPowerRk: formatNumber(seasonStat.prevPowerRk),
    prevPowerRating: formatNumber(seasonStat.prevPowerRating),
    teamW: formatNumber(seasonStat.teamW),
    teamHW: formatNumber(seasonStat.teamHW),
    teamHL: formatNumber(seasonStat.teamHL),
    teamL: formatNumber(seasonStat.teamL),
    teamCCW: formatNumber(seasonStat.teamCCW),
    teamCCHW: formatNumber(seasonStat.teamCCHW),
    teamCCHL: formatNumber(seasonStat.teamCCHL),
    teamCCL: formatNumber(seasonStat.teamCCL),
    overallRk: formatNumber(seasonStat.overallRk),
    conferenceRk: formatNumber(seasonStat.conferenceRk),
    wildcardRk:
      seasonStat.wildcardRk != null ? formatNumber(seasonStat.wildcardRk) : "",
    playersUsed: formatNumber(seasonStat.playersUsed),
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

function calculateTeamSeasonStats(
  teamWeeks,
  matchups,
  teamConfMap,
  playerUsageMap,
  allWeeks,
) {
  const weekTypeMap = new Map(
    allWeeks.map((w) => [
      w.id.toString(),
      w.weekType || SeasonType.REGULAR_SEASON,
    ]),
  );

  const teamGroups = new Map();
  teamWeeks.forEach((week) => {
    const weekType = weekTypeMap.get(week.weekId) || SeasonType.REGULAR_SEASON;
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
      aggregated.days += 1;
      TEAM_STAT_FIELDS.forEach((field) => {
        aggregated[field] += toNumber(week[field]);
      });
    });

    const GAA = aggregated.TOI > 0 ? (aggregated.GA / aggregated.TOI) * 60 : 0;
    const SVP = aggregated.SA > 0 ? aggregated.SV / aggregated.SA : 0;

    const seasonType = group.seasonType;
    const weekIdsInSeasonType = new Set(
      allWeeks
        .filter((w) => {
          if (seasonType === SeasonType.PLAYOFFS)
            return w.weekType === SeasonType.PLAYOFFS;
          if (seasonType === SeasonType.LOSERS_TOURNAMENT)
            return w.weekType === SeasonType.LOSERS_TOURNAMENT;
          return w.weekType === SeasonType.REGULAR_SEASON;
        })
        .map((w) => w.id.toString()),
    );

    const teamMatchups = matchups.filter((m) => {
      if (!weekIdsInSeasonType.has(m.weekId)) return false;
      if (!matchupHasOutcome(m)) return false;
      return m.homeTeamId === teamId || m.awayTeamId === teamId;
    });

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

    const playersUsedSet = playerUsageMap.get(`${teamId}:${seasonType}`);
    const playersUsed = playersUsedSet ? playersUsedSet.size : 0;

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

  return calculateRankings(teamSeasonStats, teamConfMap);
}

function calculateRankings(teamSeasons, teamConfMap) {
  const seasonTypeGroups = new Map();
  teamSeasons.forEach((ts) => {
    if (!seasonTypeGroups.has(ts.seasonType)) {
      seasonTypeGroups.set(ts.seasonType, []);
    }
    seasonTypeGroups.get(ts.seasonType).push(ts);
  });

  const compareEntries = (a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.team.teamW !== a.team.teamW) return b.team.teamW - a.team.teamW;
    return a.team.gshlTeamId.localeCompare(b.team.gshlTeamId);
  };

  seasonTypeGroups.forEach((teams) => {
    const teamsWithPoints = teams.map((t) => ({
      team: t,
      points: 3 * (t.teamW - t.teamHW) + 2 * t.teamHW + t.teamHL,
    }));

    const overallOrdered = [...teamsWithPoints].sort(compareEntries);
    overallOrdered.forEach((entry, index) => {
      entry.team.overallRk = index + 1;
      entry.team.conferenceRk = null;
      entry.team.wildcardRk = null;
    });

    const conferenceBuckets = new Map();
    overallOrdered.forEach((entry) => {
      const confId = teamConfMap.get(entry.team.gshlTeamId);
      if (!confId) return;
      if (!conferenceBuckets.has(confId)) {
        conferenceBuckets.set(confId, []);
      }
      conferenceBuckets.get(confId).push(entry);
    });

    conferenceBuckets.forEach((bucket) => {
      bucket.sort(compareEntries);
      bucket.forEach((entry, index) => {
        entry.team.conferenceRk = index + 1;
      });
    });

    const wildcardEntries = overallOrdered.filter((entry) => {
      const confId = teamConfMap.get(entry.team.gshlTeamId);
      if (!confId) return false;
      const rank = entry.team.conferenceRk;
      return typeof rank === "number" && rank > 3;
    });

    wildcardEntries.forEach((entry, index) => {
      entry.team.wildcardRk = index + 1;
    });
  });

  return teamSeasons;
}
