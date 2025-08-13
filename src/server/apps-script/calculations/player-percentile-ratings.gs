/**
 * DEPRECATED: Use ratings/engine + ratings/orchestrator for percentile ratings.
 * This file remains only as a simple wrapper/showcase for PlayerWeekStatLine scales.
 */

function generatePlayerRatingScales() {
  // Redirect to engine-based implementation for weeks
  return generatePlayerWeekScales_withEngine();
}

function generatePlayerWeekScales_withEngine() {
  var rows = readSheetData("PLAYERSTATS", "PlayerWeekStatLine");
  if (!rows || !rows.length) return {};
  var metaKeys = ratings_week_getMetaKeys();
  var scales = ratings_generateScales({
    rows: rows,
    positionKey: "posGroup",
    metaKeys: metaKeys,
    discoverIfMissing: true,
    getBoundsFor: ratings_week_bounds,
  });
  outputRatingScales(scales);
  return scales;
}

// Keep the pretty-printer for debugging
function outputRatingScales(scales) {
  console.log("\n" + "=".repeat(80));
  console.log("PLAYER RATING SCALES (Copy this for your algorithm)");
  console.log("=".repeat(80));
  console.log("const PLAYER_RATING_SCALES = {");
  for (var position in scales) {
    console.log("  " + position + ": {");
    var stats = scales[position];
    for (var stat in stats) {
      var scale = stats[stat];
      console.log(
        "    " +
          stat +
          ": { floor: " +
          scale.floor +
          ", ceiling: " +
          scale.ceiling +
          " },",
      );
    }
    console.log("  },");
  }
  console.log("};");
}

// Backwards-compat: retain getPercentileValue here but use ratings_getPercentileValue internally if needed
function getPercentileValue(sortedValues, percentile) {
  // Delegate to engine helper for single source of truth
  return ratings_getPercentileValue(sortedValues, percentile);
}
