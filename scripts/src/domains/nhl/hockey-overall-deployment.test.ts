import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  assertOnlyHockeyOverallSchemaChange,
  assertOnlyDualRatingsSchemaChange,
  assertDeploymentSchemaChange,
  auditBuiltinOnlyNodeModules,
  esbuildRequireShim,
  composeDeploymentOverlay,
  deploymentRootsForScope,
  gshlImpactSchemaTables,
  moduleDigest,
  type DeploymentModule,
} from "./hockey-overall-deployment";

function impactSchema() {
  const before = {
    schemaValidation: true,
    tables: gshlImpactSchemaTables.map((tableName) => ({
      tableName: String(tableName),
      indexes: [{ indexDescriptor: "by_playerId", fields: ["playerId"] }],
      documentType: {
        type: "object",
        value: { Rating: { optional: true, fieldType: { type: "string" } } },
      },
    })),
  };
  const after = structuredClone(before);
  for (const table of after.tables)
    Object.assign(table.documentType.value, {
      averageRating: {
        optional: true,
        fieldType: {
          type: "union",
          value: [{ type: "number" }, { type: "null" }],
        },
      },
      ratingVersion: {
        optional: true,
        fieldType: {
          type: "union",
          value: [{ type: "string" }, { type: "null" }],
        },
      },
      ratingAppearances: {
        optional: true,
        fieldType: {
          type: "union",
          value: [{ type: "number" }, { type: "null" }],
        },
      },
    });
  return { before, after };
}
test("impact scope adds only three exact metadata fields on ten tables, with exact idempotency", () => {
  const { before, after } = impactSchema(),
    original = structuredClone({ before, after });
  assert.doesNotThrow(() =>
    assertDeploymentSchemaChange(before, after, "gshl-impact-ratings"),
  );
  assert.doesNotThrow(() =>
    assertDeploymentSchemaChange(after, after, "gshl-impact-ratings"),
  );
  assert.deepEqual({ before, after }, original);
  assert.throws(() => assertDeploymentSchemaChange(before, after));
});
test("impact scope rejects wrong validators, existing changes, missing tables and unrelated schema changes", () => {
  for (const key of [
    "wrong-validator",
    "Rating",
    "index",
    "missing",
    "extra",
    "existing",
    "validation",
  ]) {
    const { before, after } = impactSchema();
    if (key === "wrong-validator")
      Object.assign(after.tables[0]!.documentType.value, {
        averageRating: { optional: true, fieldType: { type: "number" } },
      });
    if (key === "Rating")
      after.tables[0]!.documentType.value.Rating.optional = false;
    if (key === "index") after.tables[0]!.indexes[0]!.fields = ["Rating"];
    if (key === "missing") after.tables.pop();
    if (key === "extra")
      after.tables.push({
        ...structuredClone(after.tables[0]!),
        tableName: "playerNhlStatLines",
      });
    if (key === "existing")
      Object.assign(before.tables[0]!.documentType.value, {
        averageRating: { optional: true, fieldType: { type: "string" } },
      });
    if (key === "validation") after.schemaValidation = false;
    assert.throws(
      () => assertDeploymentSchemaChange(before, after, "gshl-impact-ratings"),
      key,
    );
  }
});
test("impact roots exclude legacy NHL and unrelated facades unless separately explicit", () => {
  const input = fixture();
  input.localChanged.push(
    module(
      "gshlImpactRatings.js",
      "import './_deps/NEW.js'; export default 'ratings';",
    ),
  );
  const output = composeDeploymentOverlay({
    ...input,
    schemaScope: "gshl-impact-ratings",
  });
  assert.deepEqual(
    output.changedModules.map((m) => m.path),
    ["_deps/NEW.js", "gshlImpactRatings.js"],
  );
  assert(output.unchangedModuleHashes.some((m) => m.path === "frontend.js"));
  assert(
    output.unchangedModuleHashes.some((m) => m.path === "nhlSeasonValues.js"),
  );
  assert.deepEqual(deploymentRootsForScope("gshl-impact-ratings", true), [
    "gshlImpactRatings.js",
    "frontend.js",
    "weeklyEditions.js",
    "performances.js",
    "matchup.js",
  ]);
  assert.throws(() => deploymentRootsForScope("hockey-overall", true));
  assert.throws(
    () =>
      composeDeploymentOverlay({
        ...input,
        schemaScope: "gshl-impact-ratings",
        includeRatingFacades: true,
      }),
    /entrypoint/,
  );
  input.localChanged.push(
    module("weeklyEditions.js"),
    module("performances.js"),
    module("matchup.js"),
  );
  const withFacades = composeDeploymentOverlay({
    ...input,
    schemaScope: "gshl-impact-ratings",
    includeRatingFacades: true,
  });
  assert.deepEqual(
    withFacades.changedModules.map((m) => m.path),
    [
      "_deps/NEW.js",
      "frontend.js",
      "gshlImpactRatings.js",
      "matchup.js",
      "performances.js",
      "weeklyEditions.js",
    ],
  );
});
test("Node dependency proof accepts exact esbuild shim with builtin literal calls", () => {
  const shim = module(
    "_deps/node/shim.js",
    esbuildRequireShim + "\nexport { __require };\n__require('node:fs');",
  );
  shim.environment = "node";
  const entry = module(
    "entry.js",
    "import { __require as __require2 } from './_deps/node/shim.js'; __require2('crypto');",
  );
  entry.environment = "node";
  assert.deepEqual(auditBuiltinOnlyNodeModules([shim, entry]).builtinImports, [
    "crypto",
    "node:fs",
  ]);
});
test("Node proof rejects external imports, aliases, dynamic loading and modified shims", () => {
  for (const code of [
    "import x from 'unreviewed-package';",
    "const loader = require; loader('node:fs');",
    "require(name);",
    "import(name);",
    "const loader = createRequire(import.meta.url);",
    "new Function('return require(name)')();",
    "const run = eval;",
    esbuildRequireShim.replace(
      "require.apply(this, arguments)",
      "require.apply(this, ['unreviewed-package'])",
    ) + "__require('node:fs');",
  ]) {
    const unsafe = module("unsafe.js", code);
    unsafe.environment = "node";
    assert.throws(() => auditBuiltinOnlyNodeModules([unsafe]));
  }
});

