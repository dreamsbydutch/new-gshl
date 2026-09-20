import assert from "node:assert/strict";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

// Unequal row heights model a wrapped team name entering/leaving the visible
// window. Exercise the real layout effect, rather than a copy of its formula.
const compiled = await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {DraftPickRail} from "./src/components/draft/DraftLiveFlow";
      import {DraftAvailableTvBoard} from "./src/components/draft/DraftTvBoards";
      const picks=Array.from({length:20},(_,i)=>({
        pick:{id:String(i),round:1,pick:i+1},
        team:{name:"Team "+i,abbr:"T"},player:null,
      }));
      const root=createRoot(document.getElementById("root"));
      window.renderFixture=(view)=>root.render(view==="rail"
        ? <DraftPickRail picks={picks} recent={false} fillHeight />
        : <DraftAvailableTvBoard/>);`,
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
      name: "fixture",
      setup(builder) {
        builder.onResolve({ filter: /^@gshl-hooks$/ }, () => ({
          path: "hooks",
          namespace: "fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          loader: "js",
          contents: `
      const players=Array.from({length:40},(_,i)=>({id:String(i),fullName:"Player "+i,nhlPos:["C"],nhlTeam:"TOR",posGroup:"F",overallRk:i+1,stats:null}));
      export const useDraftRosterBoard=()=>({availablePlayers:players,isLoading:false});
      export const useDraftLiveTvBoard=()=>({});
      export const useTeamPalette=()=>({});
      export const useOwnerRankingsData=()=>({});
      export const lighten=()=>"";
    `,
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
  await page.setContent(`<style>
    section{height:600px;width:300px;overflow:hidden} h2{height:30px;margin:0}
    ol{margin:0;padding:0} li{height:50px;overflow:hidden} li:nth-child(6){height:300px}
    table{border-collapse:collapse} tbody tr{height:20px} tbody tr:nth-child(6){height:300px}
    td,th{padding:0} p{margin:0}
  </style><div id="root"></div>`);
  await page.addScriptTag({
    content:
      'window.process={env:{NODE_ENV:"production"}};' +
      compiled.outputFiles[0].text,
  });
  for (const view of ["rail", "available"]) {
    await page.evaluate((view) => window.renderFixture(view), view);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const selector = view === "rail" ? "li" : "tbody tr";
    console.log(
      JSON.stringify({
        view,
        errors,
        visibleRows: await page.$$eval(selector, (rows) => rows.length),
      }),
    );
    assert.deepEqual(
      errors,
      [],
      "Variable-height draft rows must settle without a client exception",
    );
    assert.ok(await page.$(selector), "Draft remains visible");
  }
  await page.addStyleTag({
    content: "section{height:132px} li{margin-bottom:10px}",
  });
  await page.evaluate(() => window.renderFixture("rail"));
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.deepEqual(
    errors,
    [],
    "A single row must retain the measured inter-row gap",
  );
  assert.equal(await page.$$eval("li", (rows) => rows.length), 1);
  console.log("Small pick rail: retained gap prevents one/two-row oscillation");
} finally {
  await browser.close();
}
