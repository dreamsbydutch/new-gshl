import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadFantasyForecastSource } from "../../integrations/nhl/fantasy-forecast-source";
import {
  runCategoryBacktest,
  summarizeCategoryForecasts,
} from "../../domains/ranking/fantasy-category-backtest";
import { validateSalaryForecasts } from "../../domains/ranking/fantasy-salary-validation";

const { values } = parseArgs({
  options: {
    baseline: { type: "string" },
    "team-audit": { type: "string" },
    output: { type: "string" },
    experiment: { type: "string", default: "original" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Read-only salary-rating research. --baseline <saved source root> --team-audit <verified team-success-input.json> --output <NEW directory> [--experiment original|isolated|development]. Use tsx --tsconfig scripts/tsconfig.json from repository root. Original tests direct totals and added impact; isolated tests impact on the original rate model and historical goalie save percentage separately and together. Development tests recent trends and age/usage interactions against the position-specific best. Replays current talent math on original official season totals. Temporary API cache is removed; no database writes or salary changes.",
  );
else {
  if (!values.baseline || !values["team-audit"] || !values.output)
    throw new Error("Baseline, team audit and output required");
  if (!["original", "isolated", "development"].includes(values.experiment!))
    throw new Error("Experiment must be original, isolated or development");
  const output = resolve(values.output);
  await mkdir(output);
  const input = await loadFantasyForecastSource(
    resolve(values.baseline),
    resolve(values["team-audit"]),
    console.log,
  );
  console.log(
    `Verified ${input.rows.length} player-seasons; fitting predefined ${values.experiment} models.`,
  );
  const variants: Record<string, ReturnType<typeof runCategoryBacktest>> = {};
  const presets: Record<string, Parameters<typeof runCategoryBacktest>[2]> =
    values.experiment === "development"
      ? {
          "position-best": { skaterImpact: true, historicalSaveRate: true },
          "recent-trends": {
            skaterImpact: true,
            historicalSaveRate: true,
            development: "trend",
          },
          "age-usage": {
            skaterImpact: true,
            historicalSaveRate: true,
            development: "age-usage",
          },
        }
      : values.experiment === "isolated"
        ? {
            "category-v1": {},
            "rate-impact": { includeImpact: true },
            "historical-save-rate": { historicalSaveRate: true },
            "rate-impact-historical-save": {
              includeImpact: true,
              historicalSaveRate: true,
            },
          }
        : {
            "category-v1": {},
            "direct-model": { upgrade: true },
            "nhl-impact-model": { upgrade: true, includeImpact: true },
          };
  for (const [name, options] of Object.entries(presets)) {
    console.log(`Fitting ${name}`);
    variants[name] = runCategoryBacktest(
      input.rows,
      (s) => {
        if (s.includes("origin 2025")) console.log(`${name}: ${s}`);
      },
      options,
    );
    // Save derived diagnostics immediately, so a later scoring failure cannot lose completed evaluations.
    const result = variants[name]!;
    const folds = [...new Set(result.records.map((r) => r.origin))]
      .sort()
      .map((origin) => ({
        origin,
        annual: summarizeCategoryForecasts(
          result.records.filter((r) => r.origin === origin),
        ),
        terms: summarizeCategoryForecasts(
          result.terms.filter((r) => r.origin === origin),
        ),
      }));
    await writeFile(
      resolve(output, `${name}.json`),
      JSON.stringify(
        {
          annual: summarizeCategoryForecasts(result.records),
          terms: summarizeCategoryForecasts(result.terms),
          folds,
          trainingAudit: result.trainingAudit,
          projections: result.projections,
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
  }
  const validation = await validateSalaryForecasts(
    input.rows,
    variants,
    console.log,
  );
  const limitations = [
    "Research preview only. Current production salaries and scoring behavior are unchanged; three existing pure helpers are exported solely for exact formula replay.",
    "Current talent and market-score baselines execute the current production formula on reconstructed official historical season inputs; these are not archived signing-day database values or historical salary quotes.",
    "Salary-ranking target is the average future PlayerNHL fantasy season rating from the current RankingEngine. This measures potential category production, not actual owner lineup decisions or weekly matchup wins. Future NHL departures receive zero value.",
    "Forecast pools contain players known at origin; observed future season ratings include that season's actual population, including rookies. This pool difference can affect score levels. Rank correlations are the primary scalar comparison; raw rating RMSE is diagnostic.",
    "Projected goalie starts hold the origin starts/appearance share constant. Team transactions, injury diagnoses, role changes and prospects with no NHL history are not explicitly modeled.",
    "Each model trains on completed targets only, with fixed regression settings. No future NHL impact rows enter historical features. Impact scores themselves are retrospective reconstructions using the current methodology, not archived forecasts.",
    `Predefined experiment ${values.experiment}: ${Object.keys(presets).join(", ")}. Isolated variants retain appearance-times-rate modeling; impact adds origin-known NHL components, historical save rate substitutes pooled recent SV/SA while preserving learned workload and GAA.`,
    "Complete two/three-year windows, zero-production departures, calendar gaps and paired undefined goalie-rate comparisons follow the first forecast experiment. Pandemic 2019/2020 targets remain excluded. Repeated players and overlapping terms are not independent observations.",
    "These seasons have already been examined in prior research. Results identify candidates for improvement; they are not an untouched final test, calibrated salary prices or permission to deploy.",
  ];
  const report = {
    generatedAt: new Date().toISOString(),
    coverage: input.coverage,
    provenance: input.provenance,
    limitations,
    ...validation,
  };
  await writeFile(
    resolve(output, "salary-validation.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx" },
  );
  const cell = (x: unknown) =>
    '"' + String(x ?? "").replaceAll('"', '""') + '"';
  const table = [
    ...validation.annual.map((r) => ({ scope: "annual", ...r })),
    ...validation.terms.map((r) => ({ scope: "contract-average", ...r })),
  ];
  const columns = Object.keys(table[0] ?? {});
  await writeFile(
    resolve(output, "salary-validation.csv"),
    "\ufeff" +
      [
        columns.map(cell).join(","),
        ...table.map((r) =>
          columns.map((k) => cell(r[k as keyof typeof r])).join(","),
        ),
      ].join("\r\n"),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      output,
      salaryAnnualObservations: validation.scores.length,
      salaryTermObservations: validation.termsScores.length,
    }),
  );
}
