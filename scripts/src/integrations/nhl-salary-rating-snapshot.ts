import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Read-only, indexed season snapshots. Never reads current player salary fields. */
export async function readSalaryRatingSeason(startYear: number) {
  if (!Number.isInteger(startYear) || startYear < 2013 || startYear > 2025)
    throw new Error("Expected a tracked season start year (2013..2025)");
  const query = `
    const seasons=await ctx.db.query("seasons").take(101);
    if(seasons.length===101)throw new Error("Season read bound reached");
    const matches=seasons.filter(s=>Number(s.year)===${startYear + 1});
    if(matches.length!==1)throw new Error("Missing or ambiguous season");
    const ratings=await ctx.db.query("nhlSeasonValues").withIndex("by_seasonId",q=>q.eq("seasonId",matches[0]._id)).take(3001);
    const contracts=await ctx.db.query("nhlContractSeasons").withIndex("by_seasonStartYear",q=>q.eq("seasonStartYear",${startYear})).take(3001);
    if(ratings.length===3001||contracts.length===3001)throw new Error("Season read bound reached");
    const ids=[...new Set(contracts.map(c=>c.contractId))];
    const headers=await Promise.all(ids.map(id=>ctx.db.get(id)));
    return {startYear:${startYear},ratings:ratings.filter(r=>r.modelVersion==="nhl-season-value-v3"&&r.profile==="core"&&r.gameType===2).map(r=>({
      nhlPlayerId:r.nhlPlayerId,playerId:r.playerId??null,name:r.name,position:r.position,games:r.games,
      status:r.status,seasonValue:r.seasonValue,abilityPer60:r.gameValue?.abilityPer60??null,
      seasonRating:r.seasonRating,limitedSeason:!!r.gameValue?.finalization?.failedGates?.length
    })),contracts:contracts.map(c=>{
      const h=headers.find(h=>h?._id===c.contractId);
      return {playerId:c.playerId,contractId:c.contractId,capHit:c.capHit,cashSalary:c.cashSalary??null,
        signingStatus:h?.signingStatus??null,signingAge:h?.signingAge??null,length:h?.length??null,
        startYear:h?.startSeasonStartYear??null,endYear:h?.expirySeasonStartYear??null,
        source:c.source,validHeader:!!h&&h.playerId===c.playerId};
    })};`;
  const root = resolve(import.meta.dirname, "../../..");
  const cli = resolve(root, "node_modules/convex/bin/main.js");
  return new Promise<unknown>((accept, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-"], {
      cwd: root,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (data) => {
      stdout += String(data);
    });
    // Do not copy authenticated CLI diagnostics into reports or logs.
    child.stderr.resume();
    child.on("error", () => reject(new Error("Could not start Convex read")));
    child.on("close", (code) => {
      if (code)
        reject(new Error(`Read-only Convex query failed for ${startYear}`));
      else {
        try {
          accept(JSON.parse(stdout));
        } catch {
          reject(new Error("Invalid Convex JSON"));
        }
      }
    });
    child.stdin.end(
      `process.argv=${JSON.stringify([process.execPath, cli, "run", "--deployment", "polished-tern-709", "--codegen", "disable", "--typecheck", "disable", "--inline-query", query])};await import(${JSON.stringify(pathToFileURL(cli).href)});`,
    );
  });
}
