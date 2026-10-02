import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { input: { type: "string" }, help: { type: "boolean" } },
});
if (values.help)
  console.log(
    "Offline HTML report for completed salary-rating experiments. --input <experiment directory>. Reads existing evaluations and writes a new report.html. No API/database access.",
  );
else {
  if (!values.input) throw new Error("Experiment directory required");
  const input = resolve(values.input);
  const salary = JSON.parse(
    await readFile(resolve(input, "salary-validation.json"), "utf8"),
  );
  const categories: Record<string, unknown> = {};
  const methods = [
    ...new Set<string>(salary.annual.map((r: { method: string }) => r.method)),
  ].filter(
    (method) =>
      !method.startsWith("current-") && !method.endsWith("+calibrated"),
  );
  for (const method of methods) {
    const data = JSON.parse(
      await readFile(resolve(input, `${method}.json`), "utf8"),
    );
    categories[method] = { annual: data.annual, terms: data.terms };
  }
  const payload = JSON.stringify({
    annual: salary.annual,
    terms: salary.terms,
    categories,
    limitations: salary.limitations,
  }).replaceAll("<", "\\u003c");
  await writeFile(
    resolve(input, "report.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GSHL salary rating improvements</title><style>body{font:16px system-ui;max-width:1200px;margin:2rem auto;padding:1rem;background:#f8fafc;color:#193047}select{font:inherit;padding:.4rem;margin:.4rem}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:.55rem;text-align:left;border-bottom:1px solid #ccd6df}th{background:#e7eef5}.scroll{overflow:auto}li{margin:.6rem 0}</style><h1>Testing GSHL salary rating improvements</h1>
<p>Predicting average yearly fantasy value over a contract. Current talent math is replayed on official historical inputs; production salaries are unchanged.</p>
<label>Position <select id="position"><option>F</option><option>D</option><option>G</option></select></label><label>Years <select id="horizon"><option>2</option><option>3</option><option>1</option></select></label><label>Evaluation <select id="scope"><option value="terms">Contract annual average</option><option value="annual">Individual future season</option></select></label><label>Cohort <select id="cohort"><option value="established">Established players</option><option value="all">All players</option></select></label>
<h2>Does it rank future fantasy value better?</h2><p>Higher rank correlation is better. The outcome is the current engine's future NHL fantasy season rating. Rating-scale RMSE is supplementary because forecast and actual player pools differ.</p><div class="scroll" id="salary"></div>
<h2>Does it predict the categories better?</h2><p>Lower RMSE is better. See the method notes for the predefined variants in this experiment. Compare sample counts before comparing errors.</p><div class="scroll" id="categories"></div><details><summary>Method and limits</summary><ul id="notes"></ul></details>
<script type="application/json" id="data">${payload}</script><script>
const data=JSON.parse(document.getElementById('data').textContent),el=id=>document.getElementById(id),num=(v,d=3)=>v===null||v===undefined?'—':Number(v).toFixed(d),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function draw(){const pos=el('position').value,h=+el('horizon').value,cohort=el('cohort').value,scope=el('scope').value,match=r=>r.position===pos&&r.horizon===h&&r.cohort===cohort;
const rows=data[scope].filter(match);el('salary').innerHTML='<table><tr><th>Method</th><th>Forecasts</th><th>Rank correlation</th><th>Rating RMSE</th><th>Rating MAE</th></tr>'+rows.map(r=>'<tr><td>'+esc(r.method)+'</td><td>'+r.n+'</td><td>'+num(r.spearman)+'</td><td>'+num(r.rmse,2)+'</td><td>'+num(r.mae,2)+'</td></tr>').join('')+'</table>';
const baseline=Object.keys(data.categories)[0];const base=data.categories[baseline][scope].filter(r=>match(r)&&r.method==='category-model');
const methods=Object.keys(data.categories);el('categories').innerHTML='<table><tr><th>Category</th><th>Weighted history RMSE</th>'+methods.map(m=>'<th>'+esc(m)+' RMSE (n)</th>').join('')+'</tr>'+base.map(r=>{const d=r.category==='SVP'?4:2,w=data.categories[baseline][scope].find(p=>match(p)&&p.category===r.category&&p.method==='weighted-history');return '<tr><td>'+r.category+'</td><td>'+num(w?.rmse,d)+'</td>'+methods.map(m=>{const v=data.categories[m][scope].find(p=>match(p)&&p.category===r.category&&p.method==='category-model');return '<td>'+num(v?.rmse,d)+' ('+(v?.n??0)+')</td>';}).join('')+'</tr>';}).join('')+'</table>';
}el('notes').innerHTML=data.limitations.map(n=>'<li>'+esc(n)+'</li>').join('');for(const id of ['position','horizon','scope','cohort'])el(id).addEventListener('input',draw);draw();</script></html>`,
    { flag: "wx" },
  );
  console.log(resolve(input, "report.html"));
}
