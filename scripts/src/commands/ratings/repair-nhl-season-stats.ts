import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { canonicalRatingJson } from "../../domains/nhl/dual-ratings";
import { runDualRatingConvex } from "../../integrations/nhl/dual-ratings";
import {
  readNhlCleanupSnapshot,
  type CleanupSnapshot,
} from "../../integrations/nhl/season-stat-cleanup";
type Evidence = { path: string; sha256: string };
type Batch = Record<string, unknown> & {
  seasonId: string;
  playerOps?: unknown[];
  statOps?: unknown[];
  valueLinkOps?: unknown[];
};
type Plan = {
  version: string;
  deployment: string;
  phase: "identities" | "seasons";
  before: Evidence;
  evidence: Evidence[];
  batches: Batch[];
};
type Result = {
  apply: boolean;
  planSha256: string;
  backupSha256: string;
  matched: number;
  changed: number;
  updated: number;
  unchanged: number;
  results: Array<{ kind: string; id?: string; changed: boolean }>;
};
const { values } = parseArgs({
  options: {
    target: { type: "string" },
    deployment: { type: "string" },
    plan: { type: "string" },
    output: { type: "string" },
    "backup-manifest": { type: "string" },
    "reviewed-plan": { type: "string" },
    apply: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
const hash = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
if (values.help) {
  console.log(
    "Usage: repair-nhl-season-stats.ts --target production --deployment polished-tern-709 --plan REVIEWABLE_JSON --backup-manifest INDEPENDENT_MANIFEST --output NEW_DIRECTORY [--apply --reviewed-plan DRY_RUN_PLAN_JSON]. Defaults to dry-run. Explicit backed-up identity or season-stat repairs only. Verifies all source hashes, complete current inventory before writes, all-batch preflight and exact reviewed operation results. Batches<=100; source/math/financial changes forbidden except explicit canonical player links. Deletes require explicit per-batch allowStatLineDeletes and exact before rows. Preserve unrelated source snapshots. Run full season completeness/stat/rating proof after apply.",
  );
} else {
  if (
    values.target !== "production" ||
    values.deployment !== "polished-tern-709" ||
    !values.plan ||
    !values.output ||
    !values["backup-manifest"] ||
    (values.apply && !values["reviewed-plan"])
  )
    throw Error(
      "Explicit target, exact reviewed plan, independent backup and new output required",
    );
  const planBytes = await readFile(resolve(values.plan));
  const input = JSON.parse(planBytes.toString()) as Plan;
  if (
    input.version !== "nhl-season-cleanup-plan-v1" ||
    input.deployment !== "polished-tern-709" ||
    !["identities", "seasons"].includes(input.phase) ||
    !input.batches.length
  )
    throw Error("Invalid season cleanup plan");
  const beforeBytes = await readFile(resolve(input.before.path));
  if (hash(beforeBytes) !== input.before.sha256)
    throw Error("Before snapshot changed");
  const before = JSON.parse(beforeBytes.toString()) as CleanupSnapshot;
  if (before.deployment !== input.deployment)
    throw Error("Snapshot target mismatch");
  const backupPath = resolve(values["backup-manifest"]),
    workspace = resolve(".");
  if (
    backupPath.toLowerCase().startsWith(workspace.toLowerCase() + "\\") ||
    /[\\/]onedrive[\\/]/i.test(backupPath)
  )
    throw Error("Backup must be independent of workspace and OneDrive");
  const backupBytes = await readFile(backupPath);
  const backup = JSON.parse(backupBytes.toString()) as {
    passed: boolean;
    files: Array<{ file: string; sha256: string }>;
  };
  if (
    !backup.passed ||
    !backup.files.some((f) => f.sha256 === input.before.sha256)
  )
    throw Error("Independent backup does not cover before snapshot");
  for (const file of backup.files)
    if (
      hash(await readFile(resolve(dirname(backupPath), file.file))) !==
      file.sha256
    )
      throw Error("Independent backup readback differs");
  for (const evidence of input.evidence)
    if (hash(await readFile(resolve(evidence.path))) !== evidence.sha256)
      throw Error("Reviewed official evidence changed");
  const output = resolve(values.output);
  await mkdir(output);
  const save = (name: string, value: unknown) =>
    writeFile(resolve(output, name), JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
  const paths = [
    "scripts/src/commands/ratings/repair-nhl-season-stats.ts",
    "scripts/src/integrations/nhl/season-stat-cleanup.ts",
    "scripts/src/integrations/nhl/dual-ratings.ts",
    "scripts/src/domains/nhl/dual-ratings.ts",
    "scripts/src/domains/ranking/ranking-engine.ts",
    ...["config.js", "player-pure.js", "team-pure.js", "index.js"].map(
      (name) => `scripts/src/runtime/RankingEngine/${name}`,
    ),
    "scripts/src/domains/nhl/season-stat-repair.ts",
    "convex/nhlSeasonValues.ts",
    "convex/lib/nhlSeasonValueFields.ts",
    "convex/schema.ts",
  ];
  const codeHashes = await Promise.all(
    paths.map(async (path) => ({ path, sha256: hash(await readFile(path)) })),
  );
  const binding = {
    version: "nhl-season-cleanup-reviewed-run-v1",
    deployment: input.deployment,
    phase: input.phase,
    planSha256: hash(planBytes),
    backupSha256: hash(backupBytes),
    codeHashes,
  };
  if (values.apply) {
    const reviewed = JSON.parse(
      await readFile(resolve(values["reviewed-plan"]!), "utf8"),
    );
    if (canonicalRatingJson(reviewed) !== canonicalRatingJson(binding))
      throw Error(
        "Apply differs from reviewed source/operation/code/backup plan",
      );
  }
  await save("plan.json", binding);
  function validate(
    result: unknown,
    batch: Batch,
    apply: boolean,
  ): asserts result is Result {
    const r = result as Result;
    const count =
      (batch.playerOps?.length ?? 0) +
      (batch.statOps?.length ?? 0) +
      (batch.valueLinkOps?.length ?? 0);
    if (
      !r ||
      r.apply !== apply ||
      r.planSha256 !== binding.planSha256 ||
      r.backupSha256 !== binding.backupSha256 ||
      r.matched !== count ||
      !Array.isArray(r.results) ||
      r.results.length !== count ||
      r.changed !== r.results.filter((op) => op.changed).length ||
      r.unchanged !== count - r.changed ||
      r.updated !== (apply ? r.changed : 0)
    )
      throw Error("Unexpected repair counts");
  }
  async function run(apply: boolean) {
    const results: Result[] = [];
    for (let start = 0; start < input.batches.length; start += 3) {
      const responses = await Promise.all(
        input.batches.slice(start, start + 3).map((batch) =>
          runDualRatingConvex([
            "nhlSeasonValues:repairNhlSeasonData",
            JSON.stringify({
              ...batch,
              planSha256: binding.planSha256,
              backupSha256: binding.backupSha256,
              apply,
            }),
          ]),
        ),
      );
      responses.forEach((r, index) =>
        validate(r, input.batches[start + index], apply),
      );
      results.push(...(responses as Result[]));
      console.log(
        JSON.stringify({
          stage: apply ? "apply" : "preflight",
          phase: input.phase,
          batches: results.length,
          total: input.batches.length,
        }),
      );
    }
    return results;
  }
  const preflight = await run(false);
  await save("preflight.json", preflight);
  if (values.apply) {
    const reviewed = JSON.parse(
      await readFile(
        resolve(dirname(values["reviewed-plan"]!), "preflight.json"),
        "utf8",
      ),
    );
    if (canonicalRatingJson(reviewed) !== canonicalRatingJson(preflight))
      throw Error("Current repair differs from reviewed preflight");
    const live = await readNhlCleanupSnapshot();
    const normalize = (s: CleanupSnapshot) => ({
      deployment: s.deployment,
      players: [...s.players].sort((a, b) => a._id.localeCompare(b._id)),
      seasons: s.seasons
        .map((s) => ({
          season: s.season,
          stats: [...s.stats].sort((a, b) => a._id.localeCompare(b._id)),
          values: [...s.values].sort((a, b) => a._id.localeCompare(b._id)),
        }))
        .sort((a, b) => a.season._id.localeCompare(b.season._id)),
    });
    if (
      canonicalRatingJson(normalize(live)) !==
      canonicalRatingJson(normalize(before))
    )
      throw Error("Full reviewed production inventory changed before writes");
    const applied = await run(true);
    await save("applied.json", applied);
    // Insert IDs are assigned by Convex. Every other reviewed result must be exact.
    const comparable = (rows: Result[]) =>
      rows.map((r) =>
        r.results.map((op) =>
          op.kind.endsWith("insert")
            ? { kind: op.kind, changed: op.changed }
            : op,
        ),
      );
    if (
      canonicalRatingJson(comparable(applied)) !==
      canonicalRatingJson(comparable(preflight))
    )
      throw Error("Applied operations differ from reviewed repair");
    await save("after.json", await readNhlCleanupSnapshot());
  }
  await save("summary.json", {
    ...binding,
    apply: values.apply,
    passed: true,
    batches: input.batches.length,
    operations: preflight.reduce((sum, r) => sum + r.matched, 0),
    changed: preflight.reduce((sum, r) => sum + r.changed, 0),
    completedAt: new Date().toISOString(),
  });
}
