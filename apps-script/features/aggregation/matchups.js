// @ts-nocheck

/** Matchup scoring + win/loss resolution derived from team week stats. */
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
