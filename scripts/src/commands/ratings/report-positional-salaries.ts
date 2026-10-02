import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    analysis: { type: "string" },
    attribution: { type: "string" },
    validation: { type: "string" },
    opening: { type: "string" },
    weights: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Offline interactive positional salary report. --analysis <analysis.json> --attribution <outcome-attribution.json> --validation <prior-week validation.json> --opening <opening validation.json> --weights <prior-week weights validation.json> --output <NEW .html file>. No database access.",
  );
else {
  for (const key of [
    "analysis",
    "attribution",
    "validation",
    "opening",
    "weights",
    "output",
  ] as const)
    if (!values[key]) throw new Error(`Missing --${key}`);
  const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
  const [analysis, attribution, validation, opening, weights] =
    await Promise.all([
      read(values.analysis!),
      read(values.attribution!),
      read(values.validation!),
      read(values.opening!),
      read(values.weights!),
    ]);
  const data = JSON.stringify({
    analysis,
    attribution,
    validation,
    opening,
    weights,
  }).replaceAll("<", "\\u003c");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GSHL positional salary research</title>
<style>body{font:16px/1.55 system-ui,sans-serif;margin:auto;max-width:1200px;padding:24px;color:#172338;background:#f5f7fa}h1,h2{line-height:1.2}section{background:white;border:1px solid #dbe3ec;border-radius:12px;padding:22px;margin:20px 0}.notice{border-left:6px solid #bb6a15;background:#fff5e6}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:right;padding:10px;border-bottom:1px solid #e4e8ef;white-space:nowrap}th:first-child,td:first-child{text-align:left}caption{text-align:left;margin-bottom:12px}select,input{font:inherit;padding:8px;max-width:100%;margin:6px}label{display:inline-block}small{color:#536177}.bar{display:flex;height:34px;margin:8px 0;color:#fff;font-weight:600}.bar span{text-align:center;min-width:40px}button{padding:8px;font:inherit}a{color:#155ab6}</style>
<h1>What are F, D and G worth to a GSHL team?</h1>
<p>Historical matchup contribution, replacement scarcity and season-end forecast uncertainty are separate parts of player value.</p>
<section class="notice"><strong>Research result: no positional salary replacement selected for production.</strong><p>Simple position multipliers failed the later-season tests. The modeled matchup-value candidate gives a small, inconsistent probability improvement when evaluated with prior-week rosters, and loses with opening rosters. These prices are sensitivity scenarios, not approved salaries or a demonstrated optimal allocation.</p></section>
<section><h2>Historical evidence</h2><p id="coverage"></p><p id="contribution"></p><div class="bar" id="bar" aria-label="Retrospective position contributions"></div><p>Exact three-position Shapley decomposition: equalize selected position groups between each pair of opponents, then average each group's marginal effect over all six ordering choices. Tied category totals receive half a win. This describes realized outcomes under today's ten-category rules. It is sensitive to that counterfactual and does not measure causal or predictable salary value.</p><div class="scroll" id="years"></div></section>
<section><h2>Can it predict later matchup results?</h2><p>Player forecasts use only preceding NHL seasons; model calibration uses only earlier GSHL seasons. Later evaluation covers 2023–24 through 2025–26. Lower Brier error is better. A constant 50% prediction scores 0.25 when all outcomes are binary; historical ties alter that reference. The home-only benchmark learns earlier home outcomes without player ratings.</p><div class="scroll" id="validation"></div><p>Prior-week ownership is a diagnostic proxy for the roster known before each game week. It does not put future ownership, future ice time or postseason results into the individual season-end salary forecast. Opening-roster validation is included because a signing-day valuation cannot know future roster moves.</p><div class="scroll" id="annual"></div><p><strong>Limits:</strong> only three later evaluation seasons; dependent teams/weeks; retrospectively repaired NHL inputs rather than archived signing-day snapshots. Historical validation uses the existing three-year category projection, not a complete historical rerun of the newer experimental forecaster. An unchanged or better aggregate score alone is insufficient to select a new salary policy.</p></section>
<section><h2>Replacement depth changes the dollar split</h2><p>Percentages below describe the salary premium above the $1m floor, not the entire salary pool or keeper cap. They emerge from each model instead of enforcing positional quotas. Prices apply the existing rank-to-dollar curve with a $1m floor for nonpositive replacement value. The league has a keeper cap, so a full-roster salary sum is not a recommended budget.</p><div class="scroll" id="scenarios"></div><p>The simulation integrates uncertain appearance counts, including the two-appearance goalie minimum, and pools saves/shots and goals/minutes correctly. It preserves observed opponent category combinations, including the overlap of goals, assists and points. It does not simulate full within-game scoring/save variance or optimize future lineups. UTIL is treated as a forward.</p></section>
<section><h2>Inspect candidate prices</h2><p>Frozen 2025–26 regular-season inputs; annual salaries for the following two or three seasons. The comparison column is the earlier experimental forecast sample, not a production quote.</p><label>Scenario <select id="scenario"></select></label><label>Position <select id="position"><option value="">All</option><option>F</option><option>D</option><option>G</option></select></label><label>Player <input id="search" type="search" placeholder="Search by name"></label><p id="count" aria-live="polite"></p><div class="scroll" id="players"></div></section>
<script type="application/json" id="data">${data}</script><script>
const d=JSON.parse(document.getElementById('data').textContent),pct=x=>(100*x).toFixed(1)+'%',money=x=>'$'+(x/1e6).toFixed(2)+'m';
function table(id,headers,rows){const target=document.getElementById(id);target.replaceChildren();const t=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody'),tr=document.createElement('tr');headers.forEach(s=>{const th=document.createElement('th');th.scope='col';th.textContent=s;tr.append(th)});head.append(tr);rows.forEach(row=>{const tr=document.createElement('tr');row.forEach(s=>{const td=document.createElement('td');td.textContent=s;tr.append(td)});body.append(tr)});t.append(head,body);target.append(t)}
const a=d.analysis.audit,rows=d.attribution.records.filter(r=>r.year>=2022&&r.result!==0),shares=['F','D','G'].map(p=>rows.reduce((s,r)=>s+Math.sign(r.result)*r[p],0)/(.5*rows.length));
document.getElementById('coverage').textContent=a.reduce((s,r)=>s+r.playerWeeks,0).toLocaleString()+' player-week rows; '+a.reduce((s,r)=>s+r.validMatchups,0).toLocaleString()+' reconciled regular-season matchups across 2014–15 through 2025–26. The 2013–14 season has no retained weekly history. Seven 2025–26 games lack reconciled weekly rows and are excluded from the context/attribution analysis; their stored outcomes remain in prediction evaluation.';
document.getElementById('contribution').textContent='Across '+rows.length+' decisive matchups in 2021–22 through 2025–26, this decomposition assigns '+pct(shares[0])+' to F, '+pct(shares[1])+' to D and '+pct(shares[2])+' to G. These are not salary weights.';
shares.forEach((v,i)=>{const s=document.createElement('span');s.style.width=pct(v);s.style.background=['#2355a0','#26805d','#8854a6'][i];s.textContent=['F','D','G'][i]+' '+pct(v);document.getElementById('bar').append(s)});
table('years',['Season','Decisive games','F','D','G'],d.attribution.summaries.filter(r=>r.year>=2021).map(r=>[(r.year-1)+'–'+String(r.year).slice(2),r.matchups,pct(r.F),pct(r.D),pct(r.G)]));
const comparisons=[...d.validation.heldOut.map(r=>['Prior week',r]),...d.opening.heldOut.map(r=>['Opening',r]),...d.weights.heldOut.filter(r=>r.method!=='raw-rating').map(r=>['Prior week',r])];
table('validation',['Roster evaluation','Model','Games','Brier error','Winner accuracy'],comparisons.map(([mode,r])=>[mode,r.method,r.n,r.brier.toFixed(5),pct(r.accuracy)]));
table('annual',['Season','Model','Brier error','Winner accuracy'],d.validation.years.filter(y=>y.year>=2024).flatMap(y=>y.metrics.filter(r=>['home-only','raw-rating','empirical'].includes(r.method)).map(r=>[(y.year-1)+'–'+String(y.year).slice(2),r.method,r.brier.toFixed(5),pct(r.accuracy)])));
table('scenarios',['Scenario','F premium','D premium','G premium'],d.analysis.scenarios.map(s=>[s.scenario.name,...['F','D','G'].map(p=>pct(s.shares.find(r=>r.pos===p).salaryPremiumShare))]));
const scenario=document.getElementById('scenario');d.analysis.scenarios.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s.scenario.name;scenario.append(o)});
function render(){const s=d.analysis.scenarios[Number(scenario.value)],position=document.getElementById('position').value,q=document.getElementById('search').value.toLowerCase(),players=s.players.filter(p=>(!position||p.position===position)&&p.name.toLowerCase().includes(q));document.getElementById('count').textContent=players.length+' matching players; showing first 150.';table('players',['Player','Position','Origin GP','2-year annual','3-year annual','Earlier 2-year sample','2-year mean win gain / week'],players.slice(0,150).map(p=>[p.name,p.position,p.originGames,money(p.twoYearSalary),money(p.threeYearSalary),money(p.twoYearAnnualSalary),pct(p.twoYearValue)]));}
scenario.addEventListener('change',render);document.getElementById('position').addEventListener('change',render);document.getElementById('search').addEventListener('input',render);render();
</script></html>`;
  await writeFile(values.output!, html, { flag: "wx" });
  console.log(values.output);
}
