import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  compareNhlSalaries,
  type SalarySeason,
} from "../../domains/ranking/nhl-salary-comparison";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Offline NHL salary comparison. --input <snapshot.json> --output <NEW directory>. Writes interactive HTML, CSV and JSON; no API/database access. Uses cap hit, never substitutes cash salary; peer ranges are descriptive, not fair-market estimates.",
  );
else {
  if (!values.input || !values.output)
    throw new Error("Input and new output required");
  const snapshot = JSON.parse(
    await readFile(resolve(values.input), "utf8"),
  ) as { seasons: SalarySeason[]; target: string; exportedAt: string };
  const result = compareNhlSalaries(snapshot.seasons);
  const limitations = [
    "Retrospective comparison of real NHL cap hits and production v3 regular-season ratings; no GSHL salaries or production score changes.",
    "Season value measures accumulated contribution. Ability/60 is a shrunk rate, not the proposed injury-sensitive performance/volume blend (which remains a separate preview).",
    "Cap share = cap hit / that season's ceiling. Cap ceilings use the repository's historical commissioner-supplied table. Cash salary is separate and may be missing; cap hit is not take-home pay or a team's retained-salary charge.",
    "Percentiles use the same matched, rated, same-season position cohort. Positive percentile gap means a higher performance standing than pay standing, not a dollar surplus estimate.",
    "Benchmarks require at least 80% contract coverage of qualified players, 30 matches and no recorded season-level limitations. Missing contracts can still bias eligible cohorts; older sparse seasons are withheld.",
    "Peer dollar ranges use other players in the same season, position and exact recorded signing status, within 10 rating-percentile points; at least 15 peers. Reverse comparison uses a 10-point pay-percentile window. Ranges show the middle half of observed peers, not confidence intervals.",
    "Unknown signing status receives no dollar benchmark. Entry-level status is not reliably identified in these records; do not interpret all-player percentile gaps as unrestricted-market bargains. RFA, UFA and other recorded categories are kept separate for peer prices.",
    "Signing age and term are exposed but not adjusted. These are existing contracts, not fresh offers: age, term, signing date, expectations, injuries, bargaining restrictions, retention and bonuses can explain differences. No causal valuation or forward salary forecast is claimed.",
    "Ambiguous contract-season matches are excluded instead of choosing a convenient price. Current-profile salary is never substituted for historical contract evidence. Provisional players remain visible but unbenchmarked.",
  ];
  const output = resolve(values.output);
  await mkdir(output);
  const report = {
    target: snapshot.target,
    exportedAt: snapshot.exportedAt,
    limitations,
    ...result,
  };
  await writeFile(
    resolve(output, "analysis.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx" },
  );
  const flat = result.rows.map(
    ({ valuePeers, abilityPeers, salaryPeers, ...r }) => ({
      ...r,
      valuePeerCount: valuePeers?.n ?? 0,
      valuePeerCapMedian: valuePeers?.median ?? null,
      valuePeerCapP25: valuePeers?.p25 ?? null,
      valuePeerCapP75: valuePeers?.p75 ?? null,
      abilityPeerCount: abilityPeers?.n ?? 0,
      abilityPeerCapMedian: abilityPeers?.median ?? null,
      abilityPeerCapP25: abilityPeers?.p25 ?? null,
      abilityPeerCapP75: abilityPeers?.p75 ?? null,
      salaryPeerCount: salaryPeers?.n ?? 0,
      salaryPeerValueMedian: salaryPeers?.valueMedian ?? null,
      salaryPeerValueP25: salaryPeers?.valueP25 ?? null,
      salaryPeerValueP75: salaryPeers?.valueP75 ?? null,
      salaryPeerAbilityMedian: salaryPeers?.abilityMedian ?? null,
    }),
  );
  const columns = Object.keys(flat[0] ?? {});
  const cell = (v: unknown) =>
    '"' + String(v ?? "").replaceAll('"', '""') + '"';
  await writeFile(
    resolve(output, "players.csv"),
    "\ufeff" +
      [
        columns.map(cell).join(","),
        ...flat.map((r) =>
          columns.map((k) => cell(r[k as keyof typeof r])).join(","),
        ),
      ].join("\r\n"),
    { flag: "wx" },
  );
  const data = JSON.stringify(report).replaceAll("<", "\\u003c");
  await writeFile(
    resolve(output, "report.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NHL ratings and real contract pay</title>
<style>body{font:16px system-ui;margin:2rem auto;max-width:1250px;padding:0 1rem;color:#192b3d;background:#f8fafc}select,input{font:inherit;padding:.4rem;margin:.4rem}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:.5rem;text-align:left;border-bottom:1px solid #ccd6df}th{background:#e7eef5}svg{max-width:850px;width:100%;background:white}#table{overflow:auto}small{color:#40566b}li{margin:.5rem 0}</style>
<h1>NHL ratings and real contract pay</h1><p>Compare a player's hockey contribution with their real NHL cap hit. These are observed salary peers, not a proposed contract price.</p>
<label>Season <select id="season"></select></label><label>Position <select id="position"><option>F</option><option>D</option><option>G</option></select></label>
<label>Measure <select id="measure"><option value="value">Accumulated season value</option><option value="ability">Shrunk ability per 60</option></select></label>
<label>Find player <input id="search" type="search" placeholder="Player name"></label>
<p id="coverage" role="status"></p><svg id="chart" viewBox="0 0 850 330" role="img" aria-label="Player rating percentile versus cap hit share; each dot represents a matched qualified player"></svg>
<p>Higher dots have higher ratings; farther right costs more. Table sorted by rating. Peer ranges hold position and recorded signing status constant. A dash means insufficient evidence.</p><div id="table"></div>
<details><summary>Method and limitations</summary><ul id="notes"></ul></details>
<script type="application/json" id="data">${data}</script><script>
const data=JSON.parse(document.getElementById('data').textContent),el=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(x,n=1)=>x===null||x===undefined?'—':Number(x).toFixed(n),money=x=>x===null||x===undefined?'—':'$'+(x/1e6).toFixed(2)+'M';
el('season').innerHTML=[...new Set(data.rows.map(r=>r.startYear))].sort((a,b)=>b-a).map(y=>'<option value="'+y+'">'+y+'–'+String(y+1).slice(-2)+'</option>').join('');
el('notes').innerHTML=data.limitations.map(n=>'<li>'+escape(n)+'</li>').join('');
function draw(){const year=+el('season').value,pos=el('position').value,ability=el('measure').value==='ability',query=el('search').value.toLowerCase();
const all=data.rows.filter(r=>r.startYear===year&&r.position===pos),c=data.cohorts.find(c=>c.startYear===year&&c.position===pos);
el('coverage').textContent=c.matchedAll+'/'+c.total+' players have unambiguous contracts; '+c.matchedQualified+'/'+c.qualified+' qualified ratings matched ('+num(100*c.coverage)+'%). '+(c.eligible?'Salary/rating rank correlation: '+num(ability?c.capVsAbilitySpearman:c.capVsValueSpearman,3):'Benchmark withheld: sparse coverage, small cohort or season limitations.');
const pct=r=>ability?r.abilityPercentile:r.valuePercentile,metric=r=>ability?r.abilityPer60:r.seasonValue;
const shown=all.filter(r=>r.name.toLowerCase().includes(query)).sort((a,b)=>(metric(b)??-Infinity)-(metric(a)??-Infinity));
const dots=shown.filter(r=>pct(r)!==null&&r.capSharePct!==null),max=Math.max(1,...all.map(r=>r.capSharePct??0))*1.1;
el('chart').innerHTML='<path d="M60 20V280H820" fill="none" stroke="#536779"/><text x="65" y="16">Rating percentile (100 = highest)</text><text x="400" y="320">Cap hit / season ceiling (%)</text>'+[0,25,50,75,100].map(y=>'<text x="20" y="'+(285-y*2.5)+'">'+y+'</text>').join('')+[0,.25,.5,.75,1].map(t=>'<text x="'+(60+740*t)+'" y="300">'+num(max*t)+'</text>').join('')+dots.map(r=>'<circle cx="'+(60+r.capSharePct/max*740)+'" cy="'+(280-pct(r)*2.5)+'" r="4" fill="#216ba5" opacity=".65"><title>'+escape(r.name)+' · '+money(r.capHit)+' · percentile '+num(pct(r))+'</title></circle>').join('');
el('table').innerHTML='<table><thead><tr><th>Player / games</th><th>Signing status / age / term</th><th>Cap hit / cap share</th><th>Rating / percentile</th><th>Rating − pay percentile</th><th>Similar-rating peer cap hit: median [middle half]</th><th>Similar-pay peer season value: median [middle half]</th></tr></thead><tbody>'+shown.map(r=>{const peers=ability?r.abilityPeers:r.valuePeers,s=r.salaryPeers;return '<tr><td>'+escape(r.name)+'<br><small>'+r.games+' GP · '+escape(r.matchIssue??r.status)+'</small></td><td>'+escape(r.signingStatus)+' / '+num(r.signingAge,0)+' / '+num(r.contractLength,0)+'</td><td>'+money(r.capHit)+' / '+num(r.capSharePct)+'%</td><td>'+num(metric(r),3)+' / '+num(pct(r))+'</td><td>'+num(ability?r.abilityPayGap:r.valuePayGap)+'</td><td>'+(peers?money(peers.median)+' ['+money(peers.p25)+'–'+money(peers.p75)+'] n='+peers.n:'—')+'</td><td>'+(s?num(s.valueMedian,2)+' ['+num(s.valueP25,2)+'–'+num(s.valueP75,2)+'] n='+s.n:'—')+'</td></tr>';}).join('')+'</tbody></table>';
}for(const id of ['season','position','measure','search'])el(id).addEventListener('input',draw);draw();
</script></html>`,
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      {
        output,
        players: result.rows.length,
        matched: result.rows.filter((r) => !r.matchIssue).length,
        eligibleCohorts: result.cohorts.filter((c) => c.eligible).length,
        latest: result.cohorts.filter(
          (c) =>
            c.startYear ===
            Math.max(...snapshot.seasons.map((s) => s.startYear)),
        ),
      },
      null,
      2,
    ),
  );
}
