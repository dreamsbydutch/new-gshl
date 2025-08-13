/**
 * Player Week preset (example) using ratings engine
 * Configure stats, bounds, and optional normalization as needed for weekly data.
 */

function ratings_week_getMetaKeys() {
  return {
    id: true,
    seasonId: true,
    weekId: true,
    playerId: true,
    posGroup: true,
    nhlTeam: true,
    createdAt: true,
    updatedAt: true,
  };
}

function ratings_week_bounds(pos, stat) {
  // Use 5-95 for all weekly stats by default
  return { low: 5, high: 95 };
}

function ratings_week_buildScales() {
  var rows = readSheetData("PLAYERSTATS", "PlayerWeekStatLine");
  if (!rows || !rows.length) return {};
  // If you have custom weekly weights per pos, define them; otherwise discover
  return ratings_generateScales({
    rows: rows,
    positionKey: "posGroup",
    statKeysByPosMap: null,
    metaKeys: ratings_week_getMetaKeys(),
    discoverIfMissing: true,
    normalizeStat: null, // weekly rows are already weekly totals
    getBoundsFor: ratings_week_bounds,
  });
}

function ratings_week_computeRatings(scales) {
  var rows = readSheetData("PLAYERSTATS", "PlayerWeekStatLine");
  if (!rows || !rows.length) return { rows: [], byId: {} };

  var weightsByPos = {
    F: (PLAYER_NHL_RATING_CONFIG.F && PLAYER_NHL_RATING_CONFIG.F.stats) || {},
    D: (PLAYER_NHL_RATING_CONFIG.D && PLAYER_NHL_RATING_CONFIG.D.stats) || {},
    G: (PLAYER_NHL_RATING_CONFIG.G && PLAYER_NHL_RATING_CONFIG.G.stats) || {},
  };
  var postByPos = {
    F: PLAYER_NHL_RATING_CONFIG.F && PLAYER_NHL_RATING_CONFIG.F.overall,
    D: PLAYER_NHL_RATING_CONFIG.D && PLAYER_NHL_RATING_CONFIG.D.overall,
    G: PLAYER_NHL_RATING_CONFIG.G && PLAYER_NHL_RATING_CONFIG.G.overall,
  };

  var result = {};
  for (var i = 0; i < rows.length; i++) {
    var rec = rows[i];
    var o01 = ratings_aggregateOverall({
      record: rec,
      positionKey: "posGroup",
      scales: scales,
      weightsByPos: weightsByPos,
      negativeStatsMap: NHL_NEGATIVE_STATS,
      normalizeStat: null,
      dampeners: [], // do not apply season-length TOI dampeners to weekly rows by default
      postProcessByPos: postByPos,
    });
    result[rec.id] = o01 * 75 + 50; // map to 50..125 range similar to season
  }
  return { rows: rows, byId: result };
}

function ratings_week_recalculateAll() {
  var scales = ratings_week_buildScales();
  if (!scales || Object.keys(scales).length === 0) {
    console.log("No scales generated for PlayerWeekStatLine");
    return { success: false, error: "no scales" };
  }
  var res = ratings_week_computeRatings(scales);
  var byId = res.byId || {};

  var workbook = getWorkbook("player stats");
  var sheet = workbook && workbook.getSheetByName("PlayerWeekStatLine");
  if (!sheet) return { success: false, error: "sheet not found" };

  var data = sheet.getDataRange().getValues();
  if (!data || data.length <= 1) return { success: false, error: "no rows" };
  var headers = data[0];
  var idCol = headers.indexOf("id");
  var ratingCol = headers.indexOf("Rating");
  if (idCol < 0 || ratingCol < 0)
    return { success: false, error: "missing columns" };

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
  console.log("Updated PlayerWeekStatLine ratings:", writes);
  return { success: true, rowsUpdated: writes };
}
