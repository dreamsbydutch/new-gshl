import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile, mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

// Real comparison table and page composition; stub team-section contents to
// isolate breakpoint ordering. Draft actions only record fixture callbacks.
const entry = `
import React from "react";
import {createRoot} from "react-dom/client";
import {DraftPlayerTable} from "./src/components/draft/DraftPlayerTable";
import {DraftHubTeamPage} from "./src/components/draft/DraftHubTeamPage";
const names=["Sidney Crosby","Ryan Nugent-Hopkins","Zach Werenski","Martin Necas"];
const players=Array.from({length:16},(_,i)=>({id:String(i),fullName:names[i%4],nhlTeam:"PIT",nhlPos:["C","LW"],posGroup:i>11?"G":"F",overallRating:92.87,overallRk:i+1,yahooDraftRk:12,otherDraftRk:20,stats:{GP:75,G:22,A:59,P:81,W:39,GAA:2.31,SVP:0.911}}));
const root=createRoot(document.getElementById("root"));
window.submissions=[]; window.sorts=[];
window.renderDraft=(view="table",overrides={})=>root.render(view==="table"?React.createElement("main",{className:"p-3"},React.createElement(DraftPlayerTable,{players,activePick:{pick:{id:"pick-1",round:1,pick:12},team:{name:"Dutch Rudders"}},canSubmit:true,commissionerRequired:false,disabledReason:"Selections unlock when the draft begins.",submittingPlayerId:null,sortKey:"overallRating",sortDirection:"desc",onSort:key=>window.sorts.push(key),onSubmit:id=>window.submissions.push(id),...overrides})):React.createElement(DraftHubTeamPage,{mode:view}));
`;
const compiled = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true,
  write: false,
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "team-layout-fixtures",
      setup(builder) {
        builder.onResolve({ filter: /^@gshl-hooks$/ }, () => ({
          path: "hooks",
          namespace: "fixture",
        }));
        builder.onResolve(
          {
            filter:
              /^@gshl-components\/(contracts|team\/(LockerRoomHeader|TeamDraftPickList|TeamRoster))$/,
          },
          (args) => ({ path: args.path, namespace: "fixture" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          loader: "jsx",
          resolveDir: process.cwd(),
          contents:
            args.path === "hooks"
              ? `export function useToast(){return {toasts:[]};} export function useDraftHubTeamData(){return {isLoading:false,season:{id:"season"},selectedTeam:{id:"team"},teams:[],players:[],contracts:[],nhlTeams:[],draftPicks:[],contractTable:{}};}`
              : `import React from "react";export const LockerRoomHeader=()=> <h1>Dutch Rudders</h1>;export const TeamRoster=()=> <div className="h-64">Roster contents</div>;export const TeamDraftPickList=()=> <div className="h-32">Draft pick contents</div>;export const TeamContractTable=()=> <div className="h-48">Salary cap contents</div>;`,
        }));
      },
    },
  ],
});
const css = await readFile(".next/draft-mobile-test.css", "utf8");
const font = (
  await readFile(
    "node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
  )
).toString("base64");
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
  await page.setContent(
    `<style>${css}@font-face{font-family:TestGeist;src:url(data:font/woff2;base64,${font})}body{font-family:TestGeist,sans-serif}</style><div id="root"></div>`,
  );
  await page.addScriptTag({
    content:
      'window.process={env:{NODE_ENV:"production"}};' +
      compiled.outputFiles[0].text,
  });
  await mkdir(".next/draft-mobile-checks", { recursive: true });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewport({ width, height: 900 });
    await page.evaluate(() => window.renderDraft());
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(await page.$$eval("tbody tr", (rows) => rows.length), 16);
    assert.equal(
      await page.$$eval("tbody button", (buttons) => buttons.length),
      16,
    );
    const frozen = await page.evaluate(() => {
      const region = document.querySelector(
        '[aria-label="Available skaters"] table',
      ).parentElement;
      const row = region.querySelector("tbody tr");
      const name = row.querySelector("th");
      const button = row.querySelector("button");
      const before = [
        name.getBoundingClientRect().left,
        button.getBoundingClientRect().right,
      ];
      region.scrollLeft = 350;
      const after = [
        name.getBoundingClientRect().left,
        button.getBoundingClientRect().right,
      ];
      return {
        before,
        after,
        nameWidth: name.getBoundingClientRect().width,
        rowHeight: row.getBoundingClientRect().height,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        scrolled: region.scrollLeft,
      };
    });
    if (width < 1024) assert.ok(frozen.scrolled > 0);
    assert.ok(
      frozen.before.every((value, i) => Math.abs(value - frozen.after[i]) < 2),
    );
    assert.equal(frozen.pageOverflow, false);
    assert.ok(frozen.rowHeight <= 44);
    if (width < 1024) assert.ok(frozen.nameWidth <= 120);
    await page.screenshot({
      path: `.next/draft-mobile-checks/table-${width}.png`,
    });
    for (const mode of ["my-team", "other-team"]) {
      await page.evaluate((mode) => window.renderDraft(mode), mode);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const boxes = await page.evaluate(() =>
        Object.fromEntries(
          ["Current roster", "Draft picks", "Salary cap"].map((label) => {
            const box = document
              .querySelector('section[aria-label="' + label + '"]')
              .getBoundingClientRect();
            return [label, { top: box.top, left: box.left }];
          }),
        ),
      );
      if (width < 1024) {
        assert.ok(boxes["Current roster"].top < boxes["Draft picks"].top);
        assert.ok(boxes["Draft picks"].top < boxes["Salary cap"].top);
      } else {
        assert.ok(boxes["Draft picks"].top < boxes["Current roster"].top);
        assert.equal(boxes["Current roster"].top, boxes["Salary cap"].top);
        assert.ok(boxes["Current roster"].left < boxes["Salary cap"].left);
      }
    }
    console.log(
      `${width}px: table scrolls with frozen name/action; both team layouts ordered correctly`,
    );
  }
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluate(() => window.renderDraft());
  await page.waitForSelector('button[aria-label="Draft Sidney Crosby"]');
  await page.click('button[aria-label="Draft Sidney Crosby"]');
  await page.waitForSelector("dialog[open]");
  assert.match(
    await page.$eval("dialog", (node) => node.innerText),
    /Sidney Crosby.*Dutch Rudders/s,
  );
  assert.deepEqual(await page.evaluate(() => window.submissions), []);
  await page.screenshot({ path: ".next/draft-mobile-checks/confirm.png" });
  await page.keyboard.press("Escape");
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label"),
    ),
    "Draft Sidney Crosby",
  );
  await page.click('button[aria-label="Draft Sidney Crosby"]');
  await page.evaluate(() =>
    [...document.querySelectorAll("dialog button")]
      .find((button) => button.textContent === "Confirm draft")
      .click(),
  );
  assert.deepEqual(await page.evaluate(() => window.submissions), ["0"]);
  await page.evaluate(() =>
    window.renderDraft("table", { submittingPlayerId: "0", canSubmit: false }),
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(
    await page.$$eval("dialog button", (buttons) =>
      buttons.every((button) => button.disabled),
    ),
  );
  await page.keyboard.press("Escape");
  assert.ok(await page.$("dialog[open]"));
  await page.evaluate(() =>
    window.renderDraft("table", { error: "Pick could not be submitted." }),
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.match(
    await page.$eval('dialog [role="alert"]', (node) => node.textContent),
    /could not/,
  );
  await page.keyboard.press("Escape");
  await page.click('button[aria-label="Sort by GP"]');
  assert.deepEqual(await page.evaluate(() => window.sorts), ["GP"]);
  await page.evaluate(() =>
    window.renderDraft("table", {
      canSubmit: false,
      commissionerRequired: true,
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(
    await page.$$eval("tbody button", (buttons) =>
      buttons.every((button) => button.disabled),
    ),
  );
  assert.equal(
    await page.$eval("tbody button", (node) => node.textContent),
    "Force pick",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Confirmation, cancellation/focus, pending/error states, sorting and eligibility passed; no live mutations",
  );
} finally {
  await browser.close();
}
