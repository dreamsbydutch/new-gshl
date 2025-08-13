/**
 * GSHL Apps Script - Data Fetching Utilities
 * Comprehensive hooks for fetching data from all database sheets
 */

// =============================================================================
// CORE DATA READING FUNCTIONS
// =============================================================================

/**
 * Generic function to read data from any sheet with type conversion
 * @param {string} workbookKey - The workbook identifier (GENERAL, TEAMSTATS, etc.)
 * @param {string} sheetName - The sheet name
 * @param {Object} options - Additional options for filtering/processing
 * @returns {Array} Array of objects with proper type conversion
 */
function readSheetData(workbookKey, sheetName, options = {}) {
  try {
    const workbook = getWorkbook(workbookKey);
    const sheet = workbook.getSheetByName(sheetName);

    if (!sheet) {
      console.warn(
        `⚠️ Sheet '${sheetName}' not found in workbook '${workbookKey}'`,
      );
      return [];
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow <= 1) {
      console.log(`📊 Sheet '${sheetName}' is empty`);
      return [];
    }

    // Get headers from first row
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    // Get all data
    const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    // Convert to objects with type conversion
    const schema = SHEET_SCHEMAS[sheetName];
    const result = data
      .map((row) => {
        const obj = {};
        headers.forEach((header, index) => {
          const value = row[index];
          obj[header] = convertValue(value, schema?.types?.[header] || "auto");
        });
        return obj;
      })
      .filter((obj) => {
        // Filter out completely empty rows
        return Object.values(obj).some(
          (value) => value !== null && value !== undefined && value !== "",
        );
      });

    // Apply additional filtering if provided
    if (options.filter && typeof options.filter === "function") {
      return result.filter(options.filter);
    }

    console.log(`📊 Read ${result.length} records from ${sheetName}`);
    return result;
  } catch (error) {
    console.error(
      `❌ Error reading from ${workbookKey}.${sheetName}:`,
      error.message,
    );
    return [];
  }
}

/**
 * Convert value based on type specification
 */
function convertValue(value, type) {
  if (value === null || value === undefined || value === "") {
    return type === "string" ? "" : null;
  }

  switch (type) {
    case "number":
      return toNumber(value);
    case "string":
      return toString(value);
    case "date":
      return toDate(value);
    case "boolean":
      return toBoolean(value);
    case "auto":
    default:
      // Auto-detect type
      if (typeof value === "number") return value;
      if (typeof value === "boolean") return value;
      if (value instanceof Date) return value;
      if (typeof value === "string") {
        // Try to parse as number
        const num = Number(value);
        if (!isNaN(num) && value.trim() === num.toString()) return num;
        // Try to parse as boolean
        const lower = value.toLowerCase();
        if (lower === "true" || lower === "false") return lower === "true";
      }
      return value;
  }
}

// =============================================================================
// GENERAL DATA HOOKS (GENERAL WORKBOOK)
// =============================================================================

/**
 * Get all seasons
 * @returns {Array} Array of season objects
 */
function getSeasons() {
  return readSheetData("GENERAL", "Season");
}

/**
 * Get season by ID
 * @param {number} seasonId - The season ID
 * @returns {Object|null} Season object or null if not found
 */
function getSeasonById(seasonId) {
  const seasons = getSeasons();
  return seasons.find((season) => season.id === toNumber(seasonId)) || null;
}

/**
 * Get current/active season
 * @returns {Object|null} Active season object or null if not found
 */
function getCurrentSeason() {
  const seasons = getSeasons();
  return seasons.find((season) => season.isActive === true) || null;
}

/**
 * Get all weeks for a season
 * @param {number} seasonId - The season ID
 * @returns {Array} Array of week objects
 */
function getWeeksBySeasonId(seasonId) {
  return readSheetData("GENERAL", "Week", {
    filter: (week) => week.seasonId === toNumber(seasonId),
  });
}

/**
 * Get week by ID
 * @param {number} weekId - The week ID
 * @returns {Object|null} Week object or null if not found
 */
function getWeekById(weekId) {
  const weeks = readSheetData("GENERAL", "Week");
  return weeks.find((week) => week.id === toNumber(weekId)) || null;
}

