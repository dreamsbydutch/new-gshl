export type PositionExample={year:number;x:[number,number,number];actual:number};
const logistic=(x:number)=>1/(1+Math.exp(-Math.max(-25,Math.min(25,x))));
/** Positive shrinkage fit: coefficients stay close to a common position weight. */
export function fitPositionWeights(rows:readonly PositionExample[],cutoff:number,individual=true){
 const train=rows.filter(r=>r.year<cutoff);
 if(train.some(r=>!r.x.every(Number.isFinite)||!Number.isFinite(r.actual)||r.actual<0||r.actual>1))throw new Error("Invalid matchup example");
 if(train.length<100||new Set(train.map(r=>r.year)).size<2)throw new Error("Insufficient earlier matchup seasons");
 function optimize(width:number,prior:number,penalty:number){
  const beta=Array(width).fill(prior);beta[0]=0;
  for(let step=0;step<50;step++){
   const g=Array(width).fill(0),h=Array.from({length:width},()=>Array(width).fill(0));
   for(const r of train){const x=width===2?[1,r.x.reduce((s,v)=>s+v,0)]:[1,...r.x],p=logistic(x.reduce((s,v,i)=>s+v*beta[i]!,0)),w=p*(1-p);
    for(let i=0;i<width;i++){g[i]+=x[i]!*(r.actual-p);for(let j=0;j<width;j++)h[i]![j]+=w*x[i]!*x[j]!;}}
   for(let i=0;i<width;i++){h[i]![i]+=i?penalty:0.01;if(i)g[i]-=penalty*(beta[i]-prior);}
   const m=h.map((r,i)=>[...r,g[i]]);
   for(let k=0;k<width;k++){let pivot=k;for(let j=k+1;j<width;j++)if(Math.abs(m[j]![k]!)>Math.abs(m[pivot]![k]!))pivot=j;[m[k],m[pivot]]=[m[pivot]!,m[k]!];const d=m[k]![k]!;for(let j=k;j<=width;j++)m[k]![j]/=d;for(let i=0;i<width;i++)if(i!==k){const f=m[i]![k]!;for(let j=k;j<=width;j++)m[i]![j]-=f*m[k]![j]!;}}
   let change=0;for(let i=0;i<width;i++){const next=i?Math.max(.01,Math.min(5,beta[i]+m[i]![width]!)):beta[i]+m[i]![width]!;change+=Math.abs(next-beta[i]);beta[i]=next;}if(change<1e-7)break;
  }return beta;
 }
 const common=optimize(2,.5,1),beta=individual?optimize(4,common[1]!,25):[common[0]!,common[1]!,common[1]!,common[1]!];
 return {intercept:beta[0]!,weights:beta.slice(1) as [number,number,number],n:train.length,latestYear:Math.max(...train.map(r=>r.year))};
}
export function positionWinProbability(x:readonly number[],model:ReturnType<typeof fitPositionWeights>){return logistic(model.intercept+x.reduce((s,v,i)=>s+v*model.weights[i]!,0));}
