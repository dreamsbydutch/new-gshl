// @ts-nocheck

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
function scrapeYahooMatchupTables() {
  const seasonId = "10";
  const seasonIdNum = Number(seasonId);
  const hasPM = seasonIdNum <= 6;
  const createMissingWeeks = true;
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
  const seasonCode = seasonCodeById[seasonId] ?? "";
  const skipDays = false;
  const seasonStats = false;
  const weekNumsArray = ["1", "2"];
  // const weekNumsArray = ["3","4"]
  // const weekNumsArray = ["5","6"]
  // const weekNumsArray = ["7","8"]
  // const weekNumsArray = ["9","10"]
  // const weekNumsArray = ["11","12"]
  // const weekNumsArray = ["13","14"]
  // const weekNumsArray = ["15","16"]
  // const weekNumsArray = ["17","18"]
  // const weekNumsArray = ["19","20"]
  // const weekNumsArray = ["21","22"]
  // const weekNumsArray = ["23","24"]
  // const weekNumsArray = ["25","26"]
  // const weekNumsArray = ["1","2","3","4","5","6","7","8","9","10","11","12","13"]
  // const weekNumsArray = ["14","15","16","17","18","19","20","21","22","23","24","25","26"]
  const weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
    (s) => +s.seasonId === +seasonId,
  );
  const players = seasonStats
    ? []
    : fetchSheetAsObjects(SPREADSHEET_ID, "Player");
  const teams = fetchSheetAsObjects(SPREADSHEET_ID, "Team").filter(
    (s) => +s.seasonId === +seasonId,
  );
  const playerDayWorkbookId =
    seasonIdNum <= 5
      ? PLAYERDAY_WORKBOOKS.PLAYERDAYS_1_5
      : PLAYERDAY_WORKBOOKS.PLAYERDAYS_6_10;
  const rawPlayerDays =
    skipDays && !seasonStats
      ? []
      : fetchSheetAsObjects(playerDayWorkbookId, "PlayerDayStatLine").filter(
          (s) => +s.seasonId === +seasonId,
        );
  const rawPlayerWeeks = fetchSheetAsObjects(
    PLAYERSTATS_SPREADSHEET_ID,
    "PlayerWeekStatLine",
  ).filter((s) => +s.seasonId === +seasonId);
  const rawTeamWeeks = fetchSheetAsObjects(
    TEAMSTATS_SPREADSHEET_ID,
    "TeamWeekStatLine",
  ).filter((s) => +s.seasonId === +seasonId);

  // Pre-index for faster lookups inside loops.
  const playerById = new Map(players.map((p) => [String(p.id), p]));
  const teamByYahooId = new Map(teams.map((t) => [String(t.yahooId), t]));
  const playerDaysByWeekId = new Map();
  rawPlayerDays.forEach((pd) => {
    const weekKey = String(pd.weekId);
    const list = playerDaysByWeekId.get(weekKey) ?? [];
    list.push(pd);
    playerDaysByWeekId.set(weekKey, list);
  });
  const playerWeeksByWeekId = new Map();
  rawPlayerWeeks.forEach((pw) => {
    const weekKey = String(pw.weekId);
    const list = playerWeeksByWeekId.get(weekKey) ?? [];
    list.push(pw);
    playerWeeksByWeekId.set(weekKey, list);
  });
  const teamWeeksByWeekId = new Map();
  rawTeamWeeks.forEach((tw) => {
    const weekKey = String(tw.weekId);
    const list = teamWeeksByWeekId.get(weekKey) ?? [];
    list.push(tw);
    teamWeeksByWeekId.set(weekKey, list);
  });

  const teamWeeksOutput = [];
  const playerWeeksOutput = [];
  const playerDaysOutput = [];

  if (seasonStats) {
    updateTeamStatsFromWeeks(
      seasonId,
      weeks,
      teams,
      rawPlayerDays,
      rawPlayerWeeks,
      rawTeamWeeks,
    );
    updatePlayerStatsForSeasonCustom(seasonId, rawPlayerWeeks);
  } else {
    weekNumsArray.forEach((w) => {
      console.log("Week " + w);
      const week = weeks.find((wk) => +wk.weekNum === +w);
      if (!week) return;
      const weekKey = String(week.id);
      const pdys = playerDaysByWeekId.get(weekKey) ?? [];
      const pwks = playerWeeksByWeekId.get(weekKey) ?? [];
      const twks = teamWeeksByWeekId.get(weekKey) ?? [];
      scrapeYahooMatchupTablesforWeek(
        w,
        seasonId,
        seasonCode,
        week,
        playerById,
        players,
        teamByYahooId,
        pdys,
        pwks,
        twks,
        playerDaysOutput,
        playerWeeksOutput,
        teamWeeksOutput,
        skipDays,
        hasPM,
        createMissingWeeks,
      );
    });

    upsertSheetByKeys(
      playerDayWorkbookId,
      "PlayerDayStatLine",
      ["id"],
      playerDaysOutput,
      { idColumn: "id", updatedAtColumn: "updatedAt" },
    );
    upsertSheetByKeys(
      PLAYERSTATS_SPREADSHEET_ID,
      "PlayerWeekStatLine",
      ["weekId", "gshlTeamId", "playerId"],
      playerWeeksOutput,
      { idColumn: "id", updatedAtColumn: "updatedAt" },
    );
    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
      ["weekId", "gshlTeamId"],
      teamWeeksOutput,
      { idColumn: "id", updatedAtColumn: "updatedAt" },
    );
  }
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
) {
  const dates = getDatesInRangeInclusive(week.startDate, week.endDate);
  const playerDaysByDate = new Map();
  rawPlayerDays.forEach((pd) => {
    const dateKey = String(pd.date);
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
        weekNum,
        playerById,
        players,
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
          d,
          playerById,
          playerDays,
          teamByYahooId,
          playerDaysOutput,
          hasPM,
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
  weekId,
  playerById,
  players,
  playerWeeks,
  teamWeeks,
  teamByYahooId,
  playerWeeksOutput,
  teamWeeksOutput,
  hasPM,
  createMissingWeeks,
) {
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
  let matchupTables = fetchYahooMatchupTables(url).tables;
  matchupTables = [
    matchupTables[1],
    ...matchupTables.slice(matchupTables.length - 3, matchupTables.length - 1),
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
    weekId,
    playerById,
    players,
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
    weekId,
    playerById,
    players,
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
 * @param {string|number} weekId Yahoo matchup week id (week query param).
 * @param {string} d Date string (YYYY-MM-DD) used in Yahoo `date` query param.
 * @param {Map<string, Object>} playerById Player lookup map by player id.
 * @param {Object[]} playerDays Existing player-day stat lines for the date.
 * @param {Map<string, Object>} teamByYahooId Team lookup map by Yahoo team id.
 * @param {Object[]} playerDaysOutput Output array to append updated player-day stat lines.
 */
function processTwoTeamMatchupDatePage(
  seasonCode,
  teamAId,
  teamBId,
  seasonId,
  weekId,
  d,
  playerById,
  playerDays,
  teamByYahooId,
  playerDaysOutput,
  hasPM,
) {
  let url =
    "https://hockey.fantasysports.yahoo.com/" +
    (2013 + +seasonId) +
    "/hockey/" +
    seasonCode +
    "/matchup?week=" +
    weekId +
    "&date=" +
    d +
    "&mid1=" +
    teamAId +
    "&mid2=" +
    teamBId;
  let matchupTables = fetchYahooMatchupTables(url).tables;
  matchupTables = matchupTables.slice(
    matchupTables.length - 3,
    matchupTables.length - 1,
  );
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
    playerDays,
    teamAMatchupTables,
    d,
    teamByYahooId.get(String(teamAId)),
    playerDaysOutput,
    hasPM,
  );
  processTeamMatchupDate(
    playerById,
    playerDays,
    teamBMatchupTables,
    d,
    teamByYahooId.get(String(teamBId)),
    playerDaysOutput,
    hasPM,
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
  playerById,
  players,
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

  let teamPlayerWeeks = playerWeeks.filter((pd) => pd.gshlTeamId === team.id);
  let teamWeek = teamWeeks.find((pd) => pd.gshlTeamId === team.id);

  if (!teamWeek) {
    if (!createMissingWeeks) return;
    teamWeek = {
      seasonId: team.seasonId,
      gshlTeamId: team.id,
      weekId,
    };
  }

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
      matchupTables[0][0] + " - Wins " + teamWeek.W + " -> " + teamStats[idx.W],
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
      matchupTables[0][0] + " - GA " + teamWeek.GA + " -> " + teamStats[idx.GA],
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
      matchupTables[0][0] + " - SV " + teamWeek.SV + " -> " + teamStats[idx.SV],
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
      matchupTables[0][0] + " - SA " + teamWeek.SA + " -> " + teamStats[idx.SA],
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
  var updatedTeamIRP = 0;
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
        const plyr = players.find(
          (p) =>
            p.fullName ===
            row[1].split("W,")[0].split("L,")[0].split("PPD")[0].trim(),
        );
        if (!plyr) {
          console.log("Missing Player: " + row);
          return null;
        }

        const out = {
          playerId: plyr.id,
          gshlTeamId: team.id,
          weekId,
          seasonId: team.seasonId,
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
        const plyr = players.find(
          (p) =>
            p.fullName ===
            row[1].split("W,")[0].split("L,")[0].split("PPD")[0].trim(),
        );
        if (!plyr) {
          console.log("Missing Player: " + row);
          return null;
        }

        const out = {
          playerId: plyr.id,
          gshlTeamId: team.id,
          weekId,
          seasonId: team.seasonId,
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

      updatedTeamGP += +pd.GP || 0;
      updatedTeamMG += +pd.MG || 0;
      updatedTeamIR += +pd.IR || 0;
      updatedTeamIRP += +pd.IRP || 0;
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
            plyr.fullName + " - Shots " + pd.SOG + " -> " + skaterStats[sogIdx],
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
            plyr.fullName + " - Hits " + pd.HIT + " -> " + skaterStats[hitIdx],
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
  teamWeek.IRP = updatedTeamIRP;
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
function processTeamMatchupDate(
  playerById,
  playerDays,
  matchupTables,
  date,
  team,
  playerDaysOutput,
  hasPM,
) {
  if (!team) return;
  let teamPlayerDays = playerDays.filter((pd) => pd.gshlTeamId === team.id);
  teamPlayerDays = teamPlayerDays.map((pd) => {
    const plyr = playerById.get(String(pd.playerId));
    if (!plyr) {
      console.log(pd);
      return pd;
    }
    if (pd.posGroup === "G") {
      const stats = matchupTables[1].find(
        (b) =>
          b[2].split("W,")[0].split("L,")[0].split("PPD")[0].trim() ===
          plyr.fullName,
      );
      if (stats) {
        if (stats[3] && stats[3] !== "" && stats[3] !== "-") {
          pd.GP = "1";
        } else {
          pd.GP = null;
        }
        if (
          stats[3] &&
          stats[3] !== "" &&
          stats[3] !== "-" &&
          ["BN", "IR+", "IR"].includes(stats[0])
        ) {
          pd.GS = "1";
        } else {
          pd.GS = null;
        }
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
            plyr.fullName + " - Save Percentage " + pd.SVP + " -> " + stats[5],
          );
          pd.SVP = +stats[5];
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
        pd.W = null;
        pd.GAA = null;
        pd.SVP = null;
        return pd;
      }
      return pd;
    }
    const stats = matchupTables[0].find(
      (b) =>
        b[2].split("W,")[0].split("L,")[0].split("PPD")[0].trim() ===
        plyr.fullName,
    );
    if (stats) {
      if (stats[3] && stats[3] !== "" && stats[3] !== "-") {
        pd.GP = "1";
      } else {
        pd.GP = null;
      }
      if (
        stats[3] &&
        stats[3] !== "" &&
        stats[3] !== "-" &&
        ["BN", "IR+", "IR"].includes(stats[0])
      ) {
        pd.GS = "1";
      } else {
        pd.GS = null;
      }
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
          plyr.fullName + " - Shots " + pd.SOG + " -> " + stats[hasPM ? 8 : 7],
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
    pd.dailyPos = stats[0];
    return pd;
  });
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
    if (!isStarter(pd)) return;
    const teamId = pd.gshlTeamId?.toString();
    const weekId = pd.weekId?.toString();
    if (!teamId || !weekId) return;
    const dateKey = formatDateOnly(pd.date);
    const mapKey = `${teamId}_${dateKey}`;
    if (!teamDayMap.has(mapKey)) {
      teamDayMap.set(
        mapKey,
        createTeamDayBucket(seasonId, teamId, weekId, dateKey),
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
  const teamSeasonRows = teamSeasonStats.map(buildTeamSeasonRow);

  upsertSheetByKeys(SPREADSHEET_ID, "Matchup", ["id"], matchups, {
    idColumn: "id",
    createdAtColumn: "createdAt",
    updatedAtColumn: "updatedAt",
  });

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

/**
 * Formats a TeamWeek stat bucket into the custom row shape expected by sheets.
 */
function buildTeamWeekCustomRow(week) {
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
      aggregated.days += week.days;
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
    playerSplitStatLine.Rating = rankPerformance(playerSplitStatLine).score;
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
    playerTotalStatLine.Rating = rankPerformance(playerTotalStatLine).score;
    playerTotals.push(playerTotalStatLine);
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
    var props2 = PropertiesService.getScriptProperties().getProperties() || {};
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
      var innerMatch = cellHtml.match(/<(th|td)\b[^>]*>([\s\S]*?)<\/(th|td)>/i);
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
