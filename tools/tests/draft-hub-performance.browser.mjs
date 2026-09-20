import assert from "node:assert/strict";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

// Use the actual feature hook and projection algorithm with stable remote-data
// fixtures. An expired clock exercises the derived-status object on every tick.
const fixture = `
const now=Date.now();
const season={id:"season",name:"Draft",year:2027,startDate:new Date(now-86400000),endDate:new Date(now+86400000),draftStartAt:now-60000};
const teams=Array.from({length:14},(_,i)=>({id:"team-"+i,franchiseId:"franchise-"+i,ownerId:"owner-"+i}));
const players=Array.from({length:1000},(_,i)=>{
  const position=["C","LW","RW","D","G"][i%5];
  return {id:"player-"+i,fullName:"Player "+i,nhlPos:[position],nhlTeam:"TOR",isActive:true,
    posGroup:position==="G"?"G":position==="D"?"D":"F",overallRating:100-i/20,
    overallRk:i+1,yahooDraftRk:i+1,dailyFaceoffRk:i+1,nhlRk:i+1};
});
const picks=Array.from({length:210},(_,i)=>({pick:{id:"pick-"+i,seasonId:"season",gshlTeamId:teams[i%14].id,round:Math.floor(i/14)+1,pick:i+1,isSigning:false,createdAt:now,updatedAt:now},team:teams[i%14],player:null}));
const state={season,serverNow:now,status:"on_clock",clockExpiresAt:now-1000,activePickId:"pick-0",picks,recentPickIds:[],upcomingPickIds:picks.slice(1,6).map(p=>p.pick.id)};
const seasons=[season], empty=[];
const mutation={isPending:false,error:null,mutateAsync:()=>{throw Error("No live writes in this test")}};
export const useSeasonState=()=>({seasons});
export const useDraftHubState=()=>({data:state,isLoading:false});
export const useAuthSession=()=>({session:null});
export const useToast=()=>({toast:()=>{}});
export const usePlayers=()=>({data:players,isLoading:false});
export const useTeams=()=>({data:teams,isLoading:false});
export const useLatestPlayerNhlStats=()=>({data:empty,isLoading:false});
export const useContracts=()=>({data:empty,isLoading:false});
export const useNHLTeams=()=>({data:empty,isLoading:false});
export const useSubmitDraftPick=()=>mutation;
export const useUndoDraftPick=()=>mutation;
`;
const compiled = await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {useDraftHubBoard} from "./src/hooks/features/useDraftHubBoard";
      function Probe(){
        const board=useDraftHubBoard();
        window.samples??=[];
        window.samples.push({count:Object.keys(board.mockProjectionByPickId).length,
          same:!window.previous || window.previous===board.mockProjectionByPickId});
        window.previous=board.mockProjectionByPickId;
        return <p>{board.state?.status}</p>;
      }
      createRoot(document.getElementById("root")).render(<Probe/>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "draft-data",
      setup(builder) {
        builder.onResolve({ filter: /^@gshl-hooks$/ }, () => ({
          path: "hooks",
          namespace: "fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: fixture,
          loader: "js",
        }));
      },
    },
  ],
});
const browser = await puppeteer.launch({
  executablePath:
    process.env.TV_TEST_BROWSER ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent('<div id="root"></div>');
  const start = performance.now();
  await page.addScriptTag({
    content:
      'window.process={env:{NODE_ENV:"production"}};' +
      compiled.outputFiles[0].text,
  });
  await page.waitForFunction(() => window.samples?.length >= 1);
  console.log(
    `Full-pool hub initial render: ${Math.round(performance.now() - start)} ms`,
  );
  await page.waitForFunction(() => window.samples?.length >= 3);
  const samples = await page.evaluate(() => window.samples);
  assert.deepEqual(errors, []);
  assert.ok(
    samples.every((sample) => sample.count === 6),
    "Only visible picks should be projected",
  );
  assert.ok(
    samples.every((sample) => sample.same),
    "Clock ticks must reuse the projection, including after expiry",
  );
  console.log(
    "210 picks / 1,000 players: six recommendations; no recalculation on expired clock ticks",
  );
} finally {
  await browser.close();
}
