import {emptyLine,matchupWin,type Line,type Position} from "../../runtime/positional-matchup-value";
import {playerLine,type HistorySeason,type Row} from "./positional-salary-history";
/** Descriptive Shapley decomposition of observed results, never a forecast. */
export function positionalOutcomeAttribution(seasons:HistorySeason[]){
 const records=[];const positions:Position[]=["F","D","G"];
 for(const d of seasons){
  const year=Number(d.season.year),weeks=new Map(d.weeks.map(w=>[w.id,w])),groups=new Map<string,Record<Position,Line>>();
  for(const p of d.playerWeeks){if(!positions.includes(p.posGroup))continue;const k=p.weekId+":"+p.gshlTeamId,g=groups.get(k)??{F:emptyLine(),D:emptyLine(),G:emptyLine()},line=playerLine(p);g[p.posGroup as Position]=g[p.posGroup as Position].map((v,i)=>v+line[i]!);groups.set(k,g);}
  for(const m of d.matchups){if(!m.isComplete||weeks.get(m.weekId)?.weekType!=="RS")continue;
   const a=groups.get(m.weekId+":"+m.homeTeamId),b=groups.get(m.weekId+":"+m.awayTeamId);if(!a||!b)continue;
   const values=[];
   for(let mask=0;mask<8;mask++){const home=emptyLine(),away=emptyLine();for(let p=0;p<3;p++)for(let k=0;k<12;k++){const x=a[positions[p]!]![k]!,y=b[positions[p]!]![k]!;home[k]!+=(mask&(1<<p))?x:(x+y)/2;away[k]!+=(mask&(1<<p))?y:(x+y)/2;}values.push(matchupWin(home,away)-.5);}
   const phi=[0,0,0];for(let p=0;p<3;p++)for(let mask=0;mask<8;mask++)if(!(mask&(1<<p))){const size=(mask&1)+((mask>>1)&1)+((mask>>2)&1);phi[p]!+=(size===1?1/6:1/3)*(values[mask|(1<<p)]!-values[mask]!);}
   if(Math.abs(phi.reduce((s,v)=>s+v,0)-values[7]!)>1e-8)throw new Error("Attribution failed reconciliation");
   records.push({year,matchupId:m.id,result:values[7]!,F:phi[0]!,D:phi[1]!,G:phi[2]!});
  }
 }
 const summaries=[...new Set(records.map(r=>r.year))].map(year=>{const rows=records.filter(r=>r.year===year&&r.result!==0),den=rows.reduce((s,r)=>s+Math.abs(r.result),0);return{year,matchups:rows.length,...Object.fromEntries(positions.map(p=>[p,rows.reduce((s,r)=>s+Math.sign(r.result)*r[p],0)/den]))};});
 return{records,summaries};
}
