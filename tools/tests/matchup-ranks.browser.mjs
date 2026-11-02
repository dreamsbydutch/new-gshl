import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const compiled = await build({
  stdin: {
    contents: `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {HomeScoreboard} from "./src/components/home/HomeScoreboard";
    import {WeekMatchupScroller} from "./src/components/matchup/WeekMatchupScroller";
    createRoot(document.getElementById("root")).render(<main className="p-4 space-y-8"><HomeScoreboard seasonId="season"/><WeekMatchupScroller seasonId="season" weekId="week" matchupId="m1"/></main>);
  `,
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
      name: "fixtures",
      setup(b) {
        b.onResolve(
          { filter: /^(@gshl-hooks\/|@gshl-utils$|next\/)/ },
          ({ path }) => ({ path, namespace: "fixture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          loader: "tsx",
          resolveDir: process.cwd(),
          contents:
            path === "next/image"
              ? 'import React from "react"; export default props => <img {...props}/>;'
              : path === "next/link"
                ? 'import React from "react"; export default props => <a {...props}/>;'
                : path === "@gshl-utils"
                  ? 'export const cn=(...args)=>args.filter(Boolean).join(" "); export const buildMatchupNavigationHref=id=>"/matchup/"+id;'
                  : `const teams=[1,8,9,10].map(rank=>({id:"t"+rank,name:"Team "+rank,logoUrl:"data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="steelblue"/></svg>')}));
      const matchups=[{id:"m1",awayTeamId:"t1",homeTeamId:"t8",awayScore:12,homeScore:10},{id:"m2",awayTeamId:"t9",homeTeamId:"t10",awayScore:9,homeScore:7}];
      export const usePowerRankingsPreview=()=>({data:window.rankingsLoading?undefined:{entries:[1,8,9].map(rank=>({team:{id:"t"+rank},rank}))}});
      export const useWeeklyScheduleSummary=()=>({data:{teams,matchups},isLoading:false});
      export const useHomeScoreboard=()=>({week:{id:"week"},matchupGroups:[{week:{id:"week",weekNum:1},teams,matchups,phase:"current",isCurrentWeek:true}],isLoading:false,isScheduleLoading:false});`,
        }));
      },
    },
  ],
});
const browser = await puppeteer.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const css = await readFile(".next/matchup-ranks.css", "utf8");
  await mkdir(".next/matchup-ranks-proof", { recursive: true });
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 650 });
    await page.setContent('<html><body><div id="root"></div></body></html>');
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: compiled.outputFiles[0].text });
    await page.waitForSelector('[aria-label="Power ranking 8"]');
    for (const selector of [
      'section[aria-label="GSHL matchups"]',
      'nav[aria-label="Matchups from this week"]',
    ]) {
      const result = await page.$eval(selector, (root) => ({
        ranks: [...root.querySelectorAll('[aria-label^="Power ranking"]')].map(
          (el) => el.textContent,
        ),
        placement: [
          ...root.querySelectorAll('[aria-label^="Power ranking"]'),
        ].every(
          (el) =>
            el.nextElementSibling.tagName === "IMG" &&
            el.getBoundingClientRect().right <=
              el.nextElementSibling.getBoundingClientRect().left,
        ),
        overflow: [...root.querySelectorAll("a")].some(
          (el) => el.scrollWidth > el.clientWidth,
        ),
        links: root.querySelectorAll('a[href^="/matchup/"]').length,
      }));
      assert.deepEqual(result.ranks, ["1", "8"]);
      assert.equal(result.placement, true);
      assert.equal(result.overflow, false);
      assert.equal(result.links, 2);
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: `.next/matchup-ranks-proof/${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: both scrollers show ranks 1 and 8, hide ranks 9+ and unranked teams, place ranks left of logos, preserve links, and fit 390/1440px viewports.",
  );
} finally {
  await browser.close();
}
