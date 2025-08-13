/**
 * Ratings Orchestrator
 * One entry point to build scales and compute per-record ratings, overall, and salary
 * for any dataset using the ratings engine.
 */

function ratings_buildScalesForDataset(opts) {
  // opts: { sheet: string, table: string, positionKey: string, metaKeys: string[] | Set, statKeysByPosMap?: { [pos]: string[] },
  //         normalizeStat?: fn, getBoundsFor?: fn }
  var rows = readSheetData(opts.sheet, opts.table);
  if (!rows || !rows.length) return {};
  return ratings_generateScales({
    rows: rows,
    positionKey: opts.positionKey,
    statKeysByPosMap: opts.statKeysByPosMap,
    metaKeys: opts.metaKeys,
    discoverIfMissing: !opts.statKeysByPosMap,
    normalizeStat: opts.normalizeStat,
    getBoundsFor: opts.getBoundsFor,
  });
}

function ratings_computeSeasonRatings(opts) {
  // opts: { rows, positionKey, scales, weightsByPos, negativeStatsMap, normalizeStat, dampeners, postProcessByPos, mapToScale?: fn(overall0to1) }
  var result = {};
  var mapFn =
    opts.mapToScale ||
    function (x) {
      return x;
    };
  for (var i = 0; i < opts.rows.length; i++) {
    var rec = opts.rows[i];
    var overall01 = ratings_aggregateOverall({
      record: rec,
      positionKey: opts.positionKey,
      scales: opts.scales,
      weightsByPos: opts.weightsByPos,
      negativeStatsMap: opts.negativeStatsMap,
      normalizeStat: opts.normalizeStat,
      dampeners: opts.dampeners,
      postProcessByPos: opts.postProcessByPos,
    });
    result[rec.id] = mapFn(overall01);
  }
  return result;
}

function ratings_computeRollingOverall(opts) {
  // opts: { recordsByPlayerId: { [id]: rows[] }, multiCfg }
  var overallByRowId = {};
  for (var pid in opts.recordsByPlayerId) {
    var rowMap = ratings_computeRollingOverallPerRecord(
      opts.recordsByPlayerId[pid],
      opts.multiCfg,
    );
    for (var rowId in rowMap) overallByRowId[rowId] = rowMap[rowId];
  }
  return overallByRowId;
}

function ratings_computeSalariesForAllSeasons(
  rows,
  overallByRowId,
  anchors,
  step,
) {
  return ratings_calculateAllSeasonSalaries(
    rows,
    overallByRowId,
    anchors,
    step || 5000,
  );
}

function ratings_recalculateAllByKey(key) {
  var k = (key || "").toString().toLowerCase().trim();
  switch (k) {
    case "nhl-player-season":
    case "nhl":
    case "player-nhl":
      return ratings_nhl_recalculateAll();

    case "player-week":
    case "weeks":
      return ratings_week_recalculateAll();

    case "player-season-totals":
    case "totals":
      return ratings_totals_recalculateAll();

    case "player-season-splits":
    case "splits":
      return ratings_splits_recalculateAll();

    case "team-day":
    case "team-daily":
      return ratings_team_day_recalculateAll();

    case "team-week":
    case "team-weekly":
      return ratings_team_week_recalculateAll();

    case "team-season":
      return ratings_team_season_recalculateAll();

    default:
      return { success: false, error: "unknown key: " + key };
  }
}

function ratings_recalculate_all_players() {
  var res = {
    nhl: ratings_nhl_recalculateAll(),
    weeks: ratings_week_recalculateAll(),
    totals: ratings_totals_recalculateAll(),
    splits: ratings_splits_recalculateAll(),
  };
  return res;
}

function ratings_recalculate_all_teams() {
  var res = {
    day: ratings_team_day_recalculateAll(),
    week: ratings_team_week_recalculateAll(),
    season: ratings_team_season_recalculateAll(),
  };
  return res;
}
