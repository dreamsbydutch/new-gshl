import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkRouteBehavior } from "../../scripts/check-frontend-route-behavior.mjs";

const page = "src/app/league/page.tsx";

function rejected(source, file = page) {
  const diagnostics = checkRouteBehavior(file, source);
  assert.ok(diagnostics.length > 0, `Expected rejection: ${source}`);
  for (const diagnostic of diagnostics) {
    assert.ok(diagnostic.includes(file.replaceAll("\\", "/")), diagnostic);
    assert.match(diagnostic, /:\d+:\d+/, "Include a line and column");
    assert.match(diagnostic, /component|hook|lib|module|move|use|keep/i);
  }
  return diagnostics;
}

test("allows route composition, framework adapters, and server auth", () => {
  assert.deepEqual(
    checkRouteBehavior(
      page,
      `import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { prepareSignIn } from "@gshl-lib/auth/sign-in";
import { requireOwner } from "../../lib/auth/guards";
import { LeagueContent } from "@gshl-components/league/LeagueContent";
import { LeagueSkeleton } from "@gshl-skeletons";
export const metadata: Metadata = { title: "League" };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }) {
  return { title: (await params).slug };
}
export default async function Page({ params, searchParams }) {
  const { slug } = await params;
  const query = await searchParams;
  const request = await headers();
  const owner = await requireOwner();
  const preparation = await prepareSignIn(query);
  if (!slug) notFound();
  if (owner) redirect("/team");
  return <Suspense fallback={<LeagueSkeleton />}><LeagueContent /></Suspense>;
}`,
    ),
    [],
  );
});

test("client directive and provider rendering alone are allowed", () => {
  assert.deepEqual(
    checkRouteBehavior(
      "src/app/layout.tsx",
      `"use client";
import { AuthProvider } from "@gshl-components/auth/AuthProvider";
export default function Layout({ children }) {
  return <html><body><AuthProvider>{children}</AuthProvider></body></html>;
}`,
    ),
    [],
  );
});

for (const hook of [
  "useState",
  "useReducer",
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
  "useSyncExternalStore",
  "useTransition",
  "useOptimistic",
  "useActionState",
  "useRef",
  "useMemo",
  "useCallback",
  "useDeferredValue",
  "useImperativeHandle",
]) {
  test(`rejects React ${hook} including an import alias`, () => {
    rejected(`import { ${hook} as behavior } from "react";
export default function Page() { behavior(); return null; }`);
  });
}

test("rejects React default and namespace hook calls", () => {
  rejected('import React from "react"; function Page() { React.useState(0); }');
  rejected(
    'import * as R from "react"; function Page() { R.useEffect(() => {}); }',
  );
});

for (const [specifier, member] of [
  ["react", "useState"],
  ["next/navigation", "useRouter"],
]) {
  test(`recognizes named default aliases from ${specifier} without treating types as values`, () => {
    rejected(
      `import { default as runtime } from "${specifier}"; runtime.${member}();`,
    );
    for (const declaration of [
      `import type { default as runtime } from "${specifier}";`,
      `import { type default as runtime } from "${specifier}";`,
    ]) {
      assert.deepEqual(
        checkRouteBehavior(
          page,
          `${declaration} type Member = typeof runtime.${member};`,
        ),
        [],
      );
    }
  });
}

for (const specifier of [
  "@gshl-hooks",
  "@gshl-hooks/features/useLeague",
  "../../hooks/main/useLeague",
  "../../hooks/features/useLeague",
  "convex/react",
  "next-auth/react",
  "@tanstack/react-query",
  "swr",
  "@gshl-cache",
  "../../lib/cache/store",
  "@gshl-convex/_generated/api",
  "../../../convex/_generated/api",
  "@gshl-server/uploadthing",
  "../../server/uploadthing",
  "@gshl-lib/data/convex",
  "../../lib/data/convex",
  "@gshl-sheets",
  "../../lib/sheets/index",
]) {
  test(`rejects route runtime access to ${specifier}`, () => {
    rejected(`import { value } from "${specifier}";`);
  });
}

test("rejects client navigation while allowing server redirects", () => {
  rejected(
    'import { useRouter as navigate } from "next/navigation"; navigate();',
  );
  rejected(
    'import * as navigation from "next/navigation"; navigation.usePathname();',
  );
  assert.deepEqual(
    checkRouteBehavior(
      page,
      'import { redirect, notFound } from "next/navigation";',
    ),
    [],
  );
});

test("module restrictions also cover re-exports, dynamic import, and require", () => {
  for (const source of [
    'export { useLeague } from "@gshl-hooks";',
    'export * from "@gshl-cache";',
    'const hooks = import("@gshl-hooks");',
    'const data = require("@gshl-lib/data/convex");',
    'import "convex/react";',
  ])
    rejected(source);
});

