/**
 * Team Week preset using ratings engine
 * Works on TEAMSTATS.TeamWeekStatLine
 */

function ratings_team_week_getMetaKeys() {
  return {
    id: true,
    seasonId: true,
    gshlTeamId: true,
    weekId: true,
    createdAt: true,
    updatedAt: true,
  };
}

function ratings_team_week_bounds(stat) {
  // Generic 5..95 bounds for team weekly metrics
  return { low: 5, high: 95 };
}

function ratings_team_week_buildScales() {
  var rows = readSheetData("TEAMSTATS", "TeamWeekStatLine");
  if (!rows || !rows.length) return {};
  return ratings_generateScales({
    rows: rows,
    positionKey: null, // use ALL
    statKeysByPosMap: null,
    metaKeys: ratings_team_week_getMetaKeys(),
    discoverIfMissing: true,
    normalizeStat: null,
    getBoundsFor: function (_pos, stat) {
      return ratings_team_week_bounds(stat);
    },
  });
}

function ratings_team_week_computeRatings(scales) {
  var rows = readSheetData("TEAMSTATS", "TeamWeekStatLine");
  var result = {};
  for (var i = 0; i < rows.length; i++) {
    var rec = rows[i];
    var o01 = ratings_aggregateOverall({
      record: rec,
      positionKey: null, // ALL
      scales: scales,
      weightsByPos: { ALL: {} }, // equal weights across discovered stats
      negativeStatsMap: NHL_NEGATIVE_STATS, // GA/GAA treated as negative
      normalizeStat: null,
      dampeners: [],
      postProcessByPos: null,
    });
    result[rec.id] = o01 * 75 + 50; // map similar to players
  }
  return { rows: rows, byId: result };
}

function ratings_team_week_recalculateAll() {
  var scales = ratings_team_week_buildScales();
  if (!scales || Object.keys(scales).length === 0) {
    console.log("No scales generated for TeamWeekStatLine");
    return { success: false, error: "no scales" };
  }
  var res = ratings_team_week_computeRatings(scales);
  var byId = res.byId || {};

  var workbook = getWorkbook("team stats");
  var sheet = workbook && workbook.getSheetByName("TeamWeekStatLine");
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
  console.log("Updated TeamWeekStatLine ratings:", writes);
  return { success: true, rowsUpdated: writes };
}
