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

  const MAX_TEAM_DAY_PLAYERS = 17;

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

  function ratingValue(player) {
    var rating =
      player && player.Rating !== undefined ? Number(player.Rating) : 0;
    return isFinite(rating) ? rating : 0;
  }

  function isPlayedGame(player) {
    return String(player && player.GP) === "1";
  }

  function isStartingLineupPosition(pos) {
    var dailyPos = normalizeDailyPos(pos);
    return (
      dailyPos === RosterPosition.LW ||
      dailyPos === RosterPosition.C ||
      dailyPos === RosterPosition.RW ||
      dailyPos === RosterPosition.D ||
      dailyPos === RosterPosition.G ||
      dailyPos === RosterPosition.Util
    );
  }

  function normalizeNhlPosToken(pos) {
    if (pos === undefined || pos === null) return "";
    var normalized = String(pos).trim().toUpperCase();
    if (normalized === "UTIL") return RosterPosition.Util;
    if (normalized === "IRPLUS") return RosterPosition.IRplus;
    return normalized;
  }

  function addUniquePosition(positions, seen, pos) {
    var normalized = normalizeNhlPosToken(pos);
    if (!normalized || seen[normalized]) return;
    seen[normalized] = true;
    positions.push(normalized);
  }

  function getEligibleNhlPositions(player) {
    var positions = [];
    var seen = {};
    var raw = player && player.nhlPos;
    var values = Array.isArray(raw) ? raw : [raw];

    values.forEach(function (value) {
      if (value === undefined || value === null || value === "") return;
      String(value)
        .split(/[,/|;]+/)
        .map(function (p) {
          return String(p).trim();
        })
        .filter(Boolean)
        .forEach(function (pos) {
          addUniquePosition(positions, seen, pos);
        });
    });

    var dailyPos = normalizeDailyPos(player && player.dailyPos);
    if (
      dailyPos === RosterPosition.LW ||
      dailyPos === RosterPosition.C ||
      dailyPos === RosterPosition.RW ||
      dailyPos === RosterPosition.D ||
      dailyPos === RosterPosition.G
    ) {
      addUniquePosition(positions, seen, dailyPos);
    }

    return positions;
  }

  function computeGsValue(player) {
    return isStartingLineupPosition(player && player.dailyPos) &&
      isPlayedGame(player)
      ? 1
      : "";
  }

  function computeLineupFlags(player) {
    var dailyPosIsStart = isStartingLineupPosition(player && player.dailyPos);
    var fullPosIsStart = isStartingLineupPosition(player && player.fullPos);
    var played = isPlayedGame(player);
    var isGoalie = String((player && player.posGroup) || "") === "G";
    return {
      GS: computeGsValue(player),
      MS: played && !isGoalie && !dailyPosIsStart && fullPosIsStart ? 1 : "",
      BS:
        played &&
        dailyPosIsStart &&
        normalizeDailyPos(player && player.bestPos) === RosterPosition.BN
          ? 1
          : "",
    };
  }

  function dateOnlyFallback(d) {
    if (!d) return "";
    if (typeof d === "string") {
      var s = String(d).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    }
    try {
      if (
        typeof GshlUtils !== "undefined" &&
        GshlUtils &&
        GshlUtils.core &&
        GshlUtils.core.date &&
        typeof GshlUtils.core.date.formatDateOnly === "function"
      ) {
        return GshlUtils.core.date.formatDateOnly(d);
      }
    } catch (_e) {
      // ignore and use local fallback
    }
    var dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return "";
    var yyyy = String(dt.getFullYear());
    var mm = String(dt.getMonth() + 1).padStart(2, "0");
    var dd = String(dt.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
  }

  function previousDateKeyFallback(dateKey, dateOnlyFn) {
    if (!dateKey) return "";
    try {
      if (
        typeof GshlUtils !== "undefined" &&
        GshlUtils &&
        GshlUtils.core &&
        GshlUtils.core.date &&
        typeof GshlUtils.core.date.getPreviousDate === "function"
      ) {
        return String(GshlUtils.core.date.getPreviousDate(dateKey));
      }
    } catch (_e) {
      // ignore and use local fallback
    }
    var dt = dateKey instanceof Date ? dateKey : new Date(dateKey);
    if (isNaN(dt.getTime())) return "";
    return (dateOnlyFn || dateOnlyFallback)(
      new Date(dt.getTime() - 24 * 60 * 60 * 1000),
    );
  }

  function buildPresenceSets(playerDays, dateOnlyFn) {
    var safeDateOnly = dateOnlyFn || dateOnlyFallback;
    var rowPresence = new Set();
    var datePresence = new Set();
    (Array.isArray(playerDays) ? playerDays : []).forEach(function (pd) {
      if (!pd) return;
      var pid = pd.playerId;
      var tid = pd.gshlTeamId;
      var dk = safeDateOnly(pd.date);
      if (!dk) return;
      datePresence.add(String(dk));
      if (!pid || !tid) return;
      rowPresence.add(String(pid) + "|" + String(tid) + "|" + String(dk));
    });
    return { rowPresence: rowPresence, datePresence: datePresence };
  }

  function computeAddValue(
    playerDay,
    presenceSet,
    datePresenceSet,
    dateOnlyFn,
    previousDateKeyFn,
  ) {
    if (!playerDay) return "";
    var safeDateOnly = dateOnlyFn || dateOnlyFallback;
    var safePreviousDateKey = previousDateKeyFn || previousDateKeyFallback;
    var pid = playerDay.playerId;
    var tid = playerDay.gshlTeamId;
    var dk = safeDateOnly(playerDay.date);
    if (!pid || !tid || !dk) return "";
    var prev = safePreviousDateKey(dk || playerDay.date, safeDateOnly);
    if (!prev) return "";
    if (datePresenceSet && !datePresenceSet.has(String(prev))) return "";
    var keyPrev = String(pid) + "|" + String(tid) + "|" + String(prev);
    return presenceSet && presenceSet.has(keyPrev) ? "" : 1;
  }

  function validateTeamDayRoster(players, contextLabel) {
    var safePlayers = Array.isArray(players) ? players : [];
    var errors = [];
    var seenPlayerIds = {};
    var duplicatePlayerIds = [];
    var missingPlayerIdCount = 0;

    safePlayers.forEach(function (player) {
      var playerId =
        player && player.playerId !== undefined && player.playerId !== null
          ? String(player.playerId)
          : "";
      if (!playerId) {
        missingPlayerIdCount++;
        return;
      }
      if (seenPlayerIds[playerId]) {
        if (duplicatePlayerIds.indexOf(playerId) === -1) {
          duplicatePlayerIds.push(playerId);
        }
      } else {
        seenPlayerIds[playerId] = true;
      }
    });

    if (safePlayers.length > MAX_TEAM_DAY_PLAYERS) {
      errors.push("rowCount=" + safePlayers.length);
    }
    if (duplicatePlayerIds.length) {
      errors.push("duplicatePlayerIds=" + duplicatePlayerIds.join(","));
    }
    if (missingPlayerIdCount) {
      errors.push("missingPlayerIdCount=" + missingPlayerIdCount);
    }

    if (errors.length) {
      throw new Error(
        "Invalid team-day roster" +
          (contextLabel ? " (" + contextLabel + ")" : "") +
          ": " +
          errors.join("; "),
      );
    }
  }

  /**
   * Check if player is eligible for a position.
   * @param {Object} player
   * @param {string[]} eligiblePositions
   * @returns {boolean}
   */
  function isEligibleForPosition(player, eligiblePositions) {
    if (!player) return false;

    var nhlPosArr = getEligibleNhlPositions(player);

    if (!nhlPosArr.length) return false;

    // A Util slot may be represented either as ["Util"] or as the concrete
    // skater positions accepted by Util.
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

    // Goalie check
    if (eligiblePositions.includes(RosterPosition.G)) {
      return nhlPosArr.includes(RosterPosition.G);
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
    return isStartingLineupPosition(player && player.dailyPos);
  }

  /**
   * Greedy lineup optimizer - assigns best available player to each slot.
   * @param {Array} availablePlayers
   * @returns {Object} assignments map playerId -> slot position
   */
  function findBestLineupGreedy(availablePlayers, slots) {
    const assignments = {};
    const usedPlayers = new Set();

    const slotList = Array.isArray(slots) ? slots : LINEUP_STRUCTURE;

    const sortedSlots = slotList.slice().sort((a, b) => {
      return a.eligiblePositions.length - b.eligiblePositions.length;
    });

    for (const slot of sortedSlots) {
      let bestPlayer = null;
      let bestRating = -Infinity;

      for (const player of availablePlayers) {
        if (usedPlayers.has(player.playerId)) continue;
        if (!isEligibleForPosition(player, slot.eligiblePositions)) continue;

        const rating = ratingValue(player);
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
        total += ratingValue(player);
      }
    }
    return total;
  }

  function getTheoreticalMaxRating(players, slots) {
    const take = Array.isArray(slots) ? slots.length : 11;
    const sorted = players.map((p) => ratingValue(p)).sort((a, b) => b - a);
    return sorted.slice(0, take).reduce((sum, rating) => sum + rating, 0);
  }

  function normalizeSlotList(slots) {
    return (Array.isArray(slots) ? slots : LINEUP_STRUCTURE).slice();
  }

  function normalizeAvailablePlayers(availablePlayers) {
    var players = Array.isArray(availablePlayers) ? availablePlayers : [];
    return players.filter(function (player) {
      return (
        player && player.playerId !== undefined && player.playerId !== null
      );
    });
  }

  function getEligibleSlotIndexes(player, slots) {
    var indexes = [];
    for (var i = 0; i < slots.length; i++) {
      if (isEligibleForPosition(player, slots[i].eligiblePositions)) {
        indexes.push(i);
      }
    }
    return indexes;
  }

  function isBetterLineupState(candidate, current) {
    if (!candidate) return false;
    if (!current) return true;
    if (candidate.count !== current.count) {
      return candidate.count > current.count;
    }
    if (Math.abs(candidate.rating - current.rating) >= 0.000001) {
      return candidate.rating > current.rating;
    }
    return false;
  }

  function assignmentsFromLineupState(state) {
    var assignments = {};
    var current = state;
    while (current && current.playerId !== undefined) {
      assignments[current.playerId] = current.position;
      current = current.previous;
    }
    return assignments;
  }

  function slotEligibilityKey(slot) {
    return (
      Array.isArray(slot && slot.eligiblePositions)
        ? slot.eligiblePositions
        : []
    )
      .slice()
      .sort()
      .join("|");
  }

  function buildSlotProfile(slots) {
    var positions = [];
    var capacities = {};
    var eligibilityByPosition = {};
    var eligibilityKeyByPosition = {};
    var canUsePositionCounts = true;

    slots.forEach(function (slot) {
      if (!slot || !slot.position) return;

      var position = slot.position;
      var eligibilityKey = slotEligibilityKey(slot);

      if (capacities[position] === undefined) {
        positions.push(position);
        capacities[position] = 0;
        eligibilityByPosition[position] = Array.isArray(slot.eligiblePositions)
          ? slot.eligiblePositions.slice()
          : [];
        eligibilityKeyByPosition[position] = eligibilityKey;
      } else if (eligibilityKeyByPosition[position] !== eligibilityKey) {
        canUsePositionCounts = false;
      }

      capacities[position]++;
    });

    return {
      positions: positions,
      capacities: capacities,
      eligibilityByPosition: eligibilityByPosition,
      canUsePositionCounts: canUsePositionCounts,
    };
  }

  function getEligibleProfilePositions(player, profile) {
    return profile.positions.filter(function (position) {
      return isEligibleForPosition(
        player,
        profile.eligibilityByPosition[position],
      );
    });
  }

  /**
   * Fast path for under-filled lineups. If every available player can be placed
   * into the remaining slots, there is no lineup-choice problem to solve: all
   * players are starters and the only work is finding a legal slot for each.
   */
  function findQuickFillLineup(availablePlayers, slots) {
    var players = normalizeAvailablePlayers(availablePlayers);
    var slotList = normalizeSlotList(slots);
    if (!players.length || !slotList.length) return {};
    if (players.length > slotList.length) return null;

    var playerOptions = players
      .map(function (player) {
        return {
          player: player,
          slots: getEligibleSlotIndexes(player, slotList),
        };
      })
      .sort(function (a, b) {
        return (
          a.slots.length - b.slots.length ||
          ratingValue(b.player) - ratingValue(a.player) ||
          String(a.player.playerId).localeCompare(String(b.player.playerId))
        );
      });

    if (
      playerOptions.some(function (option) {
        return option.slots.length === 0;
      })
    ) {
      return null;
    }

    var assignments = {};
    var usedSlots = {};

    function placePlayer(index) {
      if (index >= playerOptions.length) return true;

      var option = playerOptions[index];
      var preferredSlots = option.slots.slice().sort(function (a, b) {
        return (
          slotList[a].eligiblePositions.length -
            slotList[b].eligiblePositions.length || a - b
        );
      });

      for (var i = 0; i < preferredSlots.length; i++) {
        var slotIndex = preferredSlots[i];
        if (usedSlots[slotIndex]) continue;

        usedSlots[slotIndex] = true;
        assignments[option.player.playerId] = slotList[slotIndex].position;

        if (placePlayer(index + 1)) return true;

        delete assignments[option.player.playerId];
        delete usedSlots[slotIndex];
      }

      return false;
    }

    return placePlayer(0) ? assignments : null;
  }

  /**
   * Exact search for difficult cases. Standard lineup slots are compressed to
   * position counts; a slot-mask fallback handles custom slots with different
   * eligibility under the same output position.
   * @param {Array} availablePlayers
   * @param {Object} playersMap
   * @returns {Object}
   */
  function findBestLineupExhaustive(availablePlayers, playersMap, slots) {
    var slotList = normalizeSlotList(slots);
    var profile = buildSlotProfile(slotList);

    if (profile.canUsePositionCounts) {
      return findBestLineupByPositionCounts(availablePlayers, profile);
    }

    return findBestLineupBySlotMask(availablePlayers, slotList);
  }

  function findBestLineupByPositionCounts(availablePlayers, profile) {
    var dimensions = [];
    var dimensionsByPosition = {};
    var stateCount = 1;

    profile.positions.forEach(function (position) {
      var capacity = profile.capacities[position] || 0;
      if (!capacity) return;

      var dimension = {
        position: position,
        capacity: capacity,
        base: capacity + 1,
        multiplier: stateCount,
      };
      dimensions.push(dimension);
      dimensionsByPosition[position] = dimension;
      stateCount *= dimension.base;
    });

    var candidates = normalizeAvailablePlayers(availablePlayers)
      .map(function (player) {
        return {
          player: player,
          rating: ratingValue(player),
          positions: getEligibleProfilePositions(player, profile),
        };
      })
      .filter(function (candidate) {
        return candidate.positions.length > 0;
      })
      .sort(function (a, b) {
        return (
          b.rating - a.rating ||
          a.positions.length - b.positions.length ||
          String(a.player.playerId).localeCompare(String(b.player.playerId))
        );
      });

    if (!dimensions.length || !candidates.length) return {};

    var dp = new Array(stateCount);
    dp[0] = { rating: 0, count: 0 };

    candidates.forEach(function (candidate) {
      var next = dp.slice();

      for (var stateIndex = 0; stateIndex < stateCount; stateIndex++) {
        var current = dp[stateIndex];
        if (!current) continue;

        candidate.positions.forEach(function (position) {
          var dimension = dimensionsByPosition[position];
          if (!dimension) return;

          var usedAtPosition =
            Math.floor(stateIndex / dimension.multiplier) % dimension.base;
          if (usedAtPosition >= dimension.capacity) return;

          var nextIndex = stateIndex + dimension.multiplier;
          var proposed = {
            rating: current.rating + candidate.rating,
            count: current.count + 1,
            playerId: candidate.player.playerId,
            position: position,
            previous: current,
          };

          if (isBetterLineupState(proposed, next[nextIndex])) {
            next[nextIndex] = proposed;
          }
        });
      }

      dp = next;
    });

    var best = null;
    for (var i = 0; i < dp.length; i++) {
      if (isBetterLineupState(dp[i], best)) {
        best = dp[i];
      }
    }

    return best ? assignmentsFromLineupState(best) : {};
  }

  function findBestLineupBySlotMask(availablePlayers, slotList) {
    var candidates = normalizeAvailablePlayers(availablePlayers)
      .map(function (player, index) {
        return {
          player: player,
          index: index,
          rating: ratingValue(player),
          slots: getEligibleSlotIndexes(player, slotList),
        };
      })
      .filter(function (candidate) {
        return candidate.slots.length > 0;
      })
      .sort(function (a, b) {
        return (
          b.rating - a.rating ||
          a.slots.length - b.slots.length ||
          String(a.player.playerId).localeCompare(String(b.player.playerId))
        );
      });

    if (!slotList.length || !candidates.length) return {};

    var stateCount = Math.pow(2, slotList.length);
    var dp = new Array(stateCount);
    dp[0] = { rating: 0, count: 0 };

    candidates.forEach(function (candidate) {
      var next = dp.slice();

      for (var mask = 0; mask < stateCount; mask++) {
        var current = dp[mask];
        if (!current) continue;

        candidate.slots.forEach(function (slotIndex) {
          var bit = 1 << slotIndex;
          if (mask & bit) return;

          var nextMask = mask | bit;
          var proposed = {
            rating: current.rating + candidate.rating,
            count: current.count + 1,
            playerId: candidate.player.playerId,
            position: slotList[slotIndex].position,
            previous: current,
          };

          if (isBetterLineupState(proposed, next[nextMask])) {
            next[nextMask] = proposed;
          }
        });
      }

      dp = next;
    });

    var best = null;
    for (var i = 0; i < dp.length; i++) {
      if (isBetterLineupState(dp[i], best)) {
        best = dp[i];
      }
    }

    return best ? assignmentsFromLineupState(best) : {};
  }

  /**
   * Main lineup optimizer. It takes a quick matching path when the remaining
   * lineup is under-filled, then uses an exact eligibility-aware search when
   * players must compete for limited slots.
   * @param {Array} availablePlayers
   * @param {boolean} skipValidation
   * @returns {Object}
   */
  function findBestLineup(availablePlayers, skipValidation, slots) {
    const candidates = normalizeAvailablePlayers(availablePlayers);
    const slotList = normalizeSlotList(slots);
    if (!candidates.length || !slotList.length) return {};

    const quickFillAssignments = findQuickFillLineup(candidates, slotList);
    if (quickFillAssignments) return quickFillAssignments;

    const playersMap = {};
    for (const p of candidates) {
      playersMap[p.playerId] = p;
    }

    if (skipValidation) return findBestLineupGreedy(candidates, slotList);

    return findBestLineupExhaustive(candidates, playersMap, slotList);
  }

  function reserveLineupSlot(slots, position) {
    var normalized = normalizeDailyPos(position);
    for (var i = 0; i < slots.length; i++) {
      if (slots[i] && slots[i].position === normalized) {
        slots.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  function countPlayedSkaters(players) {
    return (Array.isArray(players) ? players : []).filter(function (player) {
      if (!isPlayedGame(player)) return false;
      var positions = getEligibleNhlPositions(player);
      return positions.some(function (pos) {
        return (
          pos === RosterPosition.LW ||
          pos === RosterPosition.C ||
          pos === RosterPosition.RW ||
          pos === RosterPosition.D
        );
      });
    }).length;
  }

  function assignPlayersToSlots(players, slots, assignments, usedPlayers) {
    var slotList = Array.isArray(slots) ? slots : [];
    var madeProgress = false;

    players.forEach(function (player) {
      if (!player || !player.playerId || usedPlayers.has(player.playerId)) {
        return;
      }

      for (var i = 0; i < slotList.length; i++) {
        var slot = slotList[i];
        if (!slot || !isEligibleForPosition(player, slot.eligiblePositions)) {
          continue;
        }

        assignments[player.playerId] = slot.position;
        usedPlayers.add(player.playerId);
        slotList.splice(i, 1);
        madeProgress = true;
        return;
      }
    });

    return madeProgress;
  }

  function buildSimpleFullPosAssignments(candidates, slots) {
    var slotList = (Array.isArray(slots) ? slots : []).slice();
    var assignments = {};
    var usedPlayers = new Set();
    var playedPlayers = candidates.filter(isPlayedGame);
    var nonPlayedPlayers = candidates.filter(function (player) {
      return !isPlayedGame(player);
    });
    var playedSkaterCount = countPlayedSkaters(playedPlayers);

    if (playedPlayers.length > slotList.length) return null;

    playedPlayers = playedPlayers.slice().sort(function (a, b) {
      return (
        getEligibleNhlPositions(a).length - getEligibleNhlPositions(b).length ||
        ratingValue(b) - ratingValue(a)
      );
    });

    if (playedSkaterCount >= 7) {
      playedPlayers = playedPlayers.slice().sort(function (a, b) {
        return ratingValue(b) - ratingValue(a);
      });
      var exactPlayedAssignments = findBestLineup(
        playedPlayers,
        false,
        slotList,
      );
      var assignedPlayedCount = Object.keys(exactPlayedAssignments).length;
      if (assignedPlayedCount !== playedPlayers.length) return null;

      Object.keys(exactPlayedAssignments).forEach(function (playerId) {
        assignments[playerId] = exactPlayedAssignments[playerId];
        usedPlayers.add(playerId);
        reserveLineupSlot(slotList, exactPlayedAssignments[playerId]);
      });
    } else if (
      !assignPlayersToSlots(playedPlayers, slotList, assignments, usedPlayers)
    ) {
      // No played players to place, or the first simple pass placed none.
      if (playedPlayers.length) return null;
    }

    if (
      playedPlayers.some(function (player) {
        return !usedPlayers.has(player.playerId);
      })
    ) {
      return null;
    }

    assignPlayersToSlots(
      nonPlayedPlayers.slice().sort(function (a, b) {
        return ratingValue(b) - ratingValue(a);
      }),
      slotList,
      assignments,
      usedPlayers,
    );

    return assignments;
  }

  // ===== PUBLIC API =====

  /**
   * Optimize lineup for a team on a given day.
   * @param {Array} players
   * @returns {Array}
   */
  function optimizeLineup(players) {
    const safePlayers = Array.isArray(players) ? players : [];
    validateTeamDayRoster(safePlayers, "optimizeLineup");
    const results = safePlayers.map((p) => ({
      ...p,
      fullPos: RosterPosition.BN,
      bestPos: RosterPosition.BN,
    }));

    if (safePlayers.length === 0) return results;

    // fullPos is the best feasible lineup after preserving the manager's
    // started players who actually played. Remaining slots are filled by played
    // bench players first, then non-playing roster players.

    const PRIORITY_GAP = 100000000;

    const protectedFullPlayerIds = {};
    const lockedFullAssignments = {};
    const remainingFullSlots = LINEUP_STRUCTURE.slice();
    const failedFullSlotReservations = [];

    results.forEach(function (p) {
      if (!p || !p.playerId) return;
      const wasInActiveLineup = wasInDailyLineup(p);
      const played = isPlayedGame(p);
      if (!played || !wasInActiveLineup) return;

      var dailyPos = normalizeDailyPos(p.dailyPos);
      protectedFullPlayerIds[p.playerId] = true;
      if (reserveLineupSlot(remainingFullSlots, dailyPos)) {
        lockedFullAssignments[p.playerId] = dailyPos;
      } else {
        failedFullSlotReservations.push(p.playerId + ":" + dailyPos);
      }
    });

    if (failedFullSlotReservations.length) {
      throw new Error(
        "Unable to reserve played daily-lineup slot(s) in fullPos: " +
          failedFullSlotReservations.join(","),
      );
    }

    const candidatesForFull = results
      .filter(function (p) {
        return !protectedFullPlayerIds[p.playerId];
      })
      .map((p) => {
        const played = isPlayedGame(p);
        const tier = played ? 2 : 1;

        return {
          playerId: p.playerId,
          nhlPos: p.nhlPos,
          posGroup: p.posGroup,
          dailyPos: p.dailyPos,
          GP: p.GP,
          GS: p.GS,
          IR: p.IR,
          IRplus: p.IRplus,
          Rating: tier * PRIORITY_GAP + ratingValue(p),
        };
      });

    const fullPosAssignments =
      buildSimpleFullPosAssignments(candidatesForFull, remainingFullSlots) ||
      findBestLineup(candidatesForFull, false, remainingFullSlots);
    for (const result of results) {
      result.fullPos =
        lockedFullAssignments[result.playerId] ||
        fullPosAssignments[result.playerId] ||
        RosterPosition.BN;
    }

    const missingProtectedFull = results
      .filter(function (p) {
        return (
          protectedFullPlayerIds[p.playerId] &&
          !wasInDailyLineup({ dailyPos: p.fullPos })
        );
      })
      .map(function (p) {
        return p.playerId;
      });
    if (missingProtectedFull.length) {
      throw new Error(
        "Unable to keep played daily-lineup player(s) in fullPos: " +
          missingProtectedFull.join(","),
      );
    }

    const bestPosPriority = results
      .slice()
      .sort((a, b) => ratingValue(b) - ratingValue(a));
    const bestPosAssignments = findBestLineup(bestPosPriority, false);
    for (const result of results) {
      result.bestPos = bestPosAssignments[result.playerId] || RosterPosition.BN;
      const flags = computeLineupFlags(result);
      result.GS = flags.GS;
      result.MS = flags.MS;
      result.BS = flags.BS;
    }

    return results;
  }

  function getLineupStats(optimizedPlayers) {
    const safePlayers = Array.isArray(optimizedPlayers) ? optimizedPlayers : [];

    const fullPosRating = safePlayers
      .filter((p) => p.fullPos !== RosterPosition.BN)
      .reduce((sum, p) => sum + ratingValue(p), 0);

    const bestPosRating = safePlayers
      .filter((p) => p.bestPos !== RosterPosition.BN)
      .reduce((sum, p) => sum + ratingValue(p), 0);

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
    return "";
  }

  function computeBenchAndMissingStartsFlags(player) {
    var flags = computeLineupFlags(player);
    return { BS: flags.BS, MS: flags.MS };
  }

  function recomputeGsFromAssignedLineup(player) {
    return computeGsValue(player);
  }

  function getMatchupGameTypeForTeamWeek(matchups, teamId, weekId) {
    var teamKey =
      teamId === undefined || teamId === null ? "" : String(teamId).trim();
    var weekKey =
      weekId === undefined || weekId === null ? "" : String(weekId).trim();
    if (!teamKey || !weekKey || !Array.isArray(matchups)) return "";

    var matchup = matchups.find(function (m) {
      if (!m) return false;
      var matchupWeekId =
        m.weekId === undefined || m.weekId === null ? "" : String(m.weekId);
      if (matchupWeekId !== weekKey) return false;
      return (
        String(m.homeTeamId) === teamKey || String(m.awayTeamId) === teamKey
      );
    });

    return matchup &&
      matchup.gameType !== undefined &&
      matchup.gameType !== null
      ? String(matchup.gameType)
      : "";
  }

  function isLosersTournamentGame(gameType) {
    return String(gameType || "") === "LT";
  }

  /**
   * Recompute lineup helper columns for PlayerDay rows in a season.
   * This is the canonical maintenance entrypoint for week-scoped lineup resets;
   * pass `options.weekNums` to recompute all team-days in one or more week numbers.
   *
   * @param {string|number} seasonId
   * @param {Object=} options
   * @param {string=} options.playerDayWorkbookId Override workbook id
   * @param {Array<string|number>=} options.weekIds Only update PlayerDays with these weekIds
   * @param {Array<string|number>=} options.weekNums Only update PlayerDays in these week numbers (resolved via Week sheet)
   * @param {boolean=} options.applyLtAutoLineups When true, rows whose matchup.gameType is LT also persist dailyPos=bestPos and rerun optimization from that auto-lineup
   * @param {boolean=} options.dryRun When true, computes but does not write
   * @param {boolean=} options.logToConsole When true, prints progress
   */
  function recomputeStoredLineups(seasonId, options) {
    var seasonKey =
      seasonId === undefined || seasonId === null ? "" : String(seasonId);
    if (!seasonKey) {
      throw new Error("recomputeStoredLineups requires a seasonId argument");
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
        "recomputeStoredLineups could not resolve PlayerDay workbook id for seasonId=" +
          seasonKey,
      );
    }

    var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
    var openSheet = GshlUtils.sheets.open.getSheetByName;
    var getHeaders = GshlUtils.sheets.read.getHeadersFromSheet;
    var getColIndex = GshlUtils.sheets.read.getColIndex;
    var groupAndApply = GshlUtils.sheets.write.groupAndApplyColumnUpdates;
    var seasonWeeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week", {
      coerceTypes: true,
    }).filter(function (w) {
      return String(w && w.seasonId) === seasonKey;
    });
    var seasonMatchups = fetchSheetAsObjects(SPREADSHEET_ID, "Matchup", {
      coerceTypes: true,
    }).filter(function (m) {
      return String(m && m.seasonId) === seasonKey;
    });

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

        seasonWeeks.forEach(function (w) {
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
        "[LineupBuilder] recomputeStoredLineups season=" +
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

    var presenceSets = buildPresenceSets(seasonPlayerDays, dateOnly);

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
        "[LineupBuilder] recomputeStoredLineups: skipped " +
          skippedMissingGroupKey +
          " row(s) missing date/team for grouping",
      );
    }

    var invalidGroups = [];
    groups.forEach(function (players, groupKey) {
      try {
        validateTeamDayRoster(
          players,
          "seasonId=" + seasonKey + " group=" + groupKey,
        );
      } catch (err) {
        invalidGroups.push(err && err.message ? err.message : String(err));
      }
    });
    if (invalidGroups.length) {
      throw new Error(
        "[LineupBuilder] recomputeStoredLineups found invalid team-day roster group(s): " +
          invalidGroups.slice(0, 20).join(" | "),
      );
    }

    var updates = [];
    groups.forEach(function (players, groupKey) {
      var weekId =
        players &&
        players[0] &&
        players[0].weekId !== undefined &&
        players[0].weekId !== null
          ? String(players[0].weekId)
          : "";
      var teamId =
        players &&
        players[0] &&
        players[0].gshlTeamId !== undefined &&
        players[0].gshlTeamId !== null
          ? String(players[0].gshlTeamId)
          : "";
      var gameType = getMatchupGameTypeForTeamWeek(
        seasonMatchups,
        teamId,
        weekId,
      );
      var shouldApplyLtAutoLineup =
        !!opts.applyLtAutoLineups && isLosersTournamentGame(gameType);

      var optimized = optimizeLineup(players);
      if (shouldApplyLtAutoLineup) {
        optimized.forEach(function (p) {
          if (!p) return;
          var assignedBestPos =
            p.bestPos !== undefined && p.bestPos !== null
              ? String(p.bestPos)
              : "";
          p.dailyPos = assignedBestPos;
          p.bestPos = assignedBestPos;
          p.fullPos = assignedBestPos;
          var ltFlags = computeLineupFlags(p);
          p.GS = ltFlags.GS;
          p.MS = ltFlags.MS;
          p.BS = ltFlags.BS;
        });
      }

      optimized.forEach(function (p) {
        if (!p || p.id === undefined || p.id === null || p.id === "") return;

        var flags = computeLineupFlags(p);

        var updateObj = {
          id: p.id,
          bestPos: p.bestPos,
          fullPos: p.fullPos,
          dailyPos: shouldApplyLtAutoLineup ? p.dailyPos : undefined,
          GS: flags.GS,
          ADD: computeAddValue(
            p,
            presenceSets.rowPresence,
            presenceSets.datePresence,
            dateOnly,
            previousDateKey,
          ),
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
    var dailyPosCol = getColIndex(headers, "dailyPos", true) + 1;
    var bestPosCol = getColIndex(headers, "bestPos", true) + 1;
    var fullPosCol = getColIndex(headers, "fullPos", true) + 1;
    var gsCol = getColIndex(headers, "GS", true) + 1;
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
        dailyPos: u.dailyPos,
        bestPos: u.bestPos,
        fullPos: u.fullPos,
        GS: u.GS,
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
          "[LineupBuilder] recomputeStoredLineups: no matching sheet rows found for updates (skipped=" +
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

    var dailyPosUpdates = resolvedUpdates.filter(function (u) {
      return u.dailyPos !== undefined;
    });
    if (dailyPosUpdates.length) {
      groupAndApply(
        sheet,
        dailyPosCol,
        dailyPosUpdates.map(function (u) {
          return { rowIndex: u.rowIndex, value: u.dailyPos };
        }),
      );
    }

    var gsUpdates = resolvedUpdates.filter(function (u) {
      return u.GS !== undefined;
    });
    if (gsUpdates.length) {
      groupAndApply(
        sheet,
        gsCol,
        gsUpdates.map(function (u) {
          return { rowIndex: u.rowIndex, value: u.GS };
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

  function regression_fullPosFillsOpenSlots() {
    var roster = [
      {
        playerId: "active-lw",
        nhlPos: ["LW"],
        dailyPos: "LW",
        GP: "1",
        Rating: 10,
      },
      {
        playerId: "active-c",
        nhlPos: ["C"],
        dailyPos: "C",
        GP: "1",
        Rating: 9,
      },
      {
        playerId: "bench-rw-no-game",
        nhlPos: ["RW"],
        dailyPos: "BN",
        GP: "",
        Rating: 100,
      },
      {
        playerId: "bench-d-no-game",
        nhlPos: ["D"],
        dailyPos: "BN",
        GP: "",
        Rating: 99,
      },
      {
        playerId: "bench-g-no-game",
        nhlPos: ["G"],
        dailyPos: "BN",
        GP: "",
        Rating: 98,
      },
    ];

    var optimized = optimizeLineup(roster);
    assert(
      optimized.find(function (p) {
        return p.playerId === "bench-rw-no-game";
      }).fullPos !== RosterPosition.BN,
      "Expected fullPos to fill open RW slot with non-playing roster player",
    );
    assert(
      optimized.find(function (p) {
        return p.playerId === "bench-d-no-game";
      }).fullPos !== RosterPosition.BN,
      "Expected fullPos to fill open D slot with non-playing roster player",
    );
    assert(
      optimized.find(function (p) {
        return p.playerId === "bench-g-no-game";
      }).fullPos !== RosterPosition.BN,
      "Expected fullPos to fill open G slot with non-playing roster player",
    );
    return { ok: true };
  }

  function regression_fullPosPrioritizesPlayedBench() {
    var roster = [
      {
        playerId: "active-lw",
        nhlPos: ["LW"],
        dailyPos: "LW",
        GP: "1",
        Rating: 1,
      },
      {
        playerId: "active-rw",
        nhlPos: ["RW"],
        dailyPos: "RW",
        GP: "1",
        Rating: 1,
      },
      {
        playerId: "active-lw2",
        nhlPos: ["LW"],
        dailyPos: "LW",
        GP: "1",
        Rating: 1,
      },
      {
        playerId: "active-c1",
        nhlPos: ["C"],
        dailyPos: "C",
        GP: "1",
        Rating: 1,
      },
      {
        playerId: "active-c2",
        nhlPos: ["C"],
        dailyPos: "C",
        GP: "1",
        Rating: 1,
      },
      {
        playerId: "active-d1",
        nhlPos: ["D"],
        dailyPos: "D",
        GP: "1",
        Rating: 1,
      },
      {
        playerId: "active-d2",
        nhlPos: ["D"],
        dailyPos: "D",
        GP: "1",
        Rating: 1,
      },
      {
        playerId: "active-d3",
        nhlPos: ["D"],
        dailyPos: "D",
        GP: "1",
        Rating: 1,
      },
      {
        playerId: "active-g",
        nhlPos: ["G"],
        dailyPos: "G",
        GP: "1",
        Rating: 1,
      },
      {
        playerId: "active-util",
        nhlPos: ["C"],
        dailyPos: "Util",
        GP: "1",
        Rating: 1,
      },
      {
        playerId: "bench-rw-played",
        nhlPos: ["RW"],
        dailyPos: "BN",
        GP: "1",
        Rating: 2,
      },
      {
        playerId: "bench-rw-no-game",
        nhlPos: ["RW"],
        dailyPos: "BN",
        GP: "",
        Rating: 999,
      },
    ];

    var optimized = optimizeLineup(roster);
    assert(
      optimized.find(function (p) {
        return p.playerId === "active-lw";
      }).fullPos !== RosterPosition.BN,
      "Expected active played player to stay in fullPos",
    );
    assert(
      optimized.find(function (p) {
        return p.playerId === "bench-rw-played";
      }).fullPos !== RosterPosition.BN,
      "Expected played bench player to beat higher-rated non-player for fullPos",
    );
    assert(
      optimized.find(function (p) {
        return p.playerId === "bench-rw-no-game";
      }).fullPos === RosterPosition.BN,
      "Expected non-playing player to remain BN when played bench player fits only RW slot",
    );
    return { ok: true };
  }

  function regression_fullPosKeepsDailySlotsWhenNhlPosIsStale() {
    var roster = [
      {
        playerId: "1661",
        nhlPos: "C",
        posGroup: "F",
        dailyPos: "C",
        GP: "1",
        GS: "1",
        Rating: 52.28690355,
      },
      {
        playerId: "142",
        nhlPos: "C",
        posGroup: "F",
        dailyPos: "C",
        GP: "1",
        GS: "1",
        Rating: 16.0277851,
      },
      {
        playerId: "2149",
        nhlPos: "C",
        posGroup: "F",
        dailyPos: "LW",
        GP: "1",
        GS: "1",
        Rating: 70.91832154,
      },
      {
        playerId: "209",
        nhlPos: "C,LW",
        posGroup: "F",
        dailyPos: "LW",
        GP: "1",
        GS: "1",
        Rating: 33.36674935,
      },
      {
        playerId: "8",
        nhlPos: "LW,RW",
        posGroup: "F",
        dailyPos: "RW",
        GP: "1",
        GS: "1",
        Rating: 34.01421891,
      },
      {
        playerId: "29",
        nhlPos: "C",
        posGroup: "F",
        dailyPos: "RW",
        GP: "",
        GS: "",
        Rating: 0,
      },
      {
        playerId: "193",
        nhlPos: "D",
        posGroup: "D",
        dailyPos: "D",
        GP: "1",
        GS: "1",
        Rating: 45.70937793,
      },
      {
        playerId: "1644",
        nhlPos: "D",
        posGroup: "D",
        dailyPos: "D",
        GP: "1",
        GS: "1",
        Rating: 18.8123404,
      },
      {
        playerId: "13",
        nhlPos: "D",
        posGroup: "D",
        dailyPos: "D",
        GP: "1",
        GS: "1",
        Rating: 47.9847656,
      },
      {
        playerId: "83",
        nhlPos: "C",
        posGroup: "F",
        dailyPos: "Util",
        GP: "1",
        GS: "1",
        Rating: 52.53296173,
      },
      {
        playerId: "406",
        nhlPos: "G",
        posGroup: "G",
        dailyPos: "G",
        GP: "1",
        GS: "1",
        Rating: 110.7990159,
      },
    ];

    var optimized = optimizeLineup(roster);
    var byId = {};
    optimized.forEach(function (p) {
      byId[p.playerId] = p;
    });

    assert(byId["142"].fullPos === "C", "Expected player 142 to stay at C");
    assert(byId["2149"].fullPos === "LW", "Expected stale C row to stay at LW");
    assert(byId["8"].fullPos === "RW", "Expected LW/RW row to stay at RW");
    assert(byId["83"].fullPos === "Util", "Expected Util starter to stay Util");
    return { ok: true };
  }

  function regression_fullPosDoesNotRefillWhenDailyLineupIsFull() {
    var roster = [
      { playerId: "c1", nhlPos: ["C"], dailyPos: "C", GP: "1", Rating: 1 },
      { playerId: "c2", nhlPos: ["C"], dailyPos: "C", GP: "1", Rating: 1 },
      { playerId: "lw1", nhlPos: ["LW"], dailyPos: "LW", GP: "1", Rating: 1 },
      { playerId: "lw2", nhlPos: ["LW"], dailyPos: "LW", GP: "1", Rating: 1 },
      { playerId: "rw1", nhlPos: ["RW"], dailyPos: "RW", GP: "1", Rating: 1 },
      { playerId: "rw2", nhlPos: ["RW"], dailyPos: "RW", GP: "1", Rating: 1 },
      { playerId: "d1", nhlPos: ["D"], dailyPos: "D", GP: "1", Rating: 1 },
      { playerId: "d2", nhlPos: ["D"], dailyPos: "D", GP: "1", Rating: 1 },
      { playerId: "d3", nhlPos: ["D"], dailyPos: "D", GP: "1", Rating: 1 },
      {
        playerId: "util",
        nhlPos: ["C"],
        dailyPos: "Util",
        GP: "1",
        Rating: 1,
      },
      { playerId: "g", nhlPos: ["G"], dailyPos: "G", GP: "1", Rating: 1 },
      {
        playerId: "bench-played-c",
        nhlPos: ["C"],
        dailyPos: "BN",
        GP: "1",
        Rating: 999,
      },
      {
        playerId: "bench-played-g",
        nhlPos: ["G"],
        dailyPos: "BN",
        GP: "1",
        Rating: 999,
      },
      {
        playerId: "bench-no-game-lw",
        nhlPos: ["LW"],
        dailyPos: "BN",
        GP: "",
        Rating: 999,
      },
    ];

    var optimized = optimizeLineup(roster);
    var starterCount = optimized.filter(function (p) {
      return isStartingLineupPosition(p.fullPos);
    }).length;
    assert(
      starterCount === 11,
      "Expected fullPos to assign exactly 11 starters",
    );
    assert(
      optimized.find(function (p) {
        return p.playerId === "bench-played-c";
      }).fullPos === RosterPosition.BN,
      "Expected played bench skater to stay BN when all fullPos slots are filled",
    );
    assert(
      optimized.find(function (p) {
        return p.playerId === "bench-played-g";
      }).fullPos === RosterPosition.BN,
      "Expected played bench goalie to stay BN when G slot is filled",
    );
    assert(
      optimized.find(function (p) {
        return p.playerId === "bench-no-game-lw";
      }).fullPos === RosterPosition.BN,
      "Expected non-playing bench player to stay BN when all fullPos slots are filled",
    );
    return { ok: true };
  }

  function regression_bestPosUsesRatingOnly() {
    var roster = [
      {
        playerId: "played-rw",
        nhlPos: ["RW"],
        dailyPos: "RW",
        GP: "1",
        Rating: 1,
      },
      {
        playerId: "no-game-rw",
        nhlPos: ["RW"],
        dailyPos: "BN",
        GP: "",
        Rating: 100,
      },
    ];

    var optimized = optimizeLineup(roster);
    assert(
      optimized.find(function (p) {
        return p.playerId === "no-game-rw";
      }).bestPos !== RosterPosition.BN,
      "Expected bestPos to use higher-rated non-playing player",
    );
    return { ok: true };
  }

  function regression_quickFillPlacesAllEligiblePlayers() {
    var slots = [
      { position: RosterPosition.LW, eligiblePositions: [RosterPosition.LW] },
      { position: RosterPosition.C, eligiblePositions: [RosterPosition.C] },
    ];
    var assignments = findBestLineup(
      [
        { playerId: "dual", nhlPos: ["LW", "C"], Rating: 100 },
        { playerId: "lw-only", nhlPos: ["LW"], Rating: 1 },
      ],
      false,
      slots,
    );

    assert(
      assignments.dual === RosterPosition.C,
      "Expected dual-eligible player to move to C so both players fit",
    );
    assert(
      assignments["lw-only"] === RosterPosition.LW,
      "Expected LW-only player to receive the LW slot",
    );
    return { ok: true };
  }

  function regression_exhaustiveSearchOptimizesEligibility() {
    var slots = [
      { position: RosterPosition.LW, eligiblePositions: [RosterPosition.LW] },
      { position: RosterPosition.C, eligiblePositions: [RosterPosition.C] },
    ];
    var assignments = findBestLineup(
      [
        { playerId: "dual", nhlPos: ["LW", "C"], Rating: 100 },
        { playerId: "lw-only", nhlPos: ["LW"], Rating: 90 },
        { playerId: "c-only", nhlPos: ["C"], Rating: 1 },
      ],
      false,
      slots,
    );

    assert(
      assignments.dual === RosterPosition.C,
      "Expected exact search to assign dual player to C",
    );
    assert(
      assignments["lw-only"] === RosterPosition.LW,
      "Expected exact search to keep the better LW-only player",
    );
    assert(
      !assignments["c-only"],
      "Expected lower-rated C-only player to remain unassigned",
    );
    return { ok: true };
  }

  function regression_lineupFlagsUsePositions() {
    var msPlayer = {
      dailyPos: RosterPosition.BN,
      fullPos: RosterPosition.C,
      bestPos: RosterPosition.BN,
      GP: "1",
      GS: "",
    };
    var bsPlayer = {
      dailyPos: RosterPosition.RW,
      fullPos: RosterPosition.RW,
      bestPos: RosterPosition.BN,
      GP: "1",
      GS: "",
    };
    var gsPlayer = {
      dailyPos: RosterPosition.G,
      fullPos: RosterPosition.G,
      bestPos: RosterPosition.G,
      GP: "1",
      GS: "",
    };
    var benchPlayed = {
      dailyPos: RosterPosition.BN,
      fullPos: RosterPosition.G,
      bestPos: RosterPosition.G,
      GP: "1",
      posGroup: "G",
      GS: "",
    };
    var didNotPlayStarter = {
      dailyPos: RosterPosition.D,
      fullPos: RosterPosition.D,
      bestPos: RosterPosition.D,
      GP: "",
      GS: "1",
    };
    var didNotPlayMsPlayer = {
      dailyPos: RosterPosition.BN,
      fullPos: RosterPosition.C,
      bestPos: RosterPosition.C,
      GP: "",
      GS: "",
    };
    var didNotPlayBsPlayer = {
      dailyPos: RosterPosition.RW,
      fullPos: RosterPosition.RW,
      bestPos: RosterPosition.BN,
      GP: "",
      GS: "",
    };
    var goalieMsPlayer = {
      dailyPos: RosterPosition.BN,
      fullPos: RosterPosition.G,
      bestPos: RosterPosition.G,
      GP: "1",
      posGroup: "G",
      GS: "",
    };

    assert(computeLineupFlags(msPlayer).MS === 1, "Expected MS by positions");
    assert(
      computeLineupFlags(bsPlayer).BS === 1,
      "Expected BS by dailyPos and bestPos",
    );
    assert(
      computeLineupFlags(gsPlayer).GS === 1,
      "Expected GS for played starter",
    );
    assert(
      computeLineupFlags(benchPlayed).GS === "",
      "Expected blank GS for played bench player",
    );
    assert(
      computeLineupFlags(didNotPlayStarter).GS === "",
      "Expected blank GS for non-playing starter",
    );
    assert(
      computeLineupFlags(didNotPlayMsPlayer).MS === "",
      "Expected blank MS for non-playing player",
    );
    assert(
      computeLineupFlags(didNotPlayBsPlayer).BS === "",
      "Expected blank BS for non-playing player",
    );
    assert(
      computeLineupFlags(goalieMsPlayer).MS === "",
      "Expected blank MS for goalie",
    );
    return { ok: true };
  }

  function regression_addUsesPreviousDatePresence() {
    function localDateOnly(d) {
      return typeof d === "string" ? d : dateOnlyFallback(d);
    }
    function localPreviousDateKey(dateKey) {
      var parts = String(dateKey)
        .split("-")
        .map(function (part) {
          return Number(part);
        });
      var dt = new Date(parts[0], parts[1] - 1, parts[2] - 1);
      return localDateOnly(dt);
    }

    var noPreviousDaySets = buildPresenceSets(
      [{ playerId: "1", gshlTeamId: "42", date: "2024-04-01" }],
      localDateOnly,
    );
    assert(
      computeAddValue(
        { playerId: "1", gshlTeamId: "42", date: "2024-04-01" },
        noPreviousDaySets.rowPresence,
        noPreviousDaySets.datePresence,
        localDateOnly,
        localPreviousDateKey,
      ) === "",
      "Expected no ADD when previous day has no rows",
    );

    var continuedSets = buildPresenceSets(
      [
        { playerId: "1", gshlTeamId: "42", date: "2024-03-31" },
        { playerId: "2", gshlTeamId: "42", date: "2024-04-01" },
      ],
      localDateOnly,
    );
    assert(
      computeAddValue(
        { playerId: "1", gshlTeamId: "42", date: "2024-04-01" },
        continuedSets.rowPresence,
        continuedSets.datePresence,
        localDateOnly,
        localPreviousDateKey,
      ) === "",
      "Expected no ADD when same player/team existed previous day",
    );
    assert(
      computeAddValue(
        { playerId: "2", gshlTeamId: "42", date: "2024-04-01" },
        continuedSets.rowPresence,
        continuedSets.datePresence,
        localDateOnly,
        localPreviousDateKey,
      ) === 1,
      "Expected ADD when previous day has rows but not same player/team",
    );
    assert(
      computeAddValue(
        { playerId: "1", gshlTeamId: "99", date: "2024-04-01" },
        continuedSets.rowPresence,
        continuedSets.datePresence,
        localDateOnly,
        localPreviousDateKey,
      ) === 1,
      "Expected ADD when same player was on a different team previous day",
    );
    return { ok: true };
  }

  function regression_rosterValidationRejectsBadGroups() {
    var tooMany = [];
    for (var i = 0; i < MAX_TEAM_DAY_PLAYERS + 1; i++) {
      tooMany.push({ playerId: "p" + i });
    }
    var threwTooMany = false;
    try {
      validateTeamDayRoster(tooMany, "too-many");
    } catch (_e) {
      threwTooMany = true;
    }
    assert(threwTooMany, "Expected >17 roster to throw");

    var threwDuplicate = false;
    try {
      validateTeamDayRoster([{ playerId: "dup" }, { playerId: "dup" }], "dup");
    } catch (_e2) {
      threwDuplicate = true;
    }
    assert(threwDuplicate, "Expected duplicate playerId roster to throw");
    return { ok: true };
  }

  function regression_ltDailyPosSyncUsesBestPosOnlyForLt() {
    var helper =
      typeof YahooScraper !== "undefined" &&
      YahooScraper &&
      YahooScraper.internals &&
      typeof YahooScraper.internals.finalizeLineupAssignments === "function"
        ? YahooScraper.internals.finalizeLineupAssignments
        : null;

    if (!helper) {
      return {
        skipped: true,
        reason: "YahooScraper finalize helper unavailable",
      };
    }

    var baseRoster = [
      {
        playerId: "lt-bn-c",
        nhlPos: ["C"],
        posGroup: "F",
        dailyPos: "BN",
        GP: "1",
        GS: "1",
        Rating: 99,
      },
      {
        playerId: "lt-c1",
        nhlPos: ["C"],
        posGroup: "F",
        dailyPos: "C",
        GP: "1",
        GS: "1",
        Rating: 50,
      },
      {
        playerId: "lt-lw1",
        nhlPos: ["LW"],
        posGroup: "F",
        dailyPos: "LW",
        GP: "1",
        GS: "1",
        Rating: 49,
      },
      {
        playerId: "lt-lw2",
        nhlPos: ["LW"],
        posGroup: "F",
        dailyPos: "IR+",
        GP: "1",
        GS: "1",
        Rating: 48,
      },
      {
        playerId: "lt-rw1",
        nhlPos: ["RW"],
        posGroup: "F",
        dailyPos: "RW",
        GP: "1",
        GS: "1",
        Rating: 47,
      },
      {
        playerId: "lt-rw2",
        nhlPos: ["RW"],
        posGroup: "F",
        dailyPos: "BN",
        GP: "1",
        GS: "1",
        Rating: 46,
      },
      {
        playerId: "lt-d1",
        nhlPos: ["D"],
        posGroup: "D",
        dailyPos: "D",
        GP: "1",
        GS: "1",
        Rating: 45,
      },
      {
        playerId: "lt-d2",
        nhlPos: ["D"],
        posGroup: "D",
        dailyPos: "D",
        GP: "1",
        GS: "1",
        Rating: 44,
      },
      {
        playerId: "lt-d3",
        nhlPos: ["D"],
        posGroup: "D",
        dailyPos: "BN",
        GP: "1",
        GS: "1",
        Rating: 43,
      },
      {
        playerId: "lt-util",
        nhlPos: ["LW"],
        posGroup: "F",
        dailyPos: "BN",
        GP: "1",
        GS: "1",
        Rating: 42,
      },
      {
        playerId: "lt-g",
        nhlPos: ["G"],
        posGroup: "G",
        dailyPos: "G",
        GP: "1",
        GS: "1",
        Rating: 41,
      },
      {
        playerId: "lt-bench-bn",
        nhlPos: ["LW"],
        posGroup: "F",
        dailyPos: "BN",
        GP: null,
        GS: null,
        Rating: 1,
      },
    ];

    var ltOptimized = helper(JSON.parse(JSON.stringify(baseRoster)), {
      gameType: "LT",
    });
    ltOptimized.forEach(function (player) {
      assert(
        player.dailyPos === player.bestPos,
        "Expected LT dailyPos to match bestPos for " + player.playerId,
      );
      assert(
        player.fullPos === player.bestPos,
        "Expected LT fullPos to match bestPos for " + player.playerId,
      );
      var expectedGs = player.GP === "1" && player.bestPos !== "BN" ? "1" : "";
      assert(
        String(player.GS || "") === expectedGs,
        "Expected LT GS to be recomputed from assigned lineup for " +
          player.playerId,
      );
    });

    var rsOptimized = helper(JSON.parse(JSON.stringify(baseRoster)), {
      gameType: "RS",
    });
    var rsIrPlus = rsOptimized.find(function (p) {
      return p.playerId === "lt-lw2";
    });
    assert(
      rsIrPlus && rsIrPlus.dailyPos === "IR+",
      "Expected non-LT dailyPos to preserve source lineup positions",
    );

    return { ok: true };
  }

  return {
    RosterPosition: RosterPosition,
    LINEUP_STRUCTURE: LINEUP_STRUCTURE,
    optimizeLineup: optimizeLineup,
    findBestLineup: findBestLineup,
    getLineupStats: getLineupStats,
    internals: {
      isEligibleForPosition: isEligibleForPosition,
      wasInDailyLineup: wasInDailyLineup,
      isStartingLineupPosition: isStartingLineupPosition,
      isPlayedGame: isPlayedGame,
      ratingValue: ratingValue,
      getEligibleNhlPositions: getEligibleNhlPositions,
      computeGsValue: computeGsValue,
      computeLineupFlags: computeLineupFlags,
      buildPresenceSets: buildPresenceSets,
      computeAddValue: computeAddValue,
      validateTeamDayRoster: validateTeamDayRoster,
      findBestLineupGreedy: findBestLineupGreedy,
      findQuickFillLineup: findQuickFillLineup,
      findBestLineupExhaustive: findBestLineupExhaustive,
      calculateLineupRating: calculateLineupRating,
      getTheoreticalMaxRating: getTheoreticalMaxRating,
    },
  };
})();
