import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(
  new URL("../../public/sw.js", import.meta.url),
  "utf8",
);
async function push(icon) {
  const listeners = new Map();
  let options;
  let work;
  runInNewContext(source, {
    URL,
    self: {
      location: { origin: "https://gshlapp.vercel.app" },
      addEventListener: (name, handler) => listeners.set(name, handler),
      registration: {
        showNotification: async (_title, value) => {
          options = value;
        },
      },
    },
  });
  listeners.get("push")({
    data: {
      json: () => ({ title: "Update", body: "News", icon, href: "/draft" }),
    },
    waitUntil: (promise) => {
      work = promise;
    },
  });
  await work;
  return options;
}

test("push uses the context logo and keeps the monochrome status-bar badge", async () => {
  const options = await push("https://example.com/team.png");
  assert.equal(options.icon, "https://example.com/team.png");
  assert.equal(options.badge, "/gshl-notification-badge.png");
  assert.equal(options.data.href, "/draft");
});

test("old payloads and unsafe logo URLs fall back to GSHL", async () => {
  for (const icon of [
    undefined,
    3,
    "javascript:alert(1)",
    "http://example.com/logo.png",
    "https://user:password@example.com/logo.png",
  ])
    assert.equal((await push(icon)).icon, "/gshl-notification-icon.png");
  assert.equal(
    (await push("/team.png")).icon,
    "https://gshlapp.vercel.app/team.png",
  );
});
