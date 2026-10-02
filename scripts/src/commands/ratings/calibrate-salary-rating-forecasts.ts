import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  chronologicalRatingCalibration,
  type HistoricalRatingForecast,
} from "../../runtime/contract-rating-calibration";
import {
  correlation,
  spearman,
} from "../../domains/ranking/nhl-rating-diagnostics";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    "forward-workload": { type: "boolean" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Offline chronological salary-rating calibration test. --input <completed salary experiment directory> --output <NEW directory> [--forward-workload]. Calibrates all methods using only prior forecasts whose outcomes matured by each origin. Optional forward workload groups use origin appearances and fall back to whole-position calibration when evidence is insufficient. Never changes production.",
  );
else {
  if (!values.input || !values.output)
    throw new Error("Input and new output required");
  const input = resolve(values.input),
    output = resolve(values.output);
  const prior = JSON.parse(
    await readFile(resolve(input, "salary-validation.json"), "utf8"),
  ) as {
    scores: HistoricalRatingForecast[];
    termsScores: HistoricalRatingForecast[];
    limitations: string[];
    [key: string]: unknown;
  };
  const calibrated = chronologicalRatingCalibration(
    prior.scores,
    values["forward-workload"] ? ["F"] : [],
  );
  const groups = new Map<string, HistoricalRatingForecast[]>();
  for (const r of calibrated.rows) {
    const key = `${r.origin}:${r.playerId}:${r.method}`,
      group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }
  const terms: HistoricalRatingForecast[] = [];
  for (const group of groups.values())
    for (const horizon of [2, 3]) {
      const rows = group.filter((r) => r.horizon <= horizon);
      if (rows.length !== horizon) continue;
      terms.push({
        ...rows[0]!,
        horizon,
        prediction: rows.reduce((s, r) => s + r.prediction, 0) / horizon,
        actual: rows.reduce((s, r) => s + r.actual, 0) / horizon,
      });
    }
  const scores = [...prior.scores, ...calibrated.rows],
    termsScores = [...prior.termsScores, ...terms];
  function summarize(rows: HistoricalRatingForecast[]) {
    const results = [];
    for (const position of ["F", "D", "G"])
      for (const horizon of [1, 2, 3])
        for (const cohort of ["all", "established"])
          for (const method of [...new Set(rows.map((r) => r.method))]) {
            const pool = rows.filter(
              (r) =>
                r.position === position &&
                r.horizon === horizon &&
                r.method === method &&
                (cohort === "all" || r.established),
            );
            if (!pool.length) continue;
            const y = pool.map((r) => r.actual),
              p = pool.map((r) => r.prediction);
            results.push({
              position,
              horizon,
              cohort,
              method,
              n: pool.length,
              rmse: Math.sqrt(
                y.reduce((s, v, i) => s + (p[i]! - v) ** 2, 0) / pool.length,
              ),
              mae:
                y.reduce((s, v, i) => s + Math.abs(p[i]! - v), 0) / pool.length,
              pearson: correlation(y, p),
              spearman: spearman(y, p),
            });
          }
    return results;
  }
  const report = {
    ...prior,
    generatedAt: new Date().toISOString(),
    scores,
    termsScores,
    annual: summarize(scores),
    terms: summarize(termsScores),
    folds: [...new Set(scores.map((r) => r.origin))].sort().map((origin) => ({
      origin,
      annual: summarize(scores.filter((r) => r.origin === origin)),
      terms: summarize(termsScores.filter((r) => r.origin === origin)),
    })),
    calibrationAudit: calibrated.audit,
    workloadCalibrationPositions: values["forward-workload"] ? ["F"] : [],
    limitations: [
      ...prior.limitations,
      "Calibrated variants fit a positive linear score correction separately by position/horizon/method, using only matured prior-origin forecasts. At least 100 examples and two origin years are required; otherwise the original score is retained. A fixed 50-observation identity prior limits changes. All baselines receive the same calibration opportunity. Early folds may be uncalibrated; maturity checks are recorded.",
    ],
  };
  await mkdir(output);
  await writeFile(
    resolve(output, "salary-validation.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx" },
  );
  for (const file of [...new Set(prior.scores.map((r) => r.method))]
    .filter((method) => !method.startsWith("current-"))
    .map((method) => `${method}.json`))
    await copyFile(resolve(input, file), resolve(output, file));
  const table = [
      ...report.annual.map((r) => ({ scope: "annual", ...r })),
      ...report.terms.map((r) => ({ scope: "contract-average", ...r })),
    ],
    columns = Object.keys(table[0] ?? {}),
    cell = (x: unknown) => '"' + String(x ?? "").replaceAll('"', '""') + '"';
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
      calibratedPredictions: calibrated.rows.filter((r) => r.calibrated).length,
      fits: calibrated.audit.filter((r) => r.active).length,
    }),
  );
}