test("typeof require is harmless detection; following external loads remain forbidden", () => {
  const detection = module(
    "detection.js",
    "const present = typeof require !== 'undefined';",
  );
  detection.environment = "node";
  assert.doesNotThrow(() => auditBuiltinOnlyNodeModules([detection]));
  detection.source =
    "if(typeof require !== 'undefined') require('unreviewed-package');";
  assert.throws(
    () => auditBuiltinOnlyNodeModules([detection]),
    /External Node dependency/,
  );
  detection.source =
    "const load = typeof require !== 'undefined' ? require : null;";
  assert.throws(() => auditBuiltinOnlyNodeModules([detection]), /alias/);
});
test("compiler matching accepts installed minified fixture and lexical parameter renaming", () => {
  const esbuild = createRequire(import.meta.url)("esbuild");
  const generated = esbuild.buildSync({
    stdin: { contents: "export const sample=require('node:crypto')" },
    bundle: true,
    platform: "node",
    format: "esm",
    minify: true,
    write: false,
    logLevel: "silent",
  }).outputFiles[0].text as string;
  const minified = module("minified.js", generated);
  minified.environment = "node";
  assert.equal(
    auditBuiltinOnlyNodeModules([minified], generated).exactEsbuildRequireShims,
    1,
  );
  const renamed = module(
    "renamed.js",
    esbuildRequireShim
      .replace(/\bx\b/g, "argument")
      .replace(/\ba\b/g, "target")
      .replace(/\bb\b/g, "key") + "__require('node:crypto');",
  );
  renamed.environment = "node";
  assert.equal(
    auditBuiltinOnlyNodeModules([renamed]).exactEsbuildRequireShims,
    1,
  );
});
test("compiler matching rejects capture, nested helpers, changed globals/properties and side effects", () => {
  for (const changed of [
    esbuildRequireShim.replace(/\bx\b/g, "require"),
    "function outer(require){" + esbuildRequireShim + "__require('node:fs');}",
    "const Proxy = custom;" + esbuildRequireShim,
    esbuildRequireShim.replace("new Proxy", "new OtherProxy"),
    esbuildRequireShim.replace("require.apply", "require.call"),
    esbuildRequireShim.replace("throw Error", "sideEffect(); throw Error"),
  ]) {
    const unsafe = module("changed.js", changed);
    unsafe.environment = "node";
    assert.throws(() => auditBuiltinOnlyNodeModules([unsafe]));
  }
});
function module(path: string, source = "export default 1;"): DeploymentModule {
  return { path, source, sourceMap: "{}", environment: "isolate" };
}
function fixture() {
  const remote = [
    module("convex.config.js"),
    module("schema.js"),
    module("auth.config.js", "export default 'original auth';"),
    module(
      "crons.js",
      "import './_deps/OLD.js'; export default 'live schedule';",
    ),
    module("frontend.js", "export default 'live frontend';"),
    module("_deps/OLD.js"),
    module("nhlSeasonValues.js"),
    module("lib/nhlSeasonValueFields.js"),
  ];
  return {
    remote,
    remoteHashes: remote.map((item) => ({
      path: item.path,
      environment: item.environment,
      hash: moduleDigest(item),
    })),
    localChanged: [
      module(
        "nhlSeasonValues.js",
        "import './_deps/NEW.js'; export default 2;",
      ),
      module("lib/nhlSeasonValueFields.js", "export default 2;"),
      module("_deps/NEW.js", "export default 2;"),
      module("crons.js", "export default 'unrelated local schedule';"),
      module("auth.config.js", "export default 'unrelated local auth';"),
      module("frontend.js", "export default 'unrelated frontend';"),
    ],
    schema: module("schema.js", "export default 'new schema';"),
  };
}
test("overlay preserves exact live modules and old chunks; includes only target closure", () => {
  const input = fixture();
  const before = structuredClone(input);
  const output = composeDeploymentOverlay(input);
  assert.deepEqual(
    output.changedModules.map((item) => item.path),
    ["_deps/NEW.js", "lib/nhlSeasonValueFields.js", "nhlSeasonValues.js"],
  );
  assert.equal(output.definition, input.remote[0]);
  for (const path of [
    "auth.config.js",
    "crons.js",
    "frontend.js",
    "_deps/OLD.js",
  ])
    assert.equal(
      output.unchangedModuleHashes.find((item) => item.path === path)?.sha256,
      input.remoteHashes.find((item) => item.path === path)?.hash,
    );
  assert.deepEqual(input, before);
});
test("overlay rejects remote chunk collision and indirect unrelated entrypoint changes", () => {
  const input = fixture();
  input.localChanged[0] = module(
    "nhlSeasonValues.js",
    "import './_deps/OLD.js';",
  );
  input.localChanged.push(module("_deps/OLD.js", "export default 'changed';"));
  assert.throws(() => composeDeploymentOverlay(input), /collides/);
  const other = fixture();
  other.localChanged[0] = module(
    "nhlSeasonValues.js",
    "import './frontend.js';",
  );
  assert.throws(() => composeDeploymentOverlay(other), /collides/);
});
test("overlay rejects baseline races, missing dependencies and duplicate paths", () => {
  const input = fixture();
  input.remoteHashes[0].hash = "0".repeat(64);
  assert.throws(() => composeDeploymentOverlay(input), /baseline changed/);
  const missing = fixture();
  missing.localChanged.pop();
  missing.localChanged[0] = module(
    "nhlSeasonValues.js",
    "import './_deps/absent.js';",
  );
  assert.throws(
    () => composeDeploymentOverlay(missing),
    /Missing deployment dependency/,
  );
  const duplicate = fixture();
  duplicate.remote.push(duplicate.remote[0]!);
  assert.throws(() => composeDeploymentOverlay(duplicate), /duplicate/);
});
test("schema dependency closure is included without replacing live shared chunks", () => {
  const input = fixture();
  input.schema.source = "import './_deps/SCHEMA.js';";
  input.localChanged.push(module("_deps/SCHEMA.js"));
  assert.ok(
    composeDeploymentOverlay(input).changedModules.some(
      (item) => item.path === "_deps/SCHEMA.js",
    ),
  );
});
test("overlay requires explicit reviewed roots and isolated schema.js", () => {
  const missing = fixture();
  missing.localChanged = missing.localChanged.filter(
    (item) => item.path !== "nhlSeasonValues.js",
  );
  assert.throws(() => composeDeploymentOverlay(missing), /explicit reviewed/);
  const wrongPath = fixture();
  wrongPath.schema.path = "unreviewed.js";
  assert.throws(() => composeDeploymentOverlay(wrongPath), /schema.js/);
  const wrongEnvironment = fixture();
  wrongEnvironment.schema.environment = "node";
  assert.throws(() => composeDeploymentOverlay(wrongEnvironment), /isolate/);
});
function schema() {
  return {
    schemaValidation: true,
    tables: [
      {
        tableName: "nhlSeasonValues",
        indexes: [],
        documentType: {
          type: "object",
          value: {
            seasonValue: { optional: false, fieldType: { type: "number" } },
          },
        },
      },
    ],
  };
}
test("schema guard accepts only the new optional field and identical idempotent schema", () => {
  const before = schema();
  const after = structuredClone(before);
  Object.assign(after.tables[0]!.documentType.value, {
    hockeyOverall: { optional: true, fieldType: { type: "object", value: {} } },
  });
  assert.doesNotThrow(() => assertOnlyHockeyOverallSchemaChange(before, after));
  assert.doesNotThrow(() => assertOnlyHockeyOverallSchemaChange(after, after));
});
test("schema guard rejects changes to legacy field, indexes or required new field", () => {
  const before = schema();
  for (const change of ["legacy", "index", "required"]) {
    const after = structuredClone(before);
    Object.assign(after.tables[0]!.documentType.value, {
      hockeyOverall: {
        optional: change !== "required",
        fieldType: { type: "object", value: {} },
      },
    });
    if (change === "legacy")
      after.tables[0]!.documentType.value.seasonValue.optional = true;
    if (change === "index")
      Object.assign(after.tables[0]!, {
        indexes: [{ indexDescriptor: "unexpected", fields: ["seasonValue"] }],
      });
    assert.throws(() => assertOnlyHockeyOverallSchemaChange(before, after));
  }
});

