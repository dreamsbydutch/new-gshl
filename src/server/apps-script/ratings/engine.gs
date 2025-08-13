/**
 * Ratings Engine (Generic)
 * Reusable utilities to build percentile scales, rate records, aggregate multi-period
 * values, and compute salaries from rank anchors.
 *
 * Note: Depends on global helpers available in Apps Script codebase:
 * - toNumber(any): number
 */

// ---------- Generic helpers ----------
function ratings_clampNumber(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function ratings_roundToNearest(value, step) {
  var s = typeof step === "number" && step > 0 ? step : 1;
  return Math.round(value / s) * s;
}

// Local percentile helper (sorted array required)
function ratings_getPercentileValue(sortedValues, percentile) {
  var n = sortedValues && sortedValues.length ? sortedValues.length : 0;
  if (!n) return 0;
  var index = (percentile / 100) * (n - 1);
  var lower = Math.floor(index);
  var upper = Math.ceil(index);
  var weight = index % 1;
  if (upper >= n) return sortedValues[n - 1];
  if (lower < 0) return sortedValues[0];
  var value = sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  return parseFloat(value.toFixed(3));
}

// Discover numeric stat keys by scanning rows and excluding meta keys
function ratings_discoverNumericStatKeys(rows, excludeSet) {
  var set = {};
  for (var i = 0; i < rows.length; i++) {
    var rec = rows[i];
    for (var k in rec) {
      if (excludeSet && excludeSet[k]) continue;
      var v = toNumber(rec[k]);
      if (v !== null && v !== undefined && !isNaN(v)) set[k] = true;
    }
  }
  var out = [];
  for (var k2 in set) out.push(k2);
  return out;
}

// Build distributions: { [pos]: { [stat]: number[] } }
function ratings_buildDistributions(
  rows,
  positionKey,
  statKeysByPosMap,
  normalizeFn,
) {
  var dists = {}; // pos -> stat -> number[]
  for (var i = 0; i < rows.length; i++) {
    var rec = rows[i];
    var pos = positionKey ? rec[positionKey] : "ALL";
    if (!pos) pos = "ALL";
    if (!dists[pos]) dists[pos] = {};

    var keysForPos =
      statKeysByPosMap && statKeysByPosMap[pos]
        ? statKeysByPosMap[pos]
        : (statKeysByPosMap && statKeysByPosMap.ALL) || Object.keys(rec);

    for (var s = 0; s < keysForPos.length; s++) {
      var stat = keysForPos[s];
      var raw = rec[stat];
      if (raw === null || raw === undefined) continue;
      var val = toNumber(raw);
      if (isNaN(val)) continue;
      var adj = normalizeFn ? normalizeFn(stat, val, rec) : val;
      if (!dists[pos][stat]) dists[pos][stat] = [];
      dists[pos][stat].push(adj);
    }
  }
  return dists;
}

// Build percentile scales per position/stat based on distributions
function ratings_buildPercentileScales(distributions, getBoundsFor) {
  var scales = {}; // pos -> stat -> { floor, ceiling }
  for (var pos in distributions) {
    scales[pos] = {};
    var statsForPos = distributions[pos];
    for (var stat in statsForPos) {
      var arr = statsForPos[stat];
      if (!arr || arr.length < 2) continue;
      arr.sort(function (a, b) {
        return a - b;
      });
      var bounds = getBoundsFor ? getBoundsFor(pos, stat) : null;
      var lowPct = bounds && typeof bounds.low === "number" ? bounds.low : 0;
      var highPct =
        bounds && typeof bounds.high === "number" ? bounds.high : 99.5;
      var floor = ratings_getPercentileValue(arr, lowPct);
      var ceiling = ratings_getPercentileValue(arr, highPct);
      if (
        typeof floor === "number" &&
        typeof ceiling === "number" &&
        ceiling > floor
      ) {
        scales[pos][stat] = { floor: floor, ceiling: ceiling };
      }
    }
  }
  return scales;
}

/**
 * Generate percentile scales from raw rows.
 * opts = {
 *   rows: any[],
 *   positionKey: string | undefined,
 *   statKeysByPosMap?: { [pos]: string[] } | { ALL: string[] },
 *   metaKeys?: string[] | Set<string>,
 *   discoverIfMissing?: boolean,
 *   normalizeStat?: (stat, value, rec) => number,
 *   getBoundsFor?: (pos, stat) => { low:number, high:number }
 * }
 */
function ratings_generateScales(opts) {
  var rows = opts && opts.rows ? opts.rows : [];
  if (!rows || rows.length === 0) return {};

  var metaSet = {};
  if (opts && opts.metaKeys) {
    if (Array.isArray(opts.metaKeys)) {
      for (var i = 0; i < opts.metaKeys.length; i++)
        metaSet[opts.metaKeys[i]] = true;
    } else {
      for (var k in opts.metaKeys) metaSet[k] = true;
    }
  }

  var statKeysByPos =
    opts && opts.statKeysByPosMap ? opts.statKeysByPosMap : null;
  if (!statKeysByPos && opts && opts.discoverIfMissing) {
    var discovered = ratings_discoverNumericStatKeys(rows, metaSet);
    statKeysByPos = { ALL: discovered };
  }

  var normalizeFn = opts && opts.normalizeStat ? opts.normalizeStat : null;
  var dists = ratings_buildDistributions(
    rows,
    opts && opts.positionKey,
    statKeysByPos,
    normalizeFn,
  );
  return ratings_buildPercentileScales(dists, opts && opts.getBoundsFor);
}

// Rate a single stat using scales and negative-stat inversion map
function ratings_rateSingleStat(
  value,
  position,
  stat,
  scales,
  negativeStatsMap,
) {
  var scale = scales && scales[position] && scales[position][stat];
  if (
    !scale ||
    typeof scale.floor !== "number" ||
    typeof scale.ceiling !== "number"
  )
    return 0;
  if (scale.ceiling === scale.floor) return 0;
  var v = toNumber(value);
  if (isNaN(v)) return 0;
  if (negativeStatsMap && negativeStatsMap[stat]) {
    if (v >= scale.ceiling) return 0;
    return (scale.ceiling - v) / (scale.ceiling - scale.floor);
  }
  if (v <= scale.floor) return 0;
  return (v - scale.floor) / (scale.ceiling - scale.floor);
}

// Optional shaping of overall (0..1+)
function ratings_postProcessOverall(overall, postCfg) {
  var post = postCfg || { tailCompression: 1, multiplier: 1 };
  if (
    post.subOnePower &&
    post.subOnePower !== 1 &&
    overall > 0 &&
    overall <= 1
  ) {
    overall = Math.pow(overall, post.subOnePower);
  }
  if (
    post.topKnee != null &&
    post.topPower &&
    post.topPower !== 1 &&
    overall > post.topKnee &&
    overall <= 1
  ) {
    var t0 = post.topKnee;
    var f = (overall - t0) / (1 - t0);
    var shaped = Math.pow(f, post.topPower);
    overall = t0 + (1 - t0) * shaped;
  }
  if (overall > 1 && post.tailCompression && post.tailCompression !== 1) {
    var excess = overall - 1;
    overall = 1 + excess * post.tailCompression;
  }
  if (post.multiplier && post.multiplier !== 1) overall *= post.multiplier;
  return overall;
}

/**
 * Aggregate per-stat ratings into overall for a record.
 * Returns overall in 0..1+ domain; caller can map to any scale.
 * params = {
 *   record, positionKey, scales, weightsByPos:{[pos]:{[stat]:weight}},
 *   negativeStatsMap,
 *   normalizeStat?: (stat, value, record) => number,
 *   dampeners?: Array<(record, position, overall)=>number>,
 *   postProcessByPos?: { [pos]: any }
 * }
 */
function ratings_aggregateOverall(params) {
  var rec = params.record;
  var pos = params.positionKey ? rec[params.positionKey] : "ALL";
  if (!pos) pos = "ALL";
  var scales = params.scales || {};
  var posScales = scales[pos];
  if (!posScales) return 0;

  var weightsMap = (params.weightsByPos && params.weightsByPos[pos]) || null;
  var useConfigured = !!(weightsMap && Object.keys(weightsMap).length > 0);

  var total = 0;
  var totalW = 0;

  if (useConfigured) {
    for (var stat in weightsMap) {
      var weight = toNumber(weightsMap[stat]);
      if (!weight || weight <= 0) continue;
      if (!posScales[stat]) continue;
      var raw = rec[stat];
      if (raw === null || raw === undefined) continue;
      var num = toNumber(raw);
      if (isNaN(num)) continue;
      if (params.normalizeStat) num = params.normalizeStat(stat, num, rec);
      var r = ratings_rateSingleStat(
        num,
        pos,
        stat,
        scales,
        params.negativeStatsMap,
      );
      total += r * weight;
      totalW += weight;
    }
  } else {
    for (var stat2 in posScales) {
      var raw2 = rec[stat2];
      if (raw2 === null || raw2 === undefined) continue;
      var num2 = toNumber(raw2);
      if (isNaN(num2)) continue;
      if (params.normalizeStat) num2 = params.normalizeStat(stat2, num2, rec);
      var r2 = ratings_rateSingleStat(
        num2,
        pos,
        stat2,
        scales,
        params.negativeStatsMap,
      );
      total += r2;
      totalW += 1;
    }
  }

  var overall = totalW > 0 ? total / totalW : 0; // 0..1+

  if (params.dampeners && params.dampeners.length) {
    for (var i = 0; i < params.dampeners.length; i++) {
      try {
        overall = params.dampeners[i](rec, pos, overall);
      } catch (e) {}
    }
  }

  var postCfg = params.postProcessByPos && params.postProcessByPos[pos];
  overall = ratings_postProcessOverall(overall, postCfg);
  return overall;
}

// ---------- Multi-period aggregation ----------
/**
 * Compute a multi-period overall from records (e.g., seasons) using recency and effective weights.
 * cfg = {
 *   seasonsToConsider:number,
 *   recencyWeights:number[],
 *   seasonIdKey:string, // e.g., 'seasonId'
 *   valueGetter:(rec)=>number|null, // the per-period value to average (already on rec)
 *   effectiveWeight:(rec, base:number)=>number, // returns adjusted weight
 *   youthBoost?: {
 *     isEligible:(latestRec)=>boolean,
 *     computeBonus:(latestRec)=>number // returns additive bonus on the same scale as valueGetter
 *   },
 *   missingPenalty?: number
 * }
 */
function ratings_computeMultiPeriodOverall(records, cfg) {
  if (!records || !records.length) return 0;
  var seasonKey = cfg.seasonIdKey || "seasonId";
  var sorted = records.slice().sort(function (a, b) {
    return toNumber(b[seasonKey]) - toNumber(a[seasonKey]);
  });
  var k = Math.min(cfg.seasonsToConsider || 1, sorted.length);
  var consider = sorted.slice(0, k);

  var base = (cfg.recencyWeights || []).slice(0, k);
  if (base.length < k) {
    var last = base.length > 0 ? base[base.length - 1] : 1 / k;
    while (base.length < k) base.push(last);
  }
  var sumBase =
    base.reduce(function (s, v) {
      return s + v;
    }, 0) || 1;
  base = base.map(function (w) {
    return w / sumBase;
  });

  var num = 0;
  var den = 0;
  var missing = 0;
  for (var i = 0; i < consider.length; i++) {
    var rec = consider[i];
    var v = cfg.valueGetter ? cfg.valueGetter(rec) : null;
    var w = cfg.effectiveWeight ? cfg.effectiveWeight(rec, base[i]) : base[i];
    if (typeof v === "number" && !isNaN(v)) {
      num += v * w;
      den += w;
    } else {
      missing += 1;
    }
  }
  var overall = den > 0 ? num / den : 0;

  if (
    cfg.youthBoost &&
    cfg.youthBoost.isEligible &&
    cfg.youthBoost.computeBonus
  ) {
    var latest = consider[0];
    if (cfg.youthBoost.isEligible(latest)) {
      try {
        overall += cfg.youthBoost.computeBonus(latest) || 0;
      } catch (e) {}
    }
  }

  if (cfg.missingPenalty && missing > 0) {
    overall -= cfg.missingPenalty * missing;
  }
  return Math.max(0, overall);
}

// Rolling per-period overall for each record; returns map { rowId: overall }
function ratings_computeRollingOverallPerRecord(records, cfg) {
  var out = {};
  if (!records || !records.length) return out;
  var idKey = cfg.idKey || "id";
  var seasonKey = cfg.seasonIdKey || "seasonId";
  var asc = records.slice().sort(function (a, b) {
    return toNumber(a[seasonKey]) - toNumber(b[seasonKey]);
  });
  var windowSize = cfg.seasonsToConsider || 5;
  for (var i = 0; i < asc.length; i++) {
    var start = Math.max(0, i - (windowSize - 1));
    var win = asc.slice(start, i + 1);
    var v = ratings_computeMultiPeriodOverall(win, cfg);
    out[asc[i][idKey]] = v;
  }
  return out;
}

// ---------- Salary utilities ----------
function ratings_getSalaryForRank(rank, anchors) {
  if (!anchors || !anchors.length) return 1000000;
  var arr = anchors
    .filter(function (a) {
      return a && typeof a.rank === "number" && typeof a.salary === "number";
    })
    .slice()
    .sort(function (a, b) {
      return a.rank - b.rank;
    });
  if (!arr.length) return 1000000;
  if (rank <= arr[0].rank) return arr[0].salary;
  if (rank >= arr[arr.length - 1].rank) return arr[arr.length - 1].salary;
  for (var i = 1; i < arr.length; i++) {
    var prev = arr[i - 1];
    var next = arr[i];
    if (rank <= next.rank) {
      var span = next.rank - prev.rank;
      var t = span > 0 ? (rank - prev.rank) / span : 0;
      return prev.salary + t * (next.salary - prev.salary);
    }
  }
  return arr[arr.length - 1].salary;
}

function ratings_calculateSeasonSalariesByRank(
  allRows,
  seasonId,
  overallByRowId,
  anchors,
  roundingStep,
) {
  var rows = [];
  for (var i = 0; i < allRows.length; i++) {
    var r = allRows[i];
    if (toNumber(r.seasonId) !== toNumber(seasonId)) continue;
    var ov = overallByRowId[r.id];
    if (typeof ov === "number" && !isNaN(ov))
      rows.push({ id: r.id, overall: ov });
  }
  if (!rows.length) return {};
  rows.sort(function (a, b) {
    return b.overall - a.overall || toNumber(a.id) - toNumber(b.id);
  });
  var out = {};
  for (var j = 0; j < rows.length; j++) {
    var rank = j + 1;
    var salary = ratings_getSalaryForRank(rank, anchors);
    out[rows[j].id] = ratings_roundToNearest(salary, roundingStep || 5000);
  }
  return out;
}

function ratings_calculateAllSeasonSalaries(
  allRows,
  overallByRowId,
  anchors,
  roundingStep,
) {
  var seasonsSet = {};
  for (var i = 0; i < allRows.length; i++) {
    var sid = allRows[i].seasonId;
    if (sid != null) seasonsSet[toNumber(sid)] = true;
  }
  var result = {};
  for (var sidStr in seasonsSet) {
    var sidNum = toNumber(sidStr);
    var map = ratings_calculateSeasonSalariesByRank(
      allRows,
      sidNum,
      overallByRowId,
      anchors,
      roundingStep,
    );
    for (var rowId in map) result[rowId] = map[rowId];
  }
  return result;
}
