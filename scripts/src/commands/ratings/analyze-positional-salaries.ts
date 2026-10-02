import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  expectedMatchupWin,
  type Position,
  type PlayerProjection,
  type MatchupContext,
} from "../../runtime/positional-matchup-value";
const { values } = parseArgs({
  options: {
    history: { type: "string" },
    forecasts: { type: "string" },
    ratings: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Offline positional salary research. --history <audited contexts.json> --forecasts <development experiment directory> --ratings <sample salaries.json> --output <NEW directory>. Evaluates expected matchup wins over positional replacements. No production writes.",
  );
else {
  if (!values.history || !values.forecasts || !values.ratings || !values.output)
    throw new Error("All input paths and new output required");
  const history = JSON.parse(await readFile(values.history, "utf8")) as {
    contexts: MatchupContext[];
    audit: unknown[];
    usage: {
      year: number;
      pos: Position;
      gp: number;
      gs: number;
      owned: number;
    }[];
  };
  const rated = JSON.parse(await readFile(values.ratings, "utf8")).players as {
    playerId: number;
    name: string;
    position: Position;
    method: string;
    twoYearRating: number;
    threeYearRating: number;
    twoYearAnnualSalary: number;
    threeYearAnnualSalary: number;
  }[];
  const models = new Map<string, Map<string, PlayerProjection>>();
  for (const name of ["position-best", "age-usage"]) {
    const d = JSON.parse(
      await readFile(resolve(values.forecasts, `${name}.json`), "utf8"),
    );
    if (d.projections.some((p: any) => p.origin !== 2025))
      throw new Error(
        "Only the audited 2025-26 season-end snapshot is supported",
      );
    models.set(
      name,
      new Map(
        d.projections.map((r: any) => [
          `${r.playerId}:${r.horizon}`,
          { ...r.prediction, id: String(r.playerId), position: r.position },
        ]),
      ),
    );
  }
  const positions: Position[] = ["F", "D", "G"],
    utilization = {} as Record<Position, number>,
    owned = {} as Record<Position, number>;
  for (const pos of positions) {
    const rows = history.usage.filter((r) => r.pos === pos && r.year >= 2022);
    utilization[pos] =
      rows.reduce((s, r) => s + r.gs, 0) / rows.reduce((s, r) => s + r.gp, 0);
    owned[pos] = rows.reduce((s, r) => s + r.owned, 0) / rows.length;
  }
  const base = { F: 7, D: 3, G: 1 },
    extras = positions.reduce((s, p) => s + Math.max(0, owned[p] - base[p]), 0);
  const slots = Object.fromEntries(
    positions.map((p) => [
      p,
      base[p] + (4 * Math.max(0, owned[p] - base[p])) / extras,
    ]),
  ) as Record<Position, number>;
  const scenarios = [
    { name: "current-format", first: 2022, last: 2026, slots, weeks: 26 },
    {
      name: "two-goalie-roster",
      first: 2022,
      last: 2026,
      slots: { F: 9, D: 4, G: 2 },
      weeks: 26,
    },
    {
      name: "three-goalie-roster",
      first: 2022,
      last: 2026,
      slots: { F: 8, D: 4, G: 3 },
      weeks: 26,
    },
    {
      name: "older-compatible-format",
      first: 2017,
      last: 2021,
      slots,
      weeks: 26,
    },
    { name: "shorter-calendar", first: 2022, last: 2026, slots, weeks: 24 },
    { name: "longer-calendar", first: 2022, last: 2026, slots, weeks: 28 },
  ];
  const scenariosResult = [];
  for (const scenario of scenarios) {
    const eligible = history.contexts.filter(
      (c) => c.year >= scenario.first && c.year <= scenario.last,
    );
    const contexts = Array.from(
      { length: Math.min(384, eligible.length) },
      (_, i) =>
        eligible[
          Math.floor((i * eligible.length) / Math.min(384, eligible.length))
        ]!,
    );
    const scores = new Map<number, number[]>(),
      replacements = [];
    for (const pos of positions) {
      const pool = rated
        .filter((r) => r.position === pos)
        .sort((a, b) => b.twoYearRating - a.twoYearRating);
      const replacementRank = Math.round(14 * scenario.slots[pos]);
      const band = pool.slice(
        replacementRank,
        replacementRank + Math.max(5, Math.round(replacementRank * 0.1)),
      );
      if (!band.length) throw new Error("Empty replacement band");
      for (const horizon of [1, 2, 3]) {
        const projections = band.map(
          (r) => models.get(r.method)!.get(`${r.playerId}:${horizon}`)!,
        );
        const replacement = {
          id: "replacement",
          position: pos,
        } as PlayerProjection;
        for (const field of [
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
          replacement[field] =
            projections.reduce((s, p) => s + p[field], 0) / projections.length;
        const replacementWin = expectedMatchupWin(
          replacement,
          contexts,
          utilization[pos],
          scenario.weeks,
        );
        replacements.push({
          pos,
          horizon,
          replacementRank,
          band: band.map((r) => r.name),
          projection: replacement,
          expectedWin: replacementWin,
        });
        for (const r of pool) {
          const projection = models
            .get(r.method)!
            .get(`${r.playerId}:${horizon}`)!;
          const gain =
            expectedMatchupWin(
              projection,
              contexts,
              utilization[pos],
              scenario.weeks,
            ) - replacementWin;
          const years = scores.get(r.playerId) ?? [];
          years[horizon - 1] = gain;
          scores.set(r.playerId, years);
        }
      }
    }
    const players = rated.map((r) => {
      const years = scores.get(r.playerId)!;
      return {
        ...r,
        year1WinGain: years[0]!,
        year2WinGain: years[1]!,
        year3WinGain: years[2]!,
        twoYearValue: (years[0]! + years[1]!) / 2,
        threeYearValue: years.reduce((s, x) => s + x, 0) / 3,
      };
    });
    const priced = players
      .map((p) => {
        function price(key: "twoYearValue" | "threeYearValue") {
          const rank =
            players.filter((q) => q[key] > p[key]).length +
            (players.filter((q) => q[key] === p[key]).length + 1) / 2;
          const points = [
            [3.5, 10e6],
            [21, 9e6],
            [35, 8e6],
            [154, 5e6],
            [240, 2e6],
            [285, 1e6],
          ];
          let salary = 1e6;
          if (p[key] > 0) {
            if (rank <= 3.5) salary = 10e6;
            else
              for (let i = 1; i < points.length; i++) {
                const a = points[i - 1]!,
                  b = points[i]!;
                if (rank <= b[0]!) {
                  salary =
                    a[1]! +
                    ((b[1]! - a[1]!) * (rank - a[0]!)) / (b[0]! - a[0]!);
                  break;
                }
              }
          }
          return { rank, salary: Math.round(salary / 50000) * 50000 };
        }
        const two = price("twoYearValue"),
          three = price("threeYearValue");
        return {
          ...p,
          twoYearRank: two.rank,
          threeYearRank: three.rank,
          twoYearSalary: two.salary,
          threeYearSalary: three.salary,
        };
      })
      .sort((a, b) => a.twoYearRank - b.twoYearRank);
    const summary = positions.map((pos) => {
      const rows = priced.filter((r) => r.position === pos);
      return {
        pos,
        aboveReplacement: rows.filter((r) => r.twoYearValue > 0).length,
        positiveValue: rows.reduce(
          (s, r) => s + Math.max(0, r.twoYearValue),
          0,
        ),
        salaryPremium: rows.reduce((s, r) => s + r.twoYearSalary - 1e6, 0),
        top30: priced.slice(0, 30).filter((r) => r.position === pos).length,
      };
    });
    const total = summary.reduce((s, r) => s + r.positiveValue, 0),
      premium = summary.reduce((s, r) => s + r.salaryPremium, 0);
    const shares = summary.map((r) => ({
      ...r,
      valueShare: r.positiveValue / total,
      salaryPremiumShare: r.salaryPremium / premium,
    }));
    scenariosResult.push({
      scenario,
      contexts: contexts.length,
      utilization,
      replacements,
      shares,
      players: priced,
    });
    console.log(
      JSON.stringify({
        scenario: scenario.name,
        shares,
        top: priced
          .slice(0, 8)
          .map((r) => ({
            name: r.name,
            pos: r.position,
            value: r.twoYearValue,
            salary: r.twoYearSalary,
          })),
      }),
    );
  }
  await mkdir(values.output);
  await writeFile(
    resolve(values.output, "analysis.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        audit: history.audit,
        scenarios: scenariosResult,
        limitations: [
          "Expected-rate substitution integrates Poisson appearances but not within-game scoring/shooting/save variance. Contexts retain historical category covariance; this is a counterfactual model, not a causal estimate.",
          "Replacement depth is inferred from observed non-IR roster exposure, normalized to 15 spots with 7F/3D/1G active slots and four bench spots. UTIL is treated as forward. Current league size fixed at 14.",
          "Salary premium shares emerge from the model; no fixed position quotas. Forecasts and subtype choice are retrospective development candidates.",
          "Matched outcomes and ratio denominators are audited. Earlier roster/category formats are sensitivity checks only. Not a deployed salary policy.",
        ],
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  const players = scenariosResult[0]!.players,
    columns = Object.keys(players[0]!),
    cell = (v: unknown) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
  await writeFile(
    resolve(values.output, "salaries.csv"),
    "\ufeff" +
      [
        columns.map(cell).join(","),
        ...players.map((r) =>
          columns.map((k) => cell(r[k as keyof typeof r])).join(","),
        ),
      ].join("\r\n"),
    { flag: "wx" },
  );
}
