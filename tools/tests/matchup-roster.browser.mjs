import assert from "node:assert/strict";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import { PlayerStatsTable } from "./src/components/matchup/PlayerStatsTable";
import { getMatchupTodayGames } from "./src/lib/utils/features/matchup-details";
import { MatchupNHLGames } from "./src/components/matchup/MatchupNHLGames";
const player=(id,extra={})=>({id,fullName:id,nhlTeam:["TOR"],nhlPos:["C"],posGroup:"F",GP:1,G:1,...extra});
const roster=[player("Active Member",{dailyPos:"C"}),player("New Addition",{dailyPos:"BN"}),player("Injured Member",{dailyPos:"IR"})].map(({GP,G,...member})=>member);
const weeks=[player("Active Member"),player("Former Member"),player("Injured Member")];
const games=[{id:1,awayTeam:{abbrev:"TOR"},homeTeam:{abbrev:"BOS"},gameState:"FUT",gameScheduleState:"OK",startTimeUTC:"2026-11-01T23:00:00Z"}];
window.gameRows=getMatchupTodayGames(games,weeks,[],{date:"2026-11-01",away:[],home:[],currentAway:roster,currentHome:[]});
createRoot(document.getElementById("root")).render(<><PlayerStatsTable matchup={{id:"m",isComplete:false}} week={{startDate:"2026-10-26",endDate:"2026-11-01"}} team={{id:"team",name:"Fixture Team"}} nhlTeams={[]} players={weeks} playerDays={[]} currentRoster={roster}/><MatchupNHLGames details={{matchup:{id:"m",isComplete:false,awayTeamId:"away",homeTeamId:"home",seasonId:"s"},week:{startDate:"2026-10-26",endDate:"2026-11-01"},teams:{away:{id:"away",name:"Away"},home:{id:"home",name:"Home"}},players:{away:weeks,home:[]},playerDays:{away:[],home:[]},currentRosters:{away:roster,home:[]}}}/></>);
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
      name: "fixture-boundaries",
      setup(b) {
        b.onResolve({ filter: /useMatchupPlayersToWatch$/ }, () => ({
          path: "standouts",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /\/MatchupPlayersToWatch$/ }, () => ({
          path: "preview",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /useNHLHomeSchedule$/ }, () => ({
          path: "schedule",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /useInjuryReport$/ }, () => ({
          path: "injuries",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /^next\/image$/ }, () => ({
          path: "image",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /^next\/link$/ }, () => ({
          path: "link",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /^@gshl-utils$/ }, () => ({
          path: "utils",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /^@gshl-ui$/ }, () => ({
          path: "ui",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /PerformanceRecordBadge$/ }, () => ({
          path: "record",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          loader: "tsx",
          resolveDir: process.cwd(),
          contents:
            path === "preview"
              ? "export const MatchupPlayersToWatch=()=>null;"
              : path === "standouts"
                ? "export const useMatchupPlayersToWatch=()=>({players:[]});"
                : path === "schedule"
                  ? 'export const useNHLHomeSchedule=()=>({selectedDay:{date:"2026-11-01",dateLabel:"Today"},games:[{id:1,awayTeam:{abbrev:"TOR"},homeTeam:{abbrev:"BOS"},gameState:"FUT",gameScheduleState:"OK",startTimeUTC:"2026-11-01T23:00:00Z"}],data:{published:true},isLoading:false});'
                  : path === "injuries"
                    ? "export const useInjuryReport=()=>({data:{injuries:[]}});"
                    : path === "utils"
                      ? 'export {cn,abbreviatePlayerName} from "./src/lib/utils/core/format";export {findNhlTeamByAbbreviation,getPlayerNhlAbbreviations,resolveNhlTeamLogoUrl} from "./src/lib/utils/domain/player";export {formatMatchupPlayerName,renderPlayerStatCell} from "./src/lib/utils/features/matchup-details";'
                      : path === "ui"
                        ? 'export {TableViewport} from "./src/components/ui/TableViewport";'
                        : path === "record"
                          ? "export const PerformanceRecordBadge=()=>null;"
                          : path === "image"
                            ? 'import React from "react";export default ({...props})=><img {...props}/>;'
                            : 'import React from "react";export default ({prefetch,...props})=><a {...props}/>;',
        }));
      },
    },
  ],
});
const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => p && existsSync(p));
assert.ok(executablePath, "A Chromium browser is required");
await mkdir(".next/matchup-roster-proof", { recursive: true });
await writeFile(
  ".next/matchup-roster-proof/input.css",
  "@tailwind base;@tailwind components;@tailwind utilities;",
);
execFileSync(
  process.execPath,
  [
    "node_modules/tailwindcss/lib/cli.js",
    "-i",
    ".next/matchup-roster-proof/input.css",
    "-o",
    ".next/matchup-roster-proof/styles.css",
  ],
  { stdio: "pipe" },
);
const css = await readFile(".next/matchup-roster-proof/styles.css", "utf8");
const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent('<html><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  await page.waitForFunction(() =>
    document.querySelector('th[aria-label="Former Member"]'),
  );
  assert.ok(await page.$("#matchup-nhl-games-heading"));
  assert.ok(await page.$('a[href^="/nhl/matchup/1"]'));
  assert.doesNotMatch(
    await page.$eval(
      'section[aria-labelledby="matchup-nhl-games-heading"]',
      (node) => node.textContent,
    ),
    /No NHL games today/,
  );
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 900 });
    const groups = await page.$$eval("section:first-child tbody tr", (rows) => {
      let group = "";
      return rows.reduce((out, row) => {
        const text = row.textContent.replace(/\s+/g, " ").trim();
        if (
          /^(Active roster|No longer on roster|Injured \/ inactive)$/.test(
            text.trim(),
          )
        )
          group = text.trim();
        else if (row.querySelector("th[scope=row]"))
          out.push([
            group,
            row.querySelector("th[scope=row]").getAttribute("aria-label"),
          ]);
        return out;
      }, []);
    });
    assert.deepEqual(groups, [
      ["Active roster", "Active Member"],
      ["Active roster", "New Addition"],
      ["No longer on roster", "Former Member"],
      ["Injured / inactive", "Injured Member"],
    ]);
    assert.deepEqual(
      await page.evaluate(() =>
        window.gameRows[0].awayPlayers.map((p) => p.id),
      ),
      ["Active Member", "Injured Member", "New Addition"],
    );
    await mkdir(".next/matchup-roster-proof", { recursive: true });
    await page.screenshot({
      path: ".next/matchup-roster-proof/" + width + ".png",
      fullPage: true,
    });
  }
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent === "Today")
      .click(),
  );
  await page.waitForFunction(
    () =>
      document.querySelector('button[aria-pressed="true"]')?.textContent ===
      "Today",
  );
  assert.ok(await page.$('th[aria-label="Former Member"]'));
  assert.match(
    await page.$eval(
      'th[aria-label="Injured Member"]',
      (node) => node.textContent,
    ),
    /IR/,
  );
  assert.match(
    await page.$eval(
      'th[aria-label="Injured Member"]',
      (node) => node.closest("tr").textContent,
    ),
    /IR/,
  );
  assert.ok(
    await page.$eval('th[aria-label="Injured Member"]', (node) =>
      [...node.closest("tr").querySelectorAll("td")].some(
        (cell) => cell.textContent.trim() === "IR",
      ),
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Desktop/mobile roster groups, new additions, missing-capture games, Today toggle: passed",
  );
} finally {
  await browser.close();
}
