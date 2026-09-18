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
const nhlPositions = ["LW","C","RW","LW","C","RW","D","D","D","D","G","C","LW","RW","D"];
const teams = Array.from({length:14},(_,i)=>({id:String(i),ownerId:String(i),franchiseId:String(i),name:"Toronto Maple Reg's " + (i+1),abbr:"TOR",talentRating:89.75,logoUrl:null}));
const player = (i,ownerId="available")=>({id:ownerId+"-"+i,ownerId,fullName:names[i%names.length],nhlTeam:"TOR",nhlPos:[nhlPositions[i%nhlPositions.length]],posGroup:nhlPositions[i%nhlPositions.length]==="G"?"G":nhlPositions[i%nhlPositions.length]==="D"?"D":"F",lineupPos:positions[i%15],overallRating:99.99,seasonRating:99.99,overallRk:i+1,seasonRk:i+1,stats:{GP:82,G:65,A:105,P:170,PM:35,PIM:120,PPP:55,SOG:345,HIT:210,BLK:150,W:45,GAA:2.35,SVP:0.925}});
const players=teams.flatMap(team=>Array.from({length:15},(_,i)=>player(i,team.ownerId)));
const available=Array.from({length:50},(_,i)=>({...player(i),posGroup:i<35?"F":"G"}));
const pick=(i)=>({pick:{id:String(i),round:2,pick:i},team:{...teams[i%14],id:"draft-season-"+teams[i%14].id},player:player(i)});
export function useDraftRosterBoard(){return {season:{name:"2026-27",year:2027},nhlTeams:[],players,remainingPicksByFranchise:new Map(teams.map(team=>[team.franchiseId,Array.from({length:15-(window.tvStep??0)},(_,i)=>({id:team.id+"-pick-"+i,round:String(i+1),pick:String(i*14+Number(team.id)+1)}))])),availablePlayers:available,isLoading:window.tvState==="loading",conferences:[{id:"a",name:"Hickory Hotel",teams:teams.slice(0,7)},{id:"b",name:"Sunview",teams:teams.slice(7)}]};}
export function useOwnerRankingsData(){return {isLoading:window.tvState==="loading",data:{rankings:Array.from({length:20},(_,i)=>({owner:{id:i<14?teams[i].ownerId:"inactive-"+i},rank:i+1,displayName:i<14?"Alexander Owner "+(i+1):"Retired Owner "+(i-13),rating:1800-i*23,cups:i%4,primaryTeam:null,seasonsPlayed:12,playoffAppearances:8,finalsAppearances:3,overallRecord:{wins:150,losses:125,ties:3,winPercentage:0.545}}))}};}
export function useDraftLiveTvBoard(){const cursor=30+(window.tvStep??0); return {season:{name:"2026-27",draftStartAt:"2026-09-25T20:00:00Z"},state:{status:window.tvState,completedCount:cursor-1,remainingCount:90-cursor},activePick:pick(cursor),clockRemainingSeconds:125,draftStartRemainingSeconds:90061,isLoading:window.tvState==="loading",recentPicks:Array.from({length:20},(_,i)=>pick(cursor-i-1)),upcomingPicks:Array.from({length:20},(_,i)=>pick(cursor+i+1))};}
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
            'article,aside,[data-tv-fit],section[aria-label$="skaters"],section[aria-label$="goalies"],section[aria-label="Recent and upcoming picks"]',
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
          links: [...document.querySelectorAll("a")].map((link) =>
            link.getAttribute("href"),
          ),
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
      assert.deepEqual(
        result.links,
        [],
        `${view} ${width}: TV displays must remain URL-only`,
      );
      assert.match(result.text, /A\. Matthews|M\. Necas/);
      if (view === "live") {
        const rails = await page.evaluate(() => ({
          left: [
            ...document.querySelectorAll(
              '[aria-label="Recent picks"] [data-pick-id]',
            ),
          ].map((node) => node.dataset.pickId),
          right: [
            ...document.querySelectorAll(
              '[aria-label="Upcoming picks"] [data-pick-id]',
            ),
          ].map((node) => node.dataset.pickId),
          clock: document.querySelector('[role="timer"]')?.textContent,
          fit: [...document.querySelectorAll('[aria-label$="picks"]')].map(
            (panel) => {
              const rows = [...panel.querySelectorAll("li")];
              const last = rows.at(-1)?.getBoundingClientRect();
              const previous = rows.at(-2)?.getBoundingClientRect();
              const panelBounds = panel.getBoundingClientRect();
              const gap = last && previous ? last.top - previous.bottom : 0;
              return {
                unused: last ? panelBounds.bottom - last.bottom : 0,
                nextRow: last ? last.height + gap : Number.POSITIVE_INFINITY,
              };
            },
          ),
          downConnectors: document.querySelectorAll(
            '[aria-label="Recent picks"] [data-pick-connector="down"]',
          ).length,
          upConnectors: document.querySelectorAll(
            '[aria-label="Upcoming picks"] [data-pick-connector="up"]',
          ).length,
        }));
        assert.ok(rails.left.length >= 5);
        assert.ok(rails.right.length >= 5);
        assert.deepEqual(
          rails.left,
          Array.from({ length: rails.left.length }, (_, index) =>
            String(29 - index),
          ),
        );
        assert.deepEqual(
          rails.right,
          Array.from({ length: rails.right.length }, (_, index) =>
            String(31 + index),
          ),
        );
        assert.equal(rails.clock, "02:05");
        assert.equal(rails.downConnectors, rails.left.length - 1);
        assert.equal(rails.upConnectors, rails.right.length - 1);
        assert.ok(
          rails.fit.every(({ unused, nextRow }) => unused < nextRow + 3),
        );
      }
      if (view === "available") {
        const available = await page.evaluate(() => {
          const skaters = document.querySelector(
            'section[aria-label$="skaters"]',
          );
          const skaterRows = skaters?.querySelectorAll("tbody tr") ?? [];
          const lastSkater = skaterRows[skaterRows.length - 1];
          const goalieRows = document.querySelectorAll(
            'section[aria-label$="goalies"] tbody tr',
          );
          const positionRows = document.querySelectorAll(
            '[aria-label="Team position counts"] tbody tr',
          );
          const positionTable = document.querySelector(
            '[aria-label="Team position counts"]',
          );
          const firstPositionRow = positionRows[0];
          const lastBounds = lastSkater?.getBoundingClientRect();
          const panelBounds = skaters?.getBoundingClientRect();
          return {
            skaters: skaterRows.length,
            goalies: goalieRows.length,
            teams: positionRows.length,
            headers: [
              ...(positionTable?.querySelectorAll("thead th") ?? []),
            ].map((cell) => cell.textContent?.trim()),
            totalPlayers: firstPositionRow?.querySelector("[data-roster-total]")
              ?.textContent,
            rosterGroups: Object.fromEntries(
              [
                ...(firstPositionRow?.querySelectorAll("[data-roster-group]") ??
                  []),
              ].map((cell) => [cell.dataset.rosterGroup, cell.textContent]),
            ),
            positionEligibility: Object.fromEntries(
              [
                ...(firstPositionRow?.querySelectorAll(
                  "[data-position-count]",
                ) ?? []),
              ].map((cell) => [cell.dataset.positionCount, cell.textContent]),
            ),
            unusedHeight:
              lastBounds && panelBounds
                ? Math.round(panelBounds.bottom - lastBounds.bottom)
                : null,
            rowHeight: lastBounds ? Math.round(lastBounds.height) : null,
          };
        });
        assert.ok(available.skaters >= 20);
        assert.equal(available.goalies, 10);
        assert.equal(available.teams, 14);
        assert.deepEqual(available.headers, [
          "Team",
          "Total",
          "F",
          "D",
          "G",
          "C",
          "LW",
          "RW",
          "D",
          "G",
        ]);
        assert.equal(available.totalPlayers, "15");
        assert.deepEqual(available.rosterGroups, { F: "9", D: "5", G: "1" });
        assert.deepEqual(available.positionEligibility, {
          C: "3",
          LW: "3",
          RW: "3",
          D: "5",
          G: "1",
        });
        assert.ok(available.unusedHeight <= available.rowHeight + 3);
      }
      if (view === "overview") {
        assert.equal(result.panels, 15);
        assert.match(result.text, /Owner ladder/);
        assert.match(result.text, /Inactive/i);
        assert.doesNotMatch(
          result.text,
          /Available TV|Live TV|Draft Hub|2026-27 · 14 rosters/,
        );
        assert.doesNotMatch(result.text, /TOP 26 SKATERS|League Roster Board/);
      }
      await page.screenshot({
        path: resolve(`.next/tv-checks/${view}-${width}.png`),
      });
      console.log(`${view} ${width}x${height}: all panels fit`);
      if (view === "overview") {
        assert.equal(
          await page.$$eval(
            "[data-remaining-pick-id]",
            (nodes) => nodes.length,
          ),
          210,
        );
        assert.match(result.text, /Win%/);
        assert.equal(
          await page.$$eval(
            '[aria-label="Owner ladder"] [data-owner-status="inactive"]',
            (nodes) => nodes.length,
          ),
          6,
        );
        const pickLayout = await page.$$eval(
          "article:first-of-type [data-remaining-pick-id]",
          (nodes) =>
            nodes.slice(0, 6).map((node) => {
              const bounds = node.getBoundingClientRect();
              return {
                left: Math.round(bounds.left),
                top: Math.round(bounds.top),
              };
            }),
        );
        assert.equal(
          new Set(pickLayout.slice(0, 5).map(({ left }) => left)).size,
          1,
        );
        assert.ok(
          pickLayout
            .slice(1, 5)
            .every((item, index) => item.top > pickLayout[index].top),
        );
        assert.ok(pickLayout[5].left > pickLayout[0].left);
        assert.equal(pickLayout[5].top, pickLayout[0].top);
        await page.evaluate(() =>
          [...document.querySelectorAll('[aria-label="Center view"] button')]
            .find((button) => button.textContent === "Live draft")
            .click(),
        );
        await new Promise((resolve) => setTimeout(resolve, 400));
        const center = await page.evaluate(() => {
          const panel = document.querySelector('[aria-label="Draft center"]');
          return {
            timer: panel.querySelector('[role="timer"]')?.textContent,
            rosters: panel.querySelectorAll("article").length,
            rails: panel.querySelectorAll("[data-tv-fit]").length,
            downConnectors: panel.querySelectorAll(
              '[data-pick-connector="down"]',
            ).length,
            upConnectors: panel.querySelectorAll('[data-pick-connector="up"]')
              .length,
            overflow: [...panel.querySelectorAll("[data-tv-fit]"), panel].some(
              (node) =>
                node.scrollWidth > node.clientWidth + 1 ||
                node.scrollHeight > node.clientHeight + 1,
            ),
          };
        });
        await page.screenshot({
          path: resolve(`.next/tv-checks/overview-live-${width}.png`),
        });
        if (center.overflow)
          console.log(
            await page.evaluate(() =>
              [
                ...document.querySelectorAll(
                  '[aria-label="Draft center"], [aria-label="Draft center"] [data-tv-fit]',
                ),
              ].map((node) => ({
                name: node.getAttribute("aria-label"),
                w: node.clientWidth,
                sw: node.scrollWidth,
                h: node.clientHeight,
                sh: node.scrollHeight,
              })),
            ),
          );
        assert.deepEqual(center, {
          timer: "02:05",
          rosters: 0,
          rails: 2,
          downConnectors: 4,
          upConnectors: 4,
          overflow: false,
        });

        console.log(
          `overview live center ${width}x${height}: clock and both rails fit`,
        );
      }
    }
  }
  await page.setViewport({ width: 1920, height: 1080 });
  await page.evaluate(() => {
    window.tvStep = 1;
    window.renderTV("overview", "on_clock");
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(
    await page.$$eval("[data-remaining-pick-id]", (nodes) => nodes.length),
    196,
  );
  console.log("overview remaining picks decrease after selection");

  await page.evaluate(() => {
    window.tvStep = 1;
    window.renderTV("live", "on_clock");
  });
  await new Promise((resolve) => setTimeout(resolve, 600));
  const shifted = await page.evaluate(() => ({
    left: [
      ...document.querySelectorAll(
        '[aria-label="Recent picks"] [data-pick-id]',
      ),
    ].map((node) => node.dataset.pickId),
    right: [
      ...document.querySelectorAll(
        '[aria-label="Upcoming picks"] [data-pick-id]',
      ),
    ].map((node) => node.dataset.pickId),
  }));
  assert.ok(shifted.left.length >= 5);
  assert.ok(shifted.right.length >= 5);
  assert.deepEqual(
    shifted.left,
    Array.from({ length: shifted.left.length }, (_, index) =>
      String(30 - index),
    ),
  );
  assert.deepEqual(
    shifted.right,
    Array.from({ length: shifted.right.length }, (_, index) =>
      String(32 + index),
    ),
  );
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('[aria-label="On-clock team roster"] article')
        ?.getAttribute("aria-label"),
    ),
    "Toronto Maple Reg's 4 roster",
  );
  console.log("live pick advancement: queues and active roster update");
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.evaluate(() => {
    window.tvStep = 2;
    window.renderTV("live", "on_clock");
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
  console.log("reduced-motion preference: no pick animations");
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
    assert.ok(text.toLowerCase().includes(expected[state].toLowerCase()));
    if (state === "upcoming") {
      assert.match(text, /First team roster/i);
      assert.match(text, /1d 01:01:01/);
      assert.equal(
        await page.evaluate(() => document.querySelectorAll("article").length),
        1,
      );
    }
    await page.screenshot({
      path: resolve(`.next/tv-checks/live-${state}.png`),
    });
    console.log(`live ${state}: passed`);
  }
} finally {
  await browser.close();
}
