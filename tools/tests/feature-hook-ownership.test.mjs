import assert from "node:assert/strict";
import test from "node:test";
import { checkFeatureHookOwnership } from "../../scripts/check-feature-hook-ownership.mjs";

const feature = "src/hooks/features/useExample.ts";

for (const specifier of [
  "convex/react",
  "convex/browser",
  "@convex-dev/auth/react",
  "../../../convex/_generated/api",
  "@gshl-convex/_generated/api",
]) {
  for (const source of [
    `import { useQuery as read } from "${specifier}";`,
    `import "${specifier}";`,
    `export * from "${specifier}";`,
    `const data = import("${specifier}");`,
    `const data = require("${specifier}");`,
    `import data = require("${specifier}");`,
  ]) {
    test(`rejects feature runtime access: ${source}`, () => {
      const failures = checkFeatureHookOwnership(feature, source);
      assert.equal(failures.length, 1);
      assert.match(failures[0], /src\/hooks\/features\/useExample.ts:1:\d+/);
      assert.match(failures[0], /domain main hook/);
      assert.deepEqual(
        checkFeatureHookOwnership("src/hooks/main/useExample.ts", source),
        [],
      );
    });
  }
}

test("allows domain hooks, type-only references, comments and quoted source", () => {
  assert.deepEqual(
    checkFeatureHookOwnership(
      feature,
      `
import { useDomain } from "../main/useDomain";
import type { Id } from "../../../convex/_generated/dataModel";
import { type FunctionArgs } from "convex/server";
export type { FunctionArgs } from "convex/server";
export { type FunctionArgs } from "convex/server";
type Result = import("convex/server").FunctionArgs;
// import { useQuery } from "convex/react";
const example = 'require("convex/react")';
`,
    ),
    [],
  );
});

test("normalizes Windows paths and rejects mixed runtime/type imports", () => {
  assert.equal(
    checkFeatureHookOwnership(
      feature.replaceAll("/", "\\"),
      'import { type FunctionArgs, makeFunctionReference } from "convex/server";',
    ).length,
    1,
  );
});
