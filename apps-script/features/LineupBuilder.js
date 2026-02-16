// @ts-nocheck

/**
 * Lineup Builder
 * =============
 * Optimizes daily fantasy hockey lineups based on player ratings and eligible positions.
 *
 * This module provides two types of lineups:
 * 1. Full Lineup (fullPos): includes active lineup players + fills remaining spots with bench players who played
 * 2. Best Lineup (bestPos): mathematically optimal lineup based purely on who played best
 *
 * Primary API:
 * - LineupBuilder.optimizeLineup(players)
 * - LineupBuilder.findBestLineup(players, skipValidation)
 * - LineupBuilder.getLineupStats(optimizedPlayers)
 *
 * Testing helpers:
 * - LineupBuilder.tests.exampleRoster()
 * - LineupBuilder.tests.runExample()
 * - LineupBuilder.tests.smoke()
 */
var LineupBuilder = (function () {
  "use strict";

  // ===== CONSTANTS =====

  /**
   * Roster position types
   */
  const RosterPosition = {
    BN: "BN",
    IR: "IR",
    // Yahoo uses "IR+" (aka IL+) in matchup tables.
    IRplus: "IR+",
    LW: "LW",
    C: "C",
    RW: "RW",
    D: "D",
    G: "G",
    Util: "Util",
  };

  function normalizeDailyPos(pos) {
    var p = pos === undefined || pos === null ? "" : String(pos).trim();
    if (p === "IRplus") return "IR+";
    if (p === "ILplus") return "IL+";
    return p;
  }

  /**
   * Standard fantasy hockey lineup structure
   */
  const LINEUP_STRUCTURE = [
    { position: RosterPosition.LW, eligiblePositions: [RosterPosition.LW] },
    { position: RosterPosition.LW, eligiblePositions: [RosterPosition.LW] },
    { position: RosterPosition.C, eligiblePositions: [RosterPosition.C] },
    { position: RosterPosition.C, eligiblePositions: [RosterPosition.C] },
    { position: RosterPosition.RW, eligiblePositions: [RosterPosition.RW] },
    { position: RosterPosition.RW, eligiblePositions: [RosterPosition.RW] },
    { position: RosterPosition.D, eligiblePositions: [RosterPosition.D] },
    { position: RosterPosition.D, eligiblePositions: [RosterPosition.D] },
    { position: RosterPosition.D, eligiblePositions: [RosterPosition.D] },
    {
      position: RosterPosition.Util,
      eligiblePositions: [
        RosterPosition.LW,
        RosterPosition.C,
        RosterPosition.RW,
        RosterPosition.D,
      ],
    },
    { position: RosterPosition.G, eligiblePositions: [RosterPosition.G] },
  ];

  // ===== HELPERS =====

  /**
   * Check if player is eligible for a position.
   * @param {Object} player
   * @param {string[]} eligiblePositions
   * @returns {boolean}
   */
  function isEligibleForPosition(player, eligiblePositions) {
    if (!player || player.nhlPos === undefined || player.nhlPos === null)
      return false;

    var nhlPosArr = Array.isArray(player.nhlPos)
      ? player.nhlPos
      : String(player.nhlPos)
          .split(",")
          .map(function (p) {
            return String(p).trim();
          })
          .filter(Boolean);

    if (!nhlPosArr.length) return false;

    // Goalie check
    if (eligiblePositions.includes(RosterPosition.G)) {
      return nhlPosArr.includes(RosterPosition.G);
    }

    // Util can be any forward or defense, but not goalie
    if (eligiblePositions.includes(RosterPosition.Util)) {
      return nhlPosArr.some(function (pos) {
        return (
          pos === RosterPosition.LW ||
          pos === RosterPosition.C ||
          pos === RosterPosition.RW ||
          pos === RosterPosition.D
        );
      });
    }

    // Regular position check
    return nhlPosArr.some(function (pos) {
      return eligiblePositions.includes(pos);
    });
  }

  /**
   * Check if player was in the active daily lineup (not bench).
   * @param {Object} player
   * @returns {boolean}
   */
  function wasInDailyLineup(player) {
    var dailyPos = normalizeDailyPos(player && player.dailyPos);
    return (
      dailyPos !== RosterPosition.BN &&
      dailyPos !== RosterPosition.IR &&
      dailyPos !== RosterPosition.IRplus &&
      dailyPos !== "IL+"
    );
  }

  /**
   * Greedy lineup optimizer - assigns best available player to each slot.
   * @param {Array} availablePlayers
   * @returns {Object} assignments map playerId -> slot position
   */
  function findBestLineupGreedy(availablePlayers, slots) {
    const assignments = {};
    const usedPlayers = new Set();

    const slotList =
      Array.isArray(slots) && slots.length ? slots : LINEUP_STRUCTURE;

    const sortedSlots = slotList.slice().sort((a, b) => {
      return a.eligiblePositions.length - b.eligiblePositions.length;
    });

    for (const slot of sortedSlots) {
      let bestPlayer = null;
      let bestRating = -Infinity;

      for (const player of availablePlayers) {
        if (usedPlayers.has(player.playerId)) continue;
        if (!isEligibleForPosition(player, slot.eligiblePositions)) continue;

        const rating = player.Rating || 0;
        if (rating > bestRating) {
          bestRating = rating;
          bestPlayer = player;
        }
      }

      if (bestPlayer) {
        assignments[bestPlayer.playerId] = slot.position;
        usedPlayers.add(bestPlayer.playerId);
      }
    }

    return assignments;
  }

  function calculateLineupRating(assignments, playersMap) {
    let total = 0;
    for (const playerId in assignments) {
      const player = playersMap[playerId];
      if (player) {
        total += player.Rating || 0;
      }
    }
    return total;
  }

  function getTheoreticalMaxRating(players, slots) {
    const take = Array.isArray(slots) && slots.length ? slots.length : 11;
    const sorted = players.map((p) => p.Rating || 0).sort((a, b) => b - a);
    return sorted.slice(0, take).reduce((sum, rating) => sum + rating, 0);
  }

  /**
   * Exhaustive search with backtracking for difficult cases.
   * @param {Array} availablePlayers
   * @param {Object} playersMap
   * @returns {Object}
   */
  function findBestLineupExhaustive(availablePlayers, playersMap, slots) {
    let bestAssignments = {};
    let bestRating = -Infinity;

    const slotList =
      Array.isArray(slots) && slots.length ? slots : LINEUP_STRUCTURE;

    const sortedSlots = slotList.slice().sort((a, b) => {
      return a.eligiblePositions.length - b.eligiblePositions.length;
    });

    function estimateMaxRemaining(usedPlayers, remainingSlots) {
      if (remainingSlots <= 0) return 0;
      const remainingRatings = [];
      for (const player of availablePlayers) {
        if (usedPlayers.has(player.playerId)) continue;
        remainingRatings.push(player.Rating || 0);
      }
      if (remainingRatings.length === 0) return 0;
      remainingRatings.sort((a, b) => b - a);
      return remainingRatings
        .slice(0, remainingSlots)
        .reduce((sum, rating) => sum + rating, 0);
    }

    function backtrack(
      slotIndex,
      currentAssignments,
      usedPlayers,
      currentRating,
    ) {
      if (slotIndex >= sortedSlots.length) {
        if (currentRating > bestRating) {
          bestRating = currentRating;
          bestAssignments = Object.assign({}, currentAssignments);
        }
        return;
      }

      const slot = sortedSlots[slotIndex];
      let foundEligible = false;

      for (const player of availablePlayers) {
        if (usedPlayers.has(player.playerId)) continue;
        if (!isEligibleForPosition(player, slot.eligiblePositions)) continue;
        foundEligible = true;

        const playerRating = player.Rating || 0;

        currentAssignments[player.playerId] = slot.position;
        usedPlayers.add(player.playerId);

        const remainingSlots = sortedSlots.length - slotIndex - 1;
        const upperBound =
          currentRating +
          playerRating +
          estimateMaxRemaining(usedPlayers, remainingSlots);
        if (upperBound > bestRating) {
          backtrack(
            slotIndex + 1,
            currentAssignments,
            usedPlayers,
            currentRating + playerRating,
          );
        }

        delete currentAssignments[player.playerId];
        usedPlayers.delete(player.playerId);
      }

      if (!foundEligible) {
        backtrack(
          slotIndex + 1,
          currentAssignments,
          usedPlayers,
          currentRating,
        );
      }
    }

    backtrack(0, {}, new Set(), 0);
    return bestAssignments;
  }

  /**
   * Smart lineup optimizer with fast-path and validation.
   * @param {Array} availablePlayers
   * @param {boolean} skipValidation
   * @returns {Object}
   */
  function findBestLineup(availablePlayers, skipValidation, slots) {
    const playersMap = {};
    for (const p of availablePlayers) {
      playersMap[p.playerId] = p;
    }

    const greedyAssignments = findBestLineupGreedy(availablePlayers, slots);
    if (skipValidation) return greedyAssignments;

    const greedyRating = calculateLineupRating(greedyAssignments, playersMap);
    const theoreticalMax = getTheoreticalMaxRating(availablePlayers, slots);

    if (Math.abs(greedyRating - theoreticalMax) < 0.01) {
      return greedyAssignments;
    }

    return findBestLineupExhaustive(availablePlayers, playersMap, slots);
  }

  // ===== PUBLIC API =====

  /**
   * Optimize lineup for a team on a given day.
   * @param {Array} players
   * @returns {Array}
   */
  function optimizeLineup(players) {
    const safePlayers = Array.isArray(players) ? players : [];
    const results = safePlayers.map((p) => ({
      ...p,
      fullPos: RosterPosition.BN,
      bestPos: RosterPosition.BN,
    }));

    if (safePlayers.length === 0) return results;

    // Build fullPos as:
    // - Only players who played (GP == 1) can occupy a starting slot.
    // - Players who were in the *active* daily lineup and played must stay in the
    //   starting lineup, but may be repositioned (e.g., LW -> Util).
    // We achieve this by optimizing over played players only, and giving played
    // active-lineup players a large priority boost so they cannot be bumped out.

    const PRIORITY_GAP = 100000000;

    const playedCandidatesForFull = results
      .filter((p) => p && p.playerId && p.GP == 1)
      .map((p) => {
        const wasInActiveLineup = wasInDailyLineup(p);
        // GS is used as a "bench start" indicator in this codebase:
        // the player played (has stats) but was not started (BN/IR/IR+).
        // Only treat it as such when they were NOT in the active daily lineup.
        const benchStarted = p.GS == 1 && !wasInActiveLineup;

        // Tiering (higher = harder to bump):
        // 3: started game but was benched ("bench start")
        // 2: played and was in active lineup
        // 1: played but was not in active lineup
        const tier = benchStarted ? 3 : wasInActiveLineup ? 2 : 1;

        return {
          playerId: p.playerId,
          nhlPos: p.nhlPos,
          posGroup: p.posGroup,
          dailyPos: p.dailyPos,
          GP: p.GP,
          GS: p.GS,
          IR: p.IR,
          IRplus: p.IRplus,
          Rating: tier * PRIORITY_GAP + (p.Rating || 0),
        };
      });

    const fullPosAssignments = findBestLineup(
      playedCandidatesForFull,
      false,
      LINEUP_STRUCTURE,
    );
    for (const result of results) {
      result.fullPos = fullPosAssignments[result.playerId] || RosterPosition.BN;
    }

    const playedPlayers = results
      .filter((p) => p.GP == 1)
      .sort((a, b) => (b.Rating || 0) - (a.Rating || 0));

    const didNotPlayBest = results
      .filter((p) => !(p.GP == 1))
      .sort((a, b) => (b.Rating || 0) - (a.Rating || 0));

    const bestPosPriority = [...playedPlayers, ...didNotPlayBest];
    const bestPosAssignments = findBestLineup(bestPosPriority, false);
    for (const result of results) {
      result.bestPos = bestPosAssignments[result.playerId] || RosterPosition.BN;
    }

    return results;
  }

  function getLineupStats(optimizedPlayers) {
    const safePlayers = Array.isArray(optimizedPlayers) ? optimizedPlayers : [];

    const fullPosRating = safePlayers
      .filter((p) => p.fullPos !== RosterPosition.BN)
      .reduce((sum, p) => sum + (p.Rating || 0), 0);

    const bestPosRating = safePlayers
      .filter((p) => p.bestPos !== RosterPosition.BN)
      .reduce((sum, p) => sum + (p.Rating || 0), 0);

    const improvementPoints = bestPosRating - fullPosRating;
    const improvementPercent =
      fullPosRating > 0 ? (improvementPoints / fullPosRating) * 100 : 0;

    return {
      fullPosRating: fullPosRating,
      bestPosRating: bestPosRating,
      improvementPoints: improvementPoints,
      improvementPercent: improvementPercent,
    };
  }

  /**
   * Updates PlayerDayStatLine lineup-position helper columns (bestPos/fullPos/MS/BS)
   * for a season by re-optimizing each team/day.
   *
   * This is a Sheets-writing utility (not a pure optimizer).
   */
  function resolvePlayerDayWorkbookIdForSeason(seasonId) {
    var seasonKey =
      seasonId === undefined || seasonId === null ? "" : String(seasonId);
    if (!seasonKey) return "";
    try {
      var getId =
        GshlUtils &&
        GshlUtils.domain &&
        GshlUtils.domain.workbooks &&
        GshlUtils.domain.workbooks.getPlayerDayWorkbookId;
      if (typeof getId === "function") {
        var id = getId(seasonKey);
        if (id) return id;
      }
    } catch (_e) {
      // ignore
    }
    if (typeof CURRENT_PLAYERDAY_SPREADSHEET_ID !== "undefined") {
      return CURRENT_PLAYERDAY_SPREADSHEET_ID;
    }
    if (
      typeof PLAYERDAY_WORKBOOKS !== "undefined" &&
      PLAYERDAY_WORKBOOKS &&
      PLAYERDAY_WORKBOOKS.PLAYERDAYS_6_10
    ) {
      return PLAYERDAY_WORKBOOKS.PLAYERDAYS_6_10;
    }
    return "";
  }

  function computeBenchAndMissingStartsFlags(player) {
    // Match YahooScraper.finalizeLineupAssignments behavior.
    var GS =
      player && player.GS !== undefined && player.GS !== null
        ? String(player.GS)
        : "";
    var GP =
      player && player.GP !== undefined && player.GP !== null
        ? String(player.GP)
        : "";
    var BS = GS === "1" && player.bestPos === RosterPosition.BN ? 1 : "";
    var MS =
      GP === "1" && GS !== "1" && player.fullPos !== RosterPosition.BN ? 1 : "";
    return { BS: BS, MS: MS };
  }

  /**
   * Recompute lineup helper columns for all PlayerDay rows in a season.
   *
   * @param {string|number} seasonId
   * @param {Object=} options
   * @param {string=} options.playerDayWorkbookId Override workbook id
   * @param {Array<string|number>=} options.weekIds Only update PlayerDays with these weekIds
   * @param {Array<string|number>=} options.weekNums Only update PlayerDays in these week numbers (resolved via Week sheet)
   * @param {boolean=} options.dryRun When true, computes but does not write
   * @param {boolean=} options.logToConsole When true, prints progress
   */
  function updateLineups(seasonId, options) {
    var seasonKey =
      seasonId === undefined || seasonId === null ? "" : String(seasonId);
    if (!seasonKey) {
      throw new Error("updateLineups requires a seasonId argument");
    }

    var opts = options || {};
    var dryRun = !!opts.dryRun;
    var logToConsole =
      opts.logToConsole === undefined ? true : !!opts.logToConsole;

    var playerDayWorkbookId =
      (opts.playerDayWorkbookId && String(opts.playerDayWorkbookId)) ||
      resolvePlayerDayWorkbookIdForSeason(seasonKey);
    if (!playerDayWorkbookId) {
      throw new Error(
        "updateLineups could not resolve PlayerDay workbook id for seasonId=" +
          seasonKey,
      );
    }

    var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
    var openSheet = GshlUtils.sheets.open.getSheetByName;
    var getHeaders = GshlUtils.sheets.read.getHeadersFromSheet;
    var getColIndex = GshlUtils.sheets.read.getColIndex;
    var groupAndApply = GshlUtils.sheets.write.groupAndApplyColumnUpdates;

    function buildWeekIdAllowList() {
      var allow = new Set();

      if (opts.weekIds && Array.isArray(opts.weekIds)) {
        opts.weekIds.forEach(function (w) {
          if (w === undefined || w === null || w === "") return;
          allow.add(String(w));
        });
        return allow.size ? allow : null;
      }

      if (opts.weekNums && Array.isArray(opts.weekNums)) {
        var weekNumSet = new Set();
        opts.weekNums.forEach(function (n) {
          if (n === undefined || n === null || n === "") return;
          weekNumSet.add(String(n));
        });
        if (!weekNumSet.size) return null;

        var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week", {
          coerceTypes: true,
        }).filter(function (w) {
          return String(w && w.seasonId) === seasonKey;
        });

        weeks.forEach(function (w) {
          var wn =
            w && w.weekNum !== undefined && w.weekNum !== null
              ? String(w.weekNum)
              : "";
          if (!wn) return;
          if (!weekNumSet.has(wn)) return;
          if (w && w.id !== undefined && w.id !== null && w.id !== "") {
            allow.add(String(w.id));
          }
        });

        return allow.size ? allow : null;
      }

      return null;
    }

    var weekIdAllowList = buildWeekIdAllowList();

    // Load the whole season to build a presence map for ADD.
    // ADD depends on whether a player/team existed on the previous calendar day,
    // which might be outside a week-scoped update window.
    var seasonPlayerDays = fetchSheetAsObjects(
      playerDayWorkbookId,
      "PlayerDayStatLine",
      {
        coerceTypes: true,
      },
    ).filter(function (pd) {
      return String(pd && pd.seasonId) === seasonKey;
    });

    var playerDays = seasonPlayerDays;
    if (weekIdAllowList) {
      playerDays = seasonPlayerDays.filter(function (pd) {
        var wk =
          pd && pd.weekId !== undefined && pd.weekId !== null
            ? String(pd.weekId)
            : "";
        return wk ? weekIdAllowList.has(wk) : false;
      });
    }

    if (logToConsole) {
      console.log(
        "[LineupBuilder] updateLineups season=" +
          seasonKey +
          " workbook=" +
          playerDayWorkbookId +
          (weekIdAllowList
            ? " weeks=" + Array.from(weekIdAllowList).join(",")
            : "") +
          " rows=" +
          playerDays.length,
      );
    }

    if (!playerDays.length) {
      return { updatedRows: 0, dryRun: dryRun };
    }

    var formatDateOnly =
      GshlUtils &&
      GshlUtils.core &&
      GshlUtils.core.date &&
      GshlUtils.core.date.formatDateOnly;
    var getPreviousDate =
      GshlUtils &&
      GshlUtils.core &&
      GshlUtils.core.date &&
      GshlUtils.core.date.getPreviousDate;

    function dateOnly(d) {
      if (!d) return "";
      // Avoid timezone shifts: treat YYYY-MM-DD strings as already-normalized.
      if (typeof d === "string") {
        var s = String(d).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      }
      if (typeof formatDateOnly === "function") {
        return formatDateOnly(d);
      }
      var dt = d instanceof Date ? d : new Date(d);
      if (isNaN(dt.getTime())) return "";
      // Fallback: YYYY-MM-DD in local time.
      var yyyy = String(dt.getFullYear());
      var mm = String(dt.getMonth() + 1).padStart(2, "0");
      var dd = String(dt.getDate()).padStart(2, "0");
      return yyyy + "-" + mm + "-" + dd;
    }

    function previousDateKey(dateKey) {
      if (!dateKey) return "";
      if (typeof getPreviousDate === "function") {
        return String(getPreviousDate(dateKey));
      }
      var dt = dateKey instanceof Date ? dateKey : new Date(dateKey);
      if (isNaN(dt.getTime())) return "";
      return dateOnly(new Date(dt.getTime() - 24 * 60 * 60 * 1000));
    }

    // Presence map across the season: (playerId, teamId, date) => true
    var presence = new Set();
    seasonPlayerDays.forEach(function (pd) {
      if (!pd) return;
      var pid = pd.playerId;
      var tid = pd.gshlTeamId;
      var dk = dateOnly(pd.date);
      if (!pid || !tid || !dk) return;
      presence.add(String(pid) + "|" + String(tid) + "|" + String(dk));
    });

    function computeAddValue(playerDay) {
      if (!playerDay) return "";
      var pid = playerDay.playerId;
      var tid = playerDay.gshlTeamId;
      var dk = dateOnly(playerDay.date);
      if (!pid || !tid || !dk) return "";
      var prev = previousDateKey(dk || playerDay.date);
      if (!prev) {
        // If we can't compute the previous day, leave as-is.
        return playerDay.ADD !== undefined ? playerDay.ADD : "";
      }
      var keyPrev = String(pid) + "|" + String(tid) + "|" + String(prev);
      return presence.has(keyPrev) ? "" : 1;
    }

    // Group by calendar date + team.
    // IMPORTANT: Use date-only normalization (YYYY-MM-DD) so a single day with
    // mixed Date objects / strings / timestamps doesn't get split into multiple
    // partial-roster groups (which would yield bad lineups for that day).
    var groups = new Map();
    var skippedMissingGroupKey = 0;
    playerDays.forEach(function (pd) {
      if (!pd) return;
      var dateKey = dateOnly(pd.date);
      var teamKey = pd.gshlTeamId;
      if (
        !dateKey ||
        teamKey === undefined ||
        teamKey === null ||
        teamKey === ""
      ) {
        skippedMissingGroupKey++;
        return;
      }
      var key = String(dateKey) + "|" + String(teamKey);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(pd);
    });

    if (logToConsole && skippedMissingGroupKey) {
      console.log(
        "[LineupBuilder] updateLineups: skipped " +
          skippedMissingGroupKey +
          " row(s) missing date/team for grouping",
      );
    }

    var updates = [];
    groups.forEach(function (players, groupKey) {
      var optimized = optimizeLineup(players);

      optimized.forEach(function (p) {
        if (!p || p.id === undefined || p.id === null || p.id === "") return;

        var flags = computeBenchAndMissingStartsFlags(p);

        var updateObj = {
          id: p.id,
          bestPos: p.bestPos,
          fullPos: p.fullPos,
          ADD: computeAddValue(p),
          MS: flags.MS,
          BS: flags.BS,
        };
        updates.push(updateObj);
      });
    });

    updates.sort(function (a, b) {
      return Number(a.id) - Number(b.id);
    });

    if (dryRun) {
      return { updatedRows: updates.length, dryRun: true };
    }

    var sheet = openSheet(playerDayWorkbookId, "PlayerDayStatLine", true);
    var headers = getHeaders(sheet);
    var idCol = getColIndex(headers, "id", true) + 1;
    var bestPosCol = getColIndex(headers, "bestPos", true) + 1;
    var fullPosCol = getColIndex(headers, "fullPos", true) + 1;
    var addCol = getColIndex(headers, "ADD", true) + 1;
    var msCol = getColIndex(headers, "MS", true) + 1;
    var bsCol = getColIndex(headers, "BS", true) + 1;

    // IMPORTANT: Sheet `id` values are not row indices. Build a rowIndex map.
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
        // First occurrence wins; ids should be unique.
        if (idToRowIndex[key] === undefined) {
          idToRowIndex[key] = rowIndex;
        } else {
          // Duplicate id in sheet - this breaks id->rowIndex mapping and can
          // corrupt writes. Fail fast so the sheet can be fixed.
          if (duplicateIds.length < 20) {
            duplicateIds.push({
              id: key,
              firstRowIndex: idToRowIndex[key],
              dupRowIndex: rowIndex,
            });
          }
        }
      }
    }

    if (duplicateIds.length) {
      throw new Error(
        "PlayerDayStatLine sheet has duplicate 'id' values; fix the sheet and rerun. Example duplicates: " +
          JSON.stringify(duplicateIds),
      );
    }

    function toRowIndexFromId(id) {
      if (id === undefined || id === null || id === "") return 0;
      var key = String(id);
      var idx = idToRowIndex[key];
      return idx ? Number(idx) : 0;
    }

    // Resolve updates to rowIndex and dedupe by rowIndex (prevents batched-write
    // spillover if duplicates ever reappear).
    var resolvedByRowIndex = {};
    var skippedMissingRow = 0;
    updates.forEach(function (u) {
      var rowIndex = toRowIndexFromId(u && u.id);
      if (!rowIndex) {
        skippedMissingRow++;
        return;
      }
      var nextResolved = {
        rowIndex: rowIndex,
        id: u.id,
        bestPos: u.bestPos,
        fullPos: u.fullPos,
        ADD: u.ADD,
        MS: u.MS,
        BS: u.BS,
      };

      // Last write wins.
      resolvedByRowIndex[rowIndex] = nextResolved;
    });

    var resolvedUpdates = Object.keys(resolvedByRowIndex)
      .map(function (k) {
        return Number(k);
      })
      .sort(function (a, b) {
        return a - b;
      })
      .map(function (rowIndex) {
        return resolvedByRowIndex[rowIndex];
      });

    if (!resolvedUpdates.length) {
      if (logToConsole) {
        console.log(
          "[LineupBuilder] updateLineups: no matching sheet rows found for updates (skipped=" +
            skippedMissingRow +
            ")",
        );
      }
      return { updatedRows: 0, dryRun: false };
    }

    function groupAndApplyTwoColumnUpdates(
      sheet,
      startColIndex1Based,
      updates2,
    ) {
      if (!updates2 || updates2.length === 0) return;
      updates2.sort(function (a, b) {
        return a.rowIndex - b.rowIndex;
      });

      var start = updates2[0].rowIndex;
      var buffer = [updates2[0].values];
      for (var i = 1; i < updates2.length; i++) {
        var prev = updates2[i - 1].rowIndex;
        var curr = updates2[i];
        if (curr.rowIndex === prev + 1) {
          buffer.push(curr.values);
        } else {
          sheet
            .getRange(start, startColIndex1Based, buffer.length, 2)
            .setValues(buffer);
          start = curr.rowIndex;
          buffer = [curr.values];
        }
      }
      sheet
        .getRange(start, startColIndex1Based, buffer.length, 2)
        .setValues(buffer);
    }

    var bestFullAdjacent = Math.abs(bestPosCol - fullPosCol) === 1;
    var addMsBsAdjacent = msCol === addCol + 1 && bsCol === addCol + 2;
    var msBsAdjacent = Math.abs(msCol - bsCol) === 1;

    if (bestFullAdjacent) {
      var startCol = Math.min(bestPosCol, fullPosCol);
      var bestFirst = startCol === bestPosCol;
      groupAndApplyTwoColumnUpdates(
        sheet,
        startCol,
        resolvedUpdates.map(function (u) {
          return {
            rowIndex: u.rowIndex,
            values: bestFirst ? [u.bestPos, u.fullPos] : [u.fullPos, u.bestPos],
          };
        }),
      );
    } else {
      groupAndApply(
        sheet,
        bestPosCol,
        resolvedUpdates.map(function (u) {
          return { rowIndex: u.rowIndex, value: u.bestPos };
        }),
      );
      groupAndApply(
        sheet,
        fullPosCol,
        resolvedUpdates.map(function (u) {
          return { rowIndex: u.rowIndex, value: u.fullPos };
        }),
      );
    }

    if (addMsBsAdjacent) {
      // Columns are in order ADD/MS/BS, so write all three in one pass.
      resolvedUpdates.sort(function (a, b) {
        return a.rowIndex - b.rowIndex;
      });
      var start3 = resolvedUpdates[0].rowIndex;
      var buffer3 = [
        [resolvedUpdates[0].ADD, resolvedUpdates[0].MS, resolvedUpdates[0].BS],
      ];
      for (var j = 1; j < resolvedUpdates.length; j++) {
        var prevIdx = resolvedUpdates[j - 1].rowIndex;
        var currU = resolvedUpdates[j];
        if (currU.rowIndex === prevIdx + 1) {
          buffer3.push([currU.ADD, currU.MS, currU.BS]);
        } else {
          sheet.getRange(start3, addCol, buffer3.length, 3).setValues(buffer3);
          start3 = currU.rowIndex;
          buffer3 = [[currU.ADD, currU.MS, currU.BS]];
        }
      }
      sheet.getRange(start3, addCol, buffer3.length, 3).setValues(buffer3);
    } else {
      // Fallback: keep existing 2-col batching and apply ADD separately.
      if (msBsAdjacent) {
        var startCol2 = Math.min(msCol, bsCol);
        var msFirst = startCol2 === msCol;
        groupAndApplyTwoColumnUpdates(
          sheet,
          startCol2,
          resolvedUpdates.map(function (u) {
            return {
              rowIndex: u.rowIndex,
              values: msFirst ? [u.MS, u.BS] : [u.BS, u.MS],
            };
          }),
        );
      } else {
        groupAndApply(
          sheet,
          msCol,
          resolvedUpdates.map(function (u) {
            return { rowIndex: u.rowIndex, value: u.MS };
          }),
        );
        groupAndApply(
          sheet,
          bsCol,
          resolvedUpdates.map(function (u) {
            return { rowIndex: u.rowIndex, value: u.BS };
          }),
        );
      }

      groupAndApply(
        sheet,
        addCol,
        resolvedUpdates.map(function (u) {
          return { rowIndex: u.rowIndex, value: u.ADD };
        }),
      );
    }

    Logger.log(
      "Updated lineup helper columns for " +
        resolvedUpdates.length +
        " PlayerDayStatLine row(s) in seasonId=" +
        seasonKey +
        ".",
    );

    return {
      updatedRows: resolvedUpdates.length,
      skippedRows: skippedMissingRow,
      dryRun: false,
    };
  }

  // ===== TESTS =====

  function assert(condition, message) {
    if (condition) return;
    throw new Error(message || "Assertion failed");
  }

  function exampleRoster() {
    return [
      {
        playerId: "player1",
        nhlPos: ["LW"],
        posGroup: "F",
        dailyPos: "LW",
        GP: 1,
        GS: 1,
        IR: 0,
        IRplus: 0,
        Rating: 75.5,
      },
      {
        playerId: "player2",
        nhlPos: ["C"],
        posGroup: "F",
        dailyPos: "C",
        GP: 1,
        GS: 1,
        IR: 0,
        IRplus: 0,
        Rating: 82.3,
      },
      {
        playerId: "player3",
        nhlPos: ["RW", "C"],
        posGroup: "F",
        dailyPos: "BN",
        GP: 1,
        GS: 1,
        IR: 0,
        IRplus: 0,
        Rating: 95.0,
      },
      {
        playerId: "player4",
        nhlPos: ["D"],
        posGroup: "D",
        dailyPos: "D",
        GP: 1,
        GS: 1,
        IR: 0,
        IRplus: 0,
        Rating: 70.0,
      },
      {
        playerId: "player5",
        nhlPos: ["G"],
        posGroup: "G",
        dailyPos: "G",
        GP: 1,
        GS: 1,
        IR: 0,
        IRplus: 0,
        Rating: 88.0,
      },
    ];
  }

  function runExample() {
    const roster = exampleRoster();
    const optimized = optimizeLineup(roster);
    const stats = getLineupStats(optimized);

    if (
      typeof Logger !== "undefined" &&
      Logger &&
      typeof Logger.log === "function"
    ) {
      Logger.log("=== Lineup Optimization Results ===");
      Logger.log("Full Lineup Rating: " + stats.fullPosRating.toFixed(2));
      Logger.log("Best Lineup Rating: " + stats.bestPosRating.toFixed(2));
      Logger.log(
        "Improvement: " +
          stats.improvementPoints.toFixed(2) +
          " points (" +
          stats.improvementPercent.toFixed(2) +
          "%)",
      );
      Logger.log("");
      Logger.log("Player Positions:");
      optimized.forEach((p) => {
        const changed = p.fullPos !== p.bestPos ? " ⬆️ BETTER in bestPos" : "";
        const eligiblePos = Array.isArray(p.nhlPos)
          ? p.nhlPos.join(",")
          : p.nhlPos;
        Logger.log(
          "  " +
            p.playerId +
            " [" +
            eligiblePos +
            "]: fullPos=" +
            p.fullPos +
            ", bestPos=" +
            p.bestPos +
            changed,
        );
      });
    }

    return { optimized: optimized, stats: stats };
  }

  function smoke() {
    const roster = exampleRoster();
    const optimized = optimizeLineup(roster);
    assert(Array.isArray(optimized), "Expected optimized array");
    optimized.forEach((p) => {
      assert(typeof p.fullPos === "string", "Missing fullPos");
      assert(typeof p.bestPos === "string", "Missing bestPos");
    });
    const stats = getLineupStats(optimized);
    assert(typeof stats.fullPosRating === "number", "Missing fullPosRating");
    assert(typeof stats.bestPosRating === "number", "Missing bestPosRating");
    return { ok: true, stats: stats };
  }

  function regression_irPlusNonPlayerCannotBumpPlayedActive() {
    const roster = [
      // Active LW who played.
      {
        playerId: "playedLW",
        nhlPos: ["LW"],
        posGroup: "F",
        dailyPos: "LW",
        GP: "1",
        GS: null,
        Rating: 10,
      },
      // IR+ player who did NOT play (should never appear in fullPos).
      {
        playerId: "irPlusNoGame",
        nhlPos: ["LW"],
        posGroup: "F",
        dailyPos: "IR+",
        GP: null,
        GS: null,
        Rating: 999,
      },
      // Fill out enough other played skaters/goalie to satisfy slots.
      {
        playerId: "lw2",
        nhlPos: ["LW"],
        posGroup: "F",
        dailyPos: "BN",
        GP: "1",
        Rating: 9,
      },
      {
        playerId: "c1",
        nhlPos: ["C"],
        posGroup: "F",
        dailyPos: "C",
        GP: "1",
        Rating: 9,
      },
      {
        playerId: "c2",
        nhlPos: ["C"],
        posGroup: "F",
        dailyPos: "C",
        GP: "1",
        Rating: 9,
      },
      {
        playerId: "rw1",
        nhlPos: ["RW"],
        posGroup: "F",
        dailyPos: "RW",
        GP: "1",
        Rating: 9,
      },
      {
        playerId: "rw2",
        nhlPos: ["RW"],
        posGroup: "F",
        dailyPos: "RW",
        GP: "1",
        Rating: 9,
      },
      {
        playerId: "d1",
        nhlPos: ["D"],
        posGroup: "D",
        dailyPos: "D",
        GP: "1",
        Rating: 9,
      },
      {
        playerId: "d2",
        nhlPos: ["D"],
        posGroup: "D",
        dailyPos: "D",
        GP: "1",
        Rating: 9,
      },
      {
        playerId: "d3",
        nhlPos: ["D"],
        posGroup: "D",
        dailyPos: "D",
        GP: "1",
        Rating: 9,
      },
      {
        playerId: "util",
        nhlPos: ["C"],
        posGroup: "F",
        dailyPos: "Util",
        GP: "1",
        Rating: 9,
      },
      {
        playerId: "g",
        nhlPos: ["G"],
        posGroup: "G",
        dailyPos: "G",
        GP: "1",
        Rating: 9,
      },
    ];

    const optimized = optimizeLineup(roster);
    const playedLW = optimized.find((p) => p.playerId === "playedLW");
    const irPlus = optimized.find((p) => p.playerId === "irPlusNoGame");
    assert(
      playedLW.fullPos !== "BN",
      "Expected played active LW to remain in starting lineup (non-BN) in fullPos",
    );
    assert(
      irPlus.fullPos === "BN",
      "Expected non-playing IR+ to remain BN in fullPos",
    );
    return { ok: true };
  }

  return {
    RosterPosition: RosterPosition,
    LINEUP_STRUCTURE: LINEUP_STRUCTURE,
    optimizeLineup: optimizeLineup,
    findBestLineup: findBestLineup,
    getLineupStats: getLineupStats,
    updateLineups: updateLineups,
    internals: {
      isEligibleForPosition: isEligibleForPosition,
      wasInDailyLineup: wasInDailyLineup,
      findBestLineupGreedy: findBestLineupGreedy,
      findBestLineupExhaustive: findBestLineupExhaustive,
      calculateLineupRating: calculateLineupRating,
      getTheoreticalMaxRating: getTheoreticalMaxRating,
    },
    tests: {
      assert: assert,
      exampleRoster: exampleRoster,
      runExample: runExample,
      smoke: smoke,
      regression_irPlusNonPlayerCannotBumpPlayedActive:
        regression_irPlusNonPlayerCannotBumpPlayedActive,
    },
  };
})();
