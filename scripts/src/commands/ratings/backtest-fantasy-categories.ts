import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadFantasyForecastSource } from "../../integrations/nhl/fantasy-forecast-source";
import {
  runCategoryBacktest,
  summarizeCategoryForecasts,
} from "../../domains/ranking/fantasy-category-backtest";
import { FANTASY_FORECAST_VERSION } from "../../runtime/fantasy-category-forecast";

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
    "Experimental category forecast, no database reads/writes or salary changes. --baseline <13-season saved source root> --team-audit <verified team-success-input.json> --output <NEW directory>. Fetches official NHL hits/blocks and immutable birthdates into automatically removed scratch storage; saves predictions, evaluation and source hashes only. Forecasts +1/+2/+3 years, expanding-window training, 82-game-equivalent totals; pandemic target seasons excluded.",
  );
else {
  if (!values.baseline || !values["team-audit"] || !values.output)
    throw new Error("Baseline, team audit and output required");
  const output = resolve(values.output);
  await mkdir(output);
  const input = await loadFantasyForecastSource(
    resolve(values.baseline),
    resolve(values["team-audit"]),
    console.log,
  );
  console.log(
    `Validated ${input.rows.length} player-seasons; source scratch removed. Fitting forecasts.`,
  );
  const result = runCategoryBacktest(input.rows, console.log);
  const annual = summarizeCategoryForecasts(result.records),
    terms = summarizeCategoryForecasts(result.terms);
  const origins = [...new Set(result.records.map((r) => r.origin))].sort();
  const folds = origins.map((origin) => ({
    origin,
    annual: summarizeCategoryForecasts(
      result.records.filter((r) => r.origin === origin),
    ),
    terms: summarizeCategoryForecasts(
      result.terms.filter((r) => r.origin === origin),
    ),
  }));
  const limitations = [
    "Local experimental forecast; neither GSHL ratings nor salaries are changed. Baselines are last-season categories and a four-year recency-weighted category history, not the exact production overall-rating/salary formula.",
    "Forecasts separate expected appearances from category production per appearance using fixed ridge regression. F/D/G and horizons 1/2/3 have separate fits. Features: historical category rates, workload, power-play minutes, calendar history and target-year age. No NHL impact-model features yet.",
    "Each fit uses only targets completed by the origin season. Feature normalization is fit on training rows only. Whole future windows must be observed for contract-term evaluation; no outcomes beyond 2025-26 are invented.",
    "All players appearing in the origin season enter the cohort. Subsequent absence from a fully verified NHL season is zero production, not exclusion. Incoming prospects without NHL history are not covered. Established subset: at least 40 skater or 15 goalie 82-game-equivalent appearances at origin.",
    "Totals are normalized to 82 team games using verified historical team schedules, weighted by a traded player's appearances. Pandemic 2019-20 and 2020-21 targets are excluded from training and primary evaluation; their normalized past statistics may be predictors once completed.",
    "Points are goals plus assists. Goalie GAA uses projected goals allowed/minutes; save percentage uses independently recorded saves/shots. Official GA need not equal shots minus saves. Term ratios use pooled denominators, not averages of percentages. No-appearance goalie seasons are included for wins/workload and excluded from undefined rate error metrics.",
    "Two/three-year results evaluate average annual category production over complete contracts, with equal year weights. They do not yet measure weekly category wins, replacement value, optimal lineups or a scalar salary rating.",
    "Regression settings are fixed before this run. These are chronological research tests on retrospectively acquired corrected data, not archived live forecasts. Overlapping contracts and repeated players make observations dependent; fold results are diagnostics, not independent significance tests.",
    "No explicit injury diagnosis, transactions, future team changes, preseason depth charts or calibrated prediction intervals. Age/workload histories provide limited indirect information. Do not promote to salary production from aggregate error alone.",
    "Each category compares identical player/origin cohorts across all methods. Undefined actual or predicted goalie ratios are omitted jointly and counted explicitly; wins and appearances still evaluate every player. Zero projected workload is not evidence of good rate prediction.",
  ];
  const report = {
    version: FANTASY_FORECAST_VERSION,
    generatedAt: new Date().toISOString(),
    acquiredAt: input.acquiredAt,
    coverage: input.coverage,
    provenance: input.provenance,
    limitations,
    years: result.years,
    excludedTargets: result.excludedTargets,
    trainingAudit: result.trainingAudit,
    annual,
    terms,
    folds,
    projections: result.projections,
  };
  await writeFile(
    resolve(output, "analysis.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx" },
  );
  const csv = (rows: Record<string, unknown>[]) => {
    const columns = Object.keys(rows[0] ?? {}),
      cell = (v: unknown) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
    return (
      "\ufeff" +
      [
        columns.map(cell).join(","),
        ...rows.map((r) => columns.map((k) => cell(r[k])).join(",")),
      ].join("\r\n")
    );
  };
  await writeFile(
    resolve(output, "projections.csv"),
    csv(
      result.projections.map(({ prediction, ...r }) => ({
        ...r,
        ...prediction,
      })),
    ),
    { flag: "wx" },
  );
  await writeFile(
    resolve(output, "evaluation.csv"),
    csv([
      ...annual.map((r) => ({ scope: "individual-future-season", ...r })),
      ...terms.map((r) => ({ scope: "average-annual-contract", ...r })),
    ]),
    { flag: "wx" },
  );
  await writeFile(
    resolve(output, "backtest-errors.csv"),
    csv(
      result.records.map(({ prediction, actual, ...r }) => ({
        ...r,
        ...Object.fromEntries(
          Object.keys(prediction).map((k) => {
            const key = k as keyof typeof prediction;
            return [
              key + "Error",
              prediction[key] === null || actual[key] === null
                ? null
                : prediction[key]! - actual[key]!,
            ];
          }),
        ),
      })),
    ),
    { flag: "wx" },
  );
  const data = JSON.stringify({
    annual,
    terms,
    projections: result.projections,
    limitations,
  }).replaceAll("<", "\\u003c");
  await writeFile(
    resolve(output, "report.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GSHL category forecast experiment</title><style>body{font:16px system-ui;margin:2rem auto;max-width:1200px;padding:1rem;background:#f8fafc;color:#193047}select,input{font:inherit;padding:.4rem;margin:.4rem}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:.55rem;text-align:left;border-bottom:1px solid #ccd6df}th{background:#e7eef5}.scroll{overflow:auto}li{margin:.5rem 0}</style>
<h1>GSHL category forecast experiment</h1><p>Forecasting future fantasy production from category history, age and workload. No production salary changes. Totals are 82-game equivalents.</p>
<label>Position <select id="position"><option>F</option><option>D</option><option>G</option></select></label><label>Horizon <select id="horizon"><option>2</option><option>3</option><option>1</option></select></label><label>Evaluation <select id="scope"><option value="terms">Average annual contract production</option><option value="annual">Individual future season</option></select></label><label>Cohort <select id="cohort"><option value="established">Established NHL players</option><option value="all">All origin-season players</option></select></label>
<p>Lower error is better. Improvement compares the category model with the weighted-history baseline; negative means worse. RMSE penalizes large misses more than MAE.</p><div class="scroll" id="evaluation"></div>
<h2>Experimental upcoming-season projections</h2><p>Horizon 1 = 2026-27; 2 = 2027-28; 3 = 2028-29. These projections are category estimates, not salary rankings.</p><label>Find player <input type="search" id="search" placeholder="Name"></label><div class="scroll" id="projections"></div>
<details><summary>Method and limitations</summary><ul id="notes"></ul></details><script type="application/json" id="data">${data}</script><script>
const data=JSON.parse(document.getElementById('data').textContent),el=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),num=(v,d=2)=>v===null||v===undefined?'—':Number(v).toFixed(d);
function draw(){const pos=el('position').value,h=+el('horizon').value,cohort=el('cohort').value,scope=el('scope').value,pool=data[scope].filter(r=>r.position===pos&&r.horizon===h&&r.cohort===cohort),model=pool.filter(r=>r.method==='category-model');
el('evaluation').innerHTML='<table><tr><th>Category</th><th>Player forecasts</th><th>Last-season RMSE</th><th>Weighted-history RMSE</th><th>Model RMSE</th><th>RMSE improvement</th><th>Model MAE</th><th>Mean error</th></tr>'+model.map(r=>{const b=pool.find(p=>p.category===r.category&&p.method==='weighted-history'),l=pool.find(p=>p.category===r.category&&p.method==='last-season'),d=r.category==='SVP'?4:2;return '<tr><td>'+r.category+'</td><td>'+r.n+'</td><td>'+num(l.rmse,d)+'</td><td>'+num(b.rmse,d)+'</td><td>'+num(r.rmse,d)+'</td><td>'+num(100*(1-r.rmse/b.rmse),1)+'%</td><td>'+num(r.mae,d)+'</td><td>'+num(r.bias,d)+'</td></tr>';}).join('')+'</table>'+(model.length?'':'<p>No complete contract results for this selection.</p>');
const keys=pos==='G'?['GP','W','GAA','SVP']:['GP','G','A','P','PPP','SOG','HIT','BLK'],q=el('search').value.toLowerCase(),players=data.projections.filter(r=>r.position===pos&&r.horizon===h&&r.name.toLowerCase().includes(q)).sort((a,b)=>(pos==='G'?b.prediction.W-a.prediction.W:b.prediction.P-a.prediction.P));
el('projections').innerHTML='<table><tr><th>Player</th>'+keys.map(k=>'<th>'+k+'</th>').join('')+'</tr>'+players.map(r=>'<tr><td>'+esc(r.name)+'</td>'+keys.map(k=>'<td>'+num(r.prediction[k],k==='SVP'?4:1)+'</td>').join('')+'</tr>').join('')+'</table>';
}el('notes').innerHTML=data.limitations.map(n=>'<li>'+esc(n)+'</li>').join('');for(const id of ['position','horizon','scope','cohort','search'])el(id).addEventListener('input',draw);draw();</script></html>`,
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      output,
      inputPlayers: input.rows.length,
      annualPredictions: result.records.length / 3,
      completeTermPredictions: result.terms.length / 3,
      futureProjections: result.projections.length,
    }),
  );
}
