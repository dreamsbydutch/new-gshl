import assert from "node:assert/strict";
import test from "node:test";
import schema from "../../../../convex/schema";
import {
  assertDeploymentSchemaChange,
  assertDeploymentIndexChanges,
  composeDeploymentOverlay,
  deploymentRootsForScope,
  moduleDigest,
  type DeploymentModule,
} from "./hockey-overall-deployment";

type Schema = {
  tables: {
    tableName: string;
    indexes: { fields: string[] }[];
    documentType: { value: Record<string, unknown> };
  }[];
};
function fixtures() {
  const after = JSON.parse(
    (schema as unknown as { export(): string }).export(),
  ) as Schema;
  const before = structuredClone(after);
  before.tables = before.tables.filter(
    (t) => t.tableName !== "nhlTeamSeasonStatLines",
  );
  const fields = before.tables.find(
    (t) => t.tableName === "playerNhlStatLines",
  )!.documentType.value;
  delete fields.nhlStatsSourceFetchedAt;
  delete fields.nhlStatsSourceSha256;
  return { before, after };
}
void test("nightly schema allows exact two provenance fields and reviewed team summary, preserving every existing table", () => {
  const { before, after } = fixtures(),
    frozen = structuredClone({ before, after });
  assert.doesNotThrow(() =>
    assertDeploymentSchemaChange(before, after, "nightly-stats"),
  );
  assert.doesNotThrow(() =>
    assertDeploymentSchemaChange(after, after, "nightly-stats"),
  );
  assert.deepEqual({ before, after }, frozen);
  assert.throws(() =>
    assertDeploymentSchemaChange(before, after, "season-stat-cleanup"),
  );
});
void test("new team schema accepts only observed analysis decorations, retaining old table exactness", () => {
  const { before, after } = fixtures();
  const team = after.tables.find(
    (t) => t.tableName === "nhlTeamSeasonStatLines",
  )!;
  Object.assign(team, { stagedDocumentType: null });
  for (const index of team.indexes) index.fields.push("_creationTime");
  assert.doesNotThrow(() =>
    assertDeploymentSchemaChange(before, after, "nightly-stats"),
  );
  const analyzed = structuredClone(after);
  assert.doesNotThrow(() =>
    assertDeploymentSchemaChange(analyzed, after, "nightly-stats"),
  );
  Object.assign(team, { stagedDocumentType: { type: "object", value: {} } });
  assert.throws(() =>
    assertDeploymentSchemaChange(before, after, "nightly-stats"),
  );
  Object.assign(team, { stagedDocumentType: null });
  team.indexes[0]!.fields.push("_creationTime");
  assert.throws(() =>
    assertDeploymentSchemaChange(before, after, "nightly-stats"),
  );
});
void test("nightly schema rejects broadened fields, validators, indexes, old table changes and duplicate tables", () => {
  for (const mode of [
    "protected",
    "source",
    "team",
    "index",
    "duplicate",
    "value",
    "missing",
  ]) {
    const { before, after } = fixtures();
    const player = after.tables.find(
      (t) => t.tableName === "playerNhlStatLines",
    )!;
    const team = after.tables.find(
      (t) => t.tableName === "nhlTeamSeasonStatLines",
    )!;
    if (mode === "protected")
      player.documentType.value.salary = {
        optional: true,
        fieldType: { type: "number" },
      };
    if (mode === "source")
      player.documentType.value.nhlStatsSourceFetchedAt = {
        optional: false,
        fieldType: { type: "number" },
      };
    if (mode === "team")
      team.documentType.value.unreviewed = {
        optional: true,
        fieldType: { type: "number" },
      };
    if (mode === "index") team.indexes[0]!.fields = ["GP"];
    if (mode === "duplicate") after.tables.push(structuredClone(team));
    if (mode === "value")
      after.tables.find(
        (t) => t.tableName === "nhlSeasonValues",
      )!.documentType.value.unreviewed = { optional: true };
    if (mode === "missing")
      after.tables = after.tables.filter((t) => t.tableName !== "nhlTeams");
    assert.throws(() =>
      assertDeploymentSchemaChange(before, after, "nightly-stats"),
    );
  }
});
void test("nightly overlay preserves unrelated live modules and has no frontend or scheduler roots", () => {
  const roots = deploymentRootsForScope("nightly-stats");
  assert.deepEqual(roots, [
    "nightlyNhlStats.js",
    "lib/nightlyNhlStatFields.js",
  ]);
  assert.throws(() => deploymentRootsForScope("nightly-stats", true));
  const module = (
    path: string,
    source = "export const x=1;",
  ): DeploymentModule => ({ path, source, environment: "isolate" });
  const remote = [
    module("schema.js"),
    module("convex.config.js"),
    module("frontend.js"),
    module("scheduler.js"),
  ];
  const overlay = composeDeploymentOverlay({
    remote,
    remoteHashes: remote.map((m) => ({
      path: m.path,
      environment: m.environment,
      hash: moduleDigest(m),
    })),
    localChanged: roots.map((p) => module(p)),
    schema: module("schema.js", "export const newer=1;"),
    schemaScope: "nightly-stats",
  });
  assert.deepEqual(
    overlay.changedModules.map((m) => m.path).sort(),
    [...roots].sort(),
  );
  assert.deepEqual(
    overlay.unchangedModuleHashes.map((m) => m.path),
    ["frontend.js", "scheduler.js"],
  );
});

