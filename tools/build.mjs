import { spawn } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";

// Keep the two TypeScript programs (typed ESLint and Next's type checker)
// out of memory at the same time. A lint failure must still fail the build.
const root = process.cwd();
const stages = [
  {
    name: "Lint",
    cli: "node_modules/eslint/bin/eslint.js",
    args: [
      "src",
      "--ignore-pattern",
      "**/*.test.*",
      "--ignore-pattern",
      "**/*.spec.*",
      "--parser-options",
      JSON.stringify({ project: "./tsconfig.build.json" }),
      "--cache",
      "--cache-strategy",
      "content",
      "--cache-location",
      ".next/cache/eslint/build-cache",
    ],
  },
  {
    name: "Compile, type-check, and generate pages",
    cli: "node_modules/next/dist/bin/next",
    args: ["build", "--no-lint", ...process.argv.slice(2)],
  },
];

for (const stage of stages) {
  const started = performance.now();
  console.log(`\n[build] ${stage.name} started`);
  const child = spawn(
    process.execPath,
    ["--max-old-space-size=3072", path.join(root, stage.cli), ...stage.args],
    {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    },
  );
  const code = await new Promise((resolve) => {
    child.once("error", (error) => {
      console.error(`[build] Could not start ${stage.name}: ${error.message}`);
      resolve(1);
    });
    child.once("close", (exitCode) => resolve(exitCode ?? 1));
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `[build] ${stage.name} ${code === 0 ? "passed" : "failed"} in ${seconds}s`,
  );
  if (code !== 0) {
    process.exitCode = code;
    break;
  }
}
