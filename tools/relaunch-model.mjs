// Offline executable proposal, deliberately not imported by the running app.
import fs from "node:fs";
import vm from "node:vm";

export const categories = ["G", "A", "P", "PPP", "SOG", "HIT", "BLK"];
export const positions = { C: 3, LW: 3, RW: 3, D: 4, G: 2 };
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const clamp = (x) => Math.max(0, Math.min(1, x));
const keyCompare = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function rateGames(rows) {
  const context = vm.createContext({});
  for (const name of ["config", "player-pure", "team-pure", "index"]) {
    vm.runInContext(
      fs.readFileSync(`scripts/src/runtime/RankingEngine/${name}.js`, "utf8"),
      context,
    );
  }
  return Array.from(
    context.RankingEngine.rankRows(structuredClone(rows), {
      dataModelName: "PlayerDayStatLine",
      outputField: "Rating",
      mutate: false,
    }),
  );
}

// Bipartite matching, including reassignment of previously placed dual-position games.
export function fits(rows, caps) {
  const slots = Object.entries(caps).flatMap(([p, n]) => Array(n).fill(p));
  const owners = Array(slots.length).fill(-1);
  function place(index, visited) {
    for (let s = 0; s < slots.length; s++) {
      if (visited.has(s) || !rows[index].positions.includes(slots[s])) continue;
      visited.add(s);
      if (owners[s] === -1 || place(owners[s], visited)) {
        owners[s] = index;
        return true;
      }
    }
    return false;
  }
  return rows.every((_, i) => place(i, new Set()));
}

export function selectSkaters(
  rows,
  caps,
  limit,
  order = categories,
  pins = [],
) {
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw Error("Duplicate game");
  const compare = (a, b) =>
    b.Rating - a.Rating ||
    order.reduce((result, c) => result || (b[c] ?? 0) - (a[c] ?? 0), 0) ||
    keyCompare(a, b);
  const sorted = [...rows].sort(compare);
  const selected = [],
    removedPins = [];
  // Keep the highest rated legal pin set when changed limits make pins conflict.
  for (const row of sorted.filter((r) => pins.includes(r.id))) {
    if (selected.length < limit && fits([...selected, row], caps))
      selected.push(row);
    else removedPins.push(row.id);
  }
  for (const row of sorted.filter((r) => !pins.includes(r.id))) {
    if (selected.length < limit && fits([...selected, row], caps))
      selected.push(row);
  }
  return { selected, removedPins };
}

export function goalieTotals(rows) {
  const total = Object.fromEntries(
    ["W", "GA", "SA", "SV", "seconds"].map((c) => [
      c,
      sum(rows.map((r) => r[c])),
    ]),
  );
  return {
    ...total,
    GAA: total.seconds ? (total.GA * 3600) / total.seconds : null,
    SVP: total.SA ? total.SV / total.SA : null,
  };
}

export function categoryOrder(a, b, impact, cats = categories) {
  const gap = (c) =>
    a[c] == null || b[c] == null || !(impact[c] > 0)
      ? Infinity
      : Math.abs(a[c] - b[c]) / impact[c];
  return [...cats].sort(
    (x, y) => gap(x) - gap(y) || cats.indexOf(x) - cats.indexOf(y),
  );
}

export function selectMatchup(teams, caps, limit, impact) {
  if (teams.length !== 2) throw Error("Expected two opponents");
  const initial = teams.map((t) => ({
    skaters: selectSkaters(t.skaters, caps, limit, [], t.skaterPins ?? []),
    goalies: selectGoalies(t.goalies, [], t.goaliePins ?? []),
  }));
  const totals = initial.map((t) => ({
    ...Object.fromEntries(
      categories.map((c) => [c, sum(t.skaters.selected.map((r) => r[c]))]),
    ),
    ...goalieTotals(t.goalies.selected),
  }));
  const skaterOrder = categoryOrder(totals[0], totals[1], impact);
  const goalieOrder = categoryOrder(totals[0], totals[1], impact, [
    "W",
    "GAA",
    "SVP",
  ]);
  const selections = teams.map((t, i) => ({
    skaters: selectSkaters(
      t.skaters,
      caps,
      limit,
      skaterOrder,
      (t.skaterPins ?? []).filter(
        (id) => !initial[i].skaters.removedPins.includes(id),
      ),
    ),
    goalies: selectGoalies(t.goalies, goalieOrder, t.goaliePins ?? []),
    removedPins: initial[i].skaters.removedPins,
  }));
  return { skaterOrder, goalieOrder, selections };
}