/**
 * Get current/active week for a season
 * @param {number} seasonId - The season ID (optional)
 * @returns {Object|null} Active week object or null if not found
 */
function getCurrentWeek(seasonId = null) {
  const weeks = seasonId
    ? getWeeksBySeasonId(seasonId)
    : readSheetData("GENERAL", "Week");
  return weeks.find((week) => week.isActive === true) || null;
}

/**
 * Get all teams for a season
 * @param {number} seasonId - The season ID
 * @returns {Array} Array of team objects
 */
function getTeamsBySeasonId(seasonId) {
  return readSheetData("GENERAL", "Team", {
    filter: (team) => team.seasonId === toNumber(seasonId),
  });
}

/**
 * Get team by ID
 * @param {number} teamId - The team ID
 * @returns {Object|null} Team object or null if not found
 */
function getTeamById(teamId) {
  const teams = readSheetData("GENERAL", "Team");
  return teams.find((team) => team.id === toNumber(teamId)) || null;
}

/**
 * Get all franchises
 * @returns {Array} Array of franchise objects
 */
function getFranchises() {
  return readSheetData("GENERAL", "Franchise");
}

/**
 * Get franchise by ID
 * @param {number} franchiseId - The franchise ID
 * @returns {Object|null} Franchise object or null if not found
 */
function getFranchiseById(franchiseId) {
  const franchises = getFranchises();
  return (
    franchises.find((franchise) => franchise.id === toNumber(franchiseId)) ||
    null
  );
}

/**
 * Get all owners
 * @returns {Array} Array of owner objects
 */
function getOwners() {
  return readSheetData("GENERAL", "Owner");
}

/**
 * Get owner by ID
 * @param {number} ownerId - The owner ID
 * @returns {Object|null} Owner object or null if not found
 */
function getOwnerById(ownerId) {
  const owners = getOwners();
  return owners.find((owner) => owner.id === toNumber(ownerId)) || null;
}

/**
 * Get all players
 * @returns {Array} Array of player objects
 */
function getPlayers() {
  return readSheetData("GENERAL", "Player");
}

/**
 * Get player by ID
 * @param {number} playerId - The player ID
 * @returns {Object|null} Player object or null if not found
 */
function getPlayerById(playerId) {
  const players = getPlayers();
  return players.find((player) => player.id === toNumber(playerId)) || null;
}

/**
 * Get players by team ID
 * @param {number} teamId - The team ID
 * @returns {Array} Array of player objects
 */
function getPlayersByTeamId(teamId) {
  const players = getPlayers();
  return players.filter((player) => player.gshlTeamId === toNumber(teamId));
}

/**
 * Get players by position group
 * @param {string} posGroup - The position group (F, D, G)
 * @returns {Array} Array of player objects
 */
function getPlayersByPosition(posGroup) {
  const players = getPlayers();
  return players.filter((player) => player.posGroup === posGroup);
}

/**
 * Get all contracts
 * @returns {Array} Array of contract objects
 */
function getContracts() {
  return readSheetData("GENERAL", "Contract");
}

/**
 * Get contracts by player ID
 * @param {number} playerId - The player ID
 * @returns {Array} Array of contract objects
 */
function getContractsByPlayerId(playerId) {
  const contracts = getContracts();
  return contracts.filter(
    (contract) => contract.playerId === toNumber(playerId),
  );
}

/**
 * Get contracts by franchise ID
 * @param {number} franchiseId - The franchise ID
 * @returns {Array} Array of contract objects
 */
function getContractsByFranchiseId(franchiseId) {
  const contracts = getContracts();
  return contracts.filter(
    (contract) =>
      contract.signingFranchiseId === toNumber(franchiseId) ||
      contract.currentFranchiseId === toNumber(franchiseId),
  );
}

/**
 * Get active contracts for a season
 * @param {number} seasonId - The season ID
 * @returns {Array} Array of active contract objects
 */
function getActiveContractsBySeason(seasonId) {
  const contracts = getContracts();
  return contracts.filter(
    (contract) =>
      contract.seasonId === toNumber(seasonId) &&
      contract.signingStatus === "active",
  );
}

