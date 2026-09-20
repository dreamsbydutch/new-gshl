import assert from "node:assert/strict";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

// Real editor and feature hook; remote data and writes are local fixtures.
const fixture = `
const picks = [1,2].map(n => ({id:'pick'+n,gshlTeamId:'team'+n,originalTeamId:'team'+n,round:String(n),pick:'1',playerId:'player'+n,playerName:'Player '+n,isTraded:false,isSigning:false,version:'version'+n}));
export function useSeasons(){return {data:[{id:'season',name:'2026-27'}],isLoading:false};}
export function useDraftCorrections(){return {data:{picks,teams:[1,2].map(n=>({id:'team'+n,name:'Team '+n}))},history:[],isPending:false,mutateAsync:async args=>{window.savedCorrections=args;}};}
`;
const bundled = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {DraftPickManagement} from './src/components/admin/DraftPickManagement'; createRoot(document.getElementById('root')).render(<DraftPickManagement/>);`,
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
      name: "draft-correction-fixtures",
      setup(builder) {
        // Keep the real primitives, without bootstrapping unrelated app integrations
        // through their broad barrels in this standalone browser document.
        const barrels = {
          "@gshl-ui":
            'export {Button} from "./src/components/ui/ButtonPrimitive"; export {TableViewport} from "./src/components/ui/TableViewport";',
          "@gshl-skeletons":
            'export {AdminPanelSkeleton} from "./src/components/skeletons/LeagueOfficeSkeleton";',
          "@gshl-utils": 'export {cn} from "./src/lib/utils/core/format";',
        };
        builder.onResolve(
          { filter: /^@gshl-(ui|skeletons|utils)$/ },
          (args) => ({ path: args.path, namespace: "barrel" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "barrel" }, (args) => ({
          contents: barrels[args.path],
          loader: "js",
          resolveDir: process.cwd(),
        }));
        builder.onResolve(
          { filter: /\/main\/use(?:Season|DraftCorrections)$/ },
          () => ({ path: "remote", namespace: "fixture" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: fixture,
          loader: "js",
        }));
      },
    },
  ],
});
const browser = await puppeteer.launch({
  executablePath:
    process.env.TV_TEST_BROWSER ??
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  await page.setViewport({ width: 390, height: 844 });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({
    content:
      'window.process={env:{NODE_ENV:"production"}};' +
      bundled.outputFiles[0].text,
  });
  await page.waitForSelector('[aria-label="Edit round 1, pick 1"]');
  const button = async (text) => {
    const handle = await page.evaluateHandle(
      (label) =>
        [...document.querySelectorAll("button")].find(
          (b) => b.textContent.trim() === label,
        ),
      text,
    );
    assert.ok(handle.asElement(), `Button exists: ${text}`);
    await handle.asElement().click();
    await handle.dispose();
  };
  const input = async (label, value) => {
    await page.evaluate(
      (label, value) => {
        const container = [...document.querySelectorAll("label")].find((el) =>
          el.textContent.trim().startsWith(label),
        );
        const element = container.querySelector("input");
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      },
      label,
      value,
    );
  };
  await page.click('[aria-label="Edit round 1, pick 1"]');
  await input("Round", "2");
  await button("Stage correction");
  await page.waitForFunction(() =>
    document.body.textContent.includes("1 staged corrections"),
  );
  assert.equal(await page.evaluate(() => window.savedCorrections), undefined);
  // A pending edit must not lock editing the second half of the swap.
  await page.click('[aria-label="Edit round 2, pick 1"]:not(:disabled)');
  // Both rows now display round 2; the first matching button may edit the staged row.
  const stillFirst = await page.evaluate(
    () => document.querySelector("select")?.disabled,
  );
  assert.equal(stillFirst, true);
  await button("Cancel edit");
  const editButtons = await page.$$('[aria-label="Edit round 2, pick 1"]');
  await editButtons[1].click();
  await input("Round", "1");
  await button("Stage correction");
  await page.waitForFunction(() =>
    document.body.textContent.includes("2 staged corrections"),
  );
  await input("Reason for corrections", "Repair draft allocation");
  await button("Review batch");
  assert.equal(await page.evaluate(() => window.savedCorrections), undefined);
  await button("Save all corrections");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Corrections saved together"),
  );
  const saved = await page.evaluate(() => window.savedCorrections);
  assert.equal(saved.seasonId, "season");
  assert.equal(saved.reason, "Repair draft allocation");
  assert.equal(saved.edits.length, 2);
  assert.deepEqual(
    saved.edits.map((edit) => [
      edit.pickId,
      edit.changes.round,
      edit.changes.playerId,
    ]),
    [
      ["pick1", 2, "player1"],
      ["pick2", 1, "player2"],
    ],
  );
  assert.equal(saved.edits[0].expectedVersion, "version1");
  assert.deepEqual(errors, []);
  console.log(
    "Draft correction browser fixture passed: stage both sides, review, single batch save, clear staged state.",
  );
} finally {
  await browser.close();
}
