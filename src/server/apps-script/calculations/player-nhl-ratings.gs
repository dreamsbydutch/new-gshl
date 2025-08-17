/**
 * GSHL Apps Script - Player NHL Season Stats Rating System (Condensed)
 * Universal percentile-based ratings for PlayerNHLStatLine data
 * - Skaters (F/D): 0th (floor) to 99.5th (ceiling) percentiles
 * - Goalies (G): 5th (floor) to 95th (ceiling) percentiles
 * - Per-stat rating is a normalized ratio (allows >1 above ceiling, 0 at floor)
 * - Overall rating is the simple average across available per-stat ratings
 */

// Export existing configs for continuity
// Global rating configuration (position-agnostic)
const PLAYER_NHL_RATING_GLOBAL = {
  toiGlobal: {
    low: 10000,
    lowByPos: { F: 10000, D: 12500, G: 20000 },
    critical: 4000,
    lowMultiplier: 0.25,
    criticalCap: 0.05,
  },
};

// Centralized configuration for which stats to use and their weights by position group
const PLAYER_NHL_RATING_CONFIG = {
  F: {
    stats: {
      G: 1.8,
      A: 1.8,
      P: 2.0,
      PPP: 1.5,
      SOG: 1.2,
      TOI: 0.6,
      HIT: 1.2,
      BLK: 1.0,
      GP: 0.5,
    },
    overall: {
      tailCompression: 0.7,
      multiplier: 1,
      toiDampener: { min: 25000, max: 65000 },
      topKnee: 0.65,
      topPower: 2.75,
    },
  },
  D: {
    stats: {
      G: 1.4,
      A: 1.4,
      P: 1.6,
      PPP: 1.0,
      SOG: 1.6,
      TOI: 1.2,
      HIT: 1.8,
      BLK: 2.0,
      GP: 0.5,
    },
    overall: {
      tailCompression: 0.7,
      multiplier: 0.975,
      toiDampener: { min: 30000, max: 80000 },
      topKnee: 0.65,
      topPower: 2.5,
    },
  },
  G: {
    stats: {
      W: 1.6,
      GAA: 2.0,
      SVP: 2.0,
      SV: 0.6,
      SA: 0.6,
      GA: 0.6,
      TOI: 1.2,
      GP: 0.8,
    },
    overall: {
      tailCompression: 0.4,
      multiplier: 0.825,
      subOnePower: 1.4,
      toiDampener: { min: 75000, max: 150000 },
      topKnee: 0.65,
      topPower: 2.5,
    },
  },
};

// Career and Salary configs kept as-is
const PLAYER_NHL_CAREER_RATING_CONFIG = {
  seasonsToConsider: 5,
  recencyWeights: [0.45, 0.25, 0.15, 0.1, 0.05],
  gpFullSeason: 82,
  youth: {
    ageMax: 23,
    shortSeason: {
      hardZeroBelow: 21,
      suppressBelow: 41,
      curve: 1.5,
      minFactor: 0.05,
    },
  },
  missingSeasonPenalty: 2,
  youthHighPerfBoost: {
    threshold: 65,
    capPoints: 4,
    power: 1.2,
    ageFactor: { startAge: 18, endAge: 23, power: 1.2 },
  },
};

const PLAYER_NHL_SALARY_CONFIG = {
  anchors: [
    { rank: 1, salary: 10000000 },
    { rank: 3, salary: 10000000 },
    { rank: 15, salary: 9000000 },
    { rank: 35, salary: 8000000 },
    { rank: 140, salary: 5000000 },
    { rank: 224, salary: 2000000 },
    { rank: 340, salary: 1000000 },
  ],
};

// Season length configuration and helpers (moved to ratings/adapters but keep here for compatibility)
const PLAYER_NHL_SEASON_LENGTH = {
  defaultGames: 82,
  bySeasonId: { 6: 71, 7: 56 },
};
function getSeasonGamesForRow(rec) {
  return ratings_getSeasonGamesForRow(rec);
}

