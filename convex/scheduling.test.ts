import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { makeFunctionReference, type Scheduler } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { scheduleAfter, scheduleAt } from "./lib/scheduling";

void test("disabled scheduling rejects both timers before contacting the scheduler", async () => {
  const previous = process.env.GSHL_SCHEDULED_FUNCTIONS_ENABLED;
  process.env.GSHL_SCHEDULED_FUNCTIONS_ENABLED = "false";
  let calls = 0;
  const scheduler: Scheduler = {
    runAfter: async () => {
      calls++;
      throw new Error("Unexpected scheduler call");
    },
    runAt: async () => {
      calls++;
      throw new Error("Unexpected scheduler call");
    },
    cancel: async () => {
      throw new Error("Unexpected cancellation");
    },
  };
  const ref = makeFunctionReference<"mutation">("example:run");
  try {
    await assert.rejects(scheduleAfter({ scheduler }, 0, ref, {}), /disabled/);
    await assert.rejects(
      scheduleAt({ scheduler }, Date.now(), ref, {}),
      /disabled/,
    );
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined)
      delete process.env.GSHL_SCHEDULED_FUNCTIONS_ENABLED;
    else process.env.GSHL_SCHEDULED_FUNCTIONS_ENABLED = previous;
  }
});

void test("enabled and existing deployments preserve scheduler arguments and results", async () => {
  const previous = process.env.GSHL_SCHEDULED_FUNCTIONS_ENABLED;
  const calls: unknown[][] = [];
  const id = "scheduled-id" as Id<"_scheduled_functions">;
  const scheduler: Scheduler = {
    runAfter: async (...args) => {
      calls.push(args);
      return id;
    },
    runAt: async (...args) => {
      calls.push(args);
      return id;
    },
    cancel: async () => {
      throw new Error("Unexpected cancellation");
    },
  };
  const ref = makeFunctionReference<"mutation">("example:run");
  const args = { value: 7 };
  const date = new Date(123456789);
  try {
    for (const setting of [undefined, "true"]) {
      if (setting === undefined)
        delete process.env.GSHL_SCHEDULED_FUNCTIONS_ENABLED;
      else process.env.GSHL_SCHEDULED_FUNCTIONS_ENABLED = setting;
      assert.equal(await scheduleAfter({ scheduler }, 42, ref, args), id);
      assert.equal(await scheduleAt({ scheduler }, date, ref, args), id);
    }
    assert.deepEqual(calls, [
      [42, ref, args],
      [date, ref, args],
      [42, ref, args],
      [date, ref, args],
    ]);
  } finally {
    if (previous === undefined)
      delete process.env.GSHL_SCHEDULED_FUNCTIONS_ENABLED;
    else process.env.GSHL_SCHEDULED_FUNCTIONS_ENABLED = previous;
  }
});

void test("all backend scheduling passes through the environment guard", () => {
  const root = fileURLToPath(new URL("./", import.meta.url));
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== "_generated") scan(path);
      else if (
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts") &&
        entry.name !== "scheduling.ts"
      ) {
        assert.doesNotMatch(
          readFileSync(path, "utf8"),
          /\.scheduler\s*\.\s*run(?:After|At)\s*\(/,
          path,
        );
      }
    }
  }
  scan(root);
});