function dualSchema() {
  const value = schema();
  const statLine = structuredClone(value.tables[0]!);
  statLine.tableName = "playerNhlStatLines";
  value.tables.push(statLine);
  Object.assign(value.tables[0]!.documentType.value, {
    hockeyOverall: { optional: true, fieldType: { type: "object", value: {} } },
  });
  return value;
}
function withStatLineHockeyRating(before = dualSchema()) {
  const after = structuredClone(before);
  Object.assign(after.tables[1]!.documentType.value, {
    hockeyRating: { optional: true, fieldType: { type: "object", value: {} } },
  });
  return after;
}
test("dual scope permits only optional stat-line hockeyRating and exact idempotency", () => {
  const before = dualSchema(),
    after = withStatLineHockeyRating(before);
  const original = structuredClone({ before, after });
  assert.doesNotThrow(() => assertOnlyDualRatingsSchemaChange(before, after));
  assert.doesNotThrow(() =>
    assertDeploymentSchemaChange(before, after, "dual-ratings"),
  );
  assert.doesNotThrow(() => assertOnlyDualRatingsSchemaChange(after, after));
  assert.deepEqual({ before, after }, original);
});
test("dual scope forbids any existing nhlSeasonValues validator or index change", () => {
  for (const change of ["legacy", "overall", "index"]) {
    const before = dualSchema(),
      after = withStatLineHockeyRating(before);
    if (change === "legacy")
      after.tables[0]!.documentType.value.seasonValue.optional = true;
    if (change === "overall")
      Object.assign(after.tables[0]!.documentType.value, {
        hockeyOverall: { optional: true, fieldType: { type: "number" } },
      });
    if (change === "index")
      Object.assign(after.tables[0]!, {
        indexes: [{ indexDescriptor: "changed", fields: ["seasonValue"] }],
      });
    assert.throws(
      () => assertOnlyDualRatingsSchemaChange(before, after),
      /nhlSeasonValues schema exactly/,
    );
  }
});
test("dual scope rejects unrelated stat-line, table, index and validation changes", () => {
  for (const change of ["legacy", "extra", "index", "table", "validation"]) {
    const before = dualSchema(),
      after = withStatLineHockeyRating(before);
    if (change === "legacy")
      after.tables[1]!.documentType.value.seasonValue.optional = true;
    if (change === "extra")
      Object.assign(after.tables[1]!.documentType.value, {
        unexpected: { optional: true, fieldType: { type: "number" } },
      });
    if (change === "index")
      Object.assign(after.tables[1]!, {
        indexes: [{ indexDescriptor: "changed", fields: ["seasonValue"] }],
      });
    if (change === "table")
      after.tables.push({
        ...structuredClone(after.tables[1]!),
        tableName: "unreviewed",
      });
    if (change === "validation") after.schemaValidation = false;
    assert.throws(
      () => assertOnlyDualRatingsSchemaChange(before, after),
      /outside optional hockeyRating/,
    );
  }
});
test("dual scope requires existing unique tables and an optional field", () => {
  for (const change of [
    "missing-values",
    "missing-stats",
    "duplicate-values",
    "required",
    "absent",
  ]) {
    const before = dualSchema(),
      after = withStatLineHockeyRating(before);
    if (change === "missing-values") before.tables.shift();
    if (change === "missing-stats") after.tables.pop();
    if (change === "duplicate-values")
      before.tables.push(structuredClone(before.tables[0]!));
    if (change === "required")
      Object.assign(after.tables[1]!.documentType.value, {
        hockeyRating: {
          optional: false,
          fieldType: { type: "object", value: {} },
        },
      });
    if (change === "absent")
      after.tables[1] = structuredClone(before.tables[1]!);
    assert.throws(() => assertOnlyDualRatingsSchemaChange(before, after));
  }
});
test("dual scope cannot alter or remove an already deployed hockeyRating validator", () => {
  const before = withStatLineHockeyRating(),
    after = structuredClone(before);
  Object.assign(after.tables[1]!.documentType.value, {
    hockeyRating: { optional: true, fieldType: { type: "number" } },
  });
  assert.throws(
    () => assertOnlyDualRatingsSchemaChange(before, after),
    /outside optional hockeyRating/,
  );
  assert.throws(
    () => assertOnlyDualRatingsSchemaChange(before, dualSchema()),
    /require optional/,
  );
});
test("default deployment schema scope remains strict hockey-overall", () => {
  const before = dualSchema(),
    after = withStatLineHockeyRating(before);
  assert.throws(() => assertDeploymentSchemaChange(before, after));
  const legacyBefore = schema(),
    legacyAfter = structuredClone(legacyBefore);
  Object.assign(legacyAfter.tables[0]!.documentType.value, {
    hockeyOverall: { optional: true, fieldType: { type: "object", value: {} } },
  });
  assert.doesNotThrow(() =>
    assertDeploymentSchemaChange(legacyBefore, legacyAfter),
  );
});

