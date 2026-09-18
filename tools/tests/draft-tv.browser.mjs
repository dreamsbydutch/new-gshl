import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

// Exercise the real TV components and fitting hook with full-roster fixtures.
// No sign-in, network data, or draft mutations are used.
const fixture = `
const names = ["Auston Matthews", "Martin Necas", "Ryan Nugent-Hopkins", "James van Riemsdyk", "Alex DeBrincat"];
const positions = ["LW","C","RW","LW","C","RW","D","D","D","D","G","UTIL","BN","BN","BN"];
const teams = Array.from({length:14},(_,i)=>({id:String(i),ownerId:String(i),franchiseId:String(i),name:"Toronto Maple Reg's " + (i+1),abbr:"TOR",talentRating:89.75,logoUrl:null}));
const player = (i,ownerId="available")=>({id:ownerId+"-"+i,ownerId,fullName:names[i%names.length],nhlTeam:"TOR",nhlPos:["C","LW","RW"],posGroup:i%15===10?"G":"F",lineupPos:positions[i%15],overallRating:99.99,seasonRating:99.99,overallRk:i+1,seasonRk:i+1,stats:{GP:82,G:65,A:105,P:170,PM:35,PIM:120,PPP:55,SOG:345,HIT:210,BLK:150,W:45,GAA:2.35,SVP:0.925}});
const players=teams.flatMap(team=>Array.from({length:15},(_,i)=>player(i,team.ownerId)));
const available=Array.from({length:50},(_,i)=>({...player(i),posGroup:i<35?"F":"G"}));
const pick=(i)=>({pick:{id:String(i),round:2,pick:i},team:teams[i%14],player:player(i)});
export function useDraftRosterBoard(){return {season:{name:"2026-27",year:2027},nhlTeams:[],players,availablePlayers:available,isLoading:window.tvState==="loading",conferences:[{id:"a",name:"Hickory Hotel",teams:teams.slice(0,7)},{id:"b",name:"Sunview",teams:teams.slice(7)}]};}
export function useDraftHubBoard(){return {season:{draftStartAt:"2026-09-25T20:00:00Z"},state:{status:window.tvState},activePick:pick(3),clockRemainingSeconds:125,isLoading:window.tvState==="loading",recentPicks:Array.from({length:8},(_,i)=>pick(30-i)),upcomingPicks:[pick(3),pick(4),pick(5),pick(6)]};}
`;
const compiled = await build({
  stdin: {
    contents: `import React from "react"; import {createRoot} from "react-dom/client"; import {DraftRosterBoard} from "./src/components/draft/DraftRosterBoard"; import {DraftAvailableTvBoard,DraftLiveTvBoard} from "./src/components/draft/DraftTvBoards"; const root=createRoot(document.getElementById("root")); window.renderTV=(view,state)=>{window.tvState=state; root.render(React.createElement(view==="overview"?DraftRosterBoard:view==="available"?DraftAvailableTvBoard:DraftLiveTvBoard));};`,
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
      name: "fixture-hooks",
      setup(builder) {
        builder.onResolve({ filter: /^@gshl-hooks$/ }, () => ({
          path: "fixture",
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
const font = (
  await readFile(
    "node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
  )
).toString("base64");
const fontCss = `@font-face{font-family:TVGeist;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900} :root{--font-geist-sans:TVGeist;--font-geist-mono:monospace} body{font-family:TVGeist,sans-serif}`;
const css = await readFile(".next/draft-tv-test.css", "utf8");
const browser = await puppeteer.launch({
  executablePath:
    process.env.TV_TEST_BROWSER ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error(error.message));
  await page.setContent(`<style>${css}${fontCss}</style><div id="root"></div>`);
  await page.addScriptTag({
    content:
      'window.process={env:{NODE_ENV: "production"}};' +
      compiled.outputFiles[0].text,
  });
  await mkdir(".next/tv-checks", { recursive: true });
  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
    [3840, 2160],
  ]) {
    await page.setViewport({ width, height });
    for (const view of ["overview", "available", "live"]) {
      await page.evaluate((view) => window.renderTV(view, "loading"), view);
      await new Promise((r) => setTimeout(r, 50));
      await page.evaluate((view) => window.renderTV(view, "on_clock"), view);
      await new Promise((r) => setTimeout(r, 400));
      const result = await page.evaluate(() => {
        const panels = [
          ...document.querySelectorAll(
            'article,aside,section[aria-label="Top 26 skaters"],section[aria-label="Top 8 goalies"],section[aria-label="Recent and upcoming picks"]',
          ),
        ];
        return {
          pageOverflow:
            document.documentElement.scrollWidth > innerWidth ||
            document.documentElement.scrollHeight > innerHeight,
          panels: panels.length,
          overflows: panels
            .filter(
              (panel) =>
                panel.scrollWidth > panel.clientWidth + 1 ||
                panel.scrollHeight > panel.clientHeight + 1,
            )
            .map((panel) => ({
              name: panel.getAttribute("aria-label"),
              w: panel.scrollWidth,
              cw: panel.clientWidth,
              h: panel.scrollHeight,
              ch: panel.clientHeight,
            })),
          text: document.body.innerText,
        };
      });
      assert.equal(
        result.pageOverflow,
        false,
        `${view} ${width}: page overflow`,
      );
      assert.deepEqual(
        result.overflows,
        [],
        `${view} ${width}: panel overflow`,
      );
      assert.ok(result.panels > 0);
      assert.match(result.text, /A\. Matthews|M\. Necas/);
      if (view === "overview") assert.equal(result.panels, 15);
      await page.screenshot({
        path: resolve(`.next/tv-checks/${view}-${width}.png`),
      });
      console.log(`${view} ${width}x${height}: all panels fit`);
    }
  }
  for (const state of [
    "upcoming",
    "commissioner_required",
    "complete",
    "unavailable",
  ]) {
    await page.evaluate((state) => window.renderTV("live", state), state);
    await new Promise((r) => setTimeout(r, 200));
    const text = await page.evaluate(() => document.body.innerText);
    const expected = {
      upcoming: "Draft starts soon",
      commissioner_required: "Awaiting commissioner",
      complete: "Draft complete",
      unavailable: "Draft unavailable",
    };
    assert.ok(text.includes(expected[state]));
    console.log(`live ${state}: passed`);
  }
} finally {
  await browser.close();
}
