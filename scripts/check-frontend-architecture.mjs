import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const failures = [];

const allowedSrcDirectories = new Set([
  "app",
  "components",
  "content",
  "hooks",
  "lib",
  "server",
  "styles",
  "trpc",
]);

const routeFileNames = new Set([
  "default.tsx",
  "error.tsx",
  "layout.tsx",
  "loading.tsx",
  "not-found.tsx",
  "page.tsx",
  "route.ts",
  "template.tsx",
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath)));
    } else {
      files.push(absolutePath);
    }
  }
  return files;
}

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

for (const entry of await readdir(srcRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && !allowedSrcDirectories.has(entry.name)) {
    failures.push(`Unexpected top-level src directory: src/${entry.name}`);
  }
}

for (const folder of ["common", "helpers", "services", "shared"]) {
  const utilityFiles = await walk(path.join(srcRoot, "lib", "utils"));
  if (
    utilityFiles.some((file) =>
      relative(file).startsWith(`src/lib/utils/${folder}/`),
    )
  ) {
    failures.push(`Disallowed utility folder: src/lib/utils/${folder}`);
  }
}

for (const file of await walk(path.join(srcRoot, "components"))) {
  if (!file.endsWith(".tsx")) continue;
  const baseName = path.basename(file, ".tsx");
  if (!/^[A-Z][A-Za-z0-9]*$/.test(baseName)) {
    failures.push(`Component filename must be PascalCase: ${relative(file)}`);
  }
  const source = await readFile(file, "utf8");
  if (/^\s*export\s+default\b/m.test(source)) {
    failures.push(`Component must use a named export: ${relative(file)}`);
  }
}

for (const file of await walk(path.join(srcRoot, "app"))) {
  if (!/\.(?:ts|tsx)$/.test(file)) continue;
  if (relative(file).startsWith("src/app/api/")) continue;
  if (!routeFileNames.has(path.basename(file))) {
    failures.push(`Non-route module found in src/app: ${relative(file)}`);
  }
}

for (const file of await walk(path.join(srcRoot, "lib", "types"))) {
  if (!/\.(?:ts|tsx)$/.test(file)) continue;
  const source = await readFile(file, "utf8");
  if (/^\s*export\s+(?:const|let|var|class|function|enum)\b/m.test(source)) {
    failures.push(
      `Runtime export found in types-only layer: ${relative(file)}`,
    );
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Frontend architecture checks passed.");
}
