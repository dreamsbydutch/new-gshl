/**
 * GSHL Yahoo Scraper
 *
 * Fetches team rosters from Yahoo Fantasy Hockey and processes player data
 */

// @ts-nocheck

/**
 * Get current season and week context with all active teams and players
 *
 * @returns {Object} Context object containing:
 *   - seasonId: Current season ID
 *   - weekId: Current week ID
 *   - season: Season data object
 *   - week: Week data object
 *   - teams: Array of team objects for current season
 *   - players: Array of active player objects
 */
function updatePlayerDays() {
  const now = new Date();
  const hour = now.getHours();
  const mins = now.getMinutes();
  if (
    (hour > 1 && hour < 4) ||
    (hour === 4 && mins > 20) ||
    (hour > 4 && hour < 8) ||
    (hour === 8 && mins > 20) ||
    (hour > 8 && hour < 12)
  )
    return;
  try {
    // Get current date
    const targetDate = getTargetDateForScraping();
    const prevDate = getPreviousDate(targetDate);
    const playerDays = [];
    const teamDays = [];

    // Step 1: Get active data
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

    // Create lookup maps for O(1) access instead of O(n) find() calls
    const playersByYahooId = new Map();
    players.forEach((p) => playersByYahooId.set(p.yahooId, p));

    const teamsByFranchiseId = new Map();
    teams.forEach((t) => teamsByFranchiseId.set(t.franchiseId, t));

    // Split existing player days by date in single pass
    const yesterdayMap = new Map();
    const existingMap = new Map();
    existingPlayerDays.forEach((p) => {
      const key = `${p.playerId}_${p.gshlTeamId}`;
      const normalizedDate = formatDateOnly(p.date);
      if (normalizedDate === prevDate) {
        yesterdayMap.set(key, p);
      } else if (normalizedDate === targetDate) {
        existingMap.set(key, p);
      }
    });

    // Pre-calculate season/week IDs as strings
    const seasonIdStr = season.id.toString();
    const weekIdStr = week.id.toString();

    let globalIndex = 0; // Global counter for new player IDs
    franchises.forEach((f) => {
      const gshlTeam = teamsByFranchiseId.get(f.id);
      if (!gshlTeam) return; // Skip if no team found

      const roster = yahooTableScraper(targetDate, gshlTeam.yahooId, season.id)
        .map((p) => {
          if (p.playerName === "") return;

          // Look up player by Yahoo ID
          const player = playersByYahooId.get(p.yahooId);
          if (!player) return; // Skip if player not found

          const playerId = player.id.toString();
          const lookupKey = `${playerId}_${gshlTeam.id.toString()}`;

          // Check for yesterday and existing records using maps
          const yest = yesterdayMap.get(lookupKey);
          const existing = existingMap.get(lookupKey);

          // Build player day object
          p.id = existing ? existing.id : undefined;
          p.date = targetDate;
          p.playerId = playerId;
          p.seasonId = seasonIdStr;
          p.weekId = weekIdStr;
          p.gshlTeamId = gshlTeam.id;
          p.posGroup = p.nhlPos.includes("G")
            ? "G"
            : p.nhlPos.includes("D")
              ? "D"
              : "F";
          p.bestPos = "";
          p.fullPos = "";
          const rating = rankPerformance(p);
          p.Rating = rating.score;
          p.ADD = !yest ? 1 : "";
          p.BS = "";
          p.MS = "";
          return p;
        })
        .filter(Boolean);
      const lineup = optimizeLineup(roster).map((p) => {
        p.BS = p.GS === "1" && p.bestPos === "BN" ? 1 : "";
        p.MS = p.GP === "1" && p.GS !== "1" && p.fullPos !== "BN" ? 1 : "";
        p.nhlPos = p.nhlPos.toString();
        return p;
      });
      const skaterStart =
        lineup.filter((x) => x.posGroup !== "G" && x.GP === "1").length > 0;
      const goalieStart =
        lineup.filter((x) => x.posGroup === "G" && x.GP === "1").length > 0;

      playerDays.push(...lineup);
      const teamDayStatLine = {
        date: targetDate,
        gshlTeamId: gshlTeam.id,
        seasonId: seasonIdStr,
        weekId: weekIdStr,
        GP: lineup.reduce((p, c) => (p += +c.GP), 0).toString(),
        MG: lineup.reduce((p, c) => (p += +c.MG), 0).toString(),
        IR: lineup.reduce((p, c) => (p += +c.IR), 0).toString(),
        IRplus: lineup.reduce((p, c) => (p += +c.IRplus), 0).toString(),
        GS: lineup.reduce((p, c) => (p += +c.GS), 0).toString(),
        G: skaterStart
          ? lineup.reduce((p, c) => (p += +c.G), 0).toString()
          : "",
        A: skaterStart
          ? lineup.reduce((p, c) => (p += +c.A), 0).toString()
          : "",
        P: skaterStart
          ? lineup.reduce((p, c) => (p += +c.P), 0).toString()
          : "",
        PM:
          +season.id <= 6 && skaterStart
            ? lineup.reduce((p, c) => (p += +c.PM), 0).toString()
            : "",
        PIM:
          +season.id <= 4 && skaterStart
            ? lineup.reduce((p, c) => (p += +c.PIM), 0).toString()
            : "",
        PPP: skaterStart
          ? lineup.reduce((p, c) => (p += +c.PPP), 0).toString()
          : "",
        SOG: skaterStart
          ? lineup.reduce((p, c) => (p += +c.SOG), 0).toString()
          : "",
        HIT: skaterStart
          ? lineup.reduce((p, c) => (p += +c.HIT), 0).toString()
          : "",
        BLK: skaterStart
          ? lineup.reduce((p, c) => (p += +c.BLK), 0).toString()
          : "",
        W: goalieStart
          ? lineup.reduce((p, c) => (p += +c.W), 0).toString()
          : "",
        GA: goalieStart
          ? lineup.reduce((p, c) => (p += +c.GA), 0).toString()
          : "",
        GAA: goalieStart
          ? (
              (lineup.reduce((p, c) => (p += +c.GA), 0) /
                lineup.reduce((p, c) => (p += +c.TOI), 0)) *
              60
            )
              .toFixed(5)
              .toString()
          : "",
        SV: goalieStart
          ? lineup.reduce((p, c) => (p += +c.SV), 0).toString()
          : "",
        SA: goalieStart
          ? lineup.reduce((p, c) => (p += +c.SA), 0).toString()
          : "",
        SVP: goalieStart
          ? (
              lineup.reduce((p, c) => (p += +c.SV), 0) /
              lineup.reduce((p, c) => (p += +c.SA), 0)
            )
              .toFixed(6)
              .toString()
          : "",
        SO:
          +season.id <= 4 && goalieStart
            ? lineup.reduce((p, c) => (p += +c.SO), 0).toString()
            : "",
        TOI: goalieStart
          ? lineup.reduce((p, c) => (p += +c.TOI), 0).toString()
          : "",
        Rating: "",
        ADD: lineup.reduce((p, c) => (p += +c.ADD), 0).toString(),
        MS: lineup.reduce((p, c) => (p += +c.MS), 0).toString(),
        BS: lineup.reduce((p, c) => (p += +c.BS), 0).toString(),
      };
      teamDayStatLine.Rating = rankPerformance(teamDayStatLine);
      teamDays.push(teamDayStatLine);
    });

    // Upsert player days - this will update existing rows and insert new ones
    // deleteMissing will delete entire rows for players that were dropped (no longer on roster for this date)
    upsertSheetByKeys(
      CURRENT_PLAYERDAY_SPREADSHEET_ID,
      "PlayerDayStatLine",
      ["playerId", "gshlTeamId", "date"],
      playerDays,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
        deleteMissing: { date: targetDate }, // Delete rows for dropped players on this date
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
