import assert from "node:assert/strict";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
      import { createRoot } from "react-dom/client";
      import { NHLScheduleHomeCard } from "./src/components/home/NHLScheduleHomeCard";
      createRoot(document.querySelector("main")).render(<NHLScheduleHomeCard />);
    `,
  },
  bundle: true,
  write: false,
  jsx: "automatic",
  loader: { ".png": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  plugins: [
    {
      name: "schedule-fixture",
      setup(builder) {
        builder.onResolve({ filter: /^next\/link$/ }, () => ({
          path: "link",
          namespace: "navigation",
        }));
        builder.onLoad({ filter: /.*/, namespace: "navigation" }, () => ({
          loader: "tsx",
          resolveDir: process.cwd(),
          contents: "export default ({prefetch, ...props}) => <a {...props} />",
        }));
        builder.onResolve({ filter: /\/player\/NHLLogo$/ }, () => ({
          path: "logo",
          namespace: "logo",
        }));
        builder.onLoad({ filter: /.*/, namespace: "logo" }, () => ({
          contents: "export const NHLLogo = () => null",
        }));
        builder.onResolve({ filter: /\/main\/useNHL$/ }, () => ({
          path: "schedule",
          namespace: "fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: `
          const team = { abbrev: "TOR", placeName: { default: "Toronto" } };
          const games = Array.from({ length: 6 }, (_, i) => ({
            id: i + 1, homeTeam: team, awayTeam: team, gameState: "FUT",
            startTimeUTC: "2026-11-21T18:00:00Z",
          }));
          export const useNHLSchedule = date => ({
            data: { updatedAt: 0, gameWeek: [{ date, games }] },
          });
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
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error(error.message));
  await page.setContent("<main></main>");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const links = 'a[href^="/nhl/matchup/"]';
  await page.waitForSelector(links);
  assert.deepEqual(
    await page.$$eval(links, (rows) =>
      rows.map((row) => row.getAttribute("href")),
    ),
    [1, 2, 3, 4, 5, 6].map((id) => `/nhl/matchup/${id}`),
  );
  console.log(
    "All six selected-day matchups are visible on the homepage card.",
  );
} finally {
  await browser.close();
}
