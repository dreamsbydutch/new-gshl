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

  // ========================================================================
  // UPDATED: Determine each player's team assignment from the MOST RECENT WEEK
  // Requirement refinement: We cannot rely on numeric weekId ordering. Instead
  // we must read the GENERAL.Week table and pick the week whose endDate (or
  // startDate if endDate missing) is most recent (max chronological date).
  // Then pull PlayerWeekStatLine rows for only that weekId and map playerId->team.
  // If a player lacks a row for that final week OR the team is blank, set
  // gshlTeamId to null (blank) for that player.
  // ========================================================================
  const weekRows = readSheetData("GENERAL", "Week") || [];
  let finalWeekId = null;
  if (weekRows.length) {
    let best = null; // {weekId, date}
    for (let i = 0; i < weekRows.length; i++) {
      const w = weekRows[i];
      const endD = w.endDate instanceof Date ? w.endDate : null;
      const startD = w.startDate instanceof Date ? w.startDate : null;
      const candidate = endD || startD || null;
      if (!candidate) continue;
      if (!best || candidate.getTime() > best.date.getTime()) {
        best = { weekId: toNumber(w.id), date: candidate };
      } else if (best && candidate.getTime() === best.date.getTime()) {
        // Tie-breaker: prefer larger id (deterministic)
        const wid = toNumber(w.id);
        if (wid > best.weekId) best = { weekId: wid, date: candidate };
      }
    }
    finalWeekId = best ? best.weekId : null;
  }

  const playerWeekRowsAll = finalWeekId
    ? readSheetData("PLAYERSTATS", "PlayerWeekStatLine", {
        filter: (r) => toNumber(r.weekId) === finalWeekId,
      })
    : [];
  const finalWeekTeamByPid = new Map(); // pid -> { teamId, _rid }
  for (let i = 0; i < playerWeekRowsAll.length; i++) {
    const r = playerWeekRowsAll[i];
    const pid = toNumber(r.playerId);
    if (!pid) continue;
    const teamIdRaw = r.gshlTeamId != null ? toNumber(r.gshlTeamId) : null;
    const thisRowId = toNumber(r.id) || 0;
    const existing = finalWeekTeamByPid.get(pid);
    const existingRowId = existing ? existing._rid : -1;
    if (thisRowId >= existingRowId) {
      finalWeekTeamByPid.set(pid, {
        teamId:
          teamIdRaw != null && !isNaN(teamIdRaw) && teamIdRaw !== 0
            ? teamIdRaw
            : null,
        _rid: thisRowId,
      });
    }
  }
  logger.info(
    `Final week team mapping built (weekId=${finalWeekId || "N/A"}) with ${finalWeekTeamByPid.size} player entries`,
  );

  // Map each season team (gshlTeamId) to its franchiseId for final output.
  // If multiple seasons reuse team ids differently this may need season scoping; current
  // assumption: team.id values are unique or map consistently to a franchise across seasons.
  const teamRows = readSheetData("GENERAL", "Team") || [];
  const franchiseByTeamId = new Map();
  for (let i = 0; i < teamRows.length; i++) {
    const tr = teamRows[i];
    const tid = toNumber(tr.id);
    const fid = tr.franchiseId != null ? toNumber(tr.franchiseId) : null;
    if (tid && fid) franchiseByTeamId.set(tid, fid);
  }
  logger.info(
    `Franchise map built with ${franchiseByTeamId.size} entries (team->franchise)`,
  );

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

  // Build fallback latest team from totals gshlTeamIds (player season totals) for current season
  // Map: pid -> last teamId in sorted comma list
  const totalsLastTeamByPid = new Map();
  for (let i = 0; i < totalsRows.length; i++) {
    const tr = totalsRows[i];
    const pid = toNumber(tr.playerId);
    const season = toNumber(tr.seasonId);
    if (!pid || season !== sid) continue;
    const idsStr = tr.gshlTeamIds || tr.GshlTeamIds || tr.gshlteamids || "";
    if (idsStr && typeof idsStr === "string") {
      const parts = idsStr
        .split(/[,\s]+/)
        .map(function (p) {
          return toNumber(p);
        })
        .filter(function (n) {
          return !isNaN(n) && n != null;
        });
      if (parts.length) {
        // list already sorted ascending when created; take last
        totalsLastTeamByPid.set(pid, parts[parts.length - 1]);
      }
    }
  }

  // Index PlayerTotalStatLine rows by season & player for fast NHL team fallback
  const totalsBySeasonPid = new Map(); // seasonId -> Map(pid -> totalRow)
  for (let i = 0; i < totalsRows.length; i++) {
    const tr = totalsRows[i];
    const season = toNumber(tr.seasonId);
    const pid2 = toNumber(tr.playerId);
    if (!season || !pid2) continue;
    if (!totalsBySeasonPid.has(season))
      totalsBySeasonPid.set(season, new Map());
    // prefer later id if duplicates
    const m = totalsBySeasonPid.get(season);
    const cur = m.get(pid2);
    if (!cur || toNumber(tr.id) > toNumber(cur.id || 0)) m.set(pid2, tr);
  }

  // Build season-> (pid-> latest NHL stat row) map including prior seasons
  const seasonPlayerStatMap = new Map();
  // current season
  seasonPlayerStatMap.set(sid, byPlayer);
  // prior seasons
  for (let i = 0; i < priorRows.length; i++) {
    const r = priorRows[i];
    const s = toNumber(r.seasonId);
    const pidp = toNumber(r.playerId);
    if (!s || !pidp) continue;
    if (!seasonPlayerStatMap.has(s)) seasonPlayerStatMap.set(s, new Map());
    const mp = seasonPlayerStatMap.get(s);
    const cur = mp.get(pidp);
    if (!cur || toNumber(r.id) > toNumber(cur.id)) mp.set(pidp, r);
  }

  // Helper functions for NHL team resolution per requirements
  function isMultiTeamPlaceholder(token) {
    return !!token && /^[0-9]TM/i.test(String(token).trim());
  }
  function extractLastTeamFromTotalsRow(row) {
    if (!row) return null;
    // totals row may contain a list of NHL teams in its nhlTeam field separated by commas or spaces
    const raw = row.nhlTeam || row.NHLTeam || "";
    if (!raw) return null;
    const parts = String(raw)
      .split(/[\s,]+/)
      .map(function (p) {
        return p.trim();
      })
      .filter(function (p) {
        return !!p;
      });
    if (!parts.length) return null;
    return parts[parts.length - 1];
  }
  function resolveNhlTeam(pid) {
    // Start at current season and walk backwards until we find a usable NHL team
    for (
      let seasonCursor = sid;
      seasonCursor >= 1 && seasonCursor >= sid - 5;
      seasonCursor--
    ) {
      const map = seasonPlayerStatMap.get(seasonCursor);
      if (!map) continue;
      const row = map.get(pid);
      if (!row) continue;
      const token = row.nhlTeam || row.NHLTeam || null;
      if (token && !isMultiTeamPlaceholder(token)) {
        return String(token).trim();
      }
      // Placeholder or missing -> look at totals row for that season
      const totalsMap = totalsBySeasonPid.get(seasonCursor);
      const totalRow = totalsMap ? totalsMap.get(pid) : null;
      const lastTeam = extractLastTeamFromTotalsRow(totalRow);
      if (lastTeam) return lastTeam;
      // Otherwise continue to previous season
    }
    return null; // no data found
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
  const isResignableCol = colIndex("isResignable") || colIndex("IsResignable");
  const gshlTeamIdCol = colIndex("gshlTeamId") || colIndex("GSHLTeamId");
  // Optional NHL team text column (abbreviation) on Player sheet
  const nhlTeamCol = colIndex("nhlTeam") || colIndex("NHLTeam");
  const isActiveCol = colIndex("isActive") || colIndex("IsActive");

  // Build active contract map (reconstructed in correct location)
  const activeContractMap = new Map();
  const activeContractByPid = new Map();
  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);
  const currentYear = todayMid.getFullYear();
  // Only track contracts that have ALREADY expired recently (lookback window) for resign + salary logic
  // Assumption: "past eight months" = 240 days. Adjust LOOKBACK_DAYS if needed.
  const LOOKBACK_DAYS = 240;
  const msPerDay = 24 * 60 * 60 * 1000;
  const cutoffTime = todayMid.getTime() - LOOKBACK_DAYS * msPerDay;
  const expiredUfaRecentByPid = new Map();
  const expiredRfaRecentByPid = new Map();
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
    // Only consider contracts whose expiry date is BEFORE today and within the recent lookback window
    if (
      expMid.getTime() < todayMid.getTime() &&
      expMid.getTime() >= cutoffTime
    ) {
      const statusRaw =
        c.expiryStatus != null
          ? String(c.expiryStatus).trim().toUpperCase()
          : c.ExpiryStatus != null
            ? String(c.ExpiryStatus).trim().toUpperCase()
            : "";
      if (statusRaw === "UFA") expiredUfaRecentByPid.set(pid, true);
      else if (statusRaw === "RFA") expiredRfaRecentByPid.set(pid, true);
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
  if (!isResignableCol) missing.push("isResignable");
  if (missing.length) {
    throw new Error(
      `Missing required columns on Player sheet: ${missing.join(", ")}`,
    );
  }

  const idVals = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  const teamVals = gshlTeamIdCol
    ? sheet.getRange(2, gshlTeamIdCol, lastRow - 1, 1).getValues()
    : new Array(lastRow - 1).fill([null]);
  const nhlTeamVals = nhlTeamCol
    ? sheet.getRange(2, nhlTeamCol, lastRow - 1, 1).getValues()
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
  const isResignableOut = new Array(n);
  const gshlTeamIdOut = gshlTeamIdCol ? new Array(n) : null; // optional team updates
  const nhlTeamOut = nhlTeamCol ? new Array(n) : null; // optional NHL team text updates

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
    // Determine final-week season teamId (raw) for this player (if any)
    let latestTeamIdRaw = null; // season team id
    const finalWeekEntry = finalWeekTeamByPid.get(pid);
    if (finalWeekEntry) latestTeamIdRaw = finalWeekEntry.teamId;
    // Resolve NHL team abbreviation using multi-season fallback rules
    let resolvedNhlTeam = nhlTeamOut ? resolveNhlTeam(pid) : null;
    if (byPlayer.has(pid)) {
      const srcRow = byPlayer.get(pid);
      let fromSrc =
        srcRow.gshlTeamId != null
          ? toNumber(srcRow.gshlTeamId)
          : srcRow.Team != null
            ? toNumber(srcRow.Team)
            : srcRow.teamId != null
              ? toNumber(srcRow.teamId)
              : null;
      if (fromSrc != null && isNaN(fromSrc)) fromSrc = null;
      if (fromSrc != null) latestTeamIdRaw = fromSrc;
      // If value appears to be a string beginning with a number but not a valid team id, fallback
      // Also fallback if null after parsing
      if (latestTeamIdRaw == null) {
        const fallback = totalsLastTeamByPid.get(pid);
        if (fallback != null && !isNaN(fallback)) latestTeamIdRaw = fallback;
      }
      if (nhlTeamOut) {
        const existingAbbr =
          nhlTeamVals && nhlTeamVals[i] ? String(nhlTeamVals[i][0] || "") : "";
        nhlTeamOut[i] = [resolvedNhlTeam || existingAbbr];
        if (resolvedNhlTeam && resolvedNhlTeam !== existingAbbr) updated++;
      }
    } else {
      // No current season row; attempt fallback from totals
      const fallback = totalsLastTeamByPid.get(pid);
      if (fallback != null && !isNaN(fallback)) latestTeamIdRaw = fallback;
      // If no current season row we leave NHL team value as existing
      if (nhlTeamOut) {
        const existingAbbr =
          nhlTeamVals && nhlTeamVals[i] ? nhlTeamVals[i][0] : "";
        nhlTeamOut[i] = [resolvedNhlTeam || existingAbbr];
        if (resolvedNhlTeam && resolvedNhlTeam !== existingAbbr) updated++;
      }
    }

    // Translate raw teamId -> franchiseId for output
    let latestFranchiseId =
      latestTeamIdRaw != null && !isNaN(latestTeamIdRaw)
        ? franchiseByTeamId.get(latestTeamIdRaw) || null
        : null;
    if (latestFranchiseId === 0) latestFranchiseId = null; // treat 0 as null

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
    if (sal != null && !isNaN(sal) && expiredRfaRecentByPid.get(pid)) {
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

    // Base roster-day threshold evaluation (does NOT consider active contract yet)
    // For threshold calculations we need the RAW season team id, not the franchise id
    const teamIdForThreshold = latestTeamIdRaw; // use latest raw id rather than sheet value
    const teamId = gshlTeamIdCol ? toNumber(teamVals[i][0]) : null; // sheet (franchise) for contract logic
    const totalsDays = totalsDaysByPid.get(pid) || 0;
    let baseSignable = false; // threshold-qualified
    if (totalsDays > 120) {
      baseSignable = true;
    } else if (teamIdForThreshold != null && !isNaN(teamIdForThreshold)) {
      const splitDays =
        splitDaysByPidTeam.get(`${pid}_${teamIdForThreshold}`) || 0;
      if (splitDays > 80) baseSignable = true;
    }
    // Determine active contract separately (do not mutate baseSignable so we can distinguish threshold vs active suppression)
    const hasActiveContract = !!(
      (teamId != null &&
        !isNaN(teamId) &&
        activeContractMap.get(`${pid}_${teamId}`)) ||
      activeContractByPid.get(pid)
    );

    // Override logic ordering:
    // 1. Active contract -> isSignable=false, isResignable=null (hard stop)
    // 2. Recent expired UFA -> isSignable=false, isResignable='UFA'
    // 3. Recent expired RFA -> isSignable=true, isResignable='RFA'
    // 4. Threshold-qualified (meets day thresholds) -> isSignable=true, isResignable='DRAFT'
    // 5. Below threshold & no active contract -> isSignable=true, isResignable=null
    let finalSignable;
    let resignableVal = null;
    if (hasActiveContract) {
      finalSignable = false;
      resignableVal = null; // active contract cannot be resigned via these paths
    } else if (expiredUfaRecentByPid.get(pid)) {
      finalSignable = false;
      resignableVal = "UFA";
    } else if (expiredRfaRecentByPid.get(pid)) {
      finalSignable = true;
      resignableVal = "RFA";
    } else if (baseSignable) {
      finalSignable = true;
      resignableVal = "DRAFT";
    } else {
      finalSignable = true; // below threshold but free agent
      resignableVal = null; // keep null per requirement
    }
    // Safety: if not signable and not UFA case, ensure resignable null
    if (!finalSignable && resignableVal !== "UFA") resignableVal = null;

    isSignableOut[i] = [!!finalSignable];
    isResignableOut[i] = [resignableVal];

    // Team assignment update: override with final week mapping (even if player had a current-season row earlier)
    if (gshlTeamIdOut) {
      let existingFranchise =
        teamVals && teamVals[i] ? toNumber(teamVals[i][0]) : null;
      if (existingFranchise === 0) existingFranchise = null; // normalize
      if (latestFranchiseId != null && !isNaN(latestFranchiseId)) {
        if (existingFranchise !== latestFranchiseId) {
          gshlTeamIdOut[i] = [latestFranchiseId];
          updated++;
        } else {
          gshlTeamIdOut[i] = [existingFranchise];
        }
      } else {
        if (finalWeekTeamByPid.size) {
          if (existingFranchise !== null) updated++;
          gshlTeamIdOut[i] = [null]; // write null when no current franchise assignment
        } else {
          gshlTeamIdOut[i] = [existingFranchise];
        }
      }
    }

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
  sheet.getRange(2, isResignableCol, n, 1).setValues(isResignableOut);
  if (gshlTeamIdOut) {
    sheet.getRange(2, gshlTeamIdCol, n, 1).setValues(gshlTeamIdOut);
  }
  if (nhlTeamOut) {
    sheet.getRange(2, nhlTeamCol, n, 1).setValues(nhlTeamOut);
  }

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
