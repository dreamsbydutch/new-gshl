import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile, mkdir } from "node:fs/promises";
import postcss from "postcss";
import tailwind from "tailwindcss";
import puppeteer from "puppeteer-core";
const source = await readFile(
  "src/components/league/StandingsContainer.tsx",
  "utf8",
);
const card = await readFile(
  "src/components/standings/StandingsTeamCard.tsx",
  "utf8",
);
const css = (
  await postcss([
    tailwind({
      content: [{ raw: source + card }],
      corePlugins: { preflight: true },
    }),
  ]).process("@tailwind base; @tailwind utilities;", { from: undefined })
).css;
const compiled = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {StandingsComponent} from './src/components/league/StandingsContainer'; window.render=(view)=>createRoot(document.getElementById('root')).render(<StandingsComponent group={{title:'League',teams:[{id:'team',name:'Ben Eagers Hands',seasonStats:{teamW:0,teamL:5}}]}} season={{id:'season',categories:['G','A','P','PPP','SOG','HIT','BLK','W','GAA','SV%']}} standingsType={view}/>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  jsx: "automatic",
  platform: "browser",
  plugins: [
    {
      name: "fixtures",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^(@gshl-hooks$|@gshl-utils|next\/image|@gshl-components\/ui\/WhatsAppShareButton)/,
          },
          ({ path }) => ({ path, namespace: "fixture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          resolveDir: process.cwd(),
          loader: "tsx",
          contents:
            path === "next/image"
              ? 'import React from "react"; export default p=><img {...p}/>;'
              : path.includes("WhatsApp")
                ? "export const WhatsAppShareButton=()=>null;"
                : path === "@gshl-hooks"
                  ? `export const useAuthSession=()=>({}); export const useStandingsTeamDetail=()=>({data:{previousGames:[1,2].map(id=>({id:String(id),opponentName:"Opponent",weekLabel:"W5",venueLabel:"@",isComplete:true,resultLabel:"L 4-5",resultTone:"loss"})),upcomingGames:[3,4].map(id=>({id:String(id),opponentName:"Opponent",weekLabel:"W6",venueLabel:"v",isComplete:false})),categoryRanks:[]},isLoading:false});`
                  : path.includes("matchup-details")
                    ? "export const resolveMatchupCategories=c=>c.map(label=>({label}));"
                    : path.includes("whatsapp-share")
                      ? 'export const buildWhatsAppShareMessage=()=>""; export const canShareCommissionerContent=()=>false;'
                      : path.includes("standings-container")
                        ? 'export const standingsMatchupSummary=()=>({pointsPercentage:"0%"});'
                        : 'export const cn=(...a)=>a.filter(Boolean).join(" "); export const calculateStandingsPoints=()=>0; export const formatStandingsDetailStat=v=>v; export const buildStandingsNavigationHref=()=>"";',
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
  await mkdir(".next/standings-proof", { recursive: true });
  for (const width of [360, 390, 640, 1024, 1440])
    for (const view of ["overall", "conference", "wildcard"]) {
      await page.setViewport({ width, height: 800 });
      await page.setContent('<div id="root"></div>');
      await page.addStyleTag({ content: css });
      await page.addScriptTag({ content: compiled.outputFiles[0].text });
      await page.evaluate((v) => window.render(v), view);
      await page.waitForSelector("button[aria-expanded]");
      const measure = () =>
        page.$eval("tbody tr", (el) => ({
          height: el.getBoundingClientRect().height,
          team: el.children[1].getBoundingClientRect().width,
        }));
      const before = await measure();
      await page.click("button[aria-expanded]");
      await page.waitForSelector('button[aria-expanded="true"]');
      const after = await measure();
      console.log({ width, view, before, after });
      await page.screenshot({
        path: `.next/standings-proof/${width}-${view}.png`,
      });
      assert.ok(after.height < 120, `team name collapsed at ${width}/${view}`);
      assert.ok(
        Math.abs(after.team - before.team) < 2,
        "expansion changed team column width",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.click("button[aria-expanded]");
      assert.equal(await page.$("tr[id]"), null);
    }
  console.log(
    "PASS: opening and closing preserves columns at all five widths and all three views",
  );
} finally {
  await browser.close();
}
