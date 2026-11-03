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
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {StandingsComponent} from './src/components/league/StandingsContainer'; window.render=(view)=>createRoot(document.getElementById('root')).render(<StandingsComponent group={{title:'Sunview',teams:Array.from({length:view==='wildcard'?3:7},(_,i)=>({id:'team'+i,name:'Team '+i,seasonStats:{teamW:0,teamL:5,overallRk:i+2,conferenceRk:i+2}}))}} season={{id:'season',categories:['G','A','P','PPP','SOG','HIT','BLK','W','GAA','SV%']}} standingsType={view}/>);`,
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
      if (view !== "overall") {
        const ranks = await page.$$eval(
          "tbody > tr:not([id]) > td:first-child",
          (cells) => cells.map((c) => Number(c.textContent)),
        );
        assert.deepEqual(
          ranks,
          Array.from({ length: view === "wildcard" ? 3 : 7 }, (_, i) => i + 1),
        );
      }
      await page.screenshot({
        path: `.next/standings-proof/ranks-${width}-${view}.png`,
      });
    }
  console.log("Conference ranks passed at five viewport widths.");
} finally {
  await browser.close();
}
