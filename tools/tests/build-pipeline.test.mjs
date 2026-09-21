import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const build = fileURLToPath(new URL("../build.mjs", import.meta.url));

async function runFixture(t, lintExit, nextExit) {
  const directory = await mkdtemp(path.join(tmpdir(), "gshl-build-test-"));
  // Never recurse outside the independently created temporary fixture.
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [relativePath, source] of [
    [
      "node_modules/eslint/bin/eslint.js",
      `const fs = require('node:fs');
       setTimeout(() => {
         fs.appendFileSync('events', 'lint finished\\n');
         process.exitCode = ${lintExit};
       }, 50);`,
    ],
    [
      "node_modules/next/dist/bin/next",
      `const fs = require('node:fs');
       if (fs.readFileSync('events', 'utf8') !== 'lint finished\\n') process.exit(99);
       fs.appendFileSync('events', JSON.stringify(process.argv.slice(2)));
       process.exitCode = ${nextExit};`,
    ],
  ]) {
    const target = path.join(directory, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source);
  }
  const child = spawn(process.execPath, [build, "--debug"], {
    cwd: directory,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return {
    code,
    output,
    events: await readFile(path.join(directory, "events"), "utf8"),
  };
}

test("lint failure blocks compilation and preserves its failure code", async (t) => {
  const result = await runFixture(t, 7, 0);
  assert.equal(result.code, 7);
  assert.equal(result.events, "lint finished\n");
  assert.match(result.output, /Lint failed in/);
});

test("compilation starts after lint exits and receives build flags", async (t) => {
  const result = await runFixture(t, 0, 0);
  assert.equal(result.code, 0);
  assert.equal(result.events, 'lint finished\n["build","--no-lint","--debug"]');
  assert.match(result.output, /Lint passed in/);
  assert.match(result.output, /generate pages passed in/);
});

test("a failed Next build remains a failed production build", async (t) => {
  const result = await runFixture(t, 0, 9);
  assert.equal(result.code, 9);
  assert.match(result.output, /generate pages failed in/);
});