// Negative and normalization maps delegated to adapters
const NEGATIVE_STATS = { GA: true, GAA: true };
const RATE_STATS = { SVP: true, GAA: true };
const COUNTING_STATS = {
  G: true,
  A: true,
  P: true,
  PPP: true,
  SOG: true,
  TOI: true,
  HIT: true,
  BLK: true,
  GP: true,
  W: true,
  SV: true,
  SA: true,
  GA: true,
};
function normalizeStatForSeasonLength(stat, value, seasonGames) {
  // Translate existing signature to adapter form
  return ratings_normalizeSeasonLength(stat, value, {
    seasonId: null,
    GP: null,
    seasonGames: seasonGames,
  });
}

// Post-process kept the same via engine helper
function postProcessOverall(overall, postCfg) {
  return ratings_postProcessOverall(overall, postCfg);
}

// Global TOI dampening via adapter
function applyGlobalToiDampening(position, toiSeconds, value, seasonGames) {
  return ratings_applyGlobalToiDampening(
    PLAYER_NHL_RATING_GLOBAL,
    position,
    toiSeconds,
    value,
    seasonGames,
  );
}

// Toi dampener factor using adapter util
function getToiDampenerFactor(position, toiSeconds, seasonGames) {
  var posCfg = PLAYER_NHL_RATING_CONFIG[position];
  var toiCfg = posCfg && posCfg.overall && posCfg.overall.toiDampener;
  return ratings_getToiDampenerFactor(
    position,
    toiSeconds,
    seasonGames,
    toiCfg,
  );
}

// Memoized NHL scales to avoid recomputing within a single execution
var __NHL_SCALES_CACHE = null;
function getNhlScales(forceRebuild) {
  if (!forceRebuild && __NHL_SCALES_CACHE) return __NHL_SCALES_CACHE;
  __NHL_SCALES_CACHE = ratings_generateNHLScales(
    PLAYER_NHL_RATING_CONFIG,
    PLAYER_NHL_RATING_GLOBAL,
  );
  return __NHL_SCALES_CACHE;
}

// Scale generation now delegates to ratings engine
function generatePlayerNHLRatingScales() {
  return ratings_generateNHLScales(
    PLAYER_NHL_RATING_CONFIG,
    PLAYER_NHL_RATING_GLOBAL,
  );
}

// Single-stat rating now delegates to engine
function calculateSingleStatNHLRating(value, position, stat, scales) {
  return ratings_rateSingleStat(value, position, stat, scales, NEGATIVE_STATS);
}

// Overall per-row rating delegates to adapter aggregate + scaling to 0..100
function calculatePlayerOverallNHLRating(playerRecord, scales) {
  return ratings_calculateNHLSeasonRating(
    playerRecord,
    scales,
    PLAYER_NHL_RATING_CONFIG,
    PLAYER_NHL_RATING_GLOBAL,
  );
}

// Efficient: compute SeasonRating for all rows and batch write
function calculateAndUpdateAllNHLRatings() {
  var scales = getNhlScales(true); // rebuild to reflect latest data
  var all = readSheetData("PLAYERSTATS", "PlayerNHLStatLine");
  if (!all || !all.length) return { success: 0, errors: 0, total: 0 };

  var ratingsById = {};
  for (var i = 0; i < all.length; i++) {
    var rec = all[i];
    try {
      ratingsById[rec.id] = ratings_calculateNHLSeasonRating(
        rec,
        scales,
        PLAYER_NHL_RATING_CONFIG,
        PLAYER_NHL_RATING_GLOBAL,
      );
    } catch (e) {}
  }

  var wb = getWorkbook("PLAYERSTATS");
  var sheet = wb.getSheetByName("PlayerNHLStatLine");
  if (!sheet) throw new Error("PlayerNHLStatLine sheet not found");
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return { success: 0, errors: 0, total: 0 };

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idCol = headers.indexOf("id") + 1;
  var ratingCol = headers.indexOf("SeasonRating") + 1;
  if (ratingCol === 0) ratingCol = headers.indexOf("seasonRating") + 1;
  if (!idCol || !ratingCol)
    throw new Error("Required columns not found: id and SeasonRating");

  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  var out = new Array(lastRow - 1);
  var success = 0,
    errors = 0;
  for (var r = 0; r < ids.length; r++) {
    var id = toNumber(ids[r][0]);
    var val = ratingsById[id];
    if (typeof val === "number" && !isNaN(val)) {
      out[r] = [val];
      success++;
    } else {
      out[r] = [""];
      errors++;
    }
  }
  sheet.getRange(2, ratingCol, out.length, 1).setValues(out);
  return { success: success, errors: errors, total: all.length };
}

