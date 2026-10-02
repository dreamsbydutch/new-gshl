import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  singleSalaryValue,
  rankUnifiedValues,
  unifiedAnnualSalary,
  SALARY_HORIZON_WEIGHTS,
} from "../../runtime/unified-salary-value";
import { spearman } from "../../domains/ranking/nhl-rating-diagnostics";
import { relaunchAnnualSalary } from "../../runtime/relaunch-salary-curve";
type Row = Record<string, any>;
const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
    curve: { type: "string", default: "relaunch" },
  },
});
if (values.help)
  console.log(
    "Offline single-price salary preview. --input <unified validation.json> --output <NEW directory> [--curve relaunch|legacy]. Defaults to the owner proposal's PCHIP base salaries. One annual price for any 1–3 year term, weighted 70/20/10. Exports local CSV/JSON; no production writes.",
  );
else {
  if (!values.input || !values.output)
    throw new Error("Input and new output required");
  if (!["relaunch", "legacy"].includes(values.curve!))
    throw new Error("Unknown salary curve");
  const input = JSON.parse(await readFile(values.input, "utf8")),
    groups = new Map<string, Row[]>();
  for (const r of input.annualValues.filter(
    (r: Row) => r.method === input.selected,
  )) {
    const k = `${r.origin}:${r.id}`,
      g = groups.get(k) ?? [];
    g.push(r);
    groups.set(k, g);
  }
  const latest = [...groups.values()].filter(
    (g) => g[0]!.origin === input.latestOrigin,
  );
  const names = new Map<string, string>(
    input.players.map((r: Row) => [r.id, r.name]),
  );
  const ranked = rankUnifiedValues(
    latest.map((g) => ({
      id: String(g[0]!.id),
      name: names.get(g[0]!.id),
      position: String(g[0]!.position),
      value: singleSalaryValue(g as { horizon: number; value: number }[]),
      years: g.map((r) => ({ horizon: r.horizon, value: r.value })),
    })),
  );
  const players = ranked.map((r) => {
    const equal = ranked.filter(
        (p) => Math.abs(p.value - r.value) <= 1e-10,
      ).length,
      pricingRank = r.rank + (equal - 1) / 2;
    const annualSalary =
      values.curve === "relaunch"
        ? relaunchAnnualSalary(pricingRank)
        : unifiedAnnualSalary(pricingRank, r.value);
    return {
      ...r,
      pricingRank,
      annualSalary,
      oneYearTotal: annualSalary,
      twoYearTotal: 2 * annualSalary,
      threeYearTotal: 3 * annualSalary,
    };
  });
  const candidates = [
    { name: "next-season-only", weights: [1, 0, 0] },
    { name: "80/15/5", weights: [0.8, 0.15, 0.05] },
    { name: "70/20/10", weights: [0.7, 0.2, 0.1] },
    { name: "60/25/15", weights: [0.6, 0.25, 0.15] },
    { name: "equal-three-year", weights: [1 / 3, 1 / 3, 1 / 3] },
  ];
  const mature = [...groups.values()].filter(
    (g) => g.length === 3 && g.every((r) => Number.isFinite(r.actualValue)),
  );
  const sensitivity = candidates.flatMap((candidate) =>
    ["ALL", "F", "D", "G"].map((position) => {
      const g = mature.filter(
          (g) => position === "ALL" || g[0]!.position === position,
        ),
        pred = g.map((g) =>
          singleSalaryValue(
            g as { horizon: number; value: number }[],
            candidate.weights,
          ),
        ),
        next = g.map((g) => g.find((r) => r.horizon === 1)!.actualValue),
        average = g.map((g) => g.reduce((s, r) => s + r.actualValue, 0) / 3);
      return {
        candidate: candidate.name,
        position,
        n: g.length,
        nextSeasonCorrelation: spearman(pred, next),
        threeYearCorrelation: spearman(pred, average),
      };
    }),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    origin: input.latestOrigin,
    method: input.selected,
    horizonWeights: SALARY_HORIZON_WEIGHTS,
    curve: values.curve,
    skaterPool: input.skaterPool ?? "positional",
    pricing:
      values.curve === "relaunch"
        ? "Owner proposal PCHIP: ranks 1/20/160/325/400 at $10m/$9.25m/$5.75m/$2.5m/$1m. $50k rounding; annual base salary before renewal/UFA premiums. No replacement-value floor."
        : "Legacy rank-to-dollar curve, $50k rounding and $1m floor for nonpositive replacement value.",
    players,
    sensitivity,
    limitations: [
      "Shared skater valuation removes reserved positional slots; historical contexts do not simulate best-ball game selection or C/LW/RW/D appearance ceilings. This is a relaunch approximation, not a complete rules replay.",
      "70/20/10 is an explicit policy choice matching next-season priority, not a statistically proven optimal allocation.",
      "Sensitivity uses identical complete three-year cohorts and compares fixed next-season and three-year targets; target weighting does not change between candidates.",
      "Older-player forecasting concerns remain; changing horizon weights does not correct an overly pessimistic year-one forecast.",
      "Reconstructed historical data and overlapping player windows; not production prices.",
    ],
  };
  await mkdir(values.output);
  await writeFile(
    resolve(values.output, "salaries.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx" },
  );
  const columns = [
      "rank",
      "name",
      "position",
      "rating",
      "value",
      "annualSalary",
      "oneYearTotal",
      "twoYearTotal",
      "threeYearTotal",
    ],
    cell = (x: unknown) => '"' + String(x ?? "").replaceAll('"', '""') + '"';
  await writeFile(
    resolve(values.output, "salaries.csv"),
    "\ufeff" +
      [columns, ...players.map((p) => columns.map((k) => (p as Row)[k]))]
        .map((r) => r.map(cell).join(","))
        .join("\r\n"),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      {
        sensitivity,
        sample: players.filter((r) =>
          [
            "Sidney Crosby",
            "Alex Ovechkin",
            "Connor McDavid",
            "Cale Makar",
            "Andrei Vasilevskiy",
            "Macklin Celebrini",
          ].includes(r.name!),
        ),
      },
      null,
      2,
    ),
  );
}
