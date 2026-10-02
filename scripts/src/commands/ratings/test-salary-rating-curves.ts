import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  fitRatingCurve,
  applyRatingCurve,
} from "../../runtime/contract-rating-curve";
import type { HistoricalRatingForecast as Row } from "../../runtime/contract-rating-calibration";
import {
  fitWorkloadRatingCalibration,
  applyContractRatingCalibration,
} from "../../runtime/contract-rating-calibration";
import { spearman } from "../../domains/ranking/nhl-rating-diagnostics";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Offline season-end rating research. --input <isolated calibrated experiment directory> --output <NEW directory>. Tests monotone calibration and matured-outcome blending; no API or database writes.",
  );
else {
  if (!values.input || !values.output)
    throw new Error("Input and new output required");
  const source = JSON.parse(
    await readFile(resolve(values.input, "salary-validation.json"), "utf8"),
  ) as { scores: Row[]; limitations: string[] };
  const method = (position: string) =>
    position === "G" ? "historical-save-rate" : "rate-impact";
  const raw = source.scores.filter((r) => r.method === method(r.position));
  if (!raw.length) throw new Error("No isolated candidate forecasts found");
  const lookup = new Map(
    source.scores.map((r) => [
      `${r.origin}:${r.horizon}:${r.playerId}:${r.method}`,
      r,
    ]),
  );
  const scores: Row[] = [],
    audit: unknown[] = [];
  const fits = new Map<string, ReturnType<typeof fitRatingCurve>>(),
    weights = new Map<string, number>();
  const experienceFits = new Map<
    string,
    ReturnType<typeof fitWorkloadRatingCalibration>
  >();
  for (const r of raw) {
    const key = `${r.origin}:${r.position}:${r.horizon}`;
    const base = lookup.get(
      `${r.origin}:${r.horizon}:${r.playerId}:${r.method}+calibrated`,
    )!;
    const current = lookup.get(
      `${r.origin}:${r.horizon}:${r.playerId}:current-talent+calibrated`,
    )!;
    if (
      !base ||
      !current ||
      base.actual !== r.actual ||
      current.actual !== r.actual
    )
      throw new Error("Unpaired forecasts");
    const experienceKey = `${key}:${r.established}`;
    let experience = experienceFits.get(experienceKey);
    if (!experience) {
      experience = fitWorkloadRatingCalibration(
        raw,
        r.origin,
        r.position,
        r.horizon,
        r.method,
        r.established,
      );
      experienceFits.set(experienceKey, experience);
      audit.push({ key: experienceKey, experienceCalibration: experience });
    }
    let curve = fits.get(key);
    if (!curve) {
      curve = fitRatingCurve(raw, r.origin, r.position, r.horizon, r.method);
      fits.set(key, curve);
      audit.push({ key, ...curve });
    }
    let weight = weights.get(key);
    if (weight === undefined) {
      const train = raw.filter(
        (t) =>
          t.position === r.position &&
          t.horizon === r.horizon &&
          t.origin + t.horizon <= r.origin,
      );
      let numerator = 0,
        denominator = 0;
      for (const t of train) {
        const a = lookup.get(
          `${t.origin}:${t.horizon}:${t.playerId}:${t.method}+calibrated`,
        )!.prediction;
        const b = lookup.get(
          `${t.origin}:${t.horizon}:${t.playerId}:current-talent+calibrated`,
        )!.prediction;
        numerator += (a - b) * (t.actual - b);
        denominator += (a - b) ** 2;
      }
      const prior = (denominator * 50) / Math.max(1, train.length);
      weight =
        train.length >= 100 &&
        new Set(train.map((t) => t.origin)).size >= 2 &&
        denominator > 0
          ? Math.max(
              0,
              Math.min(1, (numerator + prior) / (denominator + prior)),
            )
          : 1;
      weights.set(key, weight);
      audit.push({
        key,
        blendWeight: weight,
        observations: train.length,
        latestOutcome: train.length
          ? Math.max(...train.map((t) => t.origin + t.horizon))
          : null,
      });
    }
    scores.push(
      { ...base, method: "previous-best" },
      {
        ...r,
        method: "experience-calibration",
        prediction: experience.active
          ? applyContractRatingCalibration(r.prediction, experience)
          : base.prediction,
      },
      {
        ...r,
        method: "monotone-curve",
        prediction: applyRatingCurve(r.prediction, curve),
      },
      {
        ...r,
        method: "talent-blend",
        prediction:
          weight * base.prediction + (1 - weight) * current.prediction,
      },
    );
  }
  const terms: Row[] = [];
  const groups = new Map<string, Row[]>();
  for (const r of scores) {
    const key = `${r.origin}:${r.playerId}:${r.method}`,
      g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }
  for (const group of groups.values())
    for (const horizon of [2, 3]) {
      const matches = group.filter((r) => r.horizon <= horizon);
      if (
        matches.length !== horizon ||
        new Set(matches.map((r) => r.horizon)).size !== horizon
      )
        continue;
      terms.push({
        ...matches[0]!,
        horizon,
        prediction: matches.reduce((s, r) => s + r.prediction, 0) / horizon,
        actual: matches.reduce((s, r) => s + r.actual, 0) / horizon,
      });
    }
  function summarize(rows: Row[]) {
    const result = [];
    for (const position of ["F", "D", "G"])
      for (const horizon of [1, 2, 3])
        for (const cohort of ["all", "established", "limited-workload"])
          for (const method of [
            "previous-best",
            "monotone-curve",
            "talent-blend",
            "experience-calibration",
          ]) {
            const pool = rows.filter(
              (r) =>
                r.position === position &&
                r.horizon === horizon &&
                r.method === method &&
                (cohort === "all" ||
                  (cohort === "established" ? r.established : !r.established)),
            );
            if (!pool.length) continue;
            result.push({
              position,
              horizon,
              cohort,
              method,
              n: pool.length,
              bias:
                pool.reduce((s, r) => s + r.prediction - r.actual, 0) /
                pool.length,
              rmse: Math.sqrt(
                pool.reduce((s, r) => s + (r.prediction - r.actual) ** 2, 0) /
                  pool.length,
              ),
              spearman: spearman(
                pool.map((r) => r.actual),
                pool.map((r) => r.prediction),
              ),
            });
          }
    return result;
  }
  const report = {
    generatedAt: new Date().toISOString(),
    cutoff:
      "Final NHL regular-season game; no playoffs or subsequent roster information",
    limitations: [
      ...source.limitations,
      "Predefined eight-bin monotone correction with 20 identity observations per bin; blend constrained to [0,1] with a 50-observation prior favoring the previous best. Historical seasons already examined; not an untouched final test.",
      "Workload split was added after inspecting the curve/blend results. Origin workload uses the existing 40-game skater / 15-game goalie schedule-adjusted thresholds; these groups are not rookie versus veteran. Subgroup calibration falls back to position calibration without 100 matured examples and two origins. Threshold discontinuities and injury-specific effects remain unvalidated.",
    ],
    annual: summarize(scores),
    terms: summarize(terms),
    folds: [...new Set(scores.map((r) => r.origin))].sort().map((origin) => ({
      origin,
      terms: summarize(terms.filter((r) => r.origin === origin)),
    })),
    audit,
    scores,
    termsScores: terms,
  };
  await mkdir(resolve(values.output));
  await writeFile(
    resolve(values.output, "validation.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx" },
  );
  const table = [
    ...report.annual.map((r) => ({ scope: "annual", ...r })),
    ...report.terms.map((r) => ({ scope: "contract", ...r })),
  ];
  const columns = Object.keys(table[0]!),
    cell = (v: unknown) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
  await writeFile(
    resolve(values.output, "comparison.csv"),
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
    JSON.stringify(
      report.terms.filter((r) => r.cohort === "established"),
      null,
      2,
    ),
  );
}
