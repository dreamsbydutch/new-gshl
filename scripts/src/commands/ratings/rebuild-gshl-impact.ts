import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import type { DatabaseRecord } from "../../integrations/data/records";
import {
  careerImpactKey,
  fitSeasonImpactReference,
  impactFields,
  impactId,
  impactRowKey,
  IMPACT_TABLES,
  scoreSeasonImpact,
  UNIFORM_IMPACT_VERSION,
  type ImpactFields,
  type ImpactTable,
  type ImpactTotals,
} from "../../domains/ranking/uniform-impact";
import { readUniformImpactInputs } from "../../integrations/ranking/uniform-impact";
import { sumPublishedCareerImpact } from "../../domains/ranking/career-impact";
import { ensureTargetCalendarExposure } from "../../integrations/ranking/target-calendar-exposure";

const hash = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
type SourceFile = {
  path: string;
  table: string;
  sha256: string;
  rows: number;
  id?: string;
  field?: string;
};
type PlanFile = {
  path: string;
  sha256: string;
  sourcePath: string;
  sourceSha256: string;
  table: ImpactTable;
  rows: number;
  changed: number;
};
type Patch = { id: string; next: ImpactFields };
type Plan = {
  version: string;
  deployment: string;
  snapshot: string;
  sourceManifestSha256: string;
  referenceConfig: string;
  referenceHashes: Array<{ path: string; sha256: string }>;
  counts: Record<string, number>;
  files: PlanFile[];
};
const readJson = async (p: string) => JSON.parse(await readFile(p, "utf8"));
let liveConcurrency = 3;
async function pooled<T>(items: T[], run: (item: T) => Promise<void>) {
  let cursor = 0,
    failure: unknown;
  await Promise.all(
    Array.from(
      { length: Math.min(liveConcurrency, items.length) },
      async () => {
        while (cursor < items.length && !failure) {
          const item = items[cursor++]!;
          try {
            await run(item);
          } catch (error) {
            failure = error;
          }
        }
      },
    ),
  );
  if (failure) throw failure;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, canonical(v)]),
      )
    : value;
}
const ratingKeys = [
  "Rating",
  "averageRating",
  "ratingVersion",
  "ratingAppearances",
] as const;
const isChanged = (row: DatabaseRecord, next: ImpactFields) =>
  ratingKeys.some((k) => row[k] !== next[k]);
const restoreFields = (row: DatabaseRecord) => {
  const state = (
    k: (typeof ratingKeys)[number],
  ): { present: false } | { present: true; value: unknown } =>
    Object.hasOwn(row, k)
      ? { present: true, value: row[k] }
      : { present: false };
  return {
    Rating: state("Rating"),
    averageRating: state("averageRating"),
    ratingVersion: state("ratingVersion"),
    ratingAppearances: state("ratingAppearances"),
  };
};
const root = fileURLToPath(new URL("../../../../", import.meta.url));