function indexDiff() {
  return {
    "": {
      added_indexes: [
        {
          name: "nhlTeamSeasonStatLines.by_legacyId",
          type: "database",
          fields: ["legacyId", "_creationTime"],
        },
        {
          name: "nhlTeamSeasonStatLines.by_seasonId",
          type: "database",
          fields: ["seasonId", "_creationTime"],
        },
        {
          name: "nhlTeamSeasonStatLines.by_seasonId_nhlTeamId",
          type: "database",
          fields: ["seasonId", "nhlTeamId", "_creationTime"],
        },
      ],
      removed_indexes: [],
      enabled_indexes: [],
      disabled_indexes: [],
    },
  };
}
void test("nightly index additions permit exactly the three new table database indexes", () => {
  const { before, after } = fixtures();
  assert.doesNotThrow(() =>
    assertDeploymentIndexChanges(before, after, indexDiff(), "nightly-stats"),
  );
  assert.doesNotThrow(() =>
    assertDeploymentIndexChanges(
      after,
      after,
      { "": { added_indexes: [], removed_indexes: [] } },
      "nightly-stats",
    ),
  );
  assert.throws(() =>
    assertDeploymentIndexChanges(
      before,
      after,
      indexDiff(),
      "gshl-impact-ratings",
    ),
  );
});
void test("index guard rejects old table changes, deletions, staging, duplicates, partial additions and unknown components", () => {
  for (const mode of [
    "old",
    "deletion",
    "staged",
    "duplicate",
    "partial",
    "component",
    "unknown",
    "fields",
    "type",
    "existing-table",
  ]) {
    const { before, after } = fixtures(),
      diffs = indexDiff();
    if (mode === "old") diffs[""].added_indexes[0]!.name = "nhlTeams.by_abbr";
    if (mode === "deletion")
      (diffs[""].removed_indexes as unknown[]).push(diffs[""].added_indexes[0]);
    if (mode === "staged")
      Object.assign(diffs[""].added_indexes[0]!, { staged: true });
    if (mode === "duplicate")
      diffs[""].added_indexes[1] = structuredClone(diffs[""].added_indexes[0]!);
    if (mode === "partial") diffs[""].added_indexes.pop();
    if (mode === "component")
      Object.assign(diffs, { unknown: { added_indexes: [] } });
    if (mode === "unknown") Object.assign(diffs[""], { unknown: [] });
    if (mode === "fields") diffs[""].added_indexes[0]!.fields = ["GP"];
    if (mode === "type") diffs[""].added_indexes[0]!.type = "search";
    assert.throws(() =>
      assertDeploymentIndexChanges(
        mode === "existing-table" ? after : before,
        after,
        diffs,
        "nightly-stats",
      ),
    );
  }
});