function cleanupSchema() {
  const before = withStatLineHockeyRating();
  const after = structuredClone(before);
  Object.assign(after.tables[1]!.documentType.value, {
    GS: {
      optional: true,
      fieldType: {
        type: "union",
        value: [{ type: "number" }, { type: "string" }, { type: "null" }],
      },
    },
  });
  return { before, after };
}
test("cleanup scope permits only canonical optional GS and exact deployed idempotency", () => {
  const { before, after } = cleanupSchema();
  const original = structuredClone({ before, after });
  assert.doesNotThrow(() =>
    assertDeploymentSchemaChange(before, after, "season-stat-cleanup"),
  );
  assert.doesNotThrow(() =>
    assertDeploymentSchemaChange(after, after, "season-stat-cleanup"),
  );
  assert.deepEqual({ before, after }, original);
  assert.throws(() => assertDeploymentSchemaChange(before, after));
  assert.throws(() =>
    assertDeploymentSchemaChange(before, after, "dual-ratings"),
  );
});
test("cleanup requires exact GS validator, existing hockeyRating and unchanged NHL value schema", () => {
  for (const change of [
    "required",
    "number-only",
    "missing-GS",
    "hockey",
    "values",
    "legacy",
    "index",
    "table",
    "validation",
  ]) {
    const { before, after } = cleanupSchema();
    if (change === "required")
      Object.assign(after.tables[1]!.documentType.value, {
        GS: { optional: false, fieldType: { type: "number" } },
      });
    if (change === "number-only")
      Object.assign(after.tables[1]!.documentType.value, {
        GS: { optional: true, fieldType: { type: "number" } },
      });
    if (change === "missing-GS")
      after.tables[1] = structuredClone(before.tables[1]!);
    if (change === "hockey")
      Object.assign(after.tables[1]!.documentType.value, {
        hockeyRating: { optional: true, fieldType: { type: "number" } },
      });
    if (change === "values")
      after.tables[0]!.documentType.value.seasonValue.optional = true;
    if (change === "legacy")
      after.tables[1]!.documentType.value.seasonValue.optional = true;
    if (change === "index")
      Object.assign(after.tables[1]!, {
        indexes: [{ indexDescriptor: "unexpected", fields: ["GS"] }],
      });
    if (change === "table")
      after.tables.push({
        ...structuredClone(after.tables[1]!),
        tableName: "new-table",
      });
    if (change === "validation") after.schemaValidation = false;
    assert.throws(() =>
      assertDeploymentSchemaChange(before, after, "season-stat-cleanup"),
    );
  }
});
test("cleanup cannot alter an existing GS validator or add hockeyRating simultaneously", () => {
  const { before, after } = cleanupSchema();
  const malformedBefore = structuredClone(after);
  Object.assign(malformedBefore.tables[1]!.documentType.value, {
    GS: { optional: true, fieldType: { type: "number" } },
  });
  assert.throws(() =>
    assertDeploymentSchemaChange(malformedBefore, after, "season-stat-cleanup"),
  );
  assert.throws(() =>
    assertDeploymentSchemaChange(dualSchema(), after, "season-stat-cleanup"),
  );
  before.tables.pop();
  assert.throws(() =>
    assertDeploymentSchemaChange(before, after, "season-stat-cleanup"),
  );
});
