/**
 * Player Season Totals preset using ratings engine
 * Works on PLAYERSTATS.PlayerTotalStatLine (RS/PO per player totals)
 */

function ratings_totals_getMetaKeys() {
  return {
    id: true,
    seasonId: true,
    seasonType: true,
    playerId: true,
    nhlPos: true,
    posGroup: true,
    nhlTeam: true,
    gshlTeamIds: true,
    createdAt: true,
    updatedAt: true,
  };
}

function ratings_totals_bounds(pos, stat) {
  // Use goalie-specific bounds like NHL; others wide
  return pos === "G" ? { low: 5, high: 95 } : { low: 0, high: 99.5 };
}

function ratings_totals_buildScales() {
  var rows = readSheetData("PLAYERSTATS", "PlayerTotalStatLine");
  if (!rows || !rows.length) return {};

  // Prefer configured stat keys per position; discover if missing
  var keysByPos = {
    F:
      PLAYER_NHL_RATING_CONFIG.F && PLAYER_NHL_RATING_CONFIG.F.stats
        ? Object.keys(PLAYER_NHL_RATING_CONFIG.F.stats)
        : null,
    D:
      PLAYER_NHL_RATING_CONFIG.D && PLAYER_NHL_RATING_CONFIG.D.stats
        ? Object.keys(PLAYER_NHL_RATING_CONFIG.D.stats)
        : null,
    G:
      PLAYER_NHL_RATING_CONFIG.G && PLAYER_NHL_RATING_CONFIG.G.stats
        ? Object.keys(PLAYER_NHL_RATING_CONFIG.G.stats)
        : null,
  };

  var discovered = ratings_discoverNumericStatKeys(
    rows,
    ratings_totals_getMetaKeys(),
  );
  if (!keysByPos.F) keysByPos.F = discovered;
  if (!keysByPos.D) keysByPos.D = discovered;
  if (!keysByPos.G) keysByPos.G = discovered;

  return ratings_generateScales({
    rows: rows,
    positionKey: "posGroup",
    statKeysByPosMap: keysByPos,
    metaKeys: ratings_totals_getMetaKeys(),
    discoverIfMissing: false,
    // Totals are already seasonal aggregates; optional normalization can be applied if desired
    normalizeStat: ratings_normalizeSeasonLength,
    getBoundsFor: ratings_totals_bounds,
  });
}

function ratings_totals_computeSeasonRatings(scales) {
  var rows = readSheetData("PLAYERSTATS", "PlayerTotalStatLine");
  var result = {};
  for (var i = 0; i < rows.length; i++) {
    var rec = rows[i];
    // Reuse NHL adapter logic for weights, dampening, and shaping
    var val = ratings_calculateNHLSeasonRating(
      rec,
      scales,
      PLAYER_NHL_RATING_CONFIG,
      PLAYER_NHL_RATING_GLOBAL,
    );
    result[rec.id] = val;
  }
  return { rows: rows, seasonById: result };
}

function ratings_totals_recalculateAll() {
  // Build scales then compute and write per-row Rating for PlayerTotalStatLine
  var scales = ratings_totals_buildScales();
  if (!scales || Object.keys(scales).length === 0) {
    console.log("No scales generated for PlayerTotalStatLine");
    return { success: false, error: "no scales" };
  }
  var result = ratings_totals_computeSeasonRatings(scales);
  var byId = result.seasonById || {};

  var workbook = getWorkbook("player stats");
  var sheet = workbook && workbook.getSheetByName("PlayerTotalStatLine");
  if (!sheet) return { success: false, error: "sheet not found" };

  var data = sheet.getDataRange().getValues();
  if (!data || data.length <= 1) return { success: false, error: "no rows" };
  var headers = data[0];
  var idCol = headers.indexOf("id");
  var ratingCol = headers.indexOf("Rating");
  if (idCol < 0 || ratingCol < 0)
    return { success: false, error: "missing columns" };

  // 1-based for setValue
  var writes = 0;
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var id = toNumber(row[idCol]);
    if (isNaN(id)) continue;
    var val = byId[id];
    if (typeof val === "number" && !isNaN(val)) {
      sheet.getRange(r + 1, ratingCol + 1).setValue(val);
      writes++;
    }
  }
  console.log("Updated PlayerTotalStatLine ratings:", writes);
  return { success: true, rowsUpdated: writes };
}
