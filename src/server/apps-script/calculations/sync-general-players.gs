/**
 * Sync Player fields in GENERAL.Player from PLAYERSTATS.PlayerNHLStatLine
 * Updates: seasonRk, seasonRating, overallRk, overallRating, salary, age
 * Source: most recent season rows (default seasonId = 11)
 */
function updateGeneralPlayersFromNHL(seasonId) {
  const logger = createLogger("SyncPlayers");
  const sid = toNumber(seasonId != null ? seasonId : 11);
  logger.info(
    `Starting Player sync from PlayerNHLStatLine for season ${sid}...`,
  );

  // Read season rows from PlayerNHLStatLine (season = sid)
  const nhlRows = readSheetData("PLAYERSTATS", "PlayerNHLStatLine", {
    filter: (r) => toNumber(r.seasonId) === sid,
  });
  if (!nhlRows || nhlRows.length === 0) {
    logger.warn(`No PlayerNHLStatLine rows found for season ${sid}`);
    return {
      success: false,
      updated: 0,
      seasonId: sid,
      message: "No source rows",
    };
  }

  // Build latest-by-player map (all rows are same season, pick deterministic one)
  const byPlayer = new Map();
  for (let i = 0; i < nhlRows.length; i++) {
    const r = nhlRows[i];
    const pid = toNumber(r.playerId);
    if (!pid) continue;
    const cur = byPlayer.get(pid);
    if (!cur || toNumber(r.id) > toNumber(cur.id)) byPlayer.set(pid, r);
  }

  // Read all prior seasons to enable projections for missing players
  const priorRows = readSheetData("PLAYERSTATS", "PlayerNHLStatLine", {
    filter: (r) => toNumber(r.seasonId) < sid,
  });
  const historyByPid = new Map();
  const latestPriorByPid = new Map();
  for (let i = 0; i < priorRows.length; i++) {
    const r = priorRows[i];
    const pid = toNumber(r.playerId);
    if (!pid) continue;
    if (!historyByPid.has(pid)) historyByPid.set(pid, []);
    historyByPid.get(pid).push(r);
    const cur = latestPriorByPid.get(pid);
    if (!cur || toNumber(r.seasonId) > toNumber(cur.seasonId)) {
      latestPriorByPid.set(pid, r);
    }
  }

  // ALSO: Read PlayerTotalStatLine and PlayerSplitStatLine to compute isSignable
  const totalsRows = readSheetData("PLAYERSTATS", "PlayerTotalStatLine") || [];
  const splitsRows = readSheetData("PLAYERSTATS", "PlayerSplitStatLine") || [];
  // Read contracts to suppress signable if currently under contract
  const contractRows = readSheetData("GENERAL", "Contract") || [];

  // Build totals days per player for the current season (sid)
  const totalsDaysByPid = new Map(); // pid -> total days in sid
  for (let i = 0; i < totalsRows.length; i++) {
    const r = totalsRows[i];
    const pid = toNumber(r.playerId);
    const season = toNumber(r.seasonId);
    if (!pid || season !== sid) continue;
    const daysVal =
      r.days != null ? toNumber(r.days) : r.Days != null ? toNumber(r.Days) : 0;
    const cur = totalsDaysByPid.get(pid) || 0;
    totalsDaysByPid.set(pid, cur + (isNaN(daysVal) ? 0 : daysVal));
  }

  // Build split days per player+team for the current season (sid)
  const splitDaysByPidTeam = new Map(); // `${pid}_${teamId}` -> total days in sid
  for (let i = 0; i < splitsRows.length; i++) {
    const r = splitsRows[i];
    const pid = toNumber(r.playerId);
    const teamId =
      r.gshlTeamId != null
        ? toNumber(r.gshlTeamId)
        : r.Team != null
          ? toNumber(r.Team)
          : r.teamId != null
            ? toNumber(r.teamId)
            : null;
    const season = toNumber(r.seasonId);
    if (!pid || !teamId || season !== sid) continue;
    const daysVal =
      r.days != null ? toNumber(r.days) : r.Days != null ? toNumber(r.Days) : 0;
    const key = `${pid}_${teamId}`;
    const cur = splitDaysByPidTeam.get(key) || 0;
    splitDaysByPidTeam.set(key, cur + (isNaN(daysVal) ? 0 : daysVal));
  }

  // Open GENERAL.Player for in-place updates
  const generalWb = getWorkbook("GENERAL");
  const sheet = generalWb.getSheetByName("Player");
  if (!sheet) throw new Error("Player sheet not found in GENERAL workbook");

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) {
    logger.warn("Player sheet has no data");
    return {
      success: false,
      updated: 0,
      seasonId: sid,
      message: "No target rows",
    };
  }

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const colIndex = (name) => headers.indexOf(name) + 1;
  const idCol = colIndex("id");
  const seasonRkCol = colIndex("seasonRk") || colIndex("SeasonRk");
  const seasonRatingCol = colIndex("seasonRating") || colIndex("SeasonRating");
  const overallRkCol = colIndex("overallRk") || colIndex("OverallRk");
  const overallRatingCol =
    colIndex("overallRating") || colIndex("OverallRating");
  const salaryCol = colIndex("salary") || colIndex("Salary");
  const ageCol = colIndex("age") || colIndex("Age");
  const isSignableCol = colIndex("isSignable") || colIndex("IsSignable");
  const gshlTeamIdCol = colIndex("gshlTeamId") || colIndex("GSHLTeamId");
  const isActiveCol = colIndex("isActive") || colIndex("IsActive");

  // Build active contract map (reconstructed in correct location)
  const activeContractMap = new Map();
  const activeContractByPid = new Map();
  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);
  const currentYear = todayMid.getFullYear();
  // Track current-year expiry statuses per player
  const ufaExpiryThisYearByPid = new Map();
  const rfaExpiryThisYearByPid = new Map();
  for (let i = 0; i < contractRows.length; i++) {
    const c = contractRows[i];
    const pid = toNumber(c.playerId != null ? c.playerId : c.PlayerId);
    if (!pid) continue;
    const teamId =
      c.currentFranchiseId != null
        ? toNumber(c.currentFranchiseId)
        : c.signingFranchiseId != null
          ? toNumber(c.signingFranchiseId)
          : c.franchiseId != null
            ? toNumber(c.franchiseId)
            : null;
    // Active determination ONLY by expiryDate (inclusive): expiryDate >= today -> active
    let expiry = c.expiryDate || c.ExpiryDate || null;
    if (typeof expiry === "string" && expiry) {
      const parsed = new Date(expiry);
      if (!isNaN(parsed.getTime())) expiry = parsed;
      else expiry = null;
    }
    if (!(expiry instanceof Date)) continue; // malformed => treat as not active
    const expMid = new Date(expiry.getTime());
    expMid.setHours(0, 0, 0, 0);
    if (expMid.getTime() >= todayMid.getTime()) {
      activeContractByPid.set(pid, true);
      if (teamId != null && !isNaN(teamId))
        activeContractMap.set(`${pid}_${teamId}`, true);
    }
    // Record expiry status for contracts expiring in the current calendar year
    if (expMid.getFullYear() === currentYear) {
      const statusRaw =
        c.expiryStatus != null
          ? String(c.expiryStatus).trim().toUpperCase()
          : c.ExpiryStatus != null
            ? String(c.ExpiryStatus).trim().toUpperCase()
            : "";
      if (statusRaw === "UFA") {
        ufaExpiryThisYearByPid.set(pid, true);
      } else if (statusRaw === "RFA") {
        rfaExpiryThisYearByPid.set(pid, true);
      }
    }
  }

  if (!idCol) throw new Error("Required column 'id' not found on Player sheet");
  const missing = [];
  if (!seasonRkCol) missing.push("seasonRk");
  if (!seasonRatingCol) missing.push("seasonRating");
  if (!overallRkCol) missing.push("overallRk");
  if (!overallRatingCol) missing.push("overallRating");
  if (!salaryCol) missing.push("salary");
  if (!ageCol) missing.push("age");
  if (!isSignableCol) missing.push("isSignable");
  if (!isActiveCol) missing.push("isActive");
  if (missing.length) {
    throw new Error(
      `Missing required columns on Player sheet: ${missing.join(", ")}`,
    );
  }

  const idVals = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  const teamVals = gshlTeamIdCol
    ? sheet.getRange(2, gshlTeamIdCol, lastRow - 1, 1).getValues()
    : new Array(lastRow - 1).fill([null]);
  const isActiveVals = sheet
    .getRange(2, isActiveCol, lastRow - 1, 1)
    .getValues();
  const n = idVals.length;

  // First pass: build rating map per pid (actual or projected)
  const ratingMap = new Map(); // pid -> { seasonRating, overallRating, salary, age, projected }
  for (let i = 0; i < n; i++) {
    const pid = toNumber(idVals[i][0]);
    if (!pid) continue;

    const src = byPlayer.get(pid);
    if (src) {
      const seasonRating =
        src.SeasonRating != null ? toNumber(src.SeasonRating) : null;
      const overallRating =
        src.OverallRating != null ? toNumber(src.OverallRating) : null;
      const salary = src.Salary != null ? toNumber(src.Salary) : null;
      const age =
        src.age != null
          ? toNumber(src.age)
          : src.Age != null
            ? toNumber(src.Age)
            : null;
      ratingMap.set(pid, {
        seasonRating,
        overallRating,
        salary,
        age,
        projected: false,
      });
      continue;
    }

    // No current season row: try projection from prior history
    const history = historyByPid.get(pid) || [];
    const latest = latestPriorByPid.get(pid);
    const hasPrevSeason = latest && toNumber(latest.seasonId) === sid - 1;
    if (hasPrevSeason) {
      // Use existing multi-season projection utility (0-100 scale)
      const projectedOverall = calculatePlayerOverallMultiSeasonRating(history);
      // Use projected overall as a proxy for current-season rating
      const projectedSeason = projectedOverall;
      let age =
        latest && (latest.age != null || latest.Age != null)
          ? latest.age != null
            ? toNumber(latest.age)
            : toNumber(latest.Age)
          : null;
      // Since projecting from exactly one season back, increment age by 1
      if (typeof age === "number" && !isNaN(age)) {
        age = age + 1;
      }
      ratingMap.set(pid, {
        seasonRating: isNaN(projectedSeason) ? null : projectedSeason,
        overallRating: isNaN(projectedOverall) ? null : projectedOverall,
        salary: null, // compute later from rank
        age,
        projected: true,
      });
    } else {
      // Do not project if no last-season stats
      ratingMap.set(pid, {
        seasonRating: null,
        overallRating: null,
        salary: null,
        age: null,
        projected: true,
      });
    }
  }

  // Build arrays for ranking including projected players
  const seasonRated = [];
  const overallRated = [];
  for (const [pid, vals] of ratingMap.entries()) {
    if (typeof vals.seasonRating === "number" && !isNaN(vals.seasonRating)) {
      seasonRated.push({ pid, val: vals.seasonRating });
    }
    if (typeof vals.overallRating === "number" && !isNaN(vals.overallRating)) {
      overallRated.push({ pid, val: vals.overallRating });
    }
  }
  seasonRated.sort((a, b) => b.val - a.val || a.pid - b.pid);
  overallRated.sort((a, b) => b.val - a.val || a.pid - b.pid);

  const seasonRankByPid = new Map();
  const overallRankByPid = new Map();
  for (let i = 0; i < seasonRated.length; i++)
    seasonRankByPid.set(seasonRated[i].pid, i + 1);
  for (let i = 0; i < overallRated.length; i++)
    overallRankByPid.set(overallRated[i].pid, i + 1);

  // Prepare output arrays
  const seasonRkOut = new Array(n);
  const seasonRatingOut = new Array(n);
  const overallRkOut = new Array(n);
  const overallRatingOut = new Array(n);
  const salaryOut = new Array(n);
  const ageOut = new Array(n);
  const isSignableOut = new Array(n);

  // Salary anchors from existing config (if available)
  const anchors =
    typeof PLAYER_NHL_SALARY_CONFIG !== "undefined" &&
    PLAYER_NHL_SALARY_CONFIG.anchors
      ? PLAYER_NHL_SALARY_CONFIG.anchors.slice().sort((a, b) => a.rank - b.rank)
      : [];

  let updated = 0;
  for (let i = 0; i < n; i++) {
    const pid = toNumber(idVals[i][0]);
    const vals = ratingMap.get(pid);

    const sr =
      vals && typeof vals.seasonRating === "number" && !isNaN(vals.seasonRating)
        ? vals.seasonRating
        : "";
    const or =
      vals &&
      typeof vals.overallRating === "number" &&
      !isNaN(vals.overallRating)
        ? vals.overallRating
        : "";

    const active = !!(isActiveVals && isActiveVals[i] && isActiveVals[i][0]);

    seasonRkOut[i] = [active ? seasonRankByPid.get(pid) || "" : ""];
    seasonRatingOut[i] = [active ? sr : ""];
    overallRkOut[i] = [active ? overallRankByPid.get(pid) || "" : ""];
    overallRatingOut[i] = [active ? or : ""];

    // Salary: keep actual if present; otherwise derive from overall rank via anchors if available
    let sal =
      vals && typeof vals.salary === "number" && !isNaN(vals.salary)
        ? vals.salary
        : null;
    let computedFromAnchors = false;
    if (
      (sal == null || isNaN(sal)) &&
      anchors.length &&
      overallRankByPid.has(pid)
    ) {
      const rank = overallRankByPid.get(pid);
      sal = getSalaryForRank(rank, anchors);
      computedFromAnchors = true;
    }
    // Apply 15% salary boost for RFA contracts expiring this calendar year
    let boosted = false;
    if (sal != null && !isNaN(sal) && rfaExpiryThisYearByPid.get(pid)) {
      sal = sal * 1.15;
      boosted = true;
    }
    // Round only if computed from anchors or boosted
    if (sal != null && !isNaN(sal) && (computedFromAnchors || boosted)) {
      sal = roundToNearest(sal, 5000);
    }
    // Blank salary for inactive players
    salaryOut[i] = [active && sal != null && !isNaN(sal) ? sal : ""];

    // Age: keep actual if present; else use most recent prior age if available
    const ageVal =
      vals && typeof vals.age === "number" && !isNaN(vals.age) ? vals.age : "";
    ageOut[i] = [ageVal];

    // Compute isSignable based on latest totals (>120 days) OR latest split for same team (>80 days) in current season
    const teamId = gshlTeamIdCol ? toNumber(teamVals[i][0]) : null;
    const totalsDays = totalsDaysByPid.get(pid) || 0;
    let signable = false;
    if (totalsDays > 120) {
      signable = true;
    } else if (teamId != null && !isNaN(teamId)) {
      const splitDays = splitDaysByPidTeam.get(`${pid}_${teamId}`) || 0;
      if (splitDays > 80) signable = true;
    }
    // Override: if active contract exists for player/team then NOT signable
    if (
      (teamId != null &&
        !isNaN(teamId) &&
        activeContractMap.get(`${pid}_${teamId}`)) ||
      activeContractByPid.get(pid)
    ) {
      signable = false;
    }
    // Also: if contract expired in current year and status is UFA, not signable
    if (ufaExpiryThisYearByPid.get(pid)) {
      signable = false;
    }
    isSignableOut[i] = [!!signable];

    if (sr !== "" || or !== "" || salaryOut[i][0] !== "" || ageOut[i][0] !== "")
      updated++;
  }

  // Batch write each column
  sheet.getRange(2, seasonRkCol, n, 1).setValues(seasonRkOut);
  sheet.getRange(2, seasonRatingCol, n, 1).setValues(seasonRatingOut);
  sheet.getRange(2, overallRkCol, n, 1).setValues(overallRkOut);
  sheet.getRange(2, overallRatingCol, n, 1).setValues(overallRatingOut);
  sheet.getRange(2, salaryCol, n, 1).setValues(salaryOut);
  sheet.getRange(2, ageCol, n, 1).setValues(ageOut);
  sheet.getRange(2, isSignableCol, n, 1).setValues(isSignableOut);

  logger.info(`Updated ${updated} player rows from season ${sid}`);
  return { success: true, updated, totalPlayers: n, seasonId: sid };
}

