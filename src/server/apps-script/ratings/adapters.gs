/**
 * Ratings Adapters
 * Bridge specific data models (NHL Player StatLine, Player Weeks, Team, etc.)
 * to the generic ratings engine.
 */

// NHL specific flags
var NHL_NEGATIVE_STATS = { GA: true, GAA: true };
var NHL_RATE_STATS = { SVP: true, GAA: true };
var NHL_COUNTING_STATS = {
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

/** Season-length map used across adapters */
var RATINGS_SEASON_LENGTH = {
  defaultGames: 82,
  bySeasonId: { 6: 71, 7: 56 },
};

function ratings_getSeasonGamesForRow(rec) {
  var sid = toNumber(rec && rec.seasonId);
  var map = (RATINGS_SEASON_LENGTH && RATINGS_SEASON_LENGTH.bySeasonId) || {};
  var g = map.hasOwnProperty(sid) ? map[sid] : null;
  return g || RATINGS_SEASON_LENGTH.defaultGames;
}

function ratings_normalizeSeasonLength(stat, value, rec) {
  var full =
    (RATINGS_SEASON_LENGTH && RATINGS_SEASON_LENGTH.defaultGames) || 82;
  // Support override via rec.seasonGames when available
  var seasonGames =
    rec && typeof rec.seasonGames === "number"
      ? rec.seasonGames
      : ratings_getSeasonGamesForRow(rec);
  if (!seasonGames || seasonGames <= 0 || seasonGames === full) return value;
  if (NHL_RATE_STATS[stat]) return value;
  if (NHL_COUNTING_STATS[stat]) return value * (full / seasonGames);
  return value;
}

// Per-position TOI dampening (local adapter util)
function ratings_getToiDampenerFactor(pos, toiSeconds, seasonGames, toiCfg) {
  if (!toiCfg) return 1;
  var full =
    (RATINGS_SEASON_LENGTH && RATINGS_SEASON_LENGTH.defaultGames) || 82;
  var factor = seasonGames && seasonGames > 0 ? seasonGames / full : 1;
  var min = toNumber(toiCfg.min) * factor;
  var max = toNumber(toiCfg.max) * factor;
  var toi = toNumber(toiSeconds);
  if (!min || !max || max <= min) return 1;
  var minFactor = typeof toiCfg.minFactor === "number" ? toiCfg.minFactor : 0.3;
  var curve = typeof toiCfg.curve === "number" ? toiCfg.curve : 1.0;
  if (toi <= 0) return minFactor;
  if (toi <= min) return minFactor;
  if (toi >= max) return 1;
  var t = (toi - min) / (max - min);
  var shaped = curve === 1 ? t : Math.pow(t, curve);
  return minFactor + (1 - minFactor) * shaped;
}

function ratings_applyGlobalToiDampening(
  globalCfg,
  position,
  toiSeconds,
  value,
  seasonGames,
) {
  var g = globalCfg && globalCfg.toiGlobal;
  if (!g || toiSeconds == null) return value;
  var toi = toNumber(toiSeconds);
  var full =
    (RATINGS_SEASON_LENGTH && RATINGS_SEASON_LENGTH.defaultGames) || 82;
  var factor = seasonGames && seasonGames > 0 ? seasonGames / full : 1;
  var lowOverrideBase = g.lowByPos && g.lowByPos[position];
  var lowThreshBase =
    typeof lowOverrideBase === "number" ? lowOverrideBase : g.low;
  var lowThresh = lowThreshBase * factor;
  var critical = g.critical * factor;
  if (toi <= critical) {
    var cap = typeof g.criticalCap === "number" ? g.criticalCap : 0.05;
    return Math.min(value, cap);
  }
  if (toi <= lowThresh) {
    var mult = typeof g.lowMultiplier === "number" ? g.lowMultiplier : 0.5;
    return value * mult;
  }
  return value;
}

/**
 * NHL Player StatLine adapter: build scales
 */
function ratings_generateNHLScales(config, globalCfg) {
  var all = readSheetData("PLAYERSTATS", "PlayerNHLStatLine");
  if (!all || !all.length) return {};

  // Discover or use configured stat keys per pos
  var metaKeys = {
    id: true,
    seasonId: true,
    playerId: true,
    nhlPos: true,
    posGroup: true,
    nhlTeam: true,
    createdAt: true,
    updatedAt: true,
  };
  var keysByPos = {
    F:
      config && config.F && config.F.stats ? Object.keys(config.F.stats) : null,
    D:
      config && config.D && config.D.stats ? Object.keys(config.D.stats) : null,
    G:
      config && config.G && config.G.stats ? Object.keys(config.G.stats) : null,
  };
  var discovered = ratings_discoverNumericStatKeys(all, metaKeys);
  if (!keysByPos.F) keysByPos.F = discovered;
  if (!keysByPos.D) keysByPos.D = discovered;
  if (!keysByPos.G) keysByPos.G = discovered;

  function getBoundsFor(pos, stat) {
    return pos === "G" ? { low: 5, high: 95 } : { low: 0, high: 99.5 };
  }

  return ratings_generateScales({
    rows: all,
    positionKey: "posGroup",
    statKeysByPosMap: keysByPos,
    metaKeys: metaKeys,
    discoverIfMissing: false,
    normalizeStat: ratings_normalizeSeasonLength,
    getBoundsFor: getBoundsFor,
  });
}

/**
 * NHL record -> overall
 */
function ratings_calculateNHLSeasonRating(rec, scales, config, globalCfg) {
  var position = rec.posGroup;
  var seasonGames = ratings_getSeasonGamesForRow(rec);
  var cfg = (config && config[position]) || {};

  var dampeners = [];
  // position-specific TOI dampener
  if (cfg.overall && cfg.overall.toiDampener) {
    dampeners.push(function (r, pos, overall) {
      var toi = r.TOI != null ? toNumber(r.TOI) : null;
      if (toi == null) return overall;
      var f = ratings_getToiDampenerFactor(
        pos,
        toi,
        seasonGames,
        cfg.overall.toiDampener,
      );
      return overall * f;
    });
  }
  // global TOI dampener
  dampeners.push(function (r, pos, overall) {
    var toi = r.TOI != null ? toNumber(r.TOI) : null;
    if (toi == null) return overall;
    return ratings_applyGlobalToiDampening(
      globalCfg,
      pos,
      toi,
      overall,
      seasonGames,
    );
  });

  var overall = ratings_aggregateOverall({
    record: rec,
    positionKey: "posGroup",
    scales: scales,
    weightsByPos: {
      F: cfg.stats || {},
      D: cfg.stats || {},
      G: cfg.stats || {},
    }, // same map for simplicity
    negativeStatsMap: NHL_NEGATIVE_STATS,
    normalizeStat: ratings_normalizeSeasonLength,
    dampeners: dampeners,
    postProcessByPos: { F: cfg.overall, D: cfg.overall, G: cfg.overall },
  });
  return overall * 75 + 50;
}

/**
 * Generic helpers export for other datasets (weeks, totals, splits, teams):
 * - Provide your own config (weights and postProcess), positionKey, normalizeStat, negative stats map
 * - Generate scales, then call ratings_aggregateOverall per record, and map scale as desired
 */