async function preview(snapshot: string, output: string, configPath: string) {
  const sourceManifestBytes = await readFile(
    resolve(snapshot, "manifest.json"),
  );
  const source = JSON.parse(sourceManifestBytes.toString()) as {
    deployment: string;
    files: SourceFile[];
  };
  if (source.deployment !== "polished-tern-709")
    throw Error("Wrong source deployment");
  const inventory = await readJson(resolve(snapshot, "inventory.json"));
  const config = await readJson(configPath);
  const inputs = await readUniformImpactInputs(configPath);
  await mkdir(output, { recursive: false });
  const codePaths = [
    "scripts/src/runtime/RankingEngine/player-day-impact.js",
    "scripts/src/runtime/RankingEngine/period-impact.js",
    "scripts/src/domains/ranking/uniform-impact.ts",
    "scripts/src/domains/ranking/period-impact.ts",
    "scripts/src/domains/ranking/career-impact.ts",
    "scripts/src/integrations/ranking/uniform-impact.ts",
    "scripts/src/integrations/ranking/target-calendar-exposure.ts",
    "scripts/src/commands/ratings/rebuild-gshl-impact.ts",
  ];
  const referenceHashes = await Promise.all(
    [
      configPath,
      resolve(config.corpus),
      resolve(config.exposure),
      ...codePaths.map((p) => resolve(root, p)),
    ].map(async (path) => ({ path, sha256: hash(await readFile(path)) })),
  );
  const plan: Plan = {
    version: UNIFORM_IMPACT_VERSION,
    deployment: source.deployment,
    snapshot,
    sourceManifestSha256: hash(sourceManifestBytes),
    referenceConfig: configPath,
    referenceHashes,
    counts: {},
    files: [],
  };
  const cs = new Map<string, ImpactTotals>(),
    ct = new Map<string, ImpactTotals>();
  async function readSource(file: SourceFile): Promise<DatabaseRecord[]> {
    const bytes = await readFile(resolve(snapshot, file.path));
    if (hash(bytes) !== file.sha256) throw Error("Source hash mismatch");
    const rows = JSON.parse(bytes.toString());
    if (!Array.isArray(rows) || rows.length !== file.rows)
      throw Error("Source count mismatch");
    return rows;
  }
  async function save(
    file: SourceFile,
    rows: DatabaseRecord[],
    get: (row: DatabaseRecord) => ImpactFields,
  ) {
    const patches: Patch[] = rows.map((row) => ({
      id: impactId(row),
      next: get(row),
    }));
    if (
      patches.some((p) => !p.id) ||
      new Set(patches.map((p) => p.id)).size !== rows.length
    )
      throw Error("Missing or duplicate canonical source identity");
    const bytes = JSON.stringify(patches),
      path = `ratings-${file.path}`;
    await writeFile(resolve(output, path), bytes, { flag: "wx" });
    plan.files.push({
      path,
      sha256: hash(bytes),
      sourcePath: file.path,
      sourceSha256: file.sha256,
      table: file.table as ImpactTable,
      rows: rows.length,
      changed: rows.filter((row, i) => isChanged(row, patches[i]!.next)).length,
    });
    plan.counts[file.table] = (plan.counts[file.table] ?? 0) + rows.length;
  }
  for (const season of inventory.seasons as DatabaseRecord[]) {
    const seasonId = impactId(season);
    const weeks = (inventory.weeks as DatabaseRecord[]).filter(
      (w) => w.seasonId === seasonId,
    );
    const weekIds = new Set(weeks.map(impactId));
    const files = source.files.filter((f) =>
      f.table === "playerDayStatLines"
        ? weekIds.has(f.id ?? "")
        : IMPACT_TABLES.includes(f.table as ImpactTable) &&
          f.field === "seasonId" &&
          f.id === seasonId,
    );
    const records = new Map<string, DatabaseRecord[]>();
    const tables: Partial<Record<ImpactTable, DatabaseRecord[]>> = {};
    for (const f of files) {
      const rows = await readSource(f);
      records.set(f.path, rows);
      (tables[f.table as ImpactTable] ??= []).push(...rows);
    }
    console.log(
      JSON.stringify({
        startingSeason: season.name ?? season.year,
        sourceRows: Object.values(tables).reduce(
          (n, r) => n + (r?.length ?? 0),
          0,
        ),
      }),
    );
    const reference = await fitSeasonImpactReference(
      inputs,
      seasonId,
      season.categories as string[],
    );
    const result = await scoreSeasonImpact({
      season,
      weeks,
      days: tables.playerDayStatLines ?? [],
      tables,
      reference,
      exposure: await ensureTargetCalendarExposure(
        inputs.exposure,
        weeks,
        [season],
        tables.playerDayStatLines ?? [],
      ),
    });
    for (const f of files)
      await save(f, records.get(f.path)!, (row) => {
        const fields = result.scores
          .get(f.table as ImpactTable)
          ?.get(impactRowKey(f.table as ImpactTable, row));
        if (!fields) throw Error("Incomplete rating output");
        return fields;
      });
    // Careers add the same published season values used by ongoing rebuilds.
    for (const [destination, values] of [
      [cs, result.careerSplits],
      [ct, result.careerTotals],
    ] as const)
      for (const [key, value] of values) {
        const previous = destination.get(key);
        const fields = sumPublishedCareerImpact([
          ...(previous
            ? [impactFields(previous.value, previous.appearances)]
            : []),
          impactFields(value.value, value.appearances),
        ]);
        destination.set(key, {
          value: fields.Rating,
          appearances: fields.ratingAppearances,
        });
      }
    await writeFile(
      resolve(output, `season-${seasonId}-contributions.json`),
      JSON.stringify({
        careerSplits: [...result.careerSplits],
        careerTotals: [...result.careerTotals],
      }),
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        previewSeason: season.name ?? season.year,
        rows: Object.values(tables).reduce((n, r) => n + (r?.length ?? 0), 0),
        files: plan.files.length,
      }),
    );
  }
  for (const table of [
    "playerCareerSplitStatLines",
    "playerCareerTotalStatLines",
  ] as const) {
    const f = source.files.find((f) => f.table === table);
    if (!f) throw Error("Missing career source");
    const split = table === "playerCareerSplitStatLines",
      totals = split ? cs : ct;
    await save(f, await readSource(f), (row) => {
      const v = totals.get(careerImpactKey(row, split)) ?? {
        value: 0,
        appearances: 0,
      };
      return impactFields(v.value, v.appearances);
    });
  }
  const expected = source.files.filter((f) =>
    IMPACT_TABLES.includes(f.table as ImpactTable),
  );
  if (
    plan.files.length !== expected.length ||
    IMPACT_TABLES.some((t) => !(t in plan.counts))
  )
    throw Error("Incomplete nine-table coverage");
  await writeFile(resolve(output, "plan.json"), JSON.stringify(plan, null, 2), {
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      previewComplete: true,
      counts: plan.counts,
      plan: resolve(output, "plan.json"),
    }),
  );
}