// Convenience wrapper for season 11
function updateGeneralPlayersFromNHLSeason11() {
  return updateGeneralPlayersFromNHL(11);
}

// Helper: project a player's multi-season overall from prior season rows
function calculatePlayerOverallMultiSeasonRating(rows) {
  if (!rows || !rows.length) return 0;
  try {
    return ratings_computeMultiPeriodOverall(rows, {
      seasonsToConsider: PLAYER_NHL_CAREER_RATING_CONFIG.seasonsToConsider,
      recencyWeights: PLAYER_NHL_CAREER_RATING_CONFIG.recencyWeights,
      seasonIdKey: "seasonId",
      valueGetter: function (rec) {
        if (rec.OverallRating != null) return toNumber(rec.OverallRating);
        const forCalc = rec.stats && rec.stats.length ? rec.stats[0] : null;
        return forCalc && forCalc.rating != null ? toNumber(forCalc.rating) : 0;
      },
    });
  } catch (e) {
    logError("calculatePlayerOverallMultiSeasonRating", e);
  }
  return 0;
}

// Wrapper utilities (bridge to ratings engine names) to avoid ReferenceError
function getSalaryForRank(rank, anchors) {
  return typeof ratings_getSalaryForRank === "function"
    ? ratings_getSalaryForRank(rank, anchors)
    : 0;
}
function roundToNearest(value, step) {
  return typeof ratings_roundToNearest === "function"
    ? ratings_roundToNearest(value, step)
    : value;
}
