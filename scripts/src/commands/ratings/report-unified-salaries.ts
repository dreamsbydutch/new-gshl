import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { compareUnifiedForecastContracts } from "../../domains/ranking/unified-contract-comparison";
const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
    "forecast-baseline": { type: "string" },
  },
});
if (values.help)
  console.log(
    "Offline unified rating report. --input <unified validation.json> --output <NEW .html> [--forecast-baseline <preceding calibrated salary-validation.json>]. Optional baseline adds a paired complete-contract comparison against the prior category forecaster. No database access or salary publication.",
  );
else {
  if (!values.input || !values.output)
    throw new Error("Input and output required");
  const r = JSON.parse(await readFile(values.input, "utf8"));
  const comparison = values["forecast-baseline"]
    ? compareUnifiedForecastContracts(
        r.contractRows,
        JSON.parse(await readFile(values["forecast-baseline"], "utf8"))
          .termsScores,
        r.selected,
      )
    : [];
  const payload = JSON.stringify({
    selected: r.selected,
    selection: r.selection,
    latestOrigin: r.latestOrigin,
    players: r.players,
    training: r.training,
    later: r.later,
    contracts: r.contracts,
    years: r.years,
    limitations: r.limitations,
    comparison,
  }).replaceAll("<", "\\u003c");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unified GSHL salary rating</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:1200px;margin:auto;padding:24px;background:#f5f7fa;color:#172338}section{background:white;border:1px solid #dce4ed;border-radius:12px;padding:20px;margin:18px 0}h1,h2{line-height:1.2}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:10px;border-bottom:1px solid #e1e7ef;text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}label{display:inline-block;margin-right:12px}input,select{font:inherit;padding:7px;margin:5px}small{color:#586675}.notice{border-left:5px solid #c57a23;background:#fff8ed}.formula{font-size:19px;font-weight:600}</style>
<h1>One ranking for forwards, defensemen and goalies</h1><p class="formula">Contract value = average yearly expected contribution above a replacement at the same position.</p>
<section class="notice"><strong>Candidate rating, calculated locally. Production ratings and contracts are unchanged.</strong><p id="choice"></p><p>The 0–100 rating is a percentile across the entire F/D/G pool. It expresses order, not a probability or a dollar value. The underlying replacement-relative contribution retains the size of each player's advantage.</p></section>
<section><h2>How positions become comparable</h2><p>Season-end category forecasts include workload and availability. Each candidate plays against the same historical opponent contexts, with the goalie appearance minimum and pooled ratio denominators. Replacements are real available players scored in those same units. No position receives a fixed salary quota or an arbitrary multiplier.</p><p>Category-win scoring counts each category equally, including goals, assists and points as the league does. Matchup-win scoring measures how often contributions flip the overall result. The selected objective and replacement depth were chosen using earlier evaluation years, then checked on later years.</p><p id="scope"></p></section>
<section><h2>Inspect the combined ranking</h2><label>Contract <select id="term"><option value="2">2 years</option><option value="3">3 years</option></select></label><label>Position <select id="position"><option value="">All</option><option>F</option><option>D</option><option>G</option></select></label><label>Player <input id="search" type="search" placeholder="Search players"></label><p id="composition"></p><p id="count" aria-live="polite"></p><div class="scroll" id="players"></div><small>Filtering a position keeps the original combined rank. Below-replacement players retain negative underlying values; a high percentile is not an automatic recommendation to sign a contract.</small></section>
<section><h2>Later matchup evaluation</h2><p>2023–24 through 2025–26. Lower Brier error is better. Opening rosters are fixed at the draft; prior-week rosters approximate what was known before each matchup. Home-only uses historical home outcomes without player ratings.</p><div class="scroll" id="later"></div><div class="scroll" id="annual"></div></section>
<section><h2>Complete contract validation</h2><p>Higher rank correlation is better. The target applies each player's actual future NHL production to the neutral lineup contexts and replacement benchmark frozen at signing. It measures category opportunity, not realized owner starts or causal team wins. Unlinked identities and shortened pandemic targets are excluded; known players who depart receive zero production. Repeated players and overlapping contracts are dependent observations.</p><div class="scroll" id="contracts"></div><div class="scroll" id="origins"></div><div class="scroll" id="positions"></div></section>
<section><h2>Comparison with the preceding category forecaster</h2><p>The same completed contract targets, matched player for player. This isolates improvement beyond simply switching from the original talent rating to a category forecast. Correlation is with modeled fantasy opportunity from actual NHL production, not observed owner matchup wins.</p><div class="scroll" id="comparison"></div></section>
<section><h2>Evidence limits</h2><ul id="limits"></ul></section>
<script type="application/json" id="data">${payload}</script><script>
const d=JSON.parse(document.getElementById('data').textContent),n=(v,k=3)=>v==null?'—':v.toFixed(k);
function table(id,headers,rows){const target=document.getElementById(id);target.replaceChildren();const t=document.createElement('table'),h=document.createElement('thead'),b=document.createElement('tbody'),tr=document.createElement('tr');headers.forEach(s=>{const th=document.createElement('th');th.scope='col';th.textContent=s;tr.append(th)});h.append(tr);rows.forEach(row=>{const tr=document.createElement('tr');row.forEach(s=>{const td=document.createElement('td');td.textContent=s;tr.append(td)});b.append(tr)});t.append(h,b);target.append(t)}
document.getElementById('choice').textContent='Selected candidate: '+d.selected+'. '+d.selection;
document.getElementById('scope').textContent='Latest origin: '+d.latestOrigin+'–'+String(d.latestOrigin+1).slice(2)+', immediately after the NHL regular season. Forecast years: '+(d.latestOrigin+1)+'–'+String(d.latestOrigin+2).slice(2)+' onward. Future rosters and ice time are forecasts, never known inputs.';
table('later',['Roster test','Method','Games','Brier error','Winner accuracy'],d.later.map(r=>[r.mode,r.method,r.n,n(r.brier,5),n(100*r.accuracy,1)+'%']));
table('annual',['Season ending','Roster test','Selected Brier','Raw-rating Brier','Home-only Brier'],d.years.flatMap(y=>['opening','prior-week'].map(mode=>[y.year,mode,...[d.selected,'raw-rating','home-only'].map(method=>n(y.metrics.find(r=>r.mode===mode&&r.method===method)?.brier,5))])));
table('contracts',['Years','Cohort','Player contracts','Unified correlation','Raw-rating correlation'],d.contracts.filter(r=>r.method===d.selected).map(r=>[r.term,r.cohort,r.n,n(r.rankCorrelation),n(r.rawRatingCorrelation)]));
table('origins',['Years','Signing season start','Established contracts','Unified correlation','Raw-rating correlation'],d.contracts.filter(r=>r.method===d.selected&&r.cohort==='established').flatMap(r=>r.origins.map(o=>[r.term,o.origin,o.n,n(o.rankCorrelation),n(o.rawRatingCorrelation)])));
table('positions',['Years','Position','Established contracts','Unified correlation','Raw-rating correlation'],d.contracts.filter(r=>r.method===d.selected&&r.cohort==='established').flatMap(r=>r.positions.map(p=>[r.term,p.position,p.n,n(p.rankCorrelation),n(p.rawRatingCorrelation)])));
d.limitations.forEach(s=>{const li=document.createElement('li');li.textContent=s;document.getElementById('limits').append(li)});
table('comparison',['Years','Cohort','Position','Contracts','Unified correlation','Previous forecast correlation'],d.comparison.map(r=>[r.term,r.cohort,r.position,r.n,n(r.unified),n(r.previous)]));
function render(){const term=Number(document.getElementById('term').value),pos=document.getElementById('position').value,q=document.getElementById('search').value.toLowerCase(),pool=d.players.filter(r=>r.term===term),rows=pool.filter(r=>(!pos||r.position===pos)&&r.name.toLowerCase().includes(q));document.getElementById('composition').textContent='Top 30: '+['F','D','G'].map(p=>pool.filter(r=>r.rank<=30&&r.position===p).length+' '+p).join(' / ')+'. These counts emerge from value; they are not quotas.';document.getElementById('count').textContent=rows.length+' matches; first 150 shown.';table('players',['Overall rank','Player','Position','Unified percentile','Mean yearly value','Year 1','Year 2','Year 3'],rows.slice(0,150).map(r=>[r.rank,r.name,r.position,n(r.rating,2),n(r.value,4),...[1,2,3].map(h=>n(r.horizons.find(v=>v.horizon===h)?.value,4))]));}
['term','position'].forEach(id=>document.getElementById(id).addEventListener('change',render));document.getElementById('search').addEventListener('input',render);render();
</script></html>`;
  await writeFile(values.output, html, { flag: "wx" });
  console.log(values.output);
}