async function runPlan(
  planPath: string,
  mode: "preflight" | "apply" | "verify" | "rollback",
  backupPath?: string,
) {
  const planBytes = await readFile(planPath),
    plan = JSON.parse(planBytes.toString()) as Plan;
  if (
    plan.version !== UNIFORM_IMPACT_VERSION ||
    plan.deployment !== "polished-tern-709"
  )
    throw Error("Wrong rating plan/version");
  if (
    hash(await readFile(resolve(plan.snapshot, "manifest.json"))) !==
    plan.sourceManifestSha256
  )
    throw Error("Source manifest changed");
  for (const file of plan.referenceHashes)
    if (hash(await readFile(file.path)) !== file.sha256)
      throw Error("Rating reference/runtime changed since preview");
  if (mode === "apply" || mode === "rollback") {
    if (
      !backupPath ||
      /[\\/]onedrive[\\/]/i.test(backupPath) ||
      resolve(backupPath).startsWith(root)
    )
      throw Error("Verified independent backup required");
    const backup = await readJson(backupPath);
    const hashes = new Set<string>();
    for (const f of backup.files) {
      const bytes = await readFile(resolve(dirname(backupPath), f.path));
      if (hash(bytes) !== f.sha256)
        throw Error("Independent backup readback failed");
      hashes.add(f.sha256);
    }
    if (
      !hashes.has(hash(planBytes)) ||
      !hashes.has(plan.sourceManifestSha256) ||
      plan.files.some(
        (f) => !hashes.has(f.sourceSha256) || !hashes.has(f.sha256),
      )
    )
      throw Error("Independent backup is incomplete");
  }
  const { createProductionImpactClient } = await import(
    "../../integrations/data/gshl-impact-ratings"
  );
  const client = await createProductionImpactClient();
  const source = await readJson(resolve(plan.snapshot, "manifest.json"));
  const inventory = await readJson(resolve(plan.snapshot, "inventory.json"));
  const liveInventory = await client.inventory();
  if (
    JSON.stringify(canonical(inventory)) !==
    JSON.stringify(canonical(liveInventory))
  )
    throw Error(
      "Season/week/team metadata changed since the reviewed source snapshot",
    );
  await pooled(plan.files, async (f) => {
    const scope = (source.files as SourceFile[]).find(
      (s) => s.path === f.sourcePath,
    );
    if (!scope) throw Error("Missing scope identity manifest");
    const originals = (await readJson(
      resolve(plan.snapshot, f.sourcePath),
    )) as DatabaseRecord[];
    const live = await client.scopeIds({
      table: f.table,
      ...(scope.field
        ? { field: scope.field as "weekId" | "seasonId", id: scope.id }
        : {}),
    });
    if (
      JSON.stringify(originals.map(impactId).sort()) !==
      JSON.stringify(live.ids)
    )
      throw Error(`Production row population changed: ${f.sourcePath}`);
  });
  console.log(
    JSON.stringify({
      mode,
      populationVerified: true,
      scopes: plan.files.length,
    }),
  );
  let total = 0,
    updated = 0,
    already = 0,
    wouldUpdate = 0;
  for (const f of plan.files) {
    const [oldBytes, nextBytes] = await Promise.all([
      readFile(resolve(plan.snapshot, f.sourcePath)),
      readFile(resolve(dirname(planPath), f.path)),
    ]);
    if (hash(oldBytes) !== f.sourceSha256 || hash(nextBytes) !== f.sha256)
      throw Error("Source or reviewed rating artifact changed");
    const originals = JSON.parse(oldBytes.toString()) as DatabaseRecord[],
      patches = JSON.parse(nextBytes.toString()) as Patch[];
    if (originals.length !== f.rows || patches.length !== f.rows)
      throw Error("Plan row count mismatch");
    const offsets = Array.from(
      { length: Math.ceil(originals.length / 100) },
      (_, i) => i * 100,
    );
    await pooled(offsets, async (i) => {
      const rows = originals.slice(i, i + 100).map((expected, offset) => {
        const patch = patches[i + offset]!;
        if (impactId(expected) !== patch.id)
          throw Error("Patch identity mismatch");
        return { id: patch.id, expected, next: patch.next };
      });
      const result =
        mode === "rollback"
          ? await client.rollbackBatch({
              table: f.table,
              apply: true,
              rows: rows.map((r) => ({
                id: r.id,
                expected: { ...r.expected, ...r.next },
                restore: restoreFields(r.expected),
              })),
            })
          : await client.applyBatch({
              table: f.table,
              apply: mode === "apply",
              rows,
            });
      total += result.total;
      updated += result.updated;
      already += result.already;
      wouldUpdate += result.wouldUpdate;
      if (mode === "verify" && result.wouldUpdate)
        throw Error("Incomplete production rating application");
    });
    console.log(
      JSON.stringify({
        mode,
        table: f.table,
        scope: f.sourcePath,
        total,
        updated,
        already,
        wouldUpdate,
      }),
    );
  }
  const report = {
    version: UNIFORM_IMPACT_VERSION,
    mode,
    deployment: plan.deployment,
    planSha256: hash(planBytes),
    completedAt: new Date().toISOString(),
    total,
    updated,
    already,
    wouldUpdate,
    populationVerified: true,
    passed: mode !== "verify" || wouldUpdate === 0,
  };
  await writeFile(
    resolve(dirname(planPath), `${mode}-${Date.now()}.json`),
    JSON.stringify(report, null, 2),
    { flag: "wx" },
  );
  console.log(JSON.stringify(report));
}

