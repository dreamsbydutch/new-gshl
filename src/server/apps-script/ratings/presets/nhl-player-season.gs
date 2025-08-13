/**
 * NHL Player Season preset using ratings engine
 * Exposes helpers to build scales, compute season ratings, rolling overall, and salary
 */

function ratings_nhl_getMetaKeys() {
  return {
    id: true,
    seasonId: true,
    playerId: true,
    nhlPos: true,
    posGroup: true,
    nhlTeam: true,
    createdAt: true,
    updatedAt: true,
  };
}

function ratings_nhl_bounds(pos, stat) {
  return pos === "G" ? { low: 5, high: 95 } : { low: 0, high: 99.5 };
}

function ratings_nhl_buildScales() {
  var rows = readSheetData("PLAYERSTATS", "PlayerNHLStatLine");
  if (!rows || !rows.length) return {};
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
    ratings_nhl_getMetaKeys(),
  );
  if (!keysByPos.F) keysByPos.F = discovered;
  if (!keysByPos.D) keysByPos.D = discovered;
  if (!keysByPos.G) keysByPos.G = discovered;
  return ratings_generateScales({
    rows: rows,
    positionKey: "posGroup",
    statKeysByPosMap: keysByPos,
    metaKeys: ratings_nhl_getMetaKeys(),
    discoverIfMissing: false,
    normalizeStat: ratings_normalizeSeasonLength,
    getBoundsFor: ratings_nhl_bounds,
  });
}

function ratings_nhl_computeSeasonRatings(scales) {
  var rows = readSheetData("PLAYERSTATS", "PlayerNHLStatLine");
  var result = {};
  for (var i = 0; i < rows.length; i++) {
    var rec = rows[i];
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

function ratings_nhl_computeRollingOverall(rows) {
  // group by playerId
  var byPlayer = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var pid = r.playerId;
    if (!pid) continue;
    if (!byPlayer[pid]) byPlayer[pid] = [];
    byPlayer[pid].push(r);
  }
  // use orchestrator helper to compute rolling per row id with youth logic
  return ratings_computeRollingOverall({
    recordsByPlayerId: byPlayer,
    multiCfg: {
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
        var gpFull =
          ratings_getSeasonGamesForRow(rec) ||
          PLAYER_NHL_CAREER_RATING_CONFIG.gpFullSeason ||
          82;
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
        // Youth short-season suppression
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
    },
  });
}

function ratings_nhl_recalculateAll() {
  // 1) Build scales
  var scales = ratings_nhl_buildScales();
  if (!scales || Object.keys(scales).length === 0)
    return { success: false, error: "no scales" };

  // 2) Compute season ratings
  var season = ratings_nhl_computeSeasonRatings(scales);
  var rows = season.rows;
  var seasonById = season.seasonById;

  // 3) Write SeasonRating back
  var wb = getWorkbook("player stats");
  var sheet = wb && wb.getSheetByName("PlayerNHLStatLine");
  if (!sheet) return { success: false, error: "sheet not found" };
  var data = sheet.getDataRange().getValues();
  if (!data || data.length <= 1) return { success: false, error: "no rows" };
  var headers = data[0];
  var idCol = headers.indexOf("id");
  var seasonCol = headers.indexOf("SeasonRating");
  var overallCol = headers.indexOf("OverallRating");
  var salaryCol = headers.indexOf("Salary");
  if (idCol < 0 || seasonCol < 0 || overallCol < 0 || salaryCol < 0)
    return { success: false, error: "missing columns" };

  // apply season ratings first
  var writeCount = 0;
  for (var r = 1; r < data.length; r++) {
    var id = toNumber(data[r][idCol]);
    if (isNaN(id)) continue;
    var sr = seasonById[id];
    if (typeof sr === "number" && !isNaN(sr)) {
      sheet.getRange(r + 1, seasonCol + 1).setValue(sr);
      writeCount++;
    }
  }

  // 4) Compute rolling overall and write
  var overallByRowId = ratings_nhl_computeRollingOverall(rows);
  var wroteOverall = 0;
  for (var r2 = 1; r2 < data.length; r2++) {
    var id2 = toNumber(data[r2][idCol]);
    if (isNaN(id2)) continue;
    var ov = overallByRowId[id2];
    if (typeof ov === "number" && !isNaN(ov)) {
      sheet.getRange(r2 + 1, overallCol + 1).setValue(ov);
      wroteOverall++;
    }
  }

  // 5) Compute salaries across all seasons and write
  var salaryByRowId = ratings_calculateAllSeasonSalaries(
    rows,
    overallByRowId,
    PLAYER_NHL_SALARY_CONFIG.anchors,
    5000,
  );
  var wroteSalary = 0;
  for (var r3 = 1; r3 < data.length; r3++) {
    var id3 = toNumber(data[r3][idCol]);
    if (isNaN(id3)) continue;
    var sal = salaryByRowId[id3];
    if (typeof sal === "number" && !isNaN(sal)) {
      sheet.getRange(r3 + 1, salaryCol + 1).setValue(sal);
      wroteSalary++;
    }
  }

  console.log(
    "PlayerNHLStatLine updates — Season:",
    writeCount,
    " Overall:",
    wroteOverall,
    " Salary:",
    wroteSalary,
  );
  return {
    success: true,
    seasonRows: writeCount,
    overallRows: wroteOverall,
    salaryRows: wroteSalary,
  };
}
