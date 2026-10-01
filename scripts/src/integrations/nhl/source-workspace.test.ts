import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { withNhlSourceCache } from "./source-workspace";

test("API inputs are available across steps and removed after success or failure", async () => {
  for (const fail of [false, true]) {
    let scratch = "";
    const run = withNhlSourceCache(undefined, async (directory) => {
      scratch = directory;
      await writeFile(join(directory, "source.json"), "api input");
      assert.equal(
        await readFile(join(directory, "source.json"), "utf8"),
        "api input",
      );
      if (fail) throw new Error("calculation failed");
      return { rating: 80 };
    });
    if (fail) await assert.rejects(run, /calculation failed/);
    else assert.deepEqual(await run, { rating: 80 });
    await assert.rejects(stat(scratch), { code: "ENOENT" });
  }
});

test("explicit reusable caches are preserved, including when calculation fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nhl-cache-test-"));
  try {
    const file = join(directory, "existing.json");
    await writeFile(file, "existing input");
    await assert.rejects(
      withNhlSourceCache(directory, async (cache) => {
        assert.equal(cache, directory);
        throw new Error("calculation failed");
      }),
      /calculation failed/,
    );
    assert.equal(await readFile(file, "utf8"), "existing input");
  } finally {
    await rm(directory, { recursive: true });
  }
  await assert.rejects(
    withNhlSourceCache("", async () => undefined),
    /Empty NHL cache/,
  );
});
