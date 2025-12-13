// @ts-nocheck

/** Shared helpers leveraged by aggregation modules. */
function getTodayDateString() {
  return formatDateOnly(new Date());
}

function isWeekCompleteRecord(week, todayDateString) {
  if (!week) return false;
  var endDateStr = formatDateOnly(week.endDate);
  if (!endDateStr) return false;
  if (!todayDateString) return false;
  return todayDateString > endDateStr;
}

function getPlayerDayWorkbookId(seasonId) {
  const seasonNumber = Number(seasonId);
  if (isNaN(seasonNumber)) return CURRENT_PLAYERDAY_SPREADSHEET_ID;
  if (seasonNumber <= 5) return PLAYERDAY_WORKBOOKS.PLAYERDAYS_1_5;
  if (seasonNumber <= 10) return PLAYERDAY_WORKBOOKS.PLAYERDAYS_6_10;
  return PLAYERDAY_WORKBOOKS.PLAYERDAYS_11_15;
}

function normalizeNhlPosValue(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(",");
  return value.toString();
}

function resolvePosGroupFromNhlPos(nhlPos) {
  const normalized = normalizeNhlPosValue(nhlPos).toUpperCase();
  if (normalized.includes("G")) return "G";
  if (normalized.includes("D")) return "D";
  return "F";
}

function buildMissingPlayerDayRow(
  scrapedPlayer,
  playerRecord,
  teamId,
  seasonId,
  weekId,
  dateStr,
) {
  if (!scrapedPlayer || !playerRecord || !playerRecord.id) return null;
  if (!teamId || !seasonId || !dateStr) return null;

  const playerIdStr = playerRecord.id.toString();
  const normalizedNhlPos = normalizeNhlPosValue(scrapedPlayer.nhlPos);
  const row = {
    ...scrapedPlayer,
    playerId: playerIdStr,
    gshlTeamId: teamId,
    seasonId,
    weekId: weekId || "",
    date: dateStr,
    posGroup: resolvePosGroupFromNhlPos(normalizedNhlPos),
    bestPos: "",
    fullPos: "",
    IR: "",
    IRplus: "",
    ADD: "",
    MS: "",
    BS: "",
    nhlPos: normalizedNhlPos,
    yahooId:
      scrapedPlayer.yahooId ||
      (playerRecord.yahooId && playerRecord.yahooId.toString()) ||
      "",
    playerName:
      scrapedPlayer.playerName ||
      playerRecord.playerName ||
      playerRecord.fullName ||
      playerRecord.name ||
      "",
  };

  row.Rating = "";
  return row;
}
