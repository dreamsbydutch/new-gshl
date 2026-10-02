import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { projectPreseasonPlayers } from "../../runtime/preseason-projection";
import {
  expectedMatchupWin,
  type PlayerProjection,
  type Position,
  type MatchupContext,
} from "../../runtime/positional-matchup-value";
type Row = Record<string, any>;
const { values } = parseArgs({
  options: {
    history: { type: "string" },
    source: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Offline chronological validation of positional matchup values. --history <audited history directory> --source <draft research source.json> --output <NEW directory>. Freezes player inputs to prior NHL seasons, evaluates known opening-draft rosters, fits probability calibration on earlier seasons only.",
  );
else {
  if (!values.history || !values.source || !values.output)
    throw new Error("All paths required");
  const source = JSON.parse(await readFile(values.source, "utf8"));
  const audited = JSON.parse(
    await readFile(resolve(values.history, "contexts.json"), "utf8"),
  ) as { contexts: MatchupContext[]; usage: Row[] };
  const years = new Map<string, number>(
    source.seasonRows.map((r: Row) => [r.id, Number(r.year)]),
  );
  const games: Row[] = [],
    coverage: Row[] = [];
  const variants = [
    { name: "empirical", slots: null },
    { name: "two-goalies", slots: { F: 9, D: 4, G: 2 } },
    { name: "three-goalies", slots: { F: 8, D: 4, G: 3 } },
  ];
  for (const year of [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
    const history = JSON.parse(
      await readFile(resolve(values.history, `${year}.json`), "utf8"),
    );
    const season = history.season,
      picks = source.draftPickRows.filter(
        (r: Row) => r.seasonId === season.id && r.playerId && r.gshlTeamId,
      );
    if (!picks.length) {
      coverage.push({ year, reason: "no opening draft roster" });
      continue;
    }
    const prior = source.playerNhlRows.filter(
      (r: Row) => (years.get(r.seasonId) ?? 9999) < year,
    );
    const latest = new Map<string, Row>();
    for (const r of [...prior].sort(
      (a: Row, b: Row) =>
        (years.get(b.seasonId) ?? 0) - (years.get(a.seasonId) ?? 0),
    ))
      if (!latest.has(r.playerId)) latest.set(r.playerId, r);
    const rosterIds = [
      ...new Set<string>([
        ...latest.keys(),
        ...picks.map((r: Row) => String(r.playerId)),
      ]),
    ];
    const projected = projectPreseasonPlayers({
      season,
      seasons: source.seasonRows,
      teams: [],
      rosters: rosterIds.map((playerId) => ({ playerId })),
      playerNhlRows: prior,
    });
    const pool: PlayerProjection[] = [],
      raw = new Map<string, number>();
    for (const [id, p] of projected) {
      if (!latest.has(id)) continue;
      const position: Position = p.goalie
          ? "G"
          : p.positions.includes("D")
            ? "D"
            : "F",
        GP = p.availability * 82;
      const row = { id, position, GP } as PlayerProjection;
      for (const k of [
        "G",
        "A",
        "PPP",
        "SOG",
        "HIT",
        "BLK",
        "W",
        "GA",
        "SA",
        "SV",
        "MIN",
      ] as const)
        row[k] = (p.rates[k === "MIN" ? "TOI" : k] ?? 0) * GP;
      pool.push(row);
      raw.set(
        id,
        Number(
          latest.get(id)!.overallRating ?? latest.get(id)!.seasonRating ?? 0,
        ),
      );
    }
    const eligible = audited.contexts.filter(
      (c) => c.year >= 2017 && c.year < year,
    );
    const contexts = Array.from(
      { length: Math.min(128, eligible.length) },
      (_, i) =>
        eligible[
          Math.floor((i * eligible.length) / Math.min(128, eligible.length))
        ]!,
    );
    if (!contexts.length) continue;
    const use = audited.usage.filter((r) => r.year >= 2017 && r.year < year),
      positions: Position[] = ["F", "D", "G"];
    const owned = {} as Record<Position, number>,
      util = {} as Record<Position, number>;
    for (const pos of positions) {
      const r = use.filter((r) => r.pos === pos);
      owned[pos] = r.reduce((s, r) => s + r.owned, 0) / r.length;
      util[pos] =
        r.reduce((s, r) => s + r.gs, 0) / r.reduce((s, r) => s + r.gp, 0);
    }
    const base = { F: 7, D: 3, G: 1 },
      extra = positions.reduce(
        (s, p) => s + Math.max(0, owned[p] - base[p]),
        0,
      );
    const empirical = Object.fromEntries(
      positions.map((p) => [
        p,
        base[p] + (4 * Math.max(0, owned[p] - base[p])) / extra,
      ]),
    ) as Record<Position, number>;
    const teams = [...new Set<string>(picks.map((r: Row) => r.gshlTeamId))],
      scores = new Map<string, Map<string, number>>([["raw-rating", raw]]);
    for (const variant of variants) {
      const vals = new Map<string, number>();
      for (const pos of positions) {
        const players = pool
          .filter((p) => p.position === pos)
          .sort((a, b) => (raw.get(b.id) ?? 0) - (raw.get(a.id) ?? 0));
        const cutoff = Math.round(
          teams.length * (variant.slots ?? empirical)[pos],
        );
        const band = players.slice(
          cutoff,
          cutoff + Math.max(5, Math.round(cutoff * 0.1)),
        );
        const replacement = {
          id: "replacement",
          position: pos,
        } as PlayerProjection;
        for (const k of [
          "GP",
          "G",
          "A",
          "PPP",
          "SOG",
          "HIT",
          "BLK",
          "W",
          "GA",
          "SA",
          "SV",
          "MIN",
        ] as const)
          replacement[k] = band.reduce((s, p) => s + p[k], 0) / band.length;
        const replace = expectedMatchupWin(replacement, contexts, util[pos]);
        for (const p of players)
          vals.set(p.id, expectedMatchupWin(p, contexts, util[pos]) - replace);
      }
      scores.set(variant.name, vals);
    }
    const teamScores = new Map<string, Record<string, number>>();
    let unknown = 0;
    for (const team of teams) {
      const ids = [
          ...new Set<string>(
            picks
              .filter((r: Row) => r.gshlTeamId === team)
              .map((r: Row) => r.playerId),
          ),
        ],
        values: Record<string, number> = {};
      unknown += ids.filter((id) => !latest.has(id)).length;
      for (const [method, ratings] of scores)
        values[method] = ids.reduce((s, id) => s + (ratings.get(id) ?? 0), 0);
      teamScores.set(team, values);
    }
    const weeks = new Map<string, Row>(
      history.weeks.map((w: Row) => [w.id, w]),
    );
    let n = 0;
    for (const m of history.matchups) {
      if (!m.isComplete || weeks.get(m.weekId)?.weekType !== "RS") continue;
      const a = teamScores.get(m.homeTeamId),
        b = teamScores.get(m.awayTeamId);
      if (!a || !b) continue;
      if (!m.homeWin && !m.awayWin && !m.tie) continue;
      const actual = m.homeWin ? 1 : m.awayWin ? 0 : 0.5;
      const delta = Object.fromEntries(
        [...scores.keys()].map((method) => [method, a[method]! - b[method]!]),
      );
      games.push({ year, matchupId: m.id, actual, delta });
      n++;
    }
    coverage.push({
      year,
      teams: teams.length,
      picks: picks.length,
      unknown,
      matchups: n,
      latestContextYear: Math.max(...contexts.map((c) => c.year)),
      latestNhlYear: Math.max(
        ...prior.map((r: Row) => years.get(r.seasonId) ?? 0),
      ),
      utilization: util,
      empiricalSlots: empirical,
    });
    console.log(JSON.stringify(coverage.at(-1)));
  }
  const methods = ["raw-rating", "empirical", "two-goalies", "three-goalies"],
    predictions: Row[] = [];
  function fit(train: Row[], method: string) {
    const scale =
      Math.sqrt(
        train.reduce((s, r) => s + r.delta[method] ** 2, 0) / train.length,
      ) || 1;
    let a = 0,
      b = 0;
    for (let iteration = 0; iteration < 30; iteration++) {
      let ga = 0,
        gb = -b,
        aa = 1e-4,
        ab = 0,
        bb = 1;
      for (const r of train) {
        const x = r.delta[method] / scale,
          p = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, a + b * x)))),
          w = p * (1 - p);
        ga += r.actual - p;
        gb += x * (r.actual - p);
        aa += w;
        ab += w * x;
        bb += w * x * x;
      }
      const det = aa * bb - ab * ab,
        da = (ga * bb - gb * ab) / det,
        db = (gb * aa - ga * ab) / det;
      a += da;
      b += db;
      if (Math.abs(da) + Math.abs(db) < 1e-8) break;
    }
    return { a, b, scale };
  }
  for (const year of [2021, 2022, 2023, 2024, 2025, 2026])
    for (const method of methods) {
      const train = games.filter((r) => r.year < year);
      if (train.length < 100) continue;
      const model = fit(train, method);
      for (const g of games.filter((r) => r.year === year))
        predictions.push({
          ...g,
          method,
          prediction:
            1 /
            (1 +
              Math.exp(-model.a - (model.b * g.delta[method]) / model.scale)),
          model,
          latestTrainingYear: Math.max(...train.map((r) => r.year)),
        });
    }
  function summarize(rows: Row[]) {
    return methods.map((method) => {
      const r = rows.filter((r) => r.method === method);
      return {
        method,
        n: r.length,
        brier:
          r.reduce((s, g) => s + (g.prediction - g.actual) ** 2, 0) / r.length,
        accuracy:
          r.reduce(
            (s, g) =>
              s +
              (g.actual === 0.5
                ? 0.5
                : Number(g.prediction >= 0.5 === (g.actual === 1))),
            0,
          ) / r.length,
      };
    });
  }
  const report = {
    coverage,
    training: summarize(predictions.filter((r) => r.year <= 2023)),
    heldOut: summarize(predictions.filter((r) => r.year >= 2024)),
    years: [...new Set(predictions.map((r) => r.year))].map((year) => ({
      year,
      metrics: summarize(predictions.filter((r) => r.year === year)),
    })),
    predictions,
    limitations: [
      "Historical test uses the existing three-year category forecast, not a reconstruction of the newer development model. It tests the positional valuation layer on a common frozen input.",
      "Opening draft rosters are supplied only for evaluation; no future roster enters individual season-end projections. In-season trades, streaming and lineup decisions are not forecast. Unknown prospects receive zero excess value; raw baseline also uses zero.",
      "Prior contexts can include different category eras re-scored under current ten-category rules; held-out results are 2023-24 through 2025-26. Player and roster observations are dependent; this is not a randomized intervention.",
    ],
  };
  await mkdir(values.output);
  await writeFile(
    resolve(values.output, "validation.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      {
        training: report.training,
        heldOut: report.heldOut,
        years: report.years,
      },
      null,
      2,
    ),
  );
}
