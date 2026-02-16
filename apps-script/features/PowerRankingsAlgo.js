// @ts-nocheck

/**
 * PowerRankingsAlgo (Apps Script)
 * ------------------------------
 * Computes a comprehensive weekly power ranking for teams.
 *
 * Outputs (stored on TEAMSTATS_SPREADSHEET_ID):
 * - TeamWeekStatLine: powerElo*, powerStat*, powerComposite, powerRating, powerRk
 * - TeamSeasonStatLine: end-of-run values for the chosen seasonType
 *
 * Design notes:
 * - Deterministic computations from existing sheets (Week/Matchup/TeamWeekStatLine)
 * - Uses Elo (matchup results) + exponentially weighted team-stat strength
 * - Hooks exist for franchise-history priors (v2)
 */

var PowerRankingsAlgo = (function buildPowerRankingsAlgo() {
  "use strict";

  if (typeof GshlUtils === "undefined") {
    throw new Error(
      "GshlUtils is not defined. Ensure core utils are loaded before PowerRankingsAlgo.js",
    );
  }
  if (typeof SPREADSHEET_ID === "undefined") {
    throw new Error("SPREADSHEET_ID is not defined");
  }
  if (typeof TEAMSTATS_SPREADSHEET_ID === "undefined") {
    throw new Error("TEAMSTATS_SPREADSHEET_ID is not defined");
  }

  var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
  var upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;
  var ensureSheetColumns = GshlUtils.sheets.write.ensureSheetColumns;
  var formatDateOnly = GshlUtils.core.date.formatDateOnly;
  var toNumber = GshlUtils.core.parse.toNumber;
  var normalizeSeasonId = GshlUtils.core.parse.normalizeSeasonId;

  var MATCHUP_CATEGORY_RULES = GshlUtils.core.constants.MATCHUP_CATEGORY_RULES;
  var SeasonType = GshlUtils.core.constants.SeasonType;

  var DEFAULTS = {
    // Elo
    baseElo: 1500,
    eloScale: 400,
    baseK: 20,
    marginKMultiplier: 0.5,
    // Elo actual-score blend per matchup:
    // - marginScore uses (teamScore-opponentScore) from Matchup scores
    // - pointsScore uses the win/loss points rule (3/2/1/0)
    // 1.0 => pure marginScore, 0.0 => pure pointsScore
    eloMarginWeight: 0.75,

    // Stat strength EWMA
    ewmaAlpha: 0.35, // higher = more weight on most recent week

    // Weekly performance score weights (all in z-space):
    // - categoryZ: based on TeamWeekStatLine category fields (MATCHUP_CATEGORY_RULES)
    // - ratingZ: based on TeamWeekStatLine.Rating
    // - matchupPointsZ: based on points from Matchup table (3/2/1/0)
    // - matchupMarginZ: based on (teamScore-opponentScore) from Matchup table
    perfCategoryWeight: 0.45,
    perfRatingWeight: 0.35,
    perfMatchupPointsWeight: 0.1,
    perfMatchupMarginWeight: 0.1,

    // Composite weights
    wElo: 0.7,
    wStat: 0.3,

    // Scope
    seasonType: SeasonType.REGULAR_SEASON,

    // Writes/logging
    dryRun: false,
    logToConsole: true,
  };

  var REQUIRED_TEAM_WEEK_COLUMNS = [
    "powerElo",
    "powerEloPre",
    "powerEloPost",
    "powerEloDelta",
    "powerEloExpected",
    "powerEloK",
    "powerStatScore",
    "powerStatEwma",
    "powerComposite",
    "powerRating",
    "powerRk",
  ];

  var REQUIRED_TEAM_SEASON_COLUMNS = [
    "powerElo",
    "powerStatEwma",
    "powerComposite",
    "powerRating",
    "powerRk",
  ];

  function applyDefaults(options) {
    var opts = options || {};
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = opts[k] === undefined ? DEFAULTS[k] : opts[k];
    });
    return out;
  }

  function ensurePowerRankingColumns() {
    var r1 = ensureSheetColumns(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
      REQUIRED_TEAM_WEEK_COLUMNS,
    );
    var r2 = ensureSheetColumns(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamSeasonStatLine",
      REQUIRED_TEAM_SEASON_COLUMNS,
    );
    return { teamWeek: r1, teamSeason: r2 };
  }

  function sortWeeks(weeks) {
    return (weeks || []).slice().sort(function (a, b) {
      var as = toNumber(a && a.weekSortOrder);
      var bs = toNumber(b && b.weekSortOrder);
      if (as && bs && as !== bs) return as - bs;

      var ai = toNumber(a && a.weekIndex);
      var bi = toNumber(b && b.weekIndex);
      if (ai && bi && ai !== bi) return ai - bi;

      var ad = formatDateOnly(a && a.startDate);
      var bd = formatDateOnly(b && b.startDate);
      if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;

      return String(a && a.id) < String(b && b.id) ? -1 : 1;
    });
  }

  function buildLeagueTeamIds(seasonKey) {
    return fetchSheetAsObjects(SPREADSHEET_ID, "Team")
      .filter(function (t) {
        return String(t && t.seasonId) === String(seasonKey);
      })
      .map(function (t) {
        return String(t && t.id);
      })
      .filter(Boolean);
  }

  function computeZScores(valuesByTeam, higherBetter) {
    var vals = [];
    valuesByTeam.forEach(function (v) {
      if (v === null || v === undefined || v === "") return;
      var n = toNumber(v);
      if (!isFinite(n)) return;
      vals.push(n);
    });

    if (!vals.length) {
      return { mean: 0, std: 1 };
    }

    var mean = vals.reduce(function (a, b) {
      return a + b;
    }, 0);
    mean = mean / vals.length;

    var variance = 0;
    for (var i = 0; i < vals.length; i++) {
      variance += Math.pow(vals[i] - mean, 2);
    }
    variance = variance / Math.max(1, vals.length);
    var std = Math.sqrt(variance);
    if (!std || !isFinite(std)) std = 1;

    return {
      mean: mean,
      std: std,
      direction: higherBetter ? 1 : -1,
    };
  }

  function computeWeeklyStatScores(teamWeeksInWeekId, teamIds) {
    var rules = MATCHUP_CATEGORY_RULES || [];

    // Build per-category maps of team->value for this week.
    var categoryStats = rules.map(function (r) {
      var map = new Map();
      (teamIds || []).forEach(function (tid) {
        var row = teamWeeksInWeekId.get(String(tid));
        map.set(String(tid), row ? row[r.field] : null);
      });
      return {
        rule: r,
        valuesByTeam: map,
      };
    });

    // Precompute mean/std per category.
    var zMeta = categoryStats.map(function (c) {
      var m = computeZScores(c.valuesByTeam, !!c.rule.higherBetter);
      return { rule: c.rule, valuesByTeam: c.valuesByTeam, meta: m };
    });

    // Score per team: average directional z across categories.
    var scores = new Map();
    (teamIds || []).forEach(function (tid) {
      var sum = 0;
      var count = 0;
      zMeta.forEach(function (cat) {
        var raw = cat.valuesByTeam.get(String(tid));
        if (raw === null || raw === undefined || raw === "") return;
        var n = toNumber(raw);
        if (!isFinite(n)) return;
        var z = (n - cat.meta.mean) / cat.meta.std;
        z = (cat.meta.direction || 1) * z;
        sum += z;
        count += 1;
      });
      scores.set(String(tid), count ? sum / count : 0);
    });

    return scores;
  }

  function computeZFromArray(vals) {
    var clean = (vals || []).filter(function (n) {
      return n !== null && n !== undefined && n !== "" && isFinite(toNumber(n));
    });
    if (!clean.length) return { mean: 0, std: 1 };
    var mean =
      clean.reduce(function (a, b) {
        return a + toNumber(b);
      }, 0) / clean.length;
    var variance = 0;
    for (var i = 0; i < clean.length; i++) {
      variance += Math.pow(toNumber(clean[i]) - mean, 2);
    }
    variance = variance / Math.max(1, clean.length);
    var std = Math.sqrt(variance);
    if (!std || !isFinite(std)) std = 1;
    return { mean: mean, std: std };
  }

  function clamp01(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return x;
  }

  function computeMatchupPointsFromRow(m) {
    // Points rule:
    // - win = 3
    // - home win on a tie score (homeWin true && scores equal) = 2, away gets 1
    // - home loss on a tie score (same as above) = away gets 1
    // - loss = 0
    // If only scores exist (no flags), infer win/loss from score.
    if (!m) return null;

    var hs = toNumber(m.homeScore);
    var as = toNumber(m.awayScore);
    var hasScores = isFinite(hs) && isFinite(as);
    var scoresEqual = hasScores && hs === as;

    if (m.homeWin === true) {
      if (scoresEqual) return { homePts: 2, awayPts: 1 };
      return { homePts: 3, awayPts: 0 };
    }
    if (m.awayWin === true) {
      // In this league model, tie-break home-win is represented via homeWin.
      // If awayWin is marked, treat as a normal win.
      return { homePts: 0, awayPts: 3 };
    }
    if (m.tie === true) {
      // Not expected often; keep neutral.
      return { homePts: 1.5, awayPts: 1.5 };
    }

    if (hasScores) {
      if (scoresEqual) return { homePts: 2, awayPts: 1 };
      return hs > as ? { homePts: 3, awayPts: 0 } : { homePts: 0, awayPts: 3 };
    }

    return null;
  }

  function buildMatchupMetricsForWeek(matchups) {
    // Returns:
    // - pointsByTeam: Map(teamId -> points)
    // - marginByTeam: Map(teamId -> scoreDiff)
    // - marginScoreByTeam: Map(teamId -> [0..1] score based on diff/maxCats)
    var pointsByTeam = new Map();
    var marginByTeam = new Map();
    var marginScoreByTeam = new Map();

    var maxCats = (MATCHUP_CATEGORY_RULES || []).length || 10;

    (matchups || []).forEach(function (m) {
      if (!m) return;
      var homeId =
        m.homeTeamId !== undefined && m.homeTeamId !== null
          ? String(m.homeTeamId)
          : "";
      var awayId =
        m.awayTeamId !== undefined && m.awayTeamId !== null
          ? String(m.awayTeamId)
          : "";
      if (!homeId || !awayId) return;

      var pts = computeMatchupPointsFromRow(m);
      if (pts) {
        pointsByTeam.set(
          homeId,
          (pointsByTeam.get(homeId) || 0) + toNumber(pts.homePts),
        );
        pointsByTeam.set(
          awayId,
          (pointsByTeam.get(awayId) || 0) + toNumber(pts.awayPts),
        );
      }

      var hs = toNumber(m.homeScore);
      var as = toNumber(m.awayScore);
      if (isFinite(hs) && isFinite(as)) {
        var diff = hs - as;
        marginByTeam.set(homeId, (marginByTeam.get(homeId) || 0) + diff);
        marginByTeam.set(awayId, (marginByTeam.get(awayId) || 0) - diff);

        var marginScoreHome = clamp01(0.5 + diff / (2 * maxCats));
        var marginScoreAway = 1 - marginScoreHome;
        // If multiple matchups existed, average them later by z-score; store the raw margin score sum.
        marginScoreByTeam.set(
          homeId,
          (marginScoreByTeam.get(homeId) || 0) + marginScoreHome,
        );
        marginScoreByTeam.set(
          awayId,
          (marginScoreByTeam.get(awayId) || 0) + marginScoreAway,
        );
      }
    });

    return {
      pointsByTeam: pointsByTeam,
      marginByTeam: marginByTeam,
      marginScoreByTeam: marginScoreByTeam,
    };
  }

  function expectedScore(eloA, eloB, scale) {
    var denom = 1 + Math.pow(10, (eloB - eloA) / scale);
    return 1 / denom;
  }

  function computeMatchupActualScore(m, marginWeight) {
    // Blend score margin with the win/loss points system.
    var w = toNumber(marginWeight);
    if (!isFinite(w)) w = 0.75;
    if (w < 0) w = 0;
    if (w > 1) w = 1;

    var maxCats = (MATCHUP_CATEGORY_RULES || []).length || 10;
    var hs = toNumber(m && m.homeScore);
    var as = toNumber(m && m.awayScore);

    var marginScore = null;
    if (isFinite(hs) && isFinite(as) && maxCats) {
      marginScore = clamp01(0.5 + (hs - as) / (2 * maxCats));
    }

    var pts = computeMatchupPointsFromRow(m);
    var pointsScore = pts ? clamp01(toNumber(pts.homePts) / 3) : null;

    if (marginScore === null && pointsScore === null) return null;
    if (marginScore === null) {
      return { home: pointsScore, away: 1 - pointsScore };
    }
    if (pointsScore === null) {
      return { home: marginScore, away: 1 - marginScore };
    }

    var blended = w * marginScore + (1 - w) * pointsScore;
    blended = clamp01(blended);
    return { home: blended, away: 1 - blended };
  }

  function computeKFactor(baseK, marginKMultiplier, m) {
    var hs = toNumber(m && m.homeScore);
    var as = toNumber(m && m.awayScore);
    var maxCats = (MATCHUP_CATEGORY_RULES || []).length || 10;

    if (!isFinite(hs) || !isFinite(as) || !maxCats) return baseK;
    var margin = Math.abs(hs - as) / maxCats;
    return baseK * (1 + marginKMultiplier * margin);
  }

  /**
   * Primary entry point.
   *
   * @param {string|number} seasonId
   * @param {Object=} options
   */
  function updatePowerRankingsForSeason(seasonId, options) {
    var seasonKey = normalizeSeasonId(seasonId, "updatePowerRankingsForSeason");
    var opts = applyDefaults(options);

    if (opts.logToConsole) {
      console.log(
        "[PowerRankingsAlgo] start season=",
        seasonKey,
        "type=",
        opts.seasonType,
        "dryRun=",
        opts.dryRun,
      );
    }

    ensurePowerRankingColumns();

    var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week").filter(
      function (w) {
        return String(w && w.seasonId) === String(seasonKey);
      },
    );

    // Filter to requested seasonType (RS/PO/LT) based on week.weekType.
    weeks = weeks.filter(function (w) {
      var wt = (w && w.weekType) || SeasonType.REGULAR_SEASON;
      return String(wt) === String(opts.seasonType);
    });

    weeks = sortWeeks(weeks);
    if (!weeks.length) {
      if (opts.logToConsole) {
        console.log("[PowerRankingsAlgo] no weeks found for season/type");
      }
      return {
        updatedWeekRows: 0,
        updatedSeasonRows: 0,
        dryRun: !!opts.dryRun,
      };
    }

    var weekIdSet = new Set(
      weeks
        .map(function (w) {
          return w && w.id !== undefined && w.id !== null ? String(w.id) : "";
        })
        .filter(Boolean),
    );

    var teamIds = buildLeagueTeamIds(seasonKey);
    var teamIdSet = new Set(teamIds);

    // Pull TeamWeekStatLine for this season and these weeks.
    var teamWeekRows = fetchSheetAsObjects(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
      { coerceTypes: true },
    ).filter(function (tw) {
      if (!tw) return false;
      if (String(tw && tw.seasonId) !== String(seasonKey)) return false;
      var wk =
        tw.weekId !== undefined && tw.weekId !== null ? String(tw.weekId) : "";
      if (!wk || !weekIdSet.has(wk)) return false;
      var tid =
        tw.gshlTeamId !== undefined && tw.gshlTeamId !== null
          ? String(tw.gshlTeamId)
          : "";
      return tid ? teamIdSet.has(tid) : false;
    });

    // Index: weekId -> teamId -> row
    var teamWeeksByWeekId = new Map();
    teamWeekRows.forEach(function (tw) {
      var wk = String(tw.weekId);
      var tid = String(tw.gshlTeamId);
      if (!teamWeeksByWeekId.has(wk)) teamWeeksByWeekId.set(wk, new Map());
      teamWeeksByWeekId.get(wk).set(tid, tw);
    });

    // Pull matchups for those weeks.
    var matchups = fetchSheetAsObjects(SPREADSHEET_ID, "Matchup", {
      coerceTypes: true,
    }).filter(function (m) {
      if (!m) return false;
      var wk =
        m.weekId !== undefined && m.weekId !== null ? String(m.weekId) : "";
      if (!wk || !weekIdSet.has(wk)) return false;
      // Only include matchups involving teams in this season.
      var home =
        m.homeTeamId !== undefined && m.homeTeamId !== null
          ? String(m.homeTeamId)
          : "";
      var away =
        m.awayTeamId !== undefined && m.awayTeamId !== null
          ? String(m.awayTeamId)
          : "";
      return home && away && teamIdSet.has(home) && teamIdSet.has(away);
    });

    var matchupsByWeekId = new Map();
    matchups.forEach(function (m) {
      var wk = String(m.weekId);
      if (!matchupsByWeekId.has(wk)) matchupsByWeekId.set(wk, []);
      matchupsByWeekId.get(wk).push(m);
    });

    // Initialize Elo / EWMA state.
    var eloByTeam = new Map();
    var statEwmaByTeam = new Map();
    teamIds.forEach(function (tid) {
      eloByTeam.set(String(tid), toNumber(opts.baseElo));
      statEwmaByTeam.set(String(tid), 0);
    });

    var weekUpdates = [];

    // Iterate weeks in order.
    weeks.forEach(function (week) {
      var weekId = String(week.id);
      var weekTeamMap = teamWeeksByWeekId.get(weekId) || new Map();

      // Snapshot Elo at the start of the week (pre-matchup).
      var eloPreByTeam = new Map();
      teamIds.forEach(function (tid) {
        eloPreByTeam.set(String(tid), eloByTeam.get(String(tid)));
      });

      // Track the per-team matchup parameters for this week (best-effort).
      // Most weeks have a single matchup per team.
      var matchupParamsByTeam = new Map();

      // Matchup-derived weekly metrics.
      var msForWeek = matchupsByWeekId.get(weekId) || [];
      var matchupMetrics = buildMatchupMetricsForWeek(msForWeek);

      // Weekly performance score (z-based) + EWMA update.
      // Includes: category performance, TeamWeekStatLine.Rating, matchup points, and matchup margin.
      var categoryZ = computeWeeklyStatScores(weekTeamMap, teamIds);

      // Rating z-score across teams.
      var ratingVals = teamIds.map(function (tid) {
        var row = weekTeamMap.get(String(tid));
        return row ? toNumber(row.Rating) : null;
      });
      var ratingMeta = computeZFromArray(ratingVals);
      var ratingZ = new Map();
      teamIds.forEach(function (tid) {
        var row = weekTeamMap.get(String(tid));
        var r = row ? toNumber(row.Rating) : null;
        if (!isFinite(r)) {
          ratingZ.set(String(tid), 0);
        } else {
          ratingZ.set(String(tid), (r - ratingMeta.mean) / ratingMeta.std);
        }
      });

      // Matchup points z-score.
      var ptsVals = teamIds.map(function (tid) {
        var p = matchupMetrics.pointsByTeam.get(String(tid));
        return p === undefined ? 0 : toNumber(p);
      });
      var ptsMeta = computeZFromArray(ptsVals);
      var ptsZ = new Map();
      teamIds.forEach(function (tid) {
        var p = matchupMetrics.pointsByTeam.get(String(tid));
        var pn = p === undefined ? 0 : toNumber(p);
        ptsZ.set(String(tid), (pn - ptsMeta.mean) / ptsMeta.std);
      });

      // Matchup score margin z-score.
      var marginVals = teamIds.map(function (tid) {
        var d = matchupMetrics.marginByTeam.get(String(tid));
        return d === undefined ? 0 : toNumber(d);
      });
      var marginMeta = computeZFromArray(marginVals);
      var marginZ = new Map();
      teamIds.forEach(function (tid) {
        var d = matchupMetrics.marginByTeam.get(String(tid));
        var dn = d === undefined ? 0 : toNumber(d);
        marginZ.set(String(tid), (dn - marginMeta.mean) / marginMeta.std);
      });

      // Combine into a single weekly performance score.
      var weeklyPerfScore = new Map();
      var wCat = toNumber(opts.perfCategoryWeight);
      var wRat = toNumber(opts.perfRatingWeight);
      var wPts = toNumber(opts.perfMatchupPointsWeight);
      var wMar = toNumber(opts.perfMatchupMarginWeight);
      if (!isFinite(wCat)) wCat = 0.45;
      if (!isFinite(wRat)) wRat = 0.35;
      if (!isFinite(wPts)) wPts = 0.1;
      if (!isFinite(wMar)) wMar = 0.1;

      teamIds.forEach(function (tid) {
        var key = String(tid);
        var s =
          wCat * toNumber(categoryZ.get(key)) +
          wRat * toNumber(ratingZ.get(key)) +
          wPts * toNumber(ptsZ.get(key)) +
          wMar * toNumber(marginZ.get(key));
        weeklyPerfScore.set(key, s);
      });

      teamIds.forEach(function (tid) {
        var prev = statEwmaByTeam.get(String(tid)) || 0;
        var curr = weeklyPerfScore.get(String(tid)) || 0;
        var next = opts.ewmaAlpha * curr + (1 - opts.ewmaAlpha) * prev;
        statEwmaByTeam.set(String(tid), next);
      });

      // Elo updates from matchups in this week.
      var ms = msForWeek;
      ms.forEach(function (m) {
        var homeId = String(m.homeTeamId);
        var awayId = String(m.awayTeamId);

        var actual = computeMatchupActualScore(m, opts.eloMarginWeight);
        if (!actual) return;

        var homeElo = eloByTeam.get(homeId);
        var awayElo = eloByTeam.get(awayId);
        if (!isFinite(homeElo) || !isFinite(awayElo)) return;

        var expHome = expectedScore(homeElo, awayElo, opts.eloScale);
        var expAway = 1 - expHome;
        var K = computeKFactor(opts.baseK, opts.marginKMultiplier, m);

        // Record the expected score + K for the team/week if not already set.
        if (!matchupParamsByTeam.has(homeId)) {
          matchupParamsByTeam.set(homeId, {
            expected: expHome,
            K: K,
            opponentId: awayId,
          });
        }
        if (!matchupParamsByTeam.has(awayId)) {
          matchupParamsByTeam.set(awayId, {
            expected: expAway,
            K: K,
            opponentId: homeId,
          });
        }

        var newHome = homeElo + K * (actual.home - expHome);
        var newAway = awayElo + K * (actual.away - expAway);

        eloByTeam.set(homeId, newHome);
        eloByTeam.set(awayId, newAway);
      });

      // Build per-team week updates.
      var teamSnapshots = teamIds.map(function (tid) {
        var tidKey = String(tid);
        var pre = eloPreByTeam.get(tidKey);
        var post = eloByTeam.get(tidKey);
        var meta = matchupParamsByTeam.get(tidKey);
        return {
          gshlTeamId: tidKey,
          weekId: weekId,
          powerElo: post,
          powerEloPre: pre,
          powerEloPost: post,
          powerEloDelta:
            isFinite(toNumber(post)) && isFinite(toNumber(pre))
              ? toNumber(post) - toNumber(pre)
              : 0,
          powerEloExpected:
            meta && meta.expected !== undefined && meta.expected !== null
              ? meta.expected
              : "",
          powerEloK:
            meta && meta.K !== undefined && meta.K !== null ? meta.K : "",
          powerStatScore: weeklyPerfScore.get(tidKey) || 0,
          powerStatEwma: statEwmaByTeam.get(tidKey) || 0,
        };
      });

      // Normalize Elo into z-space for composite.
      var eloVals = teamSnapshots.map(function (s) {
        return toNumber(s.powerElo);
      });
      var eloMean =
        eloVals.reduce(function (a, b) {
          return a + b;
        }, 0) / Math.max(1, eloVals.length);
      var eloVar = 0;
      for (var i = 0; i < eloVals.length; i++) {
        eloVar += Math.pow(eloVals[i] - eloMean, 2);
      }
      var eloStd = Math.sqrt(eloVar / Math.max(1, eloVals.length));
      if (!eloStd || !isFinite(eloStd)) eloStd = 1;

      // Compute composite + ranking.
      teamSnapshots.forEach(function (s) {
        var eloZ = (toNumber(s.powerElo) - eloMean) / eloStd;
        var statZ = toNumber(s.powerStatEwma);
        s.powerComposite = opts.wElo * eloZ + opts.wStat * statZ;
        // Keep `powerRating` aligned with composite for now.
        s.powerRating = s.powerComposite;
      });

      teamSnapshots.sort(function (a, b) {
        return toNumber(b.powerComposite) - toNumber(a.powerComposite);
      });

      teamSnapshots.forEach(function (s, idx) {
        s.powerRk = idx + 1;
      });

      weekUpdates = weekUpdates.concat(teamSnapshots);
    });

    if (opts.dryRun) {
      return {
        updatedWeekRows: weekUpdates.length,
        updatedSeasonRows: 0,
        dryRun: true,
      };
    }

    // Write TeamWeekStatLine updates.
    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamWeekStatLine",
      ["gshlTeamId", "weekId"],
      weekUpdates,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
        merge: true,
      },
    );

    // Update TeamSeasonStatLine (RS only for now): take last week snapshot.
    var lastWeekId = String(weeks[weeks.length - 1].id);
    var lastWeekRows = weekUpdates.filter(function (u) {
      return String(u.weekId) === lastWeekId;
    });

    var seasonUpdates = lastWeekRows.map(function (u) {
      return {
        gshlTeamId: u.gshlTeamId,
        seasonId: String(seasonKey),
        seasonType: String(opts.seasonType),
        powerElo: u.powerElo,
        powerStatEwma: u.powerStatEwma,
        powerComposite: u.powerComposite,
        powerRating: u.powerRating,
        powerRk: u.powerRk,
      };
    });

    upsertSheetByKeys(
      TEAMSTATS_SPREADSHEET_ID,
      "TeamSeasonStatLine",
      ["gshlTeamId", "seasonId", "seasonType"],
      seasonUpdates,
      {
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
        merge: true,
      },
    );

    if (opts.logToConsole) {
      console.log(
        "[PowerRankingsAlgo] updated TeamWeekStatLine rows=",
        weekUpdates.length,
        "TeamSeasonStatLine rows=",
        seasonUpdates.length,
      );
    }

    return {
      updatedWeekRows: weekUpdates.length,
      updatedSeasonRows: seasonUpdates.length,
      dryRun: false,
    };
  }

  return {
    ensurePowerRankingColumns: ensurePowerRankingColumns,
    updatePowerRankingsForSeason: updatePowerRankingsForSeason,
  };
})();
