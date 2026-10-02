import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadFantasyForecastSource } from "../../integrations/nhl/fantasy-forecast-source";
import { runCategoryBacktest } from "../../domains/ranking/fantasy-category-backtest";

const { values } = parseArgs({
  options: {
    baseline: { type: "string" },
    "team-audit": { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Read-only reconstruction of chronological salary category predictions. --baseline <NHL source root> --team-audit <team-success-input.json> --output <NEW directory>. Fetches official NHL source metrics in a temporary cache, removed after calculation. Saves derived predictions, not source metrics. No database writes.",
  );
else {
  if (!values.baseline || !values["team-audit"] || !values.output)
    throw new Error("All paths required");
  await mkdir(values.output);
  const source = await loadFantasyForecastSource(
    resolve(values.baseline),
    resolve(values["team-audit"]),
    console.log,
  );
  const gp = new Map(
    source.rows.map((r) => [`${r.year}:${r.playerId}`, r.totals.GP]),
  );
  const variants = [];
  for (const [method, development] of [
    ["position-best", "none"],
    ["age-usage", "age-usage"],
  ] as const) {
    const result = runCategoryBacktest(source.rows, console.log, {
      skaterImpact: true,
      historicalSaveRate: true,
      development,
      retainHistoricalProjections: true,
    });
    const predictions = result.projections.map((r) => ({
      origin: r.origin,
      horizon: r.horizon,
      playerId: r.playerId,
      name: r.name,
      position: r.position,
      prediction: r.prediction,
      originGames: gp.get(`${r.origin}:${r.playerId}`),
    }));
    variants.push({ method, predictions, trainingAudit: result.trainingAudit });
  }
  await writeFile(
    resolve(values.output, "forecasts.json"),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      coverage: source.coverage,
      variants,
      limitations: [
        "Reconstructed historical regular-season data, not signing-day snapshots.",
        "All training outcomes mature by origin. Pandemic target seasons excluded.",
        "Age-usage selection for forwards below 40 schedule-adjusted games was previously identified on these data; evaluation is development evidence.",
      ],
    }),
    { flag: "wx" },
  );
  console.log("Saved derived chronological forecasts");
}