/**
 * Get all matchups for a week
 * @param {number} weekId - The week ID
 * @returns {Array} Array of matchup objects
 */
function getMatchupsByWeekId(weekId) {
  return readSheetData("GENERAL", "Matchup", {
    filter: (matchup) => matchup.weekId === toNumber(weekId),
  });
}

/**
 * Get all matchups for a season
 * @param {number} seasonId - The season ID
 * @returns {Array} Array of matchup objects
 */
function getMatchupsBySeasonId(seasonId) {
  return readSheetData("GENERAL", "Matchup", {
    filter: (matchup) => matchup.seasonId === toNumber(seasonId),
  });
}

/**
 * Get matchups for a specific team
 * @param {number} teamId - The team ID
 * @param {number} seasonId - The season ID (optional)
 * @returns {Array} Array of matchup objects
 */
function getMatchupsByTeamId(teamId, seasonId = null) {
  const matchups = seasonId
    ? getMatchupsBySeasonId(seasonId)
    : readSheetData("GENERAL", "Matchup");
  return matchups.filter(
    (matchup) =>
      matchup.homeTeamId === toNumber(teamId) ||
      matchup.awayTeamId === toNumber(teamId),
  );
}

/**
 * Get all conferences
 * @returns {Array} Array of conference objects
 */
function getConferences() {
  return readSheetData("GENERAL", "Conference");
}

/**
 * Get conference by ID
 * @param {number} confId - The conference ID
 * @returns {Object|null} Conference object or null if not found
 */
function getConferenceById(confId) {
  const conferences = getConferences();
  return conferences.find((conf) => conf.id === toNumber(confId)) || null;
}

// =============================================================================
// TEAM STATS HOOKS (TEAMSTATS WORKBOOK)
// =============================================================================

/**
 * Get team day stats for a specific week
 * @param {number} weekId - The week ID
 * @param {number} teamId - The team ID (optional)
 * @returns {Array} Array of team day stat objects
 */
function getTeamDayStatsByWeek(weekId, teamId = null) {
  const filter = teamId
    ? (stats) =>
        stats.weekId === toNumber(weekId) &&
        stats.gshlTeamId === toNumber(teamId)
    : (stats) => stats.weekId === toNumber(weekId);

  return readSheetData("TEAMSTATS", "TeamDayStatLine", { filter });
}

/**
 * Get team week stats for a season
 * @param {number} seasonId - The season ID
 * @param {number} teamId - The team ID (optional)
 * @returns {Array} Array of team week stat objects
 */
function getTeamWeekStatsBySeason(seasonId, teamId = null) {
  const filter = teamId
    ? (stats) =>
        stats.seasonId === toNumber(seasonId) &&
        stats.gshlTeamId === toNumber(teamId)
    : (stats) => stats.seasonId === toNumber(seasonId);

  return readSheetData("TEAMSTATS", "TeamWeekStatLine", { filter });
}

/**
 * Get team season stats
 * @param {number} seasonId - The season ID
 * @param {number} teamId - The team ID (optional)
 * @returns {Array} Array of team season stat objects
 */
function getTeamSeasonStats(seasonId, teamId = null) {
  const filter = teamId
    ? (stats) =>
        stats.seasonId === toNumber(seasonId) &&
        stats.gshlTeamId === toNumber(teamId)
    : (stats) => stats.seasonId === toNumber(seasonId);

  return readSheetData("TEAMSTATS", "TeamSeasonStatLine", { filter });
}

// =============================================================================
// PLAYER STATS HOOKS (PLAYERSTATS WORKBOOK)
// =============================================================================

/**
 * Get player week stats for a specific week
 * @param {number} weekId - The week ID
 * @param {number} playerId - The player ID (optional)
 * @returns {Array} Array of player week stat objects
 */
function getPlayerWeekStatsByWeek(weekId, playerId = null) {
  const filter = playerId
    ? (stats) =>
        stats.weekId === toNumber(weekId) &&
        stats.playerId === toNumber(playerId)
    : (stats) => stats.weekId === toNumber(weekId);

  return readSheetData("PLAYERSTATS", "PlayerWeekStatLine", { filter });
}

