import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  analyzeTeamSuccess,
  type TeamRating,
  type TeamContribution,
  type SeriesResult,
} from "../../domains/ranking/nhl-team-success";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Analyze derived team validation data, offline. --input <team-success-input.json> --output <NEW directory>. Writes statistical report, team/player CSVs and interactive HTML. No API/database access or rating changes.",
  );
else {
  if (!values.input || !values.output)
    throw new Error("Input and new output required");
  const input = JSON.parse(await readFile(resolve(values.input), "utf8")) as {
    teams: TeamRating[];
    contributions: TeamContribution[];
    series: SeriesResult[];
    provisionalSeasons: number[];
    missing: { minutes: number }[];
    exposureErrors: unknown[];
    sourceHashes: Record<string, string>;
    generatedAt: string;
    sourceUrls: string[];
  };
  if (input.exposureErrors.length || input.missing.some((r) => r.minutes > 0))
    throw new Error("Resolve source coverage mismatches before analysis");
  const result = analyzeTeamSuccess(
    input.teams,
    input.series,
    input.provisionalSeasons,
  );
  const output = resolve(values.output);
  await mkdir(output);
  const limitations = [
    "Regular-season correlations are retrospective: the player model includes regular-season outcomes. They do not prove forecasting or causal validity.",
    "Traded players' season estimates are allocated by actual team-specific ice time, not refit to estimate each stint's realized contribution. This can carry information across their teams.",
    "Postseason comparisons freeze regular-season player estimates. They use full-season roster exposure, not the playoff active roster, and cannot account for later injuries or deployment changes.",
    "Primary results exclude seasons whose saved model quality gates failed. 2019-20 also has unusual qualifying/round-robin formats; it remains a labeled regular-season sensitivity only.",
    "Season-cluster intervals use 1,000 deterministic resamples and describe this limited historical sample. Teams/series within a year are dependent. Persistent franchise dependence across years is not modeled.",
    "Probability backtests require three prior seasons, fixed ridge strength, and no future outcome fitting. The player-model design was already developed with knowledge of historical hockey; this is not an untouched prospective trial.",
    "The 0-100 performance comparison is an ice-time-weighted display-score average, with unrated players at neutral 50. It is not an additive goal-value metric. Unequal schedules and failed-gate seasons omit this comparison.",
  ];
  await writeFile(
    resolve(output, "analysis.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        inputGeneratedAt: input.generatedAt,
        sourceHashes: input.sourceHashes,
        sourceUrls: input.sourceUrls,
        coverage: {
          playerTeamAllocations: input.contributions.length,
          missing: input.missing,
          exposureErrors: input.exposureErrors,
          unknownAbilityTeams: input.teams
            .filter((t) => t.ability === null)
            .map((t) => ({ season: t.season, teamId: t.teamId, name: t.name })),
        },
        limitations,
        ...result,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  const csv = (rows: Record<string, unknown>[]) => {
    const keys = Object.keys(rows[0] ?? {});
    return (
      [
        keys.join(","),
        ...rows.map((row) =>
          keys
            .map((k) =>
              row[k] === null
                ? ""
                : `"${String(row[k]).replaceAll('"', '""')}"`,
            )
            .join(","),
        ),
      ].join("\n") + "\n"
    );
  };
  await writeFile(resolve(output, "teams.csv"), csv(result.rows), {
    flag: "wx",
  });
  await writeFile(
    resolve(output, "player-team-contributions.csv"),
    csv(input.contributions),
    { flag: "wx" },
  );
  const points = result.regular.find(
    (r) => r.metric === "rating" && r.outcome === "pointsPct",
  )!;
  const series = result.comparisons.find((r) => r.metric === "rating")!;
  const pct = (v: number | null) =>
    v === null ? "Unavailable" : `${(v * 100).toFixed(1)}%`;
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NHL player value and team success</title>
<style>body{font:16px system-ui;max-width:1200px;margin:30px auto;padding:0 20px;color:#183042;background:#f6f9fc}h1{font-size:28px}section{background:white;padding:20px;margin:20px 0;border:1px solid #d9e3eb;border-radius:10px}.cards{display:flex;gap:30px;flex-wrap:wrap}.cards strong{font-size:28px;display:block}select{padding:8px;margin:5px}svg{width:100%;max-height:500px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:8px;border-bottom:1px solid #dde5eb;text-align:right}th:nth-child(2),td:nth-child(2){text-align:left}.scroll{overflow:auto}small{color:#465d6d}a{color:#075bad}li{margin:8px 0}</style>
<h1>Do NHL player ratings add up to team success?</h1><p>All tracked seasons, with historical team memberships and goalie contributions. Team goal value is divided by team games to compare different schedule lengths.</p>
<section class="cards"><div><strong>${points.pearson?.toFixed(3)}</strong>Regular-season points correlation<br><small>Within-season Pearson; retrospective</small></div><div><strong>${pct(series.higherRatedAccuracy)}</strong>Higher-rated team won its playoff series<br><small>${series.n} completed series in qualified seasons</small></div><div><strong>${result.rows.length}</strong>Team-seasons inspected<br><small>${result.primarySeasons.length} seasons in primary analysis</small></div></section>
<section><label>Season <select id="season"><option value="all">All qualified seasons</option>${[...new Set(result.rows.map((r) => r.season))].map((s) => `<option value="${s}">${Math.floor(s / 10000)}–${String(s % 10000).slice(-2)}${result.provisionalSeasons.includes(s) ? " (provisional)" : ""}</option>`).join("")}</select></label>
<label>Team rating <select id="metric"><option value="rating">Accumulated goal value per game</option><option value="ability">Shrunk ability × actual workload</option><option value="performance">Performance display score (TOI average)</option><option value="skaterValue">Skaters only</option><option value="goalieValue">Goalies only</option><option value="process">Adjusted chance creation/prevention</option><option value="defenseAndSaving">Defensive process + goalie saving</option></select></label>
<label>Outcome <select id="outcome"><option value="pointsPct">Regular-season points percentage</option><option value="winPct">Regular-season win percentage</option><option value="goalDifference">Goal difference per game</option><option value="playoffWins">Playoff wins (entrants only)</option><option value="seriesWins">Series won (entrants only)</option></select></label>
<p id="detail"></p><svg id="plot" viewBox="0 0 1000 460" role="img" aria-label="Team rating versus success scatter plot"></svg><small>Hover a point for its team. All-season plots show raw rates; the headline correlation removes each season's mean.</small></section>
<section><h2>Postseason comparisons</h2><div class="scroll"><table><thead><tr><th>Metric</th><th>Series</th><th>Higher value wins</th><th>First round</th><th>Forward-test series</th><th>Forward-test Brier ↓</th></tr></thead><tbody>${result.comparisons.map((r) => `<tr><td>${r.metric}</td><td>${r.n}</td><td>${pct(r.higherRatedAccuracy)}</td><td>${pct(r.firstRoundAccuracy)}</td><td>${r.backtest.n}</td><td>${r.backtest.brier?.toFixed(4)}</td></tr>`).join("")}</tbody></table></div><p>Probability models train only on prior seasons. Lower Brier is better; a constant 50% forecast scores 0.2500.</p></section>
<section><h2>Team results</h2><div class="scroll"><table><thead><tr><th>Season</th><th>Team</th><th>Rating rank</th><th>Points rank</th><th>Goal value/game</th><th>W–L–OTL</th><th>Points %</th><th>Playoff wins</th><th>Series won</th></tr></thead><tbody id="teams"></tbody></table></div></section>
<section><h2>Interpretation limits</h2><ul>${limitations.map((v) => `<li>${v}</li>`).join("")}</ul><p>Download adjacent <a href="teams.csv">team CSV</a>, <a href="player-team-contributions.csv">player contributions</a> or <a href="analysis.json">full analysis</a>.</p></section>
<script>const rows=${JSON.stringify(result.rows).replaceAll("<", "\\u003c")},provisional=${JSON.stringify(result.provisionalSeasons)};
const e=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function draw(){const season=document.getElementById('season').value,metric=document.getElementById('metric').value,outcome=document.getElementById('outcome').value;
let data=rows.filter(r=>season==='all'?!provisional.includes(r.season):r.season===Number(season));if(outcome==='playoffWins'||outcome==='seriesWins')data=data.filter(r=>r.playoffEntry);
data=data.filter(r=>Number.isFinite(r[metric])&&Number.isFinite(r[outcome]));
document.getElementById('detail').textContent=data.length+' team-seasons. Horizontal axis: selected player-derived team rating. Vertical axis: selected success measure.';
let minX=Math.min(...data.map(r=>r[metric])),maxX=Math.max(...data.map(r=>r[metric])),minY=Math.min(...data.map(r=>r[outcome])),maxY=Math.max(...data.map(r=>r[outcome]));
const x=v=>70+(v-minX)/(maxX-minX||1)*860,y=v=>400-(v-minY)/(maxY-minY||1)*350;
let svg='<path d="M70 45V400H945" fill="none" stroke="#718496"/>';
for(let i=0;i<=4;i++){const vx=minX+(maxX-minX)*i/4,vy=minY+(maxY-minY)*i/4;svg+='<text x="'+x(vx)+'" y="430" text-anchor="middle" font-size="12">'+vx.toFixed(2)+'</text><text x="60" y="'+(y(vy)+4)+'" text-anchor="end" font-size="12">'+vy.toFixed(2)+'</text>';}
svg+=data.map(r=>'<circle cx="'+x(r[metric])+'" cy="'+y(r[outcome])+'" r="'+(r.champion?7:5)+'" fill="'+(r.champion?'#ba5907':'#247ba5')+'" opacity="0.75"><title>'+e(r.name)+' '+r.season+' | rating '+r[metric].toFixed(3)+' | outcome '+r[outcome].toFixed(3)+'</title></circle>').join('');document.getElementById('plot').innerHTML=svg;
document.getElementById('teams').innerHTML=data.sort((a,b)=>b.season-a.season||a.ratingRank-b.ratingRank).map(r=>'<tr><td>'+r.season+'</td><td>'+e(r.name)+(r.champion?' ★':'')+'</td><td>'+r.ratingRank+'</td><td>'+r.pointsRank+'</td><td>'+r.rating.toFixed(3)+'</td><td>'+r.wins+'–'+r.losses+'–'+r.otLosses+'</td><td>'+(r.pointsPct*100).toFixed(1)+'%</td><td>'+r.playoffWins+'</td><td>'+r.seriesWins+'</td></tr>').join('');}
for(const id of ['season','metric','outcome'])document.getElementById(id).addEventListener('change',draw);draw();</script></html>`;
  await writeFile(resolve(output, "report.html"), html, { flag: "wx" });
  console.log(
    JSON.stringify(
      {
        points,
        interval: result.pointsCorrelationInterval,
        playoffs: result.playoffs.filter((r) => r.metric === "rating"),
        series: result.comparisons.map(
          ({ metric, n, higherRatedAccuracy, backtest, incremental }) => ({
            metric,
            n,
            higherRatedAccuracy,
            backtest: {
              n: backtest.n,
              brier: backtest.brier,
              accuracy: backtest.accuracy,
            },
            incremental: incremental
              ? { brier: incremental.brier, accuracy: incremental.accuracy }
              : null,
          }),
        ),
        ratingVersusPointsBrierInterval: result.ratingVersusPointsBrierInterval,
        incrementalVersusPointsBrierInterval:
          result.incrementalVersusPointsBrierInterval,
        output,
      },
      null,
      2,
    ),
  );
}
