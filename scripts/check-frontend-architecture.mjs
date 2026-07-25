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

function moduleSpecifiers(source) {
  const specifiers = [];
  const pattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^;"']*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1]) specifiers.push(match[1]);
  }
  return specifiers;
}

function reportsForbiddenImport(file, specifier, patterns, layer) {
  if (!patterns.some((pattern) => pattern.test(specifier))) return;
  failures.push(
    `${layer} has forbidden import "${specifier}": ${relative(file)}`,
  );
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
  if (!/\.(?:ts|tsx)$/.test(file)) continue;
  const source = await readFile(file, "utf8");
  if (file.endsWith(".tsx")) {
    const baseName = path.basename(file, ".tsx");
    if (!/^[A-Z][A-Za-z0-9]*$/.test(baseName)) {
      failures.push(`Component filename must be PascalCase: ${relative(file)}`);
    }
    if (/^\s*export\s+default\b/m.test(source)) {
      failures.push(`Component must use a named export: ${relative(file)}`);
    }
    if (/^(?:export\s+)?(?:type|interface)\s+\w+/m.test(source)) {
      failures.push(
        `Component declares a type or interface: ${relative(file)}`,
      );
    }
  }

  const providerException = new Set([
    "src/components/auth/AuthProvider.tsx",
    "src/components/auth/ConvexClientProvider.tsx",
  ]).has(relative(file));
  for (const specifier of moduleSpecifiers(source)) {
    reportsForbiddenImport(
      file,
      specifier,
      [
        /^next\/navigation$/,
        /^@gshl-cache(?:\/|$)/,
        /^@gshl-server(?:\/|$)/,
        /^@gshl-app\/.*\/api(?:\/|$)/,
        /(?:^|\/)(?:server|app\/api|trpc|lib\/cache)(?:\/|$)/,
        ...(providerException
          ? []
          : [/^next-auth\/react$/, /^@uploadthing\/react$/, /^convex\/react$/]),
      ],
      "Component",
    );
  }
}

for (const file of await walk(path.join(srcRoot, "app"))) {
  if (!/\.(?:ts|tsx)$/.test(file)) continue;
  if (!routeFileNames.has(path.basename(file))) {
    failures.push(`Non-route module found in src/app: ${relative(file)}`);
  }
  if (
    !relative(file).startsWith("src/app/api/") &&
    /^(?:export\s+)?(?:type|interface)\s+\w+/m.test(
      await readFile(file, "utf8"),
    )
  ) {
    failures.push(`Route declares a type or interface: ${relative(file)}`);
  }
}

for (const group of ["main", "features"]) {
  for (const file of await walk(path.join(srcRoot, "hooks", group))) {
    if (!/\.(?:ts|tsx)$/.test(file)) continue;
    if (
      path.basename(file) !== "index.ts" &&
      !/^use[A-Z][A-Za-z0-9]*\.(?:ts|tsx)$/.test(path.basename(file))
    ) {
      failures.push(`Hook filename must start with use: ${relative(file)}`);
    }
    const source = await readFile(file, "utf8");
    if (/^(?:export\s+)?(?:type|interface)\s+\w+/m.test(source)) {
      failures.push(`Hook declares a type or interface: ${relative(file)}`);
    }
    for (const specifier of moduleSpecifiers(source)) {
      reportsForbiddenImport(
        file,
        specifier,
        [
          /^@gshl-components(?:\/|$)/,
          /^@gshl-ui$/,
          /^@gshl-nav$/,
          /^@gshl-skeletons$/,
          /(?:^|\/)components(?:\/|$)/,
        ],
        "Hook",
      );
    }
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
  for (const specifier of moduleSpecifiers(source)) {
    reportsForbiddenImport(
      file,
      specifier,
      [
        /^@gshl-hooks(?:\/|$)/,
        /^@gshl-components(?:\/|$)/,
        /^@gshl-utils(?:\/|$)/,
        /^(?:\.\.\/)+(?:hooks|components|lib\/utils)(?:\/|$)/,
      ],
      "Types layer",
    );
  }
}

for (const file of await walk(path.join(srcRoot, "lib", "utils"))) {
  if (!/\.(?:ts|tsx)$/.test(file)) continue;
  const source = await readFile(file, "utf8");
  for (const specifier of moduleSpecifiers(source)) {
    reportsForbiddenImport(
      file,
      specifier,
      [
        /^react(?:\/|$)/,
        /^next(?:\/|$)/,
        /^@gshl-hooks(?:\/|$)/,
        /^@gshl-components(?:\/|$)/,
        /(?:^|\/)(?:hooks|components)(?:\/|$)/,
      ],
      "Utility",
    );
  }
}

for (const file of await walk(path.join(srcRoot, "lib", "cache"))) {
  if (!/\.(?:ts|tsx)$/.test(file)) continue;
  const source = await readFile(file, "utf8");
  for (const specifier of moduleSpecifiers(source)) {
    reportsForbiddenImport(
      file,
      specifier,
      [/^react(?:\/|$)/, /^@gshl-hooks(?:\/|$)/, /(?:^|\/)hooks(?:\/|$)/],
      "Cache layer",
    );
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Frontend architecture checks passed.");
}