const { values } = parseArgs({
  options: {
    mode: { type: "string", default: "preview" },
    snapshot: { type: "string" },
    output: { type: "string" },
    config: { type: "string" },
    plan: { type: "string" },
    "backup-manifest": { type: "string" },
    concurrency: { type: "string", default: "3" },
    help: { type: "boolean" },
  },
});
liveConcurrency = Number(values.concurrency);
if (
  !Number.isInteger(liveConcurrency) ||
  liveConcurrency < 1 ||
  liveConcurrency > 8
)
  throw Error("Production rating concurrency must be an integer from 1 to 8");
if (values.help)
  console.log(
    "Usage: rebuild-gshl-impact.ts --mode preview --snapshot DIR --output NEW_DIR --config FILE | --mode preflight|apply|verify|rollback --plan FILE [--backup-manifest FILE] [--concurrency 1..8; default 3]. Production: polished-tern-709, all nine GSHL stat-line tables. Rating-only full-preimage CAS; no inserts, deletions or source-stat changes. Apply/rollback require independently verified source+plan backup. Default preview writes local artifacts only.",
  );
else if (values.mode === "preview") {
  if (!values.snapshot || !values.output || !values.config)
    throw Error(
      "Preview requires snapshot, new output and reference configuration",
    );
  await preview(
    resolve(values.snapshot),
    resolve(values.output),
    resolve(values.config),
  );
} else {
  if (
    !values.plan ||
    !["preflight", "apply", "verify", "rollback"].includes(values.mode!)
  )
    throw Error("Explicit reviewed plan and supported mode required");
  await runPlan(
    resolve(values.plan),
    values.mode as "preflight" | "apply" | "verify" | "rollback",
    values["backup-manifest"] ? resolve(values["backup-manifest"]!) : undefined,
  );
}
