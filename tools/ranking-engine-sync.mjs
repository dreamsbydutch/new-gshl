import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, "..");

const FILE_PAIRS = [
  {
    source: path.resolve(
      REPO_ROOT,
      "scripts/src/runtime/apps-script/features/RankingEngine/config.js",
    ),
    destination: path.resolve(
      REPO_ROOT,
      "apps-script/features/RankingEngine/config.js",
    ),
  },
  {
    source: path.resolve(
      REPO_ROOT,
      "scripts/src/runtime/apps-script/features/RankingEngine/player-pure.js",
    ),
    destination: path.resolve(
      REPO_ROOT,
      "apps-script/features/RankingEngine/player-pure.js",
    ),
  },
  {
    source: path.resolve(
      REPO_ROOT,
      "scripts/src/runtime/apps-script/features/RankingEngine/team-pure.js",
    ),
    destination: path.resolve(
      REPO_ROOT,
      "apps-script/features/RankingEngine/team-pure.js",
    ),
  },
  {
    source: path.resolve(
      REPO_ROOT,
      "scripts/src/runtime/apps-script/features/RankingEngine/index.js",
    ),
    destination: path.resolve(
      REPO_ROOT,
      "apps-script/features/RankingEngine/index.js",
    ),
  },
];

function toRelativePath(targetPath) {
  return path.relative(REPO_ROOT, targetPath).replaceAll("\\", "/");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableReadError(error) {
  return (
    error &&
    typeof error === "object" &&
    (error.code === "EBUSY" ||
      error.code === "EPERM" ||
      error.code === "ENOENT")
  );
}

async function readFileWithRetry(filePath, attempts = 5) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await readFile(filePath);
    } catch (error) {
      if (!isRetryableReadError(error) || attempt === attempts - 1) {
        throw error;
      }
      lastError = error;
      await sleep(100 * (attempt + 1));
    }
  }

  throw lastError;
}

async function sha256(filePath) {
  const contents = await readFileWithRetry(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

async function comparePair(pair) {
  const [sourceHash, destinationHash] = await Promise.all([
    sha256(pair.source),
    sha256(pair.destination),
  ]);

  return {
    ...pair,
    sourceHash,
    destinationHash,
    matches: sourceHash === destinationHash,
  };
}

async function verifyAllPairs() {
  return Promise.all(FILE_PAIRS.map(comparePair));
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node tools/ranking-engine-sync.mjs sync",
      "  node tools/ranking-engine-sync.mjs check",
    ].join("\n"),
  );
}

async function runSync() {
  for (const pair of FILE_PAIRS) {
    await mkdir(path.dirname(pair.destination), { recursive: true });
    await copyFile(pair.source, pair.destination);
    console.log(
      `[ranking-engine:sync] Copied ${toRelativePath(pair.source)} -> ${toRelativePath(pair.destination)}`,
    );
  }

  const results = await verifyAllPairs();
  const mismatches = results.filter((result) => !result.matches);
  if (mismatches.length > 0) {
    for (const mismatch of mismatches) {
      console.error(
        `[ranking-engine:sync] Hash mismatch after copy for ${toRelativePath(mismatch.destination)} source=${mismatch.sourceHash} destination=${mismatch.destinationHash}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `[ranking-engine:sync] Verified ${results.length} ranking engine file pair(s).`,
  );
}

async function runCheck() {
  const results = await verifyAllPairs();
  const mismatches = results.filter((result) => !result.matches);
  if (mismatches.length === 0) {
    console.log(
      `[ranking-engine:check] Verified ${results.length} ranking engine file pair(s).`,
    );
    return;
  }

  for (const mismatch of mismatches) {
    console.error(
      [
        `[ranking-engine:check] Drift detected.`,
        `  source: ${toRelativePath(mismatch.source)}`,
        `  destination: ${toRelativePath(mismatch.destination)}`,
        `  source hash: ${mismatch.sourceHash}`,
        `  destination hash: ${mismatch.destinationHash}`,
        "  Run `npm run ranking-engine:sync` from the repo root to resync the deployed Apps Script copy.",
      ].join("\n"),
    );
  }

  process.exitCode = 1;
}

const command = process.argv[2]?.trim().toLowerCase() ?? "check";

if (command === "sync") {
  await runSync();
} else if (command === "check") {
  await runCheck();
} else {
  printUsage();
  process.exitCode = 1;
}
