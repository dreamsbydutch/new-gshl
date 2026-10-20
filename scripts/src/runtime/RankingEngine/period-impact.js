// @ts-nocheck
var RankingEngine = RankingEngine || {};
(function (ns) {
  "use strict";
  var VERSION = "gshl-period-category-impact-v1";
  var SK = ["G", "A", "P", "PM", "PIM", "PPP", "SOG", "HIT", "BLK"];
  var GK = ["W", "GAA", "SV", "SVP", "SO"];
  var GR = ["W", "GA", "SV", "SA", "SO", "TOI"];
  var caches = new WeakMap();
  var fittedModels = new WeakSet();
  var subsetCache = new Map(),
    subsetStates = 0;
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }
  function freeze(o) {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.keys(o).forEach(function (k) {
        freeze(o[k]);
      });
      Object.freeze(o);
    }
    return o;
  }
  function required(c) {
    return c === "GAA" ? ["GA", "TOI"] : c === "SVP" ? ["SV", "SA"] : [c];
  }
  function available(o, fields) {
    return (
      !!o &&
      fields.every(function (k) {
        return (
          finite(o.raw[k]) &&
          (k === "PM" || o.raw[k] >= 0) &&
          (k === "TOI" || Number.isInteger(o.raw[k])) &&
          (!o.availableFields || o.availableFields.indexOf(k) !== -1)
        );
      })
    );
  }
  function compare(a, b, lower) {
    return a === b ? 0.5 : (lower ? a < b : a > b) ? 1 : 0;
  }
  function numericValue(c, raw, model) {
    if (c === "GAA")
      return raw.TOI > 0
        ? Number(((raw.GA * 60) / raw.TOI).toFixed(model.ratioPrecision.GAA))
        : null;
    if (c === "SVP")
      return raw.SA > 0
        ? Number((raw.SV / raw.SA).toFixed(model.ratioPrecision.SVP))
        : null;
    return raw[c];
  }
  function mode(c, n, other, min, q) {
    return q.indexOf(c) === -1
      ? -1
      : n < min
        ? other < min
          ? 0.5
          : 0
        : other < min
          ? 1
          : -1;
  }
  function u(c, a, b, n, other, min, model) {
    var qualification = mode(c, n, other, min, model.qualificationCategories);
    if (qualification !== -1) return qualification;
    if (
      !available({ raw: a }, required(c)) ||
      !available({ raw: b }, required(c))
    )
      return null;
    var av = a[c],
      bv = b[c];
    if (c === "GAA") {
      if (a.TOI <= 0 || b.TOI <= 0) return null;
      av = Number(((a.GA * 60) / a.TOI).toFixed(model.ratioPrecision.GAA));
      bv = Number(((b.GA * 60) / b.TOI).toFixed(model.ratioPrecision.GAA));
    }
    if (c === "SVP") {
      if (a.SA <= 0 || b.SA <= 0) return null;
      av = Number((a.SV / a.SA).toFixed(model.ratioPrecision.SVP));
      bv = Number((b.SV / b.SA).toFixed(model.ratioPrecision.SVP));
    }
    return compare(av, bv, c === "GAA");
  }
  function roleRows(side, role) {
    return side.appearances
      .filter(function (a) {
        return a.role === role;
      })
      .map(function (a) {
        var fields = (role === "skater" ? SK : GR).filter(function (f) {
            return available(a, [f]);
          }),
          raw = {};
        fields.forEach(function (f) {
          raw[f] = a.raw[f];
        });
        return { raw: raw, availableFields: fields };
      });
  }
  function sourceHas(source, role, fields) {
    return (
      available({ raw: source.own }, fields) &&
      available({ raw: source.opp }, fields) &&
      source[role].every(function (a) {
        return available(a, fields);
      }) &&
      source[role === "skaters" ? "opponentSkaters" : "opponentGoalies"].every(
        function (a) {
          return available(a, fields);
        },
      )
    );
  }
  function fitBlockContexts(contexts, options) {
    var opts = options || {};
    if (
      ["retrospective-fixed", "before-week"].indexOf(opts.referencePolicy) ===
      -1
    )
      throw Error("Explicit period reference policy required");
    if (
      opts.contextModel !== "schedule-kernel" ||
      (opts.countModel && opts.countModel !== "empirical") ||
      opts.maxGoalieContexts !== undefined
    )
      throw Error("Exact uncapped empirical schedule reference required");
    if (!ns.PlayerDayImpact) throw Error("Daily impact runtime required");
    var daily = ns.PlayerDayImpact.fitContexts(contexts, opts);
    var sides = [];
    contexts.forEach(function (m) {
      if (m.endDate >= opts.trainedBefore) return;
      var skaters = {
          home: roleRows(m.home, "skater"),
          away: roleRows(m.away, "skater"),
        },
        goalies = {
          home: roleRows(m.home, "goalie"),
          away: roleRows(m.away, "goalie"),
        },
        raws = { home: { ...m.home.raw }, away: { ...m.away.raw } },
        categories = m.categories.slice();
      ["home", "away"].forEach(function (k) {
        var own = m[k],
          opp = m[k === "home" ? "away" : "home"];
        sides.push({
          own: raws[k],
          opp: raws[k === "home" ? "away" : "home"],
          skaters: skaters[k],
          goalies: goalies[k],
          opponentSkaters: skaters[k === "home" ? "away" : "home"],
          opponentGoalies: goalies[k === "home" ? "away" : "home"],
          categories: categories,
          exposure: m.nhlGamesPerTeam,
        });
      });
    });
    var model = freeze({
      version: VERSION,
      dailyReference: daily,
      sides: sides,
      ratioPrecision: daily.ratioPrecision,
      qualificationCategories: daily.qualificationCategories,
      exposureBandwidth: opts.exposureBandwidth,
      backgroundWeighting: opts.backgroundWeighting || "side-week",
      referencePolicy: opts.referencePolicy,
      provenance: {
        ...daily.provenance,
        referencePolicy: opts.referencePolicy,
        blockBaseline:
          "uniformly remove min(requested,available) observed role appearances; nonempty source-role pools; no heavy-week conditioning",
        wholeTeamWeekBaseline:
          "empty own team versus neutral historical opponent weeks",
        units:
          "expected category points; sum weekly blocks across distinct fantasy weeks; nonadditive within weeks",
        retrospective: opts.referencePolicy === "retrospective-fixed",
      },
    });
    fittedModels.add(model);
    return model;
  }
  function hydrateBlockReference(input) {
    if (
      !input ||
      input.version !== VERSION ||
      ["retrospective-fixed", "before-week"].indexOf(input.referencePolicy) ===
        -1
    )
      throw Error("Unknown period reference");
    var m = JSON.parse(JSON.stringify(input));
    m.dailyReference = ns.PlayerDayImpact.hydrateReference(m.dailyReference);
    if (
      m.exposureBandwidth !== m.dailyReference.exposureBandwidth ||
      JSON.stringify(m.ratioPrecision) !==
        JSON.stringify(m.dailyReference.ratioPrecision) ||
      JSON.stringify(m.qualificationCategories) !==
        JSON.stringify(m.dailyReference.qualificationCategories) ||
      !Array.isArray(m.sides) ||
      m.provenance.trainedBefore !==
        m.dailyReference.provenance.trainedBefore ||
      m.provenance.referencePolicy !== m.referencePolicy
    )
      throw Error("Period reference metadata mismatch");
    m.sides.forEach(function (s) {
      if (
        !finite(s.exposure) ||
        s.exposure <= 0 ||
        !s.own ||
        !s.opp ||
        !Array.isArray(s.categories) ||
        s.categories.some(function (c) {
          return SK.indexOf(c) === -1 && GK.indexOf(c) === -1;
        })
      )
        throw Error("Invalid period source");
      ["skaters", "goalies", "opponentSkaters", "opponentGoalies"].forEach(
        function (k) {
          if (!Array.isArray(s[k])) throw Error("Invalid role appearances");
          s[k].forEach(function (a) {
            if (
              !a.raw ||
              !Array.isArray(a.availableFields) ||
              a.availableFields.some(function (f) {
                return !available(a, [f]);
              })
            )
              throw Error("Invalid period appearance source");
          });
        },
      );
    });
    freeze(m);
    fittedModels.add(m);
    return m;
  }
  function cache(model) {
    var c = caches.get(model);
    if (!c) {
      c = { removals: new Map(), targets: new Map(), opponents: new Map() };
      caches.set(model, c);
    }
    return c;
  }
  function subsetDistribution(values, k) {
    if (!k) return new Map([[0, 1]]);
    if (k === values.length)
      return new Map([
        [
          values.reduce(function (s, x) {
            return s + x;
          }, 0),
          1,
        ],
      ]);
    if (k > values.length / 2) {
      var complement = subsetDistribution(values, values.length - k),
        sum = values.reduce(function (s, x) {
          return s + x;
        }, 0),
        out = new Map();
      complement.forEach(function (p, x) {
        out.set(sum - x, p);
      });
      return out;
    }
    var histogram = new Map();
    values.forEach(function (v) {
      histogram.set(v, (histogram.get(v) || 0) + 1);
    });
    var bins = Array.from(histogram.keys()).sort(function (a, b) {
      return a - b;
    });
    var key = bins
      .map(function (v) {
        return v + ":" + histogram.get(v);
      })
      .join("|");
    var entry = subsetCache.get(key);
    if (entry) {
      subsetCache.delete(key);
      subsetCache.set(key, entry);
    }
    if (!entry || entry.maxK < k) {
      if (entry) {
        subsetStates -= entry.states;
        subsetCache.delete(key);
      }
      var dp = [new Map([[0, 1]])],
        processed = 0;
      bins.forEach(function (v) {
        var count = histogram.get(v),
          next = [];
        for (var j = 0; j <= Math.min(processed, k); j++) {
          if (!dp[j]) continue;
          for (var add = 0; add <= Math.min(count, k - j); add++) {
            var target = j + add;
            if (!next[target]) next[target] = new Map();
            var coefficient = choose(count, add),
              shift = v * add,
              map = next[target];
            dp[j].forEach(function (weight, s) {
              var t = s + shift;
              map.set(t, (map.get(t) || 0) + weight * coefficient);
            });
          }
        }
        processed += count;
        dp = next;
      });
      var states = dp.reduce(function (s, m) {
        return s + m.size;
      }, 0);
      entry = { maxK: k, dp: dp, probabilities: new Map(), states: states };
      subsetCache.set(key, entry);
      subsetStates += states;
    }
    if (!entry.probabilities.has(k)) {
      var total = 0;
      entry.dp[k].forEach(function (p) {
        total += p;
      });
      if (!finite(total) || total <= 0)
        throw Error("Subset coefficient overflow");
      var probabilities = new Map();
      entry.dp[k].forEach(function (p, s) {
        probabilities.set(s, p / total);
      });
      entry.probabilities.set(k, probabilities);
      entry.states += probabilities.size;
      subsetStates += probabilities.size;
    }
    var result = entry.probabilities.get(k);
    // Bound retained polynomial states globally across leave-season-out models.
    // Cache eviction changes only work, never the exact subset distribution.
    while (subsetStates > 250000 && subsetCache.size) {
      var oldest = subsetCache.keys().next().value;
      subsetStates -= subsetCache.get(oldest).states;
      subsetCache.delete(oldest);
    }
    return result;
  }
  function subsets(n, k, visit) {
    var selected = [];
    function walk(from, left) {
      if (!left) {
        visit(selected);
        return;
      }
      for (var i = from; i <= n - left; i++) {
        selected.push(i);
        walk(i + 1, left - 1);
        selected.pop();
      }
    }
    walk(0, k);
  }
  function choose(n, k) {
    var x = 1;
    for (var i = 1; i <= k; i++) x = (x * (n - i + 1)) / i;
    return x;
  }
  function addAtom(map, value, weight) {
    if (weight > 0) map.set(value, (map.get(value) || 0) + weight);
  }
  function cdf(atoms) {
    var values = Array.from(atoms.keys()).sort(function (a, b) {
        return a - b;
      }),
      total = 0;
    return {
      values: values,
      cumulative: values.map(function (v) {
        total += atoms.get(v);
        return total;
      }),
      weight: total,
    };
  }
  function prob(d, t, inclusive) {
    var l = 0,
      h = d.values.length;
    while (l < h) {
      var m = (l + h) >>> 1;
      if (d.values[m] < t || (inclusive && d.values[m] === t)) l = m + 1;
      else h = m;
    }
    return l ? d.cumulative[l - 1] / d.weight : 0;
  }
  function marginal(d, x) {
    return (
      0.5 *
      (prob(d, 0, true) +
        prob(d, 0, false) -
        prob(d, -x, true) -
        prob(d, -x, false))
    );
  }
  function prepareRemoval(model, role, n) {
    var key = role + ":" + n,
      c = cache(model);
    if (c.removals.has(key)) return c.removals.get(key);
    var groups = {};
    model.sides.forEach(function (s) {
      var rows = role === "skater" ? s.skaters : s.goalies,
        m = rows.length;
      if (!m) return;
      var k = Math.min(n, m),
        sideWeight = model.backgroundWeighting === "appearance" ? m : 1;
      if (!groups[s.exposure]) groups[s.exposure] = { counts: {}, goalies: [] };
      var g = groups[s.exposure];
      if (role === "skater") {
        SK.forEach(function (cat) {
          if (
            s.categories.indexOf(cat) === -1 ||
            !sourceHas(s, "skaters", [cat])
          )
            return;
          if (!g.counts[cat]) g.counts[cat] = new Map();
          subsetDistribution(
            rows.map(function (a) {
              return a.raw[cat];
            }),
            k,
          ).forEach(function (p, sum) {
            addAtom(
              g.counts[cat],
              s.own[cat] - sum - s.opp[cat],
              sideWeight * p,
            );
          });
        });
      } else {
        var fields = GR.filter(function (f) {
            return sourceHas(s, "goalies", [f]);
          }),
          weight = sideWeight / choose(m, k);
        subsets(m, k, function (selected) {
          var own = {},
            opp = {};
          fields.forEach(function (f) {
            var removed = selected.reduce(function (sum, index) {
              return sum + rows[index].raw[f];
            }, 0);
            own[f] = s.own[f] - removed;
            if (own[f] < 0 && own[f] >= -1e-8 && f === "TOI") own[f] = 0;
            opp[f] = s.opp[f];
          });
          g.goalies.push({
            own: own,
            opp: opp,
            ownGames: m - k,
            oppGames: s.opponentGoalies.length,
            fields: fields,
            categories: s.categories,
            weight: weight,
          });
        });
      }
    });
    c.removals.set(key, groups);
    return groups;
  }
  function kernelWeights(groups, exposure, h) {
    var keys = Object.keys(groups).sort(function (a, b) {
        return Number(a) - Number(b);
      }),
      squares = keys.map(function (k) {
        return Math.pow(Math.log(Number(k)) - Math.log(exposure), 2);
      });
    var min = Math.min.apply(null, squares);
    return keys.map(function (k, i) {
      var delta = Math.max(0, squares[i] - min);
      return {
        key: k,
        weight: delta === 0 ? 1 : Math.exp((-0.5 * delta) / h / h),
      };
    });
  }
  function targetRemoval(model, role, n, exposure, min) {
    var c = cache(model),
      key = role + ":" + n + ":" + exposure + ":" + min;
    if (c.targets.has(key)) {
      var old = c.targets.get(key);
      c.targets.delete(key);
      c.targets.set(key, old);
      return old;
    }
    var groups = prepareRemoval(model, role, n),
      result = { counts: {}, goalies: {} };
    var weights = kernelWeights(groups, exposure, model.exposureBandwidth);
    SK.forEach(function (cat) {
      var atoms = new Map();
      weights.forEach(function (w) {
        if (w.weight && groups[w.key].counts[cat])
          groups[w.key].counts[cat].forEach(function (p, v) {
            addAtom(atoms, v, p * w.weight);
          });
      });
      if (atoms.size) result.counts[cat] = cdf(atoms);
    });
    GK.forEach(function (cat) {
      var prepared = [];
      weights.forEach(function (w) {
        if (!w.weight) return;
        groups[w.key].goalies.forEach(function (x) {
          if (
            x.categories.indexOf(cat) === -1 ||
            !required(cat).every(function (f) {
              return x.fields.indexOf(f) !== -1;
            })
          )
            return;
          var before = u(cat, x.own, x.opp, x.ownGames, x.oppGames, min, model);
          if (before === null) return;
          var bm = mode(
              cat,
              x.ownGames,
              x.oppGames,
              min,
              model.qualificationCategories,
            ),
            am = mode(
              cat,
              x.ownGames + n,
              x.oppGames,
              min,
              model.qualificationCategories,
            );
          prepared.push({
            ...x,
            weight: x.weight * w.weight,
            before: before,
            beforeMode: bm,
            afterMode: am,
            opponentValue: numericValue(cat, x.opp, model),
          });
        });
      });
      result.goalies[cat] = prepared;
    });
    c.targets.set(key, result);
    if (c.targets.size > 8) c.targets.delete(c.targets.keys().next().value);
    return result;
  }
  function updated(c, x, row, min, model, n) {
    if (x.afterMode !== -1) return x.afterMode;
    if (x.opponentValue === null) return null;
    var f = c === "GAA" ? "GA" : c === "SVP" ? "SV" : c,
      numerator = x.own[f] + row[f];
    if (!finite(numerator) || !Number.isInteger(numerator) || numerator < 0)
      return null;
    var value = numerator;
    if (c === "GAA" || c === "SVP") {
      var denominator =
        x.own[c === "GAA" ? "TOI" : "SA"] + row[c === "GAA" ? "TOI" : "SA"];
      if (!finite(denominator) || denominator <= 0) return null;
      value =
        c === "GAA"
          ? Number(
              ((numerator * 60) / denominator).toFixed(
                model.ratioPrecision.GAA,
              ),
            )
          : Number((numerator / denominator).toFixed(model.ratioPrecision.SVP));
    }
    return compare(value, x.opponentValue, c === "GAA");
  }
  function validateBlock(block, opts, model) {
    if (!model || model.version !== VERSION || !fittedModels.has(model))
      throw Error("Unknown or unhydrated period impact model");
    if (
      !block ||
      ["skater", "goalie", "team"].indexOf(block.role) === -1 ||
      !Number.isInteger(block.skaterAppearances) ||
      block.skaterAppearances < 0 ||
      !Number.isInteger(block.goalieAppearances) ||
      block.goalieAppearances < 0 ||
      (block.role === "skater" && block.goalieAppearances) ||
      (block.role === "goalie" && block.skaterAppearances)
    )
      throw Error("Invalid source block appearance counts");
    if (
      !Array.isArray(opts.categories) ||
      !opts.categories.length ||
      new Set(opts.categories).size !== opts.categories.length ||
      opts.categories.some(function (c) {
        return SK.indexOf(c) === -1 && GK.indexOf(c) === -1;
      }) ||
      !Number.isInteger(opts.goalieMinimum) ||
      opts.goalieMinimum < 1 ||
      !Number.isInteger(opts.weekDays) ||
      opts.weekDays < 1 ||
      ["replacement", "whole-team-week"].indexOf(opts.blockKind) === -1
    )
      throw Error("Invalid block scoring context");
    if (opts.blockKind === "whole-team-week" && block.role !== "team")
      throw Error("Whole team week requires team block");
    if (
      model.referencePolicy === "before-week" &&
      (typeof opts.weekStartDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(opts.weekStartDate) ||
        model.provenance.trainedBefore > opts.weekStartDate)
    )
      throw Error("Reference must be frozen before target week");
  }
  function finish(block, opts, model, values, reasons, support, qualification) {
    var n = block.skaterAppearances + block.goalieAppearances,
      total = reasons.length
        ? null
        : Object.keys(values).reduce(function (s, c) {
            return s + values[c];
          }, 0);
    return {
      status: reasons.length ? "unavailable" : n ? "rated" : "no-appearance",
      value: total,
      ifStarted: total,
      counted: total,
      average: total === null ? null : n ? total / n : 0,
      appearances: n,
      categoryContributions: values,
      qualificationContributions: qualification,
      reasons: reasons,
      support: support,
      reference: { version: model.version, ...model.provenance },
      blockKind: opts.blockKind,
    };
  }
  function scoreBlock(block, model, options) {
    var opts = options || {};
    validateBlock(block, opts, model);
    var values = {},
      qual = {},
      support = {},
      reasons = [];
    opts.categories.forEach(function (c) {
      values[c] = 0;
      qual[c] = 0;
    });
    SK.concat(GR).forEach(function (f) {
      if (
        block.raw[f] === undefined ||
        block.raw[f] === null ||
        (block.availableFields && block.availableFields.indexOf(f) === -1)
      )
        return;
      var v = block.raw[f];
      if (
        !finite(v) ||
        (f !== "PM" && v < 0) ||
        (f !== "TOI" && !Number.isInteger(v))
      )
        reasons.push("Invalid raw block field: " + f);
    });
    if (available(block, ["SV", "SA"]) && block.raw.SV > block.raw.SA)
      reasons.push("Block saves exceed shots against");
    ["W", "SO"].forEach(function (f) {
      if (available(block, [f]) && block.raw[f] > block.goalieAppearances)
        reasons.push("Block " + f + " exceeds goalie appearances");
    });
    if (
      !block.skaterAppearances &&
      SK.some(function (f) {
        return available(block, [f]) && block.raw[f] !== 0;
      })
    )
      reasons.push("Skater activity without appearances");
    if (
      !block.goalieAppearances &&
      GR.filter(function (f) {
        return f !== "TOI" || block.role !== "skater";
      }).some(function (f) {
        return available(block, [f]) && block.raw[f] !== 0;
      })
    )
      reasons.push("Goalie activity without appearances");
    if (reasons.length)
      return finish(block, opts, model, values, reasons, support, qual);
    if (!block.skaterAppearances && !block.goalieAppearances)
      return finish(block, opts, model, values, [], support, qual);
    if (!finite(opts.nhlGamesPerTeam) || opts.nhlGamesPerTeam <= 0)
      return finish(
        block,
        opts,
        model,
        values,
        ["Positive target schedule exposure required"],
        support,
        qual,
      );
    if (opts.blockKind === "whole-team-week")
      return wholeTeam(block, model, opts, values, qual, support, reasons);
    ["skater", "goalie"].forEach(function (role) {
      var n =
          role === "skater" ? block.skaterAppearances : block.goalieAppearances,
        categories = opts.categories.filter(function (c) {
          return (role === "skater" ? SK : GK).indexOf(c) !== -1;
        });
      if (!n || !categories.length) return;
      if (n === 1) {
        var rowRaw = {};
        (role === "skater" ? SK : GR).forEach(function (f) {
          if (available(block, [f])) rowRaw[f] = block.raw[f];
        });
        var scored = ns.PlayerDayImpact.score(
          {
            GP: 1,
            role: role,
            raw: rowRaw,
            availableFields: Object.keys(rowRaw),
          },
          model.dailyReference,
          { ...opts, categories: categories, started: true },
        );
        categories.forEach(function (c) {
          values[c] = scored.categoryContributions[c];
          qual[c] = scored.qualificationContributions[c] || 0;
          if (scored.support[c] !== undefined) support[c] = scored.support[c];
        });
        reasons.push.apply(reasons, scored.reasons);
        return;
      }
      var ref = targetRemoval(
        model,
        role,
        n,
        opts.nhlGamesPerTeam,
        opts.goalieMinimum,
      );
      categories.forEach(function (c) {
        if (!available(block, required(c))) {
          reasons.push("Missing block source: " + c);
          return;
        }
        if (role === "skater") {
          var d = ref.counts[c];
          if (!d || !d.weight) {
            reasons.push("No historical block category: " + c);
            return;
          }
          values[c] = marginal(d, block.raw[c]);
          support[c] = d.weight;
          return;
        }
        var total = 0,
          weight = 0,
          credit = 0;
        ref.goalies[c].forEach(function (x) {
          var after = updated(c, x, block.raw, opts.goalieMinimum, model, n);
          if (after === null) return;
          var unchanged = x.beforeMode === -1 ? after : x.beforeMode;
          total += x.weight * (after - x.before);
          credit += x.weight * (after - unchanged);
          weight += x.weight;
        });
        if (!weight) {
          reasons.push("No usable historical goalie block: " + c);
          return;
        }
        values[c] = total / weight;
        qual[c] = credit / weight;
        support[c] = weight;
      });
    });
    return finish(block, opts, model, values, reasons, support, qual);
  }
  function wholeTeam(block, model, opts, values, qual, support, reasons) {
    var state = cache(model);
    if (!state.opponentGroups) {
      var groups = {};
      model.sides.forEach(function (s) {
        if (!groups[s.exposure]) groups[s.exposure] = {};
        SK.concat(GK).forEach(function (c) {
          var role =
            GK.indexOf(c) !== -1 ? "opponentGoalies" : "opponentSkaters";
          if (
            s.categories.indexOf(c) === -1 ||
            !available({ raw: s.opp }, required(c)) ||
            !s[role].every(function (a) {
              return available(a, required(c));
            })
          )
            return;
          var byGames = groups[s.exposure][c] || (groups[s.exposure][c] = {}),
            n = s.opponentGoalies.length,
            record =
              byGames[n] || (byGames[n] = { atoms: new Map(), weight: 0 });
          record.weight++;
          var value = numericValue(c, s.opp, model);
          if (value !== null) addAtom(record.atoms, value, 1);
        });
      });
      state.opponentGroups = groups;
    }
    var key = opts.nhlGamesPerTeam + ":" + opts.goalieMinimum,
      reference = state.opponents.get(key);
    if (!reference) {
      reference = {};
      var weights = kernelWeights(
        state.opponentGroups,
        opts.nhlGamesPerTeam,
        model.exposureBandwidth,
      );
      SK.concat(GK).forEach(function (c) {
        var atoms = new Map(),
          total = 0,
          failed = 0,
          masked = model.qualificationCategories.indexOf(c) !== -1;
        weights.forEach(function (w) {
          var byGames = state.opponentGroups[w.key][c];
          if (!w.weight || !byGames) return;
          Object.keys(byGames).forEach(function (n) {
            var record = byGames[n];
            total += record.weight * w.weight;
            if (masked && Number(n) < opts.goalieMinimum)
              failed += record.weight * w.weight;
            else
              record.atoms.forEach(function (p, v) {
                addAtom(atoms, v, p * w.weight);
              });
          });
        });
        reference[c] = {
          total: total,
          failed: failed,
          cdf: atoms.size ? cdf(atoms) : null,
        };
      });
      state.opponents.set(key, reference);
      if (state.opponents.size > 8)
        state.opponents.delete(state.opponents.keys().next().value);
    }
    opts.categories.forEach(function (c) {
      if (
        (GK.indexOf(c) !== -1 && !block.goalieAppearances) ||
        (SK.indexOf(c) !== -1 && !block.skaterAppearances)
      )
        return;
      if (!available(block, required(c))) {
        reasons.push("Missing whole team source: " + c);
        return;
      }
      var ref = reference[c],
        masked = model.qualificationCategories.indexOf(c) !== -1;
      var weight = ref.total;
      if (masked && block.goalieAppearances < opts.goalieMinimum) {
        if (!weight)
          reasons.push("No usable whole team opponent reference: " + c);
        else support[c] = weight;
        return;
      }
      var value = numericValue(c, block.raw, model),
        d = ref.cdf,
        sum = 0,
        q = 0;
      if (masked) {
        weight = ref.failed + (value !== null && d ? d.weight : 0);
        sum = 0.5 * ref.failed;
        if (value !== null && d) {
          var score = 0.5 * (prob(d, value, true) + prob(d, value, false));
          if (c === "GAA") score = 1 - score;
          sum += d.weight * score;
        }
        q = sum;
      } else {
        if (c === "GAA" || c === "SVP" || !d || value === null) {
          weight = 0;
        } else {
          weight = d.weight;
          sum =
            0.5 *
            (prob(d, value, true) +
              prob(d, value, false) -
              prob(d, 0, true) -
              prob(d, 0, false)) *
            weight;
        }
      }
      if (!weight) {
        reasons.push("No usable whole team opponent reference: " + c);
        return;
      }
      values[c] = sum / weight;
      qual[c] = q / weight;
      support[c] = weight;
    });
    return finish(block, opts, model, values, reasons, support, qual);
  }
  ns.PeriodImpact = {
    fitBlockContexts: fitBlockContexts,
    scoreBlock: scoreBlock,
    hydrateBlockReference: hydrateBlockReference,
  };
})(RankingEngine);