test("type-only access and source text do not count as runtime behavior", () => {
  assert.deepEqual(
    checkRouteBehavior(
      page,
      `import type { Value } from "@gshl-hooks";
import { type Query } from "convex/react";
export type { Value } from "@gshl-hooks";
export { type Query } from "convex/react";
// fetch("/example"); import { useState } from "react";
const example = 'require("@gshl-cache"); React.useEffect();';
export default function Page() { return <p>fetch() useState()</p>; }`,
    ),
    [],
  );
});

test("rejects global fetching even inside nested functions", () => {
  for (const call of [
    'fetch("/data")',
    'globalThis.fetch("/data")',
    'window.fetch("/data")',
  ]) {
    rejected(`export default function Page() {
  async function load() { return ${call}; }
  return null;
}`);
  }
});

test("local names matching global APIs or React namespaces do not trigger", () => {
  assert.deepEqual(
    checkRouteBehavior(
      page,
      `import React from "react";
function example(fetch, window, globalThis, React) {
  fetch(); window.fetch(); globalThis.fetch(); React.useState();
}`,
    ),
    [],
  );
});

test("normalizes Windows paths and reports the actual failing source line", () => {
  const diagnostics = rejected(
    '\n\nconst result = fetch("/data");',
    "src\\app\\league\\page.tsx",
  );
  assert.ok(
    diagnostics.some((diagnostic) =>
      /src\/app\/league\/page\.tsx:3:\d+/.test(diagnostic),
    ),
  );
});

for (const file of ["src/app/error.tsx", "src/app/global-error.tsx"]) {
  test(`${file} allows client error logging but rejects route data access`, () => {
    assert.deepEqual(
      checkRouteBehavior(
        file,
        `"use client";
import { useEffect as logError } from "react";
export default function Error({ error, reset }) {
  logError(() => console.error(error), [error]);
  return <button onClick={reset}>Try again</button>;
}`,
      ),
      [],
    );
    rejected('import { useQuery } from "convex/react";', file);
    rejected('fetch("/data");', file);
  });
}

test("route handlers outside /api retain their integration role", () => {
  assert.deepEqual(
    checkRouteBehavior(
      "src/app/webhooks/route.ts",
      `import { value } from "@gshl-lib/data/convex";
export async function GET() { return fetch("https://example.test"); }`,
    ),
    [],
  );
});

test("CLI enforces route behavior alongside existing filename policy", async () => {
  const fixture = await mkdtemp(
    path.join(os.tmpdir(), "gshl-architecture-test-"),
  );
  const checker = fileURLToPath(
    new URL("../../scripts/check-frontend-architecture.mjs", import.meta.url),
  );
  const run = () =>
    spawnSync(process.execPath, [checker], { cwd: fixture, encoding: "utf8" });
  try {
    for (const folder of [
      "app",
      "components",
      "hooks/main",
      "hooks/features",
      "lib/types",
      "lib/utils",
      "lib/cache",
    ]) {
      await mkdir(path.join(fixture, "src", folder), { recursive: true });
    }
    await writeFile(
      path.join(fixture, "src/app/page.tsx"),
      "export default function Page() { return <main>League</main>; }",
    );
    await writeFile(
      path.join(fixture, "src/app/global-error.tsx"),
      '"use client"; import { useEffect } from "react"; export default function Error() { useEffect(() => console.error("error"), []); return <html><body>Error</body></html>; }',
    );
    await mkdir(path.join(fixture, "src/app/webhooks"));
    await writeFile(
      path.join(fixture, "src/app/webhooks/route.ts"),
      'export async function GET() { return fetch("https://example.test"); }',
    );
    const accepted = run();
    assert.equal(
      accepted.status,
      0,
      accepted.stderr || accepted.error?.message,
    );

    await writeFile(
      path.join(fixture, "src/app/page.tsx"),
      'export default async function Page() { return fetch("/data"); }',
    );
    const behavior = run();
    assert.equal(behavior.status, 1, behavior.stderr);
    assert.match(behavior.stderr, /src\/app\/page\.tsx:1:\d+/);
    assert.match(behavior.stderr, /fetch/i);

    await writeFile(
      path.join(fixture, "src/app/page.tsx"),
      "export default function Page() { return null; }",
    );
    await writeFile(
      path.join(fixture, "src/app/helper.ts"),
      "export const value = 1;",
    );
    const filename = run();
    assert.equal(filename.status, 1, filename.stderr);
    assert.match(filename.stderr, /Non-route module.*src\/app\/helper\.ts/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