/**
 * Get player NHL stats for a season
 * @param {number} seasonId - The season ID
 * @param {number} playerId - The player ID (optional)
 * @returns {Array} Array of player NHL stat objects
 */
function getPlayerNHLStatsBySeason(seasonId, playerId = null) {
  const filter = playerId
    ? (stats) =>
        stats.seasonId === toNumber(seasonId) &&
        stats.playerId === toNumber(playerId)
    : (stats) => stats.seasonId === toNumber(seasonId);

  return readSheetData("PLAYERSTATS", "PlayerNHLStatLine", { filter });
}

/**
 * Get player split stats (team-specific stats)
 * @param {number} seasonId - The season ID
 * @param {number} teamId - The team ID (optional)
 * @param {number} playerId - The player ID (optional)
 * @returns {Array} Array of player split stat objects
 */
function getPlayerSplitStats(seasonId, teamId = null, playerId = null) {
  let filter = (stats) => stats.seasonId === toNumber(seasonId);

  if (teamId) {
    const baseFilter = filter;
    filter = (stats) =>
      baseFilter(stats) && stats.gshlTeamId === toNumber(teamId);
  }

  if (playerId) {
    const baseFilter = filter;
    filter = (stats) =>
      baseFilter(stats) && stats.playerId === toNumber(playerId);
  }

  return readSheetData("PLAYERSTATS", "PlayerSplitStatLine", { filter });
}

// =============================================================================
// PLAYER DAYS HOOKS (PLAYERDAYS WORKBOOK)
// =============================================================================

/**
 * Get player day stats for a specific week
 * @param {number} weekId - The week ID
 * @param {number} playerId - The player ID (optional)
 * @returns {Array} Array of player day stat objects
 */
function getPlayerDayStatsByWeek(weekId, playerId = null) {
  const filter = playerId
    ? (stats) =>
        stats.weekId === toNumber(weekId) &&
        stats.playerId === toNumber(playerId)
    : (stats) => stats.weekId === toNumber(weekId);

  return readSheetData("PLAYERDAYS", "PlayerDayStatLine", { filter });
}

/**
 * Get player day stats for a team and week
 * @param {number} weekId - The week ID
 * @param {number} teamId - The team ID
 * @returns {Array} Array of player day stat objects
 */
function getPlayerDayStatsByTeamWeek(weekId, teamId) {
  return readSheetData("PLAYERDAYS", "PlayerDayStatLine", {
    filter: (stats) =>
      stats.weekId === toNumber(weekId) &&
      stats.gshlTeamId === toNumber(teamId),
  });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get comprehensive team information including franchise and owner details
 * @param {number} teamId - The team ID
 * @returns {Object|null} Enhanced team object with franchise and owner info
 */
function getTeamWithDetails(teamId) {
  const team = getTeamById(teamId);
  if (!team) return null;

  const franchise = getFranchiseById(team.franchiseId);
  const owner = franchise ? getOwnerById(franchise.ownerId) : null;
  const conference = franchise ? getConferenceById(franchise.confId) : null;

  return {
    ...team,
    franchise,
    owner,
    conference,
  };
}

/**
 * Get comprehensive player information including team and contract details
 * @param {number} playerId - The player ID
 * @returns {Object|null} Enhanced player object with team and contract info
 */
function getPlayerWithDetails(playerId) {
  const player = getPlayerById(playerId);
  if (!player) return null;

  const team = player.gshlTeamId ? getTeamById(player.gshlTeamId) : null;
  const contracts = getContractsByPlayerId(playerId);
  const currentContract = contracts.find(
    (contract) => contract.signingStatus === "active",
  );

  return {
    ...player,
    team,
    contracts,
    currentContract,
  };
}

/**
 * Get all teams with full details for a season
 * @param {number} seasonId - The season ID
 * @returns {Array} Array of enhanced team objects
 */
function getTeamsWithDetailsBySeason(seasonId) {
  const teams = getTeamsBySeasonId(seasonId);
  return teams.map((team) => getTeamWithDetails(team.id)).filter(Boolean);
}

console.log("✅ Data hooks loaded successfully");