// Update a single SeasonRating by record id
function updatePlayerNHLRating(recordId, rating) {
  var wb = getWorkbook("PLAYERSTATS");
  var sheet = wb.getSheetByName("PlayerNHLStatLine");
  if (!sheet) throw new Error("PlayerNHLStatLine sheet not found");
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return false;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idCol = headers.indexOf("id") + 1;
  var ratingCol = headers.indexOf("SeasonRating") + 1;
  if (ratingCol === 0) ratingCol = headers.indexOf("seasonRating") + 1;
  if (!idCol || !ratingCol) return false;
  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (toNumber(ids[i][0]) === toNumber(recordId)) {
      sheet.getRange(i + 2, ratingCol).setValue(rating);
      return true;
    }
  }
  return false;
}

// Efficient one-call recompute: SeasonRating, OverallRating (rolling), Salary
function recalculateAllNHLSeasonAndOverallRatings() {
  var scales = getNhlScales(true);
  var all = readSheetData("PLAYERSTATS", "PlayerNHLStatLine");
  if (!all || !all.length) {
    return {
      seasonUpdated: 0,
      overallUpdated: 0,
      salaryUpdated: 0,
      totalRows: 0,
      totalPlayers: 0,
      wroteOverall: false,
      wroteSalary: false,
    };
  }

  // Compute SeasonRating per record and attach for downstream overall
  var ratingsById = {};
  for (var i = 0; i < all.length; i++) {
    var rec = all[i];
    try {
      var r = ratings_calculateNHLSeasonRating(
        rec,
        scales,
        PLAYER_NHL_RATING_CONFIG,
        PLAYER_NHL_RATING_GLOBAL,
      );
      ratingsById[rec.id] = r;
      rec.SeasonRating = r;
    } catch (e) {}
  }

  // Group rows by player
  var byPlayer = {};
  for (var j = 0; j < all.length; j++) {
    var row = all[j];
    var pid = row.playerId;
    if (!pid) continue;
    if (!byPlayer[pid]) byPlayer[pid] = [];
    byPlayer[pid].push(row);
  }

  // Rolling overall per rowId
  var overallByRowId = {};
  for (var pidKey in byPlayer) {
    var map = ratings_computeRollingOverallPerRecord(byPlayer[pidKey], {
      seasonsToConsider: PLAYER_NHL_CAREER_RATING_CONFIG.seasonsToConsider,
      recencyWeights: PLAYER_NHL_CAREER_RATING_CONFIG.recencyWeights,
      seasonIdKey: "seasonId",
      idKey: "id",
      valueGetter: function (rec) {
        return rec.SeasonRating != null
          ? toNumber(rec.SeasonRating)
          : rec.seasonRating != null
            ? toNumber(rec.seasonRating)
            : null;
      },
      effectiveWeight: function (rec, base) {
        var gpFull = getSeasonGamesForRow(rec) || 82;
        var gp = toNumber(rec.GP);
        var age =
          rec.Age != null
            ? toNumber(rec.Age)
            : rec.age != null
              ? toNumber(rec.age)
              : rec.seasonAge != null
                ? toNumber(rec.seasonAge)
                : null;
        var weight = base;
        var gpFrac =
          !isNaN(gp) && gpFull > 0 ? ratings_clampNumber(gp / gpFull, 0, 1) : 1;
        weight *= gpFrac;
        if (
          age != null &&
          !isNaN(age) &&
          age <= PLAYER_NHL_CAREER_RATING_CONFIG.youth.ageMax
        ) {
          var ys = PLAYER_NHL_CAREER_RATING_CONFIG.youth.shortSeason;
          if (!isNaN(gp) && gp <= ys.suppressBelow) {
            if (gp <= ys.hardZeroBelow) weight *= ys.minFactor;
            else {
              var t = ratings_clampNumber(
                (gp - ys.hardZeroBelow) / (ys.suppressBelow - ys.hardZeroBelow),
                0,
                1,
              );
              var shaped = Math.pow(t, ys.curve);
              weight *= ys.minFactor + (1 - ys.minFactor) * shaped;
            }
          }
        }
        return weight;
      },
      youthBoost: {
        isEligible: function (latest) {
          var latestAge =
            latest.Age != null
              ? toNumber(latest.Age)
              : latest.age != null
                ? toNumber(latest.age)
                : latest.seasonAge != null
                  ? toNumber(latest.seasonAge)
                  : null;
          var latestRating =
            latest.SeasonRating != null
              ? toNumber(latest.SeasonRating)
              : latest.seasonRating != null
                ? toNumber(latest.seasonRating)
                : null;
          return (
            latestAge != null &&
            !isNaN(latestAge) &&
            latestAge <= PLAYER_NHL_CAREER_RATING_CONFIG.youth.ageMax &&
            latestRating != null &&
            !isNaN(latestRating)
          );
        },
        computeBonus: function (latest) {
          var y = PLAYER_NHL_CAREER_RATING_CONFIG.youthHighPerfBoost;
          var latestRating =
            latest.SeasonRating != null
              ? toNumber(latest.SeasonRating)
              : toNumber(latest.seasonRating);
          var above = ratings_clampNumber(
            (latestRating - y.threshold) / (100 - y.threshold),
            0,
            1,
          );
          var add = y.capPoints * Math.pow(above, y.power);
          var af = y.ageFactor || {};
          var startA = typeof af.startAge === "number" ? af.startAge : 18;
          var endA =
            typeof af.endAge === "number"
              ? af.endAge
              : PLAYER_NHL_CAREER_RATING_CONFIG.youth.ageMax || 23;
          var ap = typeof af.power === "number" ? af.power : 1.0;
          var ageVal =
            latest.Age != null
              ? toNumber(latest.Age)
              : latest.age != null
                ? toNumber(latest.age)
                : latest.seasonAge != null
                  ? toNumber(latest.seasonAge)
                  : null;
          var ageMult = 1;
          if (ageVal <= startA) ageMult = 1;
          else if (ageVal >= endA) ageMult = 0;
          else {
            var t2 = ratings_clampNumber(
              (endA - ageVal) / (endA - startA),
              0,
              1,
            );
            ageMult = Math.pow(t2, ap);
          }
          return add * ageMult;
        },
      },
      missingPenalty: PLAYER_NHL_CAREER_RATING_CONFIG.missingSeasonPenalty,
    });
    for (var rowId in map) overallByRowId[rowId] = map[rowId];
  }

  // Salary per season from anchors
  var salaryByRowId = ratings_calculateAllSeasonSalaries(
    all,
    overallByRowId,
    PLAYER_NHL_SALARY_CONFIG.anchors,
    5000,
  );

  // Write all outputs in batches
  var wb = getWorkbook("PLAYERSTATS");
  var sheet = wb.getSheetByName("PlayerNHLStatLine");
  if (!sheet) throw new Error("PlayerNHLStatLine sheet not found");
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) {
    return {
      seasonUpdated: 0,
      overallUpdated: 0,
      salaryUpdated: 0,
      totalRows: 0,
      totalPlayers: Object.keys(byPlayer).length,
      wroteOverall: false,
      wroteSalary: false,
    };
  }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idCol = headers.indexOf("id") + 1;
  var seasonCol = headers.indexOf("SeasonRating") + 1;
  if (seasonCol === 0) seasonCol = headers.indexOf("seasonRating") + 1;
  var overallCol = headers.indexOf("OverallRating") + 1;
  if (overallCol === 0) overallCol = headers.indexOf("overallRating") + 1;
  var salaryCol = headers.indexOf("Salary") + 1;
  if (salaryCol === 0) salaryCol = headers.indexOf("salary") + 1;
  if (!idCol || !seasonCol)
    throw new Error("Required columns not found: id and SeasonRating");

  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  var seasonOut = new Array(lastRow - 1);
  var overallOut = overallCol ? new Array(lastRow - 1) : null;
  var salaryOut = salaryCol ? new Array(lastRow - 1) : null;
  var seasonUpdated = 0,
    overallUpdated = 0,
    salaryUpdated = 0;

  for (var k = 0; k < ids.length; k++) {
    var rowIdNum = toNumber(ids[k][0]);
    var sVal = ratingsById[rowIdNum];
    if (typeof sVal === "number" && !isNaN(sVal)) {
      seasonOut[k] = [sVal];
      seasonUpdated++;
    } else {
      seasonOut[k] = [""];
    }
    if (overallOut) {
      var oVal = overallByRowId[rowIdNum];
      if (typeof oVal === "number" && !isNaN(oVal)) {
        overallOut[k] = [oVal];
        overallUpdated++;
      } else {
        overallOut[k] = [""];
      }
    }
    if (salaryOut) {
      var pay = salaryByRowId[rowIdNum];
      if (typeof pay === "number" && !isNaN(pay)) {
        salaryOut[k] = [pay];
        salaryUpdated++;
      } else {
        salaryOut[k] = [""];
      }
    }
  }

  sheet.getRange(2, seasonCol, seasonOut.length, 1).setValues(seasonOut);
  if (overallOut)
    sheet.getRange(2, overallCol, overallOut.length, 1).setValues(overallOut);
  if (salaryOut)
    sheet.getRange(2, salaryCol, salaryOut.length, 1).setValues(salaryOut);

  return {
    seasonUpdated: seasonUpdated,
    overallUpdated: overallUpdated,
    salaryUpdated: salaryUpdated,
    totalRows: all.length,
    totalPlayers: Object.keys(byPlayer).length,
    wroteOverall: Boolean(overallCol),
    wroteSalary: Boolean(salaryCol),
  };
}

