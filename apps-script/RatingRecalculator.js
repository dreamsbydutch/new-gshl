// @ts-nocheck

/**
 * Simple re-calculation helper for PlayerDay ratings.
 * Pulls every PlayerDay row, runs the Apps Script RankingEngine against it,
 * and writes the refreshed Rating column back to the sheet without touching
 * other data.
 */
function recalcPlayerDayRatings() {
  var sheet = getSheetByName(
    PLAYERDAY_WORKBOOKS.PLAYERDAYS_6_10,
    "PlayerDayStatLine",
    true,
  );
  var values = sheet.getDataRange().getValues();
  if (!values || values.length <= 1) {
    Logger.log("No PlayerDay data to process.");
    return;
  }

  var headers = values[0];
  var ratingColIdx = headers.indexOf("Rating");
  if (ratingColIdx === -1) {
    throw new Error("PlayerDayStatLine sheet is missing a 'Rating' column.");
  }

  var updates = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row || row.length === 0) continue;

    // Convert the row into an object keyed by header name for rankPerformance
    var statLine = {};
    for (var c = 0; c < headers.length; c++) {
      statLine[headers[c]] = row[c];
    }

    var ratingResult = rankPerformance(statLine);
    var score =
      ratingResult && !isNaN(ratingResult.score)
        ? Number(ratingResult.score.toFixed(2))
        : "";

    updates.push({ rowIndex: i + 1, value: score });
  }

  groupAndApplyColumnUpdates(sheet, ratingColIdx + 1, updates);
  Logger.log(
    "Updated Rating column for " + updates.length + " PlayerDay rows.",
  );
}
