// @ts-nocheck

/**
 * Simple re-calculation helper for PlayerSplits ratings.
 * Pulls every PlayerSplits row, runs the Apps Script RankingEngine against it,
 * and writes the refreshed Rating column back to the sheet without touching
 * other data.
 */
function recalcPlayerRatings() {
  var totalUpdated = 0;
  totalUpdated += recalcRatingsForSheet(
    PLAYERDAY_WORKBOOKS.PLAYERDAYS_6_10,
    "PlayerDayStatLine",
    "Rating",
  );
  totalUpdated += recalcRatingsForSheet(
    PLAYERDAY_WORKBOOKS.PLAYERDAYS_11_15,
    "PlayerDayStatLine",
    "Rating",
  );
  totalUpdated += recalcRatingsForSheet(
    PLAYERSTATS_SPREADSHEET_ID,
    "PlayerWeekStatLine",
    "Rating",
  );
  totalUpdated += recalcRatingsForSheet(
    PLAYERSTATS_SPREADSHEET_ID,
    "PlayerSplitStatLine",
    "Rating",
  );
  totalUpdated += recalcRatingsForSheet(
    PLAYERSTATS_SPREADSHEET_ID,
    "PlayerTotalStatLine",
    "Rating",
  );
  totalUpdated += recalcRatingsForSheet(
    PLAYERSTATS_SPREADSHEET_ID,
    "PlayerNHLStatLine",
    "SeasonRating",
  );

  Logger.log(
    "recalcPlayerRatings complete. Updated " + totalUpdated + " row(s).",
  );
}
function updateLineups() {
  var teamDays = fetchSheetAsObjects(
    TEAMSTATS_SPREADSHEET_ID,
    "TeamDayStatLine",
    true,
  ).filter((a) => a.seasonId === "9");
  var playerDays = fetchSheetAsObjects(
    PLAYERDAY_WORKBOOKS.PLAYERDAYS_6_10,
    "PlayerDayStatLine",
    true,
  )
    .filter((a) => a.seasonId === "9")
    .map((a) => {
      a.nhlPos = a.nhlPos.split(",");
      return a;
    });
  const output = [];
  console.log("Fetched....");
  teamDays.forEach((td) => {
    const players = playerDays.filter(
      (pd) => pd.date === td.date && pd.gshlTeamId === td.gshlTeamId,
    );
    if (td.date === "2023-01-16" && td.gshlTeamId === "62") {
      console.log(1);
    }
    output.push(
      ...optimizeLineup(players).map((a) => {
        return {
          id: a.id,
          dailyPos: a.dailyPos,
          fullPos: a.fullPos,
          bestPos: a.bestPos,
          MS: a.MS,
          BS: a.BS,
        };
      }),
    );
  });
  output.sort((a, b) => +a.id - +b.id);
  console.log("Printing....");

  const ss = getSheetByName(
    PLAYERDAY_WORKBOOKS.PLAYERDAYS_6_10,
    "PlayerDayStatLine",
    true,
  );
  console.log("Print Best Pos");
  groupAndApplyColumnUpdates(
    ss,
    11,
    output.map((a) => {
      return { rowIndex: +a.id + 1, value: a.bestPos };
    }),
  );
  console.log("Print Full Pos");
  groupAndApplyColumnUpdates(
    ss,
    12,
    output.map((a) => {
      return { rowIndex: +a.id + 1, value: a.fullPos };
    }),
  );
  console.log("Print MS");
  groupAndApplyColumnUpdates(
    ss,
    39,
    output.map((a) => {
      return { rowIndex: +a.id + 1, value: a.MS };
    }),
  );
  console.log("Print BS");
  groupAndApplyColumnUpdates(
    ss,
    40,
    output.map((a) => {
      return { rowIndex: +a.id + 1, value: a.BS };
    }),
  );
  Logger.log(
    "Updated Rating column for " + output.length + " PlayerDays rows.",
  );
}

function recalcRatingsForSheet(spreadsheetId, sheetName, ratingColumnName) {
  var sheet = getSheetByName(spreadsheetId, sheetName, true);
  var values = sheet.getDataRange().getValues();
  if (!values || values.length <= 1) {
    Logger.log(
      "No data to process for " + sheetName + " (" + spreadsheetId + ").",
    );
    return 0;
  }

  var headers = values[0];
  var ratingColIdx = headers.indexOf(ratingColumnName);
  if (ratingColIdx === -1) {
    throw new Error(
      sheetName + " sheet is missing a '" + ratingColumnName + "' column.",
    );
  }

  var updates = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row || row.length === 0) continue;

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
    "Updated " +
      ratingColumnName +
      " column for " +
      updates.length +
      " row(s) in " +
      sheetName +
      ".",
  );

  return updates.length;
}
