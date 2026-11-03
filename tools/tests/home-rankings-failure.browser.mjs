import assert from "node:assert/strict";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React from "react";
import {createRoot} from "react-dom/client";
import {ConvexProvider} from "convex/react";
import {HomeScoreboard} from "./src/components/home/HomeScoreboard";
import {PowerRankingsHomeCard} from "./src/components/home/PowerRankingsHomeCard";
const client={watchQuery:()=>({localQueryResult:()=>{throw new Error("[CONVEX Q(frontend:powerRankingsPreview)] Server Error")},onUpdate:()=>()=>{},journal:()=>undefined})};
createRoot(document.getElementById("root")).render(<ConvexProvider client={client}><HomeScoreboard seasonId="season"/><PowerRankingsHomeCard seasonId="season"/></ConvexProvider>);
`,
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
          {
            filter:
              /^(@gshl-hooks$|@gshl-hooks\/features\/useHomeScoreboard$|@gshl-utils$|next\/|@gshl-skeletons$)/,
          },
          ({ path }) => ({ path, namespace: "fixture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          loader: "tsx",
          resolveDir: process.cwd(),
          contents:
            path === "next/image"
              ? 'import React from "react"; export default p=><img {...p}/>;'
              : path === "next/link"
                ? 'import React from "react"; export default p=><a {...p}/>;'
                : path === "@gshl-utils"
                  ? 'export const cn=(...a)=>a.filter(Boolean).join(" "); export const buildMatchupNavigationHref=()=>"/matchup"; export const buildStandingsNavigationHref=()=>"/standings"; export const selectHomePowerRankingPreview=x=>x;'
                  : path === "@gshl-skeletons"
                    ? "export const PowerRankingsHomeCardSkeleton=()=>null;"
                    : path === "@gshl-hooks"
                      ? 'export {usePowerRankingsPreview} from "./src/hooks/main/usePowerRankings"; export const useAppRouter=()=>({router:{push(){}}}); export const useDistinctTeamColors=()=>({});'
                      : "export const useHomeScoreboard=()=>({week:null,matchupGroups:[],isLoading:false,isScheduleLoading:false,error:null});",
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
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [390, 1280]) {
    await page.setViewport({ width, height: 844 });
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForFunction(() =>
      document.body.innerText.includes("Power rankings"),
    );
    const text = await page.evaluate(() => document.body.innerText);
    assert.match(text, /The season schedule is not available yet/);
    assert.match(text, /unavailable/i);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: both homepage consumers survive rankings failure at " +
        width +
        "px",
    );
  }
} finally {
  await browser.close();
}
