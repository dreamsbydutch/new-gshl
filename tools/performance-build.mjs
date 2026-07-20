import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const startedAt = new Date().toISOString();
const started = performance.now();

const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextCli, "build"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

const exitCode = await new Promise((resolve) => child.on("exit", resolve));
const durationMs = Math.round(performance.now() - started);

async function directoryBytes(directory) {
  let total = 0;
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      total += entry.isDirectory()
        ? await directoryBytes(target)
        : (await stat(target)).size;
    }
  } catch {
    return total;
  }
  return total;
}

async function routeAssets() {
  try {
    const manifest = JSON.parse(
      await readFile(
        path.join(root, ".next", "server", "app-build-manifest.json"),
        "utf8",
      ),
    );
    const routes = {};
    for (const [route, files] of Object.entries(manifest.pages ?? {})) {
      let rawBytes = 0;
      let gzipBytes = 0;
      for (const file of new Set(files)) {
        const contents = await readFile(path.join(root, ".next", file));
        rawBytes += contents.byteLength;
        gzipBytes += gzipSync(contents).byteLength;
      }
      routes[route] = { rawBytes, gzipBytes };
    }
    return routes;
  } catch {
    return {};
  }
}

const report = {
  startedAt,
  finishedAt: new Date().toISOString(),
  durationMs,
  exitCode: exitCode ?? 1,
  staticAssetBytes: await directoryBytes(path.join(root, ".next", "static")),
  serverAssetBytes: await directoryBytes(path.join(root, ".next", "server")),
  routes: await routeAssets(),
};

await mkdir(path.join(root, ".next", "performance"), { recursive: true });
await writeFile(
  path.join(root, ".next", "performance", "build-profile.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log("Performance build profile:", report);
process.exitCode = report.exitCode;
