import { mkdir,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {readPositionalDirectory,readPositionalPage} from "../../integrations/positional-salary-history";

const {values}=parseArgs({options:{target:{type:"string"},output:{type:"string"},help:{type:"boolean"}}});
if(values.help)console.log("Read-only positional salary history audit. --target production --output <NEW directory>. Reads season-scoped weeks, matchups, team and player weekly totals for completed seasons. Writes local research snapshots only; no database writes.");
else{
 if(values.target!=="production"||!values.output)throw new Error("Explicit production target and new output required");
 const output=resolve(values.output);await mkdir(output);
 const {seasons,players}=await readPositionalDirectory();
 await writeFile(resolve(output,"directory.json"),JSON.stringify({fetchedAt:new Date().toISOString(),target:"polished-tern-709",seasons,players}),{flag:"wx"});
 async function fetch(table:Parameters<typeof readPositionalPage>[0],id:string){
  const rows=[];let cursor:string|null=null;
  do{const page=await readPositionalPage(table,id,cursor);rows.push(...page.page);cursor=page.isDone?null:page.continueCursor;}while(cursor);
  return rows;
 }
 for(const season of seasons.filter(s=>Number(s.year)>=2014&&Number(s.year)<=2026).sort((a,b)=>Number(a.year)-Number(b.year))){
  const id=String(season.id);
  const [weeks,matchups,teamWeeks,playerWeeks]=await Promise.all([
   fetch("weeks",id),fetch("matchups",id),fetch("teamWeekStatLines",id),fetch("playerWeekStatLines",id),
  ]);
  await writeFile(resolve(output,`${season.year}.json`),JSON.stringify({season,weeks,matchups,teamWeeks,playerWeeks}),{flag:"wx"});
  console.log(JSON.stringify({year:season.year,weeks:weeks.length,matchups:matchups.length,teamWeeks:teamWeeks.length,playerWeeks:playerWeeks.length}));
 }
}
