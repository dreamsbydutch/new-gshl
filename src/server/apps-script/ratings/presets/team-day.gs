/**
 * Team Day preset using ratings engine
 * Works on TEAMSTATS.TeamDayStatLine
 */

function ratings_team_day_getMetaKeys() {
  return {
    id: true,
    seasonId: true,
    gshlTeamId: true,
    weekId: true,
    date: true,
    createdAt: true,
    updatedAt: true,
  };
}

function ratings_team_day_bounds(stat) {
  return { low: 5, high: 95 };
}

function ratings_team_day_buildScales() {
  var rows = readSheetData("TEAMSTATS", "TeamDayStatLine");
  if (!rows || !rows.length) return {};
  return ratings_generateScales({
    rows: rows,
    positionKey: null,
    statKeysByPosMap: null,
    metaKeys: ratings_team_day_getMetaKeys(),
    discoverIfMissing: true,
    normalizeStat: null,
    getBoundsFor: function () {
      return ratings_team_day_bounds();
    },
  });
}

function ratings_team_day_computeRatings(scales) {
  var rows = readSheetData("TEAMSTATS", "TeamDayStatLine");
  var result = {};
  for (var i = 0; i < rows.length; i++) {
    var rec = rows[i];
    var o01 = ratings_aggregateOverall({
      record: rec,
      positionKey: null,
      scales: scales,
      weightsByPos: { ALL: {} },
      negativeStatsMap: NHL_NEGATIVE_STATS,
      normalizeStat: null,
      dampeners: [],
      postProcessByPos: null,
    });
    result[rec.id] = o01 * 75 + 50;
  }
  return { rows: rows, byId: result };
}

function ratings_team_day_recalculateAll() {
  var scales = ratings_team_day_buildScales();
  if (!scales || Object.keys(scales).length === 0) {
    console.log("No scales generated for TeamDayStatLine");
    return { success: false, error: "no scales" };
  }
  var res = ratings_team_day_computeRatings(scales);
  var byId = res.byId || {};

  var workbook = getWorkbook("team stats");
  var sheet = workbook && workbook.getSheetByName("TeamDayStatLine");
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
  console.log("Updated TeamDayStatLine ratings:", writes);
  return { success: true, rowsUpdated: writes };
}
