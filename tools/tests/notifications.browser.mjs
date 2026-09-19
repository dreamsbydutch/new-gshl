import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

// Exercise the real setup UI without granting permission or sending live pushes.
const bundle = await build({
  stdin: {
    contents: `import React from "react"; import {createRoot} from "react-dom/client";
      import {DraftNotificationSetup} from "./src/components/notifications/DraftNotificationSetup";
      import {NotificationCenter} from "./src/components/notifications/NotificationCenter";
      const root=createRoot(document.getElementById("root"));
      window.actions=[];
      window.renderSetup=(overrides={})=>{
        window.setup={settings:{publicKey:"fixture-key"},browserChecked:true,supported:true,permission:"default",
          busy:false,draftReady:false,needsHomeScreen:false,
          enablePush:async draft=>window.actions.push(["enable",draft]),
          testPush:async args=>window.actions.push(["test",args.deviceId]),
          enableDraftReminders:async()=>window.actions.push(["save"]),
          run:async work=>work(),...overrides};
        root.render(<div className="p-3"><DraftNotificationSetup /></div>);
      };
      window.renderCenter=(isCommissioner)=>{
        window.setup={...window.setup,
          settings:{publicKey:"fixture-key",options:[],devices:[],isCommissioner},
          inbox:{status:"Exhausted",results:[]}};
        root.render(<NotificationCenter />);
      };`,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "notification-fixtures",
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /^@gshl-hooks\/(features\/useNotificationCenter|main\/useAuthSession)$/,
          },
          (args) => ({ path: args.path, namespace: "fixture" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          loader: "js",
          contents: args.path.includes("useAuthSession")
            ? 'export function useAuthSession(){return {status:"authenticated",session:{user:{status:"active"}}};}'
            : "export function useNotificationCenter(){return window.setup;}",
        }));
      },
    },
  ],
});
const css = await readFile(".next/notifications-test.css", "utf8");
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
  await page.setRequestInterception(true);
  page.on(
    "request",
    (request) =>
      void request.respond({
        status: 200,
        contentType: "text/html",
        body: `<style>${css}</style><div id="root"></div>`,
      }),
  );
  await page.goto("http://localhost:3107");
  await page.addScriptTag({
    content:
      'window.process={env:{NODE_ENV:"production"}};' +
      bundle.outputFiles[0].text,
  });
  assert.deepEqual(errors, []);
  const render = async (overrides) => {
    await page.evaluate((value) => window.renderSetup(value), overrides);
    await page.waitForSelector('[aria-label="Draft notification setup"]');
    await new Promise((resolve) => setTimeout(resolve, 50));
  };
  for (const width of [320, 390, 1280]) {
    await page.setViewport({ width, height: 900 });
    await render({});
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.equal(
      await page.evaluate(() => window.actions.length),
      0,
      "Rendering must not request permission",
    );
  }
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent === "Enable draft alerts")
      .click(),
  );
  assert.deepEqual(await page.evaluate(() => window.actions), [
    ["enable", true],
  ]);
  await render({ permission: "denied" });
  assert.ok(
    (await page.$eval("body", (el) => el.textContent)).includes(
      "Notifications are blocked",
    ),
  );
  assert.equal(
    await page.$$eval("button", (buttons) =>
      buttons.some((button) => button.textContent === "Enable draft alerts"),
    ),
    false,
  );
  await render({ needsHomeScreen: true, supported: false });
  assert.equal(await page.$$eval("ol li", (rows) => rows.length), 3);
  await render({ settings: { publicKey: null } });
  assert.ok(
    (await page.$eval("body", (el) => el.textContent)).includes(
      "awaiting league setup",
    ),
  );
  await render({
    draftReady: true,
    deviceId: "own-device",
    permission: "granted",
  });
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent === "Send test notification")
      .click(),
  );
  assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), [
    "test",
    "own-device",
  ]);
  for (const isCommissioner of [false, true, false]) {
    await page.evaluate((role) => window.renderCenter(role), isCommissioner);
    await page.waitForSelector('[aria-label="Notification views"]');
    await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === "preferences")
        .click(),
    );
    await page.waitForSelector('[aria-label="Preferences"]');
    await page.waitForFunction(
      (expected) =>
        !!document.querySelector('form button[type="submit"]') === expected,
      {},
      isCommissioner,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Notification setup and commissioner-only announcement visibility pass; no overflow at 320/390/1280px.",
  );
} finally {
  await browser.close();
}
