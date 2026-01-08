// @ts-nocheck

/** Team-level aggregation logic: daily, weekly, and season rollups. */
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
      homeWin:
        m.homeWin === undefined || m.homeWin === null || m.homeWin === ""
          ? null
          : toBool(m.homeWin),
      awayWin:
        m.awayWin === undefined || m.awayWin === null || m.awayWin === ""
          ? null
          : toBool(m.awayWin),
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
    const weekIdsInSeasonType =
      weekIdsBySeasonType.get(seasonType) ||
      weekIdsBySeasonType.get(SeasonType.REGULAR_SEASON) ||
      new Set();

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

  return calculateRankings(
    teamSeasonStats,
    teamConfMap,
    matchups,
    weekIdsBySeasonType,
  );
}

function calculateRankings(
  teamSeasons,
  teamConfMap,
  matchups,
  weekIdsBySeasonType,
) {
  const seasonTypeGroups = new Map();
  teamSeasons.forEach((ts) => {
    if (!seasonTypeGroups.has(ts.seasonType)) {
      seasonTypeGroups.set(ts.seasonType, []);
    }
    seasonTypeGroups.get(ts.seasonType).push(ts);
  });

  const resolvedMatchups = Array.isArray(matchups) ? matchups : [];
  const matchupHasOutcome = (matchup) => {
    if (!matchup) return false;
    return matchup.homeWin === true || matchup.awayWin === true;
  };

  const computeStandingsPoints = (team) => {
    if (!team) return 0;
    const wins = toNumber(team.teamW);
    const homeTieWins = toNumber(team.teamHW);
    const homeTieLosses = toNumber(team.teamHL);
    return 3 * (wins - homeTieWins) + 2 * homeTieWins + homeTieLosses;
  };

  const computeConferencePoints = (team) => {
    if (!team) return 0;
    const wins = toNumber(team.teamCCW);
    const homeTieWins = toNumber(team.teamCCHW);
    const homeTieLosses = toNumber(team.teamCCHL);
    return 3 * (wins - homeTieWins) + 2 * homeTieWins + homeTieLosses;
  };

  const computeMiniStandingsForTeams = (teamIds, seasonType) => {
    const ids = Array.isArray(teamIds) ? teamIds.filter(Boolean) : [];
    const idSet = new Set(ids);
    const weekIdsInSeasonType =
      (weekIdsBySeasonType && weekIdsBySeasonType.get(seasonType)) ||
      (weekIdsBySeasonType &&
        weekIdsBySeasonType.get(SeasonType.REGULAR_SEASON)) ||
      null;

    const mini = new Map();
    ids.forEach((id) => {
      mini.set(id, { W: 0, HW: 0, HL: 0 });
    });

    resolvedMatchups.forEach((matchup) => {
      if (!matchup || !matchup.weekId) return;
      if (weekIdsInSeasonType && !weekIdsInSeasonType.has(matchup.weekId))
        return;
      if (!matchupHasOutcome(matchup)) return;
      const homeId = matchup.homeTeamId;
      const awayId = matchup.awayTeamId;
      if (!idSet.has(homeId) || !idSet.has(awayId)) return;
      const homeStats = mini.get(homeId);
      const awayStats = mini.get(awayId);
      if (!homeStats || !awayStats) return;

      const scoresWereEqual =
        matchup.homeScore !== null &&
        matchup.awayScore !== null &&
        matchup.homeScore === matchup.awayScore;

      if (matchup.homeWin) {
        homeStats.W += 1;
        if (scoresWereEqual) {
          homeStats.HW += 1;
          awayStats.HL += 1;
        }
      } else if (matchup.awayWin) {
        awayStats.W += 1;
      }
    });

    const pointsByTeamId = new Map();
    ids.forEach((id) => {
      const stats = mini.get(id) || { W: 0, HW: 0, HL: 0 };
      pointsByTeamId.set(
        id,
        3 * (stats.W - stats.HW) + 2 * stats.HW + stats.HL,
      );
    });

    return { miniByTeamId: mini, pointsByTeamId };
  };

  const orderEntriesWithTiebreakers = (entries, seasonType) => {
    const baseSorted = [...entries].sort((a, b) => {
      if (b.team.teamW !== a.team.teamW) return b.team.teamW - a.team.teamW;
      if (b.points !== a.points) return b.points - a.points;
      return a.team.gshlTeamId.localeCompare(b.team.gshlTeamId);
    });

    const output = [];
    let i = 0;
    while (i < baseSorted.length) {
      const start = i;
      const wins = baseSorted[i].team.teamW;
      const points = baseSorted[i].points;
      i++;
      while (
        i < baseSorted.length &&
        baseSorted[i].team.teamW === wins &&
        baseSorted[i].points === points
      ) {
        i++;
      }
      const group = baseSorted.slice(start, i);
      if (group.length <= 1) {
        output.push(group[0]);
        continue;
      }

      const teamIds = group.map((entry) => entry.team.gshlTeamId);
      const headToHead = computeMiniStandingsForTeams(teamIds, seasonType);
      group.sort((a, b) => {
        const aId = a.team.gshlTeamId;
        const bId = b.team.gshlTeamId;
        const aMini = headToHead.miniByTeamId.get(aId) || {
          W: 0,
          HW: 0,
          HL: 0,
        };
        const bMini = headToHead.miniByTeamId.get(bId) || {
          W: 0,
          HW: 0,
          HL: 0,
        };
        const aMiniPoints = headToHead.pointsByTeamId.get(aId) || 0;
        const bMiniPoints = headToHead.pointsByTeamId.get(bId) || 0;

        if (bMini.W !== aMini.W) return bMini.W - aMini.W;
        if (bMiniPoints !== aMiniPoints) return bMiniPoints - aMiniPoints;

        const aConfWins = toNumber(a.team.teamCCW);
        const bConfWins = toNumber(b.team.teamCCW);
        if (bConfWins !== aConfWins) return bConfWins - aConfWins;

        const aConfPoints = computeConferencePoints(a.team);
        const bConfPoints = computeConferencePoints(b.team);
        if (bConfPoints !== aConfPoints) return bConfPoints - aConfPoints;

        // TODO: final tiebreaker should use power ranking once implemented.
        return aId.localeCompare(bId);
      });

      output.push(...group);
    }

    return output;
  };

  seasonTypeGroups.forEach((teams) => {
    const teamsWithPoints = teams.map((t) => ({
      team: t,
      points: computeStandingsPoints(t),
    }));

    const seasonType = teamsWithPoints[0]?.team?.seasonType;
    const overallOrdered = orderEntriesWithTiebreakers(
      teamsWithPoints,
      seasonType,
    );
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
      const ordered = orderEntriesWithTiebreakers(bucket, seasonType);
      bucket.length = 0;
      bucket.push(...ordered);
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

    const wildcardOrdered = orderEntriesWithTiebreakers(
      wildcardEntries,
      seasonType,
    );
    wildcardOrdered.forEach((entry, index) => {
      entry.team.wildcardRk = index + 1;
    });
  });

  return teamSeasons;
}