export function selectGoalies(rows, order = ["W", "GAA", "SVP"], pins = []) {
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw Error("Duplicate game");
  const canonical = [...rows].sort(
    (a, b) => b.Rating - a.Rating || keyCompare(a, b),
  );
  const reference = canonical.filter((r) => pins.includes(r.id));
  for (const row of canonical) {
    if (reference.length >= 3) break;
    if (!reference.includes(row)) reference.push(row);
  }
  const sorted = [...rows].sort((a, b) => {
    if (a.Rating !== b.Rating) return b.Rating - a.Rating;
    const ta = goalieTotals([...reference, a]),
      tb = goalieTotals([...reference, b]);
    for (const c of order) {
      if (ta[c] == null || tb[c] == null) continue;
      const difference = (tb[c] - ta[c]) * (c === "GAA" ? -1 : 1);
      if (Math.abs(difference) > 1e-12) return difference;
    }
    return keyCompare(a, b);
  });
  const baseline = sorted.filter((r) => pins.includes(r.id));
  for (const row of sorted) {
    if (baseline.length >= 3) break;
    if (!pins.includes(row.id)) baseline.push(row);
  }
  if (rows.length < 3) return { selected: baseline, qualifies: false };
  const rest = sorted.filter((r) => !baseline.includes(r));
  if (rest.length > 20)
    throw Error(
      "Research enumerator limit; production needs exact branch-and-bound",
    );
  const base = goalieTotals(baseline);
  let best = baseline,
    bestTotals = base;
  function better(t, candidate) {
    for (const c of order) {
      if (t[c] == null || bestTotals[c] == null) continue;
      const d = (t[c] - bestTotals[c]) * (c === "GAA" ? -1 : 1);
      if (Math.abs(d) > 1e-12) return d > 0;
    }
    return (
      candidate.length < best.length ||
      (candidate.length === best.length &&
        candidate
          .map((r) => r.id)
          .sort()
          .join("|") <
          best
            .map((r) => r.id)
            .sort()
            .join("|"))
    );
  }
  for (let mask = 1; mask < 2 ** rest.length; mask++) {
    const candidate = [...baseline, ...rest.filter((_, i) => mask & (2 ** i))];
    const t = goalieTotals(candidate);
    const noWorse =
      (base.GAA == null || (t.GAA != null && t.GAA <= base.GAA + 1e-12)) &&
      (base.SVP == null || (t.SVP != null && t.SVP >= base.SVP - 1e-12));
    const improves =
      t.W > base.W ||
      (t.GAA != null && (base.GAA == null || t.GAA < base.GAA - 1e-12)) ||
      (t.SVP != null && (base.SVP == null || t.SVP > base.SVP + 1e-12));
    if (noWorse && improves && better(t, candidate)) {
      best = candidate;
      bestTotals = t;
    }
  }
  return { selected: best, qualifies: true };
}

