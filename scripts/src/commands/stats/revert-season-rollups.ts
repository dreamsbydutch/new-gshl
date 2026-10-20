import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import {
  getCompositeKeyColumnsForModel,
  type CompositeKeyModelName,
} from "../../integrations/data/records";
import {
  createProductionAggregateWriter,
  readProductionOperatorQuery,
} from "../../integrations/data/production-operator-cli";
type Row = Record<string, unknown> & { _id: string };
const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const { values } = parseArgs({
  options: {
    deployment: { type: "string" },
    operation: { type: "string" },
    output: { type: "string" },
    "backup-manifest": { type: "string" },
    "reviewed-plan": { type: "string" },
    apply: { type: "boolean", default: false },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Restore only the fields changed by a verified six-table rollup rebuild. Dry-run default. --deployment polished-tern-709 --operation ORIGINAL_DIRECTORY --output NEW_DIRECTORY [--apply --reviewed-plan DRY_RUN/plan.json --backup-manifest INDEPENDENT_MANIFEST]. Reads current canonical IDs, rejects conflicting later edits, requires verified original backup and reviewed current-preimage backup; never inserts/deletes or changes source days/ratings/standings.",
  );
else {
  if (
    values.deployment !== "polished-tern-709" ||
    !values.operation ||
    !values.output ||
    (values.apply && (!values["reviewed-plan"] || !values["backup-manifest"]))
  )
    throw Error(
      "Explicit production operation and reviewed backed-up apply required",
    );
  const op = resolve(values.operation),
    output = resolve(values.output);
  const originalBytes = await readFile(resolve(op, "dry-run/plan.json")),
    original = JSON.parse(originalBytes.toString());
  const verification = JSON.parse(
    await readFile(resolve(op, "verification.json"), "utf8"),
  );
  if (
    original.deployment !== values.deployment ||
    !verification.passed ||
    !verification.proofs.some(
      (p: { path: string; sha256: string }) =>
        p.path === "dry-run/plan.json" && p.sha256 === hash(originalBytes),
    )
  )
    throw Error("Original operation proof differs");
  const backupPath = verification.beforeBackup.manifest,
    backup = JSON.parse(await readFile(backupPath, "utf8"));
  if (
    hash(await readFile(backupPath)) !== verification.beforeBackup.sha256 ||
    !backup.passed
  )
    throw Error("Original independent backup differs");
  for (const file of backup.files)
    if (
      hash(await readFile(resolve(dirname(backupPath), file.path))) !==
      file.sha256
    )
      throw Error("Original independent backup readback differs");
  const entries: {
    table: string;
    model: CompositeKeyModelName;
    before: Row;
    applied: Row;
    fields: string[];
  }[] = [];
  const sourceFiles: { path: string; sha256: string }[] = [];
  for (const job of original.jobs) {
    if (
      ![
        "playerWeekStatLines",
        "playerSplitStatLines",
        "playerTotalStatLines",
        "teamDayStatLines",
        "teamWeekStatLines",
        "teamSeasonStatLines",
      ].includes(job.table) ||
      job.inserted
    )
      throw Error("Unsupported rollback scope");
    const keys = getCompositeKeyColumnsForModel(job.model),
      key = (r: Row) => JSON.stringify(keys.map((f) => r[f]));
    const load = async (stage: string) => {
      const p = resolve(op, stage, `${job.table}-${job.seasonId}.json`),
        b = await readFile(p);
      const digest = hash(b);
      sourceFiles.push({ path: p, sha256: digest });
      if (
        stage === "before" &&
        !backup.files.some((f: { sha256: string }) => f.sha256 === digest)
      )
        throw Error("Before records lack independent backup");
      return JSON.parse(b.toString()) as Row[];
    };
    const before = new Map((await load("before")).map((r) => [key(r), r]));
    const applied = new Map((await load("after")).map((r) => [key(r), r]));
    for (const patch of job.changed) {
      const b = before.get(key(patch)),
        a = applied.get(key(patch));
      if (!b || !a || b._id !== a._id)
        throw Error("Missing exact rollback identity");
      const fields = Object.keys(a).filter(
        (f) => f !== "updatedAt" && !isDeepStrictEqual(a[f], b[f]),
      );
      for (const f of fields)
        if (
          !(f in b) ||
          /rating$|rk$|^power|^gmLadder/i.test(f) ||
          [
            "_id",
            "_creationTime",
            "createdAt",
            "legacyId",
            "seasonId",
            "playerId",
            "gshlTeamId",
            "weekId",
            "date",
            "seasonType",
          ].includes(f)
        )
          throw Error("Unexpected original field change");
      entries.push({
        table: job.table,
        model: job.model,
        before: b,
        applied: a,
        fields,
      });
    }
  }
  if (
    entries.length !== 1008 ||
    new Set(entries.map((e) => e.before._id)).size !== entries.length
  )
    throw Error("Original rollback scope differs");
  await mkdir(output, { recursive: false });
  const chunks = Array.from(
    { length: Math.ceil(entries.length / 100) },
    (_, i) => entries.slice(i * 100, (i + 1) * 100),
  );
  const current: Row[] = [];
  const worker = async () => {
    while (chunks.length) {
      const chunk = chunks.shift()!;
      const rows = (await readProductionOperatorQuery(
        `return await Promise.all(${JSON.stringify(chunk.map((e) => e.before._id))}.map(id=>ctx.db.get(id)));`,
      )) as Row[];
      if (rows.some((r) => !r)) throw Error("Rollback row disappeared");
      current.push(...rows);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  current.sort((a, b) => a._id.localeCompare(b._id));
  const currentById = new Map(current.map((r) => [r._id, r])),
    conflicts = [],
    changes = [];
  for (const entry of entries) {
    const live = currentById.get(entry.before._id)!;
    for (const field of [
      "seasonId",
      "gshlTeamId",
      "weekId",
      "date",
      "playerId",
      "seasonType",
    ])
      if (!isDeepStrictEqual(live[field], entry.applied[field]))
        throw Error("Later identity change conflicts with rollback");
    const patch: Record<string, unknown> = {};
    for (const f of entry.fields) {
      if (isDeepStrictEqual(live[f], entry.before[f])) continue;
      if (!isDeepStrictEqual(live[f], entry.applied[f])) {
        conflicts.push({
          table: entry.table,
          id: live._id,
          field: f,
          before: entry.before[f],
          applied: entry.applied[f],
          current: live[f],
        });
        continue;
      }
      patch[f] = entry.before[f];
    }
    if (Object.keys(patch).length) {
      for (const f of [
        "seasonId",
        "gshlTeamId",
        "weekId",
        "date",
        "playerId",
        "seasonType",
        "legacyId",
      ])
        if (live[f] !== undefined) patch[f] = live[f];
      changes.push({ table: entry.table, id: live._id, patch });
    }
  }
  const codePaths = [
    "scripts/src/commands/stats/revert-season-rollups.ts",
    "scripts/src/integrations/data/production-operator-cli.ts",
    "scripts/src/integrations/data/records.ts",
  ];
  const code = await Promise.all(
    codePaths.map(async (p) => ({
      path: p,
      sha256: hash(await readFile(resolve(root, p))),
    })),
  );
  const plan = {
    version: "restore-six-rollup-fields-v1",
    deployment: values.deployment,
    originalPlanSha256: hash(originalBytes),
    sourceFiles,
    code,
    current,
    changes,
    conflicts,
  };
  const serialized = JSON.stringify(plan);
  await writeFile(resolve(output, "plan.json"), serialized);
  await writeFile(
    resolve(output, "summary.json"),
    JSON.stringify(
      {
        deployment: values.deployment,
        scope: entries.length,
        updates: changes.length,
        fields: entries.reduce((n, e) => n + e.fields.length, 0),
        conflicts: conflicts.length,
        apply: values.apply,
      },
      null,
      2,
    ),
  );
  if (conflicts.length)
    throw Error("Later edits conflict with rollback; no writes performed");
  if (values.apply) {
    if (
      (await readFile(resolve(values["reviewed-plan"]!), "utf8")) !== serialized
    )
      throw Error("Current records or reviewed rollback plan changed");
    const independentPath = resolve(values["backup-manifest"]!);
    if (
      /[\\/]onedrive[\\/]/i.test(independentPath) ||
      independentPath.startsWith(root)
    )
      throw Error("Independent backup required");
    const independent = JSON.parse(await readFile(independentPath, "utf8"));
    if (
      !independent.passed ||
      !independent.files.some(
        (f: { sha256: string }) => f.sha256 === hash(serialized),
      )
    )
      throw Error("Current preimage/rollback plan backup missing");
    for (const f of independent.files)
      if (
        hash(await readFile(resolve(dirname(independentPath), f.path))) !==
        f.sha256
      )
        throw Error("Independent backup readback differs");
    const writer = await createProductionAggregateWriter();
    for (const table of [...new Set(changes.map((c) => c.table))]) {
      const rows = changes.filter((c) => c.table === table);
      for (let offset = 0; offset < rows.length; offset += 25) {
        const batch = rows.slice(offset, offset + 25),
          result = await writer(
            table,
            batch.map((c) => c.patch),
          );
        if (result.inserted !== 0 || result.updated !== batch.length)
          throw Error("Unexpected rollback insert/update count");
      }
      console.log(JSON.stringify({ table, restored: rows.length }));
    }
    const after: Row[] = [];
    for (let i = 0; i < entries.length; i += 100) {
      const batch = entries.slice(i, i + 100);
      after.push(
        ...((await readProductionOperatorQuery(
          `return await Promise.all(${JSON.stringify(batch.map((e) => e.before._id))}.map(id=>ctx.db.get(id)));`,
        )) as Row[]),
      );
    }
    const byId = new Map(after.map((r) => [r._id, r]));
    let restoredFields = 0;
    for (const e of entries) {
      const live = byId.get(e.before._id)!;
      for (const f of e.fields) {
        if (!isDeepStrictEqual(live[f], e.before[f]))
          throw Error("Restored field differs from original");
        restoredFields++;
      }
      const pre = currentById.get(e.before._id)!;
      for (const f of new Set([...Object.keys(live), ...Object.keys(pre)]))
        if (
          f !== "updatedAt" &&
          !e.fields.includes(f) &&
          !isDeepStrictEqual(live[f], pre[f])
        )
          throw Error("Unrelated field changed during rollback");
    }
    await writeFile(resolve(output, "after.json"), JSON.stringify(after));
    await writeFile(
      resolve(output, "proof.json"),
      JSON.stringify(
        {
          passed: true,
          rows: after.length,
          restoredFields,
          unrelatedFieldsPreserved: true,
          inserted: 0,
          deleted: 0,
          verifiedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }
  console.log(
    JSON.stringify({
      scope: entries.length,
      updates: changes.length,
      conflicts: conflicts.length,
      apply: values.apply,
    }),
  );
}
