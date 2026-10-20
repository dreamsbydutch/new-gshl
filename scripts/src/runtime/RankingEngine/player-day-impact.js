// @ts-nocheck
var RankingEngine = RankingEngine || {};

(function (ns) {
  "use strict";
  var VERSION = "gshl-player-day-impact-experiment-v1";
  var KERNEL_VERSION = "gshl-player-day-impact-experiment-v2";
  var SKATER = ["G", "A", "P", "PM", "PIM", "PPP", "SOG", "HIT", "BLK"];
  var GOALIE = ["W", "GAA", "SVP", "SV", "SO", "GA", "SA"];
  var RAW_GOALIE = ["W", "GA", "SV", "SA", "SO", "TOI"];
  var fittedModels = new WeakSet();
  var goalieCache = new WeakMap();
  var combinedGroupCache = new WeakMap();
  function finite(x) {
    return typeof x === "number" && isFinite(x);
  }
  function raw(x) {
    return x && x.raw ? x.raw : x;
  }
  function role(x) {
    return x.role === "goalie" || x.posGroup === "G" ? "goalie" : "skater";
  }
  function validDate(x) {
    return (
      typeof x === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(x) &&
      new Date(x + "T00:00:00Z").toISOString().slice(0, 10) === x
    );
  }
  function available(x, fields) {
    var r = raw(x);
    return (
      !!r &&
      fields.every(function (k) {
        return (
          finite(r[k]) &&
          (k === "TOI" || Number.isInteger(r[k])) &&
          (k === "PM" || r[k] >= 0) &&
          (!x.availableFields || x.availableFields.indexOf(k) !== -1)
        );
      })
    );
  }
  function sourceProblem(row, game) {
    var r = raw(row);
    if (!r) return "Missing raw source";
    var fields = SKATER.concat(RAW_GOALIE);
    if (
      row.GP === 0 &&
      (row.GS > 0 ||
        r.GS > 0 ||
        fields.some(function (k) {
          return available(row, [k]) && r[k] !== 0;
        }))
    )
      return "Zero appearances contradict recorded activity";
    for (var i = 0; i < fields.length; i++) {
      var k = fields[i],
        value = r[k];
      if (
        value === undefined ||
        value === null ||
        (row.availableFields && row.availableFields.indexOf(k) === -1)
      )
        continue;
      if (
        !finite(value) ||
        (k !== "PM" && value < 0) ||
        (k !== "TOI" && !Number.isInteger(value))
      )
        return "Invalid raw source: " + k;
    }
    if (available(row, ["SV", "SA"]) && r.SV > r.SA)
      return "Saves exceed shots against";
    var games = row.GP === undefined ? (game ? 1 : null) : row.GP;
    if (
      games !== null &&
      ["W", "SO"].some(function (k) {
        return available(row, [k]) && r[k] > games;
      })
    )
      return "Wins or shutouts exceed appearances";
    return null;
  }
  function freeze(x) {
    if (x && typeof x === "object" && !Object.isFrozen(x)) {
      Object.keys(x).forEach(function (k) {
        freeze(x[k]);
      });
      Object.freeze(x);
    }
    return x;
  }
  function precision(p) {
    if (!p) throw new Error("Explicit ratio precision required");
    var result = Object.assign({}, p);
    ["GAA", "SVP"].forEach(function (k) {
      if (!Number.isInteger(result[k]) || result[k] < 0 || result[k] > 10)
        throw new Error("Invalid ratio precision");
    });
    return result;
  }
  function rounded(x, digits) {
    return Number(x.toFixed(digits));
  }
  function compare(a, b, lower) {
    return a === b ? 0.5 : (lower ? a < b : a > b) ? 1 : 0;
  }
  function required(c) {
    return c === "GAA" ? ["GA", "TOI"] : c === "SVP" ? ["SV", "SA"] : [c];
  }
  function qualification(categories) {
    if (
      !Array.isArray(categories) ||
      !categories.length ||
      new Set(categories).size !== categories.length ||
      categories.some(function (c) {
        return GOALIE.indexOf(c) === -1;
      })
    )
      throw new Error("Explicit goalie qualification categories required");
    return categories.slice();
  }
  function utility(c, own, opp, ownGames, oppGames, minimum, p, qualified) {
    if (qualified.indexOf(c) !== -1) {
      var a = ownGames >= minimum,
        b = oppGames >= minimum;
      if (!a && !b) return 0.5;
      if (!a) return 0;
      if (!b) return 1;
    }
    if (!available(own, required(c)) || !available(opp, required(c)))
      return null;
    var left = raw(own),
      right = raw(opp),
      av,
      bv;
    if (c === "GAA") {
      if (left.TOI <= 0 || right.TOI <= 0) return null;
      av = rounded((left.GA * 60) / left.TOI, p.GAA);
      bv = rounded((right.GA * 60) / right.TOI, p.GAA);
    } else if (c === "SVP") {
      if (left.SA <= 0 || right.SA <= 0) return null;
      av = rounded(left.SV / left.SA, p.SVP);
      bv = rounded(right.SV / right.SA, p.SVP);
    } else {
      av = left[c];
      bv = right[c];
    }
    return compare(av, bv, c === "GAA" || c === "GA");
  }
  function qualificationMode(c, ownGames, oppGames, minimum, qualified) {
    if (qualified.indexOf(c) === -1) return -1;
    var a = ownGames >= minimum,
      b = oppGames >= minimum;
    return !a && !b ? 0.5 : !a ? 0 : !b ? 1 : -1;
  }
  function prepareGoalieCategory(model, group, c, minimum) {
    var cache;
    // Only models deep-frozen by this API are cached. Mutable/deserialized input
    // models are recomputed so later caller changes cannot leave stale results.
    if (fittedModels.has(model)) {
      var groups = goalieCache.get(model);
      if (!groups) {
        groups = new WeakMap();
        goalieCache.set(model, groups);
      }
      cache = groups.get(group);
      if (!cache) {
        cache = new Map();
        groups.set(group, cache);
      }
      var key = c + ":" + minimum;
      if (cache.has(key)) return cache.get(key);
    }
    var fields = required(c),
      prepared = [];
    for (var i = 0; i < group.goalies.length; i++) {
      var ctx = group.goalies[i];
      if (
        ctx.categories.indexOf(c) === -1 ||
        !fields.every(function (k) {
          return ctx.fields.indexOf(k) !== -1;
        })
      )
        continue;
      var before = utility(
        c,
        ctx.own,
        ctx.opp,
        ctx.ownGames,
        ctx.oppGames,
        minimum,
        model.ratioPrecision,
        model.qualificationCategories,
      );
      if (before === null) continue;
      var beforeMode = qualificationMode(
        c,
        ctx.ownGames,
        ctx.oppGames,
        minimum,
        model.qualificationCategories,
      );
      var afterMode = qualificationMode(
        c,
        ctx.ownGames + 1,
        ctx.oppGames,
        minimum,
        model.qualificationCategories,
      );
      var opponent = null;
      if (available(ctx.opp, fields)) {
        if (c === "GAA" && ctx.opp.TOI > 0)
          opponent = rounded(
            (ctx.opp.GA * 60) / ctx.opp.TOI,
            model.ratioPrecision.GAA,
          );
        else if (c === "SVP" && ctx.opp.SA > 0)
          opponent = rounded(ctx.opp.SV / ctx.opp.SA, model.ratioPrecision.SVP);
        else if (c !== "GAA" && c !== "SVP") opponent = ctx.opp[c];
      }
      prepared.push({
        own: ctx.own,
        weight: ctx.weight,
        before: before,
        beforeMode: beforeMode,
        afterMode: afterMode,
        opponent: opponent,
      });
    }
    if (cache) cache.set(key, prepared);
    return prepared;
  }
  function updatedGoalieUtility(ctx, c, row, p) {
    if (ctx.afterMode !== -1) return ctx.afterMode;
    if (ctx.opponent === null) return null;
    var numerator =
      ctx.own[c === "GAA" ? "GA" : c === "SVP" ? "SV" : c] +
      row[c === "GAA" ? "GA" : c === "SVP" ? "SV" : c];
    if (!finite(numerator) || !Number.isInteger(numerator) || numerator < 0)
      return null;
    var value = numerator;
    if (c === "GAA" || c === "SVP") {
      var denominator =
        ctx.own[c === "GAA" ? "TOI" : "SA"] + row[c === "GAA" ? "TOI" : "SA"];
      if (c === "GAA" && denominator < 0 && denominator >= -1e-8)
        denominator = 0;
      if (
        !finite(denominator) ||
        denominator <= 0 ||
        (c === "SVP" && !Number.isInteger(denominator))
      )
        return null;
      value =
        c === "GAA"
          ? rounded((numerator * 60) / denominator, p.GAA)
          : rounded(numerator / denominator, p.SVP);
    }
    return compare(value, ctx.opponent, c === "GAA" || c === "GA");
  }
  function alter(base, row, sign, fields) {
    var out = Object.assign({}, raw(base));
    fields.forEach(function (k) {
      out[k] += sign * raw(row)[k];
      if (k === "TOI" && out[k] < 0 && out[k] >= -1e-8) out[k] = 0;
    });
    return out;
  }
  function makeCdf(entries) {
    var merged = new Map();
    entries.forEach(function (e) {
      merged.set(e.value, (merged.get(e.value) || 0) + e.weight);
    });
    var values = Array.from(merged.keys()).sort(function (a, b) {
      return a - b;
    });
    var total = 0;
    var cumulative = values.map(function (v) {
      total += merged.get(v);
      return total;
    });
    var mean =
      entries.reduce(function (s, e) {
        return s + e.weight * e.value;
      }, 0) / total;
    var variance =
      entries.reduce(function (s, e) {
        return s + e.weight * Math.pow(e.value - mean, 2);
      }, 0) / total;
    return {
      values: values,
      cumulative: cumulative,
      weight: total,
      samples: entries.length,
      mean: mean,
      standardDeviation: Math.sqrt(variance),
    };
  }
  function probability(cdf, threshold, inclusive) {
    var lo = 0,
      hi = cdf.values.length;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (
        cdf.values[mid] < threshold ||
        (inclusive && cdf.values[mid] === threshold)
      )
        lo = mid + 1;
      else hi = mid;
    }
    return lo ? cdf.cumulative[lo - 1] / cdf.weight : 0;
  }
  function normalCdf(x) {
    // Abramowitz-Stegun 7.1.26; absolute approximation error below 1.5e-7.
    var z = Math.abs(x) / Math.sqrt(2),
      t = 1 / (1 + 0.3275911 * z);
    var erf =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-z * z);
    return 0.5 * (1 + (x < 0 ? -erf : erf));
  }
  function marginUtility(cdf, x, countModel) {
    if (countModel === "normal" && cdf.standardDeviation > 0) {
      var location = cdf.mean + x;
      return (
        0.5 *
        (normalCdf((location - 0.5) / cdf.standardDeviation) +
          normalCdf((location + 0.5) / cdf.standardDeviation))
      );
    }
    return 1 - 0.5 * (probability(cdf, -x, true) + probability(cdf, -x, false));
  }
  function scheduleGroup(model, exposure) {
    var cache;
    if (fittedModels.has(model)) {
      cache = combinedGroupCache.get(model);
      if (!cache) {
        cache = new Map();
        combinedGroupCache.set(model, cache);
      }
      if (cache.has(exposure)) {
        var existing = cache.get(exposure);
        cache.delete(exposure);
        cache.set(exposure, existing);
        return existing;
      }
    }
    var keys = Object.keys(model.groups).sort(function (a, b) {
      return Number(a) - Number(b);
    });
    if (!keys.length) return null;
    var squares = keys.map(function (k) {
      return Math.pow(Math.log(Number(k)) - Math.log(exposure), 2);
    });
    var minimumSquare = Math.min.apply(null, squares);
    var group = { counts: {}, goalies: [], categorySupport: {} },
      atoms = {},
      sources = [];
    var weightedSides = 0,
      squaredWeightSides = 0,
      sourceSides = 0;
    keys.forEach(function (k, i) {
      // Subtract the maximum log weight before exponentiation. This equivalent
      // squared-distance form also survives arbitrarily narrow positive h.
      var delta = Math.max(0, squares[i] - minimumSquare);
      var weight =
        delta === 0
          ? 1
          : Math.exp(
              (-0.5 * delta) /
                model.exposureBandwidth /
                model.exposureBandwidth,
            );
      var source = model.groups[k],
        sides = source.sourceSideWeeks;
      sources.push({
        nhlGamesPerTeam: Number(k),
        relativeKernelWeight: weight,
        sourceSideWeeks: sides,
      });
      sourceSides += sides;
      weightedSides += sides * weight;
      squaredWeightSides += sides * weight * weight;
      if (!weight) return;
      Object.keys(source.counts).forEach(function (c) {
        if (!atoms[c]) atoms[c] = [];
        var d = source.counts[c];
        d.values.forEach(function (value, index) {
          var atomWeight =
            (d.cumulative[index] - (index ? d.cumulative[index - 1] : 0)) *
            weight;
          if (atomWeight > 0)
            atoms[c].push({ value: value, weight: atomWeight });
        });
      });
      source.goalies.forEach(function (ctx) {
        var w = ctx.weight * weight;
        if (w > 0) group.goalies.push(Object.assign({}, ctx, { weight: w }));
      });
    });
    Object.keys(atoms).forEach(function (c) {
      if (atoms[c].length) group.counts[c] = makeCdf(atoms[c]);
    });
    SKATER.forEach(function (c) {
      group.categorySupport[c] = group.counts[c] ? group.counts[c].weight : 0;
    });
    GOALIE.forEach(function (c) {
      group.categorySupport[c] = group.goalies.reduce(function (s, ctx) {
        return (
          s +
          (ctx.categories.indexOf(c) !== -1 &&
          required(c).every(function (k) {
            return ctx.fields.indexOf(k) !== -1;
          })
            ? ctx.weight
            : 0)
        );
      }, 0);
    });
    group.context = {
      contextModel: "schedule-kernel",
      exposureBandwidth: model.exposureBandwidth,
      targetNhlGamesPerTeam: exposure,
      sourceExposureRange: [Number(keys[0]), Number(keys[keys.length - 1])],
      extrapolated:
        exposure < Number(keys[0]) || exposure > Number(keys[keys.length - 1]),
      sourceSideWeeks: sourceSides,
      effectiveSourceSideWeeks:
        (weightedSides * weightedSides) / squaredWeightSides,
      supportMeaning:
        "Kish effective side-week count describes exposure weights only; per-category support reports relative weighted mass, not independent observations",
      sources: sources,
    };
    freeze(group);
    if (cache) {
      cache.set(exposure, group);
      // Eviction only drops invariant work; scoring and all source weights stay
      // identical on recomputation. Weak goalie caches permit evicted groups GC.
      if (cache.size > 8) cache.delete(cache.keys().next().value);
    }
    return group;
  }
  function fitContexts(contexts, options) {
    var opts = options || {};
    var weighting = opts.backgroundWeighting || "side-week",
      countModel = opts.countModel || "empirical";
    var contextModel = opts.contextModel || "week-days";
    if (["week-days", "schedule-kernel"].indexOf(contextModel) === -1)
      throw new Error("Unknown context model");
    if (
      contextModel === "schedule-kernel" &&
      (!finite(opts.exposureBandwidth) ||
        opts.exposureBandwidth <= 0 ||
        opts.maxGoalieContexts !== undefined)
    )
      throw new Error(
        "Positive exposure bandwidth and uncapped contexts required",
      );
    if (
      ["side-week", "appearance"].indexOf(weighting) === -1 ||
      ["empirical", "normal"].indexOf(countModel) === -1
    )
      throw new Error("Unknown background or counting model");
    var p = precision(opts.ratioPrecision),
      qualified = qualification(opts.qualificationCategories);
    if (!validDate(opts.trainedBefore))
      throw new Error("trainedBefore date required");
    if (
      opts.maxGoalieContexts !== undefined &&
      (!Number.isInteger(opts.maxGoalieContexts) || opts.maxGoalieContexts < 1)
    )
      throw new Error("Invalid goalie context cap");
    var groups = {},
      dates = [],
      seen = new Set(),
      excluded = { future: 0, noRoleAppearances: 0 };
    contexts.forEach(function (context) {
      if (!validDate(context.endDate))
        throw new Error("Context endDate required");
      if (context.endDate >= opts.trainedBefore) {
        excluded.future++;
        return;
      }
      var key = context.matchupId;
      if (!key || seen.has(key))
        throw new Error("Duplicate or missing matchup identity");
      seen.add(key);
      var days = context.configuredGameDays || context.calendarDays;
      if (
        !Number.isInteger(days) ||
        days <= 0 ||
        !Array.isArray(context.categories)
      )
        throw new Error("Invalid context metadata");
      var groupKey = days;
      if (contextModel === "schedule-kernel") {
        if (!finite(context.nhlGamesPerTeam) || context.nhlGamesPerTeam <= 0)
          throw new Error("Positive historical NHL schedule exposure required");
        groupKey = context.nhlGamesPerTeam;
      }
      dates.push(context.endDate);
      if (!groups[groupKey]) groups[groupKey] = { counts: {}, goalies: [] };
      var group = groups[groupKey];
      if (contextModel === "schedule-kernel")
        group.sourceSideWeeks = (group.sourceSideWeeks || 0) + 2;
      ["home", "away"].forEach(function (side) {
        var own = context[side],
          opp = context[side === "home" ? "away" : "home"];
        if (
          !own ||
          !opp ||
          !Array.isArray(own.appearances) ||
          !Array.isArray(opp.appearances)
        )
          throw new Error("Context sides required");
        own.appearances.concat(opp.appearances).forEach(function (a) {
          var issue = sourceProblem(a, true);
          if (issue) throw new Error(issue);
        });
        var skaters = own.appearances.filter(function (a) {
          return a.role === "skater";
        });
        var goalies = own.appearances.filter(function (a) {
          return a.role === "goalie";
        });
        if (!skaters.length) excluded.noRoleAppearances++;
        SKATER.forEach(function (c) {
          if (context.categories.indexOf(c) === -1 || !skaters.length) return;
          if (
            !available(own, [c]) ||
            !available(opp, [c]) ||
            !own.appearances
              .filter(function (a) {
                return a.role === "skater";
              })
              .every(function (a) {
                return available(a, [c]);
              }) ||
            !opp.appearances
              .filter(function (a) {
                return a.role === "skater";
              })
              .every(function (a) {
                return available(a, [c]);
              })
          )
            return;
          if (!group.counts[c]) group.counts[c] = [];
          skaters.forEach(function (appearance) {
            group.counts[c].push({
              value: own.raw[c] - appearance.raw[c] - opp.raw[c],
              weight: weighting === "appearance" ? 1 : 1 / skaters.length,
            });
          });
        });
        if (!goalies.length) {
          excluded.noRoleAppearances++;
          return;
        }
        var fields = RAW_GOALIE.filter(function (field) {
          return (
            available(own, [field]) &&
            available(opp, [field]) &&
            goalies.every(function (a) {
              return available(a, [field]);
            }) &&
            opp.appearances
              .filter(function (a) {
                return a.role === "goalie";
              })
              .every(function (a) {
                return available(a, [field]);
              })
          );
        });
        goalies.forEach(function (appearance) {
          var base = alter(own, appearance, -1, fields),
            opposite = {};
          fields.forEach(function (k) {
            opposite[k] = opp.raw[k];
          });
          group.goalies.push({
            own: base,
            opp: opposite,
            ownGames: goalies.length - 1,
            oppGames: opp.appearances.filter(function (a) {
              return a.role === "goalie";
            }).length,
            fields: fields.slice(),
            categories: context.categories.slice(),
            weight: weighting === "appearance" ? 1 : 1 / goalies.length,
          });
        });
      });
    });
    Object.keys(groups).forEach(function (key) {
      var g = groups[key];
      Object.keys(g.counts).forEach(function (c) {
        g.counts[c] = makeCdf(g.counts[c]);
      });
      g.originalGoalieContexts = g.goalies.length;
      g.categorySupport = {};
      SKATER.forEach(function (c) {
        g.categorySupport[c] = g.counts[c] ? g.counts[c].weight : 0;
      });
      GOALIE.forEach(function (c) {
        g.categorySupport[c] = g.goalies.reduce(function (s, ctx) {
          return (
            s +
            (ctx.categories.indexOf(c) !== -1 &&
            required(c).every(function (k) {
              return ctx.fields.indexOf(k) !== -1;
            })
              ? ctx.weight
              : 0)
          );
        }, 0);
      });
      var cap = opts.maxGoalieContexts;
      if (cap && g.goalies.length > cap) {
        var total = g.goalies.reduce(function (s, x) {
            return s + x.weight;
          }, 0),
          selected = [],
          index = 0,
          cum = g.goalies[0].weight;
        for (var i = 0; i < cap; i++) {
          var target = (total * (i + 0.5)) / cap;
          while (cum < target && index < g.goalies.length - 1)
            cum += g.goalies[++index].weight;
          selected.push(
            Object.assign({}, g.goalies[index], { weight: total / cap }),
          );
        }
        g.goalies = selected;
      }
    });
    dates.sort();
    var definition = {
      version: VERSION,
      groups: groups,
      ratioPrecision: p,
      qualificationCategories: qualified,
      countModel: countModel,
      provenance: {
        trainedBefore: opts.trainedBefore,
        earliestEndDate: dates[0] || null,
        latestEndDate: dates[dates.length - 1] || null,
        matchups: seen.size,
        excluded: excluded,
        maxGoalieContexts: opts.maxGoalieContexts || null,
        approximation: !!opts.maxGoalieContexts,
        backgroundWeighting: weighting,
        countModel: countModel,
        weighting:
          weighting === "appearance"
            ? "each observed role appearance equal"
            : "each side/week equal; each role appearance uniform within side",
        baseline: "unfilled role appearance",
        qualificationCategories: qualified.slice(),
      },
    };
    if (contextModel === "schedule-kernel") {
      definition.version = KERNEL_VERSION;
      definition.contextModel = contextModel;
      definition.exposureBandwidth = opts.exposureBandwidth;
      definition.provenance.contextModel = contextModel;
      definition.provenance.exposureBandwidth = opts.exposureBandwidth;
      definition.provenance.exposureCovariate =
        "leaguewide NHL regular-season games times two / NHL teams; historical as-played calendar, not archived pre-week schedule";
    }
    var model = freeze(definition);
    fittedModels.add(model);
    return model;
  }
  function hydrateReference(input) {
    if (
      !input ||
      (input.version !== VERSION && input.version !== KERNEL_VERSION) ||
      ["empirical", "normal"].indexOf(input.countModel) === -1
    )
      throw new Error("Unknown impact model");
    // Artifact authentication belongs to the caller. Validate the numerical
    // structure before giving the detached, frozen reference a persistent cache.
    var model = JSON.parse(JSON.stringify(input));
    if (
      model.version === KERNEL_VERSION &&
      (model.contextModel !== "schedule-kernel" ||
        !finite(model.exposureBandwidth) ||
        model.exposureBandwidth <= 0)
    )
      throw new Error("Invalid saved schedule kernel");
    precision(model.ratioPrecision);
    qualification(model.qualificationCategories);
    if (
      !model.provenance ||
      !validDate(model.provenance.trainedBefore) ||
      !model.groups ||
      Array.isArray(model.groups)
    )
      throw new Error("Invalid saved reference metadata");
    ["earliestEndDate", "latestEndDate"].forEach(function (k) {
      var date = model.provenance[k];
      if (
        date !== null &&
        (!validDate(date) || date >= model.provenance.trainedBefore)
      )
        throw new Error("Invalid saved reference chronology");
    });
    Object.keys(model.groups).forEach(function (days) {
      if (
        !finite(Number(days)) ||
        Number(days) <= 0 ||
        (model.version === VERSION && !Number.isInteger(Number(days)))
      )
        throw new Error("Invalid saved week length");
      var group = model.groups[days];
      if (
        model.version === KERNEL_VERSION &&
        (!Number.isInteger(group.sourceSideWeeks) || group.sourceSideWeeks < 1)
      )
        throw new Error("Invalid saved exposure support");
      if (!group || !group.counts || !Array.isArray(group.goalies))
        throw new Error("Invalid saved context group");
      Object.keys(group.counts).forEach(function (c) {
        var d = group.counts[c];
        if (
          SKATER.indexOf(c) === -1 ||
          !d ||
          !Array.isArray(d.values) ||
          !Array.isArray(d.cumulative) ||
          d.values.length !== d.cumulative.length ||
          !d.values.length ||
          !finite(d.weight) ||
          d.weight <= 0 ||
          !Number.isInteger(d.samples) ||
          d.samples < 1 ||
          !finite(d.mean) ||
          !finite(d.standardDeviation) ||
          d.standardDeviation < 0
        )
          throw new Error("Invalid saved margin distribution");
        d.values.forEach(function (v, i) {
          if (
            !Number.isInteger(v) ||
            (i && v <= d.values[i - 1]) ||
            !finite(d.cumulative[i]) ||
            d.cumulative[i] <= (i ? d.cumulative[i - 1] : 0)
          )
            throw new Error("Invalid saved margin CDF");
        });
        if (d.cumulative[d.cumulative.length - 1] !== d.weight)
          throw new Error("Invalid saved margin weight");
      });
      group.goalies.forEach(function (ctx) {
        if (
          !ctx ||
          !Array.isArray(ctx.fields) ||
          new Set(ctx.fields).size !== ctx.fields.length ||
          ctx.fields.some(function (k) {
            return RAW_GOALIE.indexOf(k) === -1;
          }) ||
          !Array.isArray(ctx.categories) ||
          ctx.categories.some(function (c) {
            return SKATER.indexOf(c) === -1 && GOALIE.indexOf(c) === -1;
          }) ||
          !Number.isInteger(ctx.ownGames) ||
          ctx.ownGames < 0 ||
          !Number.isInteger(ctx.oppGames) ||
          ctx.oppGames < 0 ||
          !finite(ctx.weight) ||
          ctx.weight <= 0 ||
          !available(ctx.own, ctx.fields) ||
          !available(ctx.opp, ctx.fields)
        )
          throw new Error("Invalid saved goalie context");
      });
    });
    freeze(model);
    fittedModels.add(model);
    return model;
  }
  function result(
    contributions,
    reasons,
    support,
    started,
    noAppearance,
    qualificationContributions,
  ) {
    var ok = !reasons.length,
      total = Object.keys(contributions).reduce(function (s, c) {
        return s + contributions[c];
      }, 0);
    return {
      status: noAppearance ? "no-appearance" : ok ? "rated" : "unavailable",
      ifStarted: ok ? total : null,
      counted: started === false ? 0 : ok ? total : null,
      categoryContributions: contributions,
      reasons: reasons,
      support: support,
      qualificationContributions: qualificationContributions || {},
    };
  }
  function validateTarget(row, opts) {
    if (
      !Array.isArray(opts.categories) ||
      !opts.categories.length ||
      new Set(opts.categories).size !== opts.categories.length ||
      opts.categories.some(function (c) {
        return SKATER.indexOf(c) === -1 && GOALIE.indexOf(c) === -1;
      })
    )
      throw new Error("Invalid target categories");
    if (!Number.isInteger(opts.goalieMinimum) || opts.goalieMinimum < 1)
      throw new Error("Invalid goalie minimum");
    if (!finite(row.GP) || (row.GP !== 0 && row.GP !== 1))
      throw new Error("Daily GP must be zero or one");
  }
  function score(row, model, options) {
    var opts = options || {};
    validateTarget(row, opts);
    if (!Number.isInteger(opts.weekDays) || opts.weekDays < 1)
      throw new Error("Invalid target week length");
    if (
      !model ||
      (model.version !== VERSION && model.version !== KERNEL_VERSION) ||
      ["empirical", "normal"].indexOf(model.countModel) === -1
    )
      throw new Error("Unknown impact model");
    if (
      model.version === KERNEL_VERSION &&
      (model.contextModel !== "schedule-kernel" ||
        !finite(model.exposureBandwidth) ||
        model.exposureBandwidth <= 0)
    )
      throw new Error("Invalid schedule kernel model");
    var contributions = {},
      reasons = [],
      support = {},
      qualificationContributions = {},
      goalie = role(row) === "goalie";
    opts.categories.forEach(function (c) {
      contributions[c] = 0;
      qualificationContributions[c] = 0;
    });
    var issue = sourceProblem(row, true);
    if (issue)
      return result(contributions, [issue], support, opts.started, false);
    if (!row.GP) return result(contributions, [], support, opts.started, true);
    if (
      row.date !== undefined &&
      (!validDate(row.date) || model.provenance.trainedBefore > row.date)
    )
      return result(
        contributions,
        ["Model cutoff is later than target daily date"],
        support,
        opts.started,
        false,
      );
    var kernel = model.version === KERNEL_VERSION;
    if (kernel && (!finite(opts.nhlGamesPerTeam) || opts.nhlGamesPerTeam <= 0))
      return result(
        contributions,
        ["Positive target NHL schedule exposure required"],
        support,
        opts.started,
        false,
      );
    var group = kernel
      ? scheduleGroup(model, opts.nhlGamesPerTeam)
      : model.groups[opts.weekDays];
    if (!group)
      return result(
        contributions,
        [
          kernel
            ? "No earlier schedule-exposure contexts"
            : "No earlier matching week-length contexts",
        ],
        support,
        opts.started,
        false,
      );
    opts.categories.forEach(function (c) {
      if ((goalie ? GOALIE : SKATER).indexOf(c) === -1) return;
      if (!available(row, required(c))) {
        reasons.push("Missing daily source: " + c);
        return;
      }
      if (!goalie) {
        var cdf = group.counts[c];
        if (!cdf || !cdf.weight) {
          reasons.push("No earlier category context: " + c);
          return;
        }
        contributions[c] =
          marginUtility(cdf, raw(row)[c], model.countModel) -
          marginUtility(cdf, 0, model.countModel);
        support[c] = cdf.weight;
      } else {
        var sum = 0,
          qualificationSum = 0,
          weight = 0;
        var contexts = prepareGoalieCategory(
          model,
          group,
          c,
          opts.goalieMinimum,
        );
        var dailyRaw = raw(row);
        for (var i = 0; i < contexts.length; i++) {
          var ctx = contexts[i];
          var after = updatedGoalieUtility(
            ctx,
            c,
            dailyRaw,
            model.ratioPrecision,
          );
          if (after === null) continue;
          var unchangedQualification =
            ctx.beforeMode === -1 ? after : ctx.beforeMode;
          sum += ctx.weight * (after - ctx.before);
          qualificationSum += ctx.weight * (after - unchangedQualification);
          weight += ctx.weight;
        }
        if (!weight) reasons.push("No earlier usable goalie context: " + c);
        else {
          contributions[c] = sum / weight;
          qualificationContributions[c] = qualificationSum / weight;
          support[c] = weight;
        }
      }
    });
    var scored = result(
      contributions,
      reasons,
      support,
      opts.started,
      false,
      qualificationContributions,
    );
    if (kernel) scored.context = group.context;
    return scored;
  }
  function actualImpact(row, own, opp, options) {
    var opts = options || {};
    validateTarget(row, opts);
    var p = precision(opts.ratioPrecision),
      qualified = qualification(opts.qualificationCategories),
      contributions = {},
      reasons = [],
      support = {},
      qualificationContributions = {},
      goalie = role(row) === "goalie";
    opts.categories.forEach(function (c) {
      contributions[c] = 0;
      qualificationContributions[c] = 0;
    });
    var issue =
      sourceProblem(row, true) ||
      sourceProblem(own, false) ||
      sourceProblem(opp, false);
    if (issue)
      return result(contributions, [issue], support, opts.started, false);
    if (!row.GP || opts.started === false)
      return result(contributions, [], support, opts.started, !row.GP);
    if (
      !Number.isInteger(own.goalieAppearances) ||
      !Number.isInteger(opp.goalieAppearances) ||
      own.goalieAppearances < (goalie ? 1 : 0) ||
      opp.goalieAppearances < 0
    )
      throw new Error("Actual goalie appearance counts required");
    opts.categories.forEach(function (c) {
      if ((goalie ? GOALIE : SKATER).indexOf(c) === -1) return;
      var fields = required(c);
      if (
        !available(row, fields) ||
        !available(own, fields) ||
        !available(opp, fields)
      ) {
        reasons.push("Missing actual source: " + c);
        return;
      }
      var without = alter(own, row, -1, fields);
      if (
        fields.some(function (k) {
          return k !== "PM" && without[k] < 0;
        })
      ) {
        reasons.push("Appearance exceeds own final total: " + c);
        return;
      }
      var before = utility(
        c,
        without,
        opp,
        own.goalieAppearances - (goalie ? 1 : 0),
        opp.goalieAppearances,
        opts.goalieMinimum,
        p,
        qualified,
      );
      var after = utility(
        c,
        own,
        opp,
        own.goalieAppearances,
        opp.goalieAppearances,
        opts.goalieMinimum,
        p,
        qualified,
      );
      if (before === null || after === null)
        reasons.push("Undefined actual ratio: " + c);
      else {
        contributions[c] = after - before;
        var unchangedQualification = utility(
          c,
          own,
          opp,
          own.goalieAppearances - (goalie ? 1 : 0),
          opp.goalieAppearances,
          opts.goalieMinimum,
          p,
          qualified,
        );
        if (unchangedQualification !== null)
          qualificationContributions[c] = after - unchangedQualification;
        support[c] = 1;
      }
    });
    return result(
      contributions,
      reasons,
      support,
      opts.started,
      false,
      qualificationContributions,
    );
  }
  ns.PlayerDayImpact = {
    fitContexts: fitContexts,
    hydrateReference: hydrateReference,
    score: score,
    actualImpact: actualImpact,
  };
})(RankingEngine);