// Values are preseason/entering-week frozen pooled player-rating percentiles.
export function rosterValue(rows) {
  return sum(
    selectSkaters(
      rows.map((r) => ({ ...r, Rating: r.value })),
      positions,
      15,
      [],
    ).selected.map((r) => r.value),
  );
}
export function rosterFactors(roster, incoming, dropId) {
  const before = rosterValue(roster);
  const after = rosterValue([
    ...roster.filter((r) => r.id !== dropId),
    incoming,
  ]);
  const improvement = Math.max(0, after - before);
  return {
    before,
    after,
    improvement,
    opportunity: clamp(improvement),
    quality: before / 15,
    weakness: 1 - before / 15,
  };
}
export const claimScore = (f) => 0.75 * f.opportunity + 0.25 * f.weakness;
export function ufaScore({
  salary,
  min,
  max,
  years,
  p,
  quality,
  opportunity,
  performance,
  ladder,
  draft,
}) {
  if (max <= min || salary < min || salary > max || ![1, 2, 3].includes(years))
    throw Error("Invalid offer");
  const fit = (0.35 + 0.3 * p) * quality + (0.65 - 0.3 * p) * opportunity;
  return (
    (0.45 * (salary - min)) / (max - min) +
    (0.25 * (years - 1)) / 2 +
    0.2 * fit +
    0.05 * performance +
    0.03 * ladder +
    0.02 * draft
  );
}
export function probabilities(scores) {
  if (!scores.length) return [];
  if (scores.some((s) => !Number.isFinite(s) || s < 0 || s > 1))
    throw Error("Invalid score");
  const weights = scores.map((s) => Math.exp(3 * (s - Math.max(...scores))));
  return weights.map((w) => 0.1 / scores.length + (0.9 * w) / sum(weights));
}
export function draw(probability, roll) {
  if (!(roll >= 0 && roll < 1) || !probability.length)
    throw Error("Invalid draw");
  let cumulative = 0;
  for (let i = 0; i < probability.length; i++) {
    cumulative += probability[i];
    if (roll < cumulative) return i;
  }
  return probability.length - 1;
}
export function random(seed = 20261017) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

// Exact outcome enumeration is an acceptance oracle, not a production implementation.
export function commitmentOutcomes(roster, offers, cap) {
  if (
    cap.length < 2 ||
    [...roster, ...offers.map((o) => o.player)].some(
      (r) => r.salary.length > cap.length,
    )
  )
    throw Error("Cap horizon does not cover commitments");
  const drops = offers.map((o) => o.dropId).filter(Boolean);
  if (new Set(drops).size !== drops.length) return false;
  if (drops.some((id) => !roster.some((r) => r.id === id))) return false;
  if (
    new Set([...roster.map((r) => r.id), ...offers.map((o) => o.player.id)])
      .size !==
    roster.length + offers.length
  )
    return false;
  for (let mask = 0; mask < 2 ** offers.length; mask++) {
    let result = [...roster];
    const dead = Array(cap.length).fill(0);
    for (let i = 0; i < offers.length; i++) {
      if (!(mask & (2 ** i))) continue;
      const o = offers[i],
        drop = result.find((r) => r.id === o.dropId);
      if (drop) {
        const last = drop.salary.findLastIndex((s) => s > 0);
        for (let y = 0; y <= Math.max(1, last); y++)
          dead[y] += drop.salary[0] * 0.5;
      }
      result = [...result.filter((r) => r.id !== o.dropId), o.player];
    }
    if (result.length > 23) return false;
    for (let y = 0; y < cap.length; y++) {
      if (dead[y] + sum(result.map((r) => r.salary[y] ?? 0)) > cap[y])
        return false;
    }
    // Can every player be assigned to a main position or one of eight reserves?
    if (
      !fits(
        result.map((r) => ({ ...r, positions: [...r.positions, "reserve"] })),
        { ...positions, reserve: 8 },
      )
    )
      return false;
  }
  return true;
}

export function processQueue(state, now, period, { closeout = false } = {}) {
  const next = structuredClone(state);
  if (closeout) {
    next.finalized = true;
    for (const p of next.roster) if (p.expiry <= now) p.salary = 0;
  }
  next.used[period] ??= 0;
  for (const tx of next.queue) {
    if (
      tx.status !== "pending" ||
      tx.due > now ||
      tx.lockedUntil > now ||
      next.used[period] >= 2
    )
      continue;
    const drop = next.roster.find((p) => p.id === tx.dropId);
    next.buyouts += (drop?.salary ?? 0) * 0.5;
    next.roster = [...next.roster.filter((p) => p.id !== tx.dropId), tx.player];
    next.used[period]++;
    tx.status = "executed";
    tx.chargedPeriod = period;
  }
  if (closeout) {
    next.frozen = next.roster.filter((p) => p.main).map((p) => p.id);
    for (const tx of next.queue)
      if (tx.status === "pending") tx.status = "cancelled";
  }
  return next;
}