// Optional: write overall player ratings to the most recent season row per player
function updateOverallRatingsOnLatestSeasonRows() {
  var all = readSheetData("PLAYERSTATS", "PlayerNHLStatLine");
  if (!all || !all.length) return { success: 0, total: 0 };

  var byPlayer = {};
  for (var i = 0; i < all.length; i++) {
    var r = all[i];
    var pid = r.playerId;
    if (!pid) continue;
    var curr = byPlayer[pid];
    if (!curr || toNumber(r.seasonId) > toNumber(curr.seasonId))
      byPlayer[pid] = r;
  }

  // Compute multi-season overall per player (not rolling per row)
  var ratings = {};
  for (var pidKey in byPlayer) {
    var rows = all.filter(function (x) {
      return x.playerId === pidKey;
    });
    ratings[pidKey] = ratings_computeMultiPeriodOverall(rows, {
      seasonsToConsider: PLAYER_NHL_CAREER_RATING_CONFIG.seasonsToConsider,
      recencyWeights: PLAYER_NHL_CAREER_RATING_CONFIG.recencyWeights,
      seasonIdKey: "seasonId",
      valueGetter: function (rec) {
        return rec.SeasonRating != null
          ? toNumber(rec.SeasonRating)
          : rec.seasonRating != null
            ? toNumber(rec.seasonRating)
            : null;
      },
      effectiveWeight: function (rec, base) {
        var gpFull = getSeasonGamesForRow(rec) || 82;
        var gp = toNumber(rec.GP);
        var weight = base;
        var gpFrac =
          !isNaN(gp) && gpFull > 0 ? ratings_clampNumber(gp / gpFull, 0, 1) : 1;
        return weight * gpFrac;
      },
      missingPenalty: PLAYER_NHL_CAREER_RATING_CONFIG.missingSeasonPenalty,
    });
  }

  var wb = getWorkbook("PLAYERSTATS");
  var sheet = wb.getSheetByName("PlayerNHLStatLine");
  if (!sheet) throw new Error("PlayerNHLStatLine sheet not found");
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return { success: 0, total: 0 };

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idCol = headers.indexOf("id") + 1;
  var overallCol = headers.indexOf("OverallRating") + 1;
  if (overallCol === 0) overallCol = headers.indexOf("overallRating") + 1;
  if (!idCol || !overallCol) return { success: 0, total: 0 };

  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  var idToRow = {};
  for (var r = 0; r < ids.length; r++) idToRow[toNumber(ids[r][0])] = r + 2;

  var success = 0;
  for (var pid2 in byPlayer) {
    var latestRow = byPlayer[pid2];
    var rowIndex = idToRow[toNumber(latestRow.id)];
    var val = ratings[pid2];
    if (rowIndex && typeof val === "number" && !isNaN(val)) {
      sheet.getRange(rowIndex, overallCol).setValue(val);
      success++;
    }
  }
  return { success: success, total: Object.keys(byPlayer).length };
}
