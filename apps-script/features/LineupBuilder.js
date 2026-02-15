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
    IRplus: "IRplus",
    LW: "LW",
    C: "C",
    RW: "RW",
    D: "D",
    G: "G",
    Util: "Util",
  };

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
    return (
      player.dailyPos !== RosterPosition.BN &&
      player.dailyPos !== RosterPosition.IR &&
      player.dailyPos !== RosterPosition.IRplus
    );
  }

  /**
   * Greedy lineup optimizer - assigns best available player to each slot.
   * @param {Array} availablePlayers
   * @returns {Object} assignments map playerId -> slot position
   */
  function findBestLineupGreedy(availablePlayers) {
    const assignments = {};
    const usedPlayers = new Set();

    const sortedSlots = LINEUP_STRUCTURE.slice().sort((a, b) => {
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

  function getTheoreticalMaxRating(players) {
    const sorted = players.map((p) => p.Rating || 0).sort((a, b) => b - a);
    return sorted.slice(0, 11).reduce((sum, rating) => sum + rating, 0);
  }

  /**
   * Exhaustive search with backtracking for difficult cases.
   * @param {Array} availablePlayers
   * @param {Object} playersMap
   * @returns {Object}
   */
  function findBestLineupExhaustive(availablePlayers, playersMap) {
    let bestAssignments = {};
    let bestRating = -Infinity;

    const sortedSlots = LINEUP_STRUCTURE.slice().sort((a, b) => {
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
  function findBestLineup(availablePlayers, skipValidation) {
    const playersMap = {};
    for (const p of availablePlayers) {
      playersMap[p.playerId] = p;
    }

    const greedyAssignments = findBestLineupGreedy(availablePlayers);
    if (skipValidation) return greedyAssignments;

    const greedyRating = calculateLineupRating(greedyAssignments, playersMap);
    const theoreticalMax = getTheoreticalMaxRating(availablePlayers);

    if (Math.abs(greedyRating - theoreticalMax) < 0.01) {
      return greedyAssignments;
    }

    return findBestLineupExhaustive(availablePlayers, playersMap);
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

    const PRIORITY_GAP = 100000000;

    const playersWithFullPosPriority = safePlayers.map((p) => {
      const wasInActiveLineup = wasInDailyLineup(p);
      const gamesStarted = p.GS == 1;
      const played = p.GP == 1;

      let priorityTier = 1;

      if (gamesStarted) {
        priorityTier = 5;
      } else if (played && wasInActiveLineup) {
        priorityTier = 4;
      } else if (played && !wasInActiveLineup) {
        priorityTier = 3;
      } else if (!played && wasInActiveLineup) {
        priorityTier = 2;
      } else {
        priorityTier = 1;
      }

      const priorityBoost = priorityTier * PRIORITY_GAP + (p.Rating || 0);

      return {
        playerId: p.playerId,
        nhlPos: p.nhlPos,
        posGroup: p.posGroup,
        dailyPos: p.dailyPos,
        GP: p.GP,
        GS: p.GS,
        IR: p.IR,
        IRplus: p.IRplus,
        Rating: priorityBoost,
      };
    });

    const fullPosAssignments = findBestLineup(playersWithFullPosPriority, true);
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
    var GS = player && player.GS !== undefined && player.GS !== null
      ? String(player.GS)
      : "";
    var GP = player && player.GP !== undefined && player.GP !== null
      ? String(player.GP)
      : "";
    var BS = GS === "1" && player.bestPos === RosterPosition.BN ? 1 : "";
    var MS =
      GP === "1" && GS !== "1" && player.fullPos !== RosterPosition.BN
        ? 1
        : "";
    return { BS: BS, MS: MS };
  }

  /**
   * Recompute lineup helper columns for all PlayerDay rows in a season.
   *
   * @param {string|number} seasonId
   * @param {Object=} options
   * @param {string=} options.playerDayWorkbookId Override workbook id
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
    var logToConsole = opts.logToConsole === undefined ? true : !!opts.logToConsole;

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

    var playerDays = fetchSheetAsObjects(playerDayWorkbookId, "PlayerDayStatLine", {
      coerceTypes: true,
    }).filter(function (pd) {
      return String(pd && pd.seasonId) === seasonKey;
    });

    if (logToConsole) {
      console.log(
        "[LineupBuilder] updateLineups season=" +
          seasonKey +
          " workbook=" +
          playerDayWorkbookId +
          " rows=" +
          playerDays.length,
      );
    }

    if (!playerDays.length) {
      return { updatedRows: 0, dryRun: dryRun };
    }

    // Group by date + team.
    var groups = new Map();
    playerDays.forEach(function (pd) {
      if (!pd) return;
      var dateKey = pd.date;
      var teamKey = pd.gshlTeamId;
      if (!dateKey || !teamKey) return;
      var key = String(dateKey) + "|" + String(teamKey);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(pd);
    });

    var updates = [];
    groups.forEach(function (players) {
      var optimized = optimizeLineup(players);
      optimized.forEach(function (p) {
        if (!p || p.id === undefined || p.id === null || p.id === "") return;

        var flags = computeBenchAndMissingStartsFlags(p);

        updates.push({
          id: p.id,
          bestPos: p.bestPos,
          fullPos: p.fullPos,
          MS: flags.MS,
          BS: flags.BS,
        });
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
    var bestPosCol = getColIndex(headers, "bestPos", true) + 1;
    var fullPosCol = getColIndex(headers, "fullPos", true) + 1;
    var msCol = getColIndex(headers, "MS", true) + 1;
    var bsCol = getColIndex(headers, "BS", true) + 1;

    groupAndApply(
      sheet,
      bestPosCol,
      updates.map(function (u) {
        return { rowIndex: Number(u.id) + 1, value: u.bestPos };
      }),
    );
    groupAndApply(
      sheet,
      fullPosCol,
      updates.map(function (u) {
        return { rowIndex: Number(u.id) + 1, value: u.fullPos };
      }),
    );
    groupAndApply(
      sheet,
      msCol,
      updates.map(function (u) {
        return { rowIndex: Number(u.id) + 1, value: u.MS };
      }),
    );
    groupAndApply(
      sheet,
      bsCol,
      updates.map(function (u) {
        return { rowIndex: Number(u.id) + 1, value: u.BS };
      }),
    );

    Logger.log(
      "Updated lineup helper columns for " +
        updates.length +
        " PlayerDayStatLine row(s) in seasonId=" +
        seasonKey +
        ".",
    );

    return { updatedRows: updates.length, dryRun: false };
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
    },
  };
})();
