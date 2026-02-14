// @ts-nocheck

/**
 * Player-focused aggregation helpers: retroactive player-day fixes,
 * weekly/split/season rollups, and related utilities.
 */
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
        const ratingResult = RankingEngine.rankPerformance(newRow);
        newRow.Rating =
          ratingResult && ratingResult.score !== undefined
            ? ratingResult.score
            : "";
        inserts.push(newRow);
        playerDayByKey.set(key, newRow);
        logVerbose(
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

      const ratingResult = RankingEngine.rankPerformance(mergedRow);
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
    const weekSeasonType = week.weekType || SEASON_TYPE.REGULAR_SEASON;
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
      playerWeekStatLine.Rating =
        RankingEngine.rankPerformance(playerWeekStatLine).score;
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
    playerSplitStatLine.Rating =
      RankingEngine.rankPerformance(playerSplitStatLine).score;
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
    playerTotalStatLine.Rating =
      RankingEngine.rankPerformance(playerTotalStatLine).score;
    playerTotals.push(playerTotalStatLine);
  });

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
