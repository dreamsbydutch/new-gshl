import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildSeasonStatLines,
  prepareSeasonAggregateWriteRow,
} from "../../domains/aggregation/season-stat-aggregation";
import {
  getCompositeKeyColumnsForModel,
  type DatabaseRecord,
  type CompositeKeyModelName,
} from "../../integrations/data/records";
import {
  createProductionAggregateWriter,
  readProductionOperatorQuery,
} from "../../integrations/data/production-operator-cli";

const models = [
  ["PlayerWeekStatLine", "playerWeekStatLines", "playerWeeks"],
  ["PlayerSplitStatLine", "playerSplitStatLines", "playerSplits"],
  ["PlayerTotalStatLine", "playerTotalStatLines", "playerTotals"],
  ["TeamDayStatLine", "teamDayStatLines", "teamDays"],
  ["TeamWeekStatLine", "teamWeekStatLines", "teamWeeks"],
  ["TeamSeasonStatLine", "teamSeasonStatLines", "teamSeasons"],
] as const;
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const hash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const { values } = parseArgs({
  options: {
    snapshot: { type: "string" },
    output: { type: "string" },
    deployment: { type: "string" },
    "backup-manifest": { type: "string" },
    "reviewed-plan": { type: "string" },
    apply: { type: "boolean", default: false },
    help: { type: "boolean" },
  },
});
const protectedField = (field: string) =>
  /rating$|rk$|^power|^gmLadder/i.test(field);
const countFields = new Set([
  "days",
  "GP",
  "MG",
  "IR",
  "IRplus",
  "GS",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "SV",
  "SA",
  "SO",
  "TOI",
  "ADD",
  "MS",
  "BS",
  "playersUsed",
]);
const comparable = (v: unknown): unknown => {
  if (v === "" || v === null || v === undefined) return null;
  if (Array.isArray(v)) return [...v].map(String).sort();
  if (
    typeof v === "number" ||
    (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))
  )
    return Number(v);
  return v;
};
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
const key = (model: CompositeKeyModelName, row: DatabaseRecord) =>
  getCompositeKeyColumnsForModel(model)
    .map((f) => String(row[f] ?? ""))
    .join("|");
const hydrate = (row: DatabaseRecord): DatabaseRecord => ({
  ...row,
  id: row._id,
  ...Object.fromEntries(
    ["startDate", "endDate"]
      .filter((f) => row[f] !== undefined)
      .map((f) => [
        f,
        typeof row[f] === "number" ? new Date(row[f] as number) : row[f],
      ]),
  ),
});
if (values.help) {
  console.log(
    "Rebuild only six season rollups from a hash-verified complete production snapshot. Dry-run default. --deployment polished-tern-709 --snapshot DIRECTORY --output NEW_DIRECTORY [--apply --reviewed-plan PLAN --backup-manifest INDEPENDENT_MANIFEST]. Preserves ratings, standings, careers, source days and stale rows. Apply requires exact reviewed calculation/source hashes and independently verified backup; no deletion or deployment.",
  );
} else {
  if (
    values.deployment !== "polished-tern-709" ||
    !values.snapshot ||
    !values.output ||
    (values.apply && (!values["reviewed-plan"] || !values["backup-manifest"]))
  )
    throw Error(
      "Explicit production scope, snapshot and reviewed backed-up apply required",
    );
  const snapshot = resolve(values.snapshot),
    output = resolve(values.output);
  const manifestBytes = await readFile(resolve(snapshot, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString());
  if (manifest.deployment !== values.deployment)
    throw Error("Snapshot target mismatch");
  for (const f of manifest.files)
    if (hash(await readFile(resolve(snapshot, f.path))) !== f.sha256)
      throw Error(`Snapshot hash mismatch: ${f.path}`);
  const inventoryBytes = await readFile(resolve(snapshot, "inventory.json"));
  const inventory = JSON.parse(inventoryBytes.toString());
  const codePaths = [
    "scripts/src/commands/stats/rebuild-season-rollups.ts",
    "scripts/src/domains/aggregation/season-stat-aggregation.ts",
    "scripts/src/domains/aggregation/player-day-flags.ts",
    "scripts/src/domains/aggregation/player-day-source-validation.ts",
    "scripts/src/domains/aggregation/official-goalie-accounting-exceptions.ts",
    "scripts/src/integrations/data/production-operator-cli.ts",
    "scripts/src/integrations/data/records.ts",
    "scripts/src/utils/data.ts",
    "scripts/src/utils/date.ts",
    "scripts/src/types/enums.ts",
  ];
  const code = await Promise.all(
    codePaths.map(async (path) => ({
      path,
      sha256: hash(await readFile(resolve(repositoryRoot, path))),
    })),
  );
  const asOf = manifest.capturedAt;
  const jobs: {
    seasonId: string;
    table: string;
    model: CompositeKeyModelName;
    expected: DatabaseRecord[];
    changed: DatabaseRecord[];
    stale: DatabaseRecord[];
    inactiveResets: DatabaseRecord[];
    inserted: number;
    updated: number;
  }[] = [];
  const coverage = [];
  for (const rawSeason of inventory.seasons) {
    const season = hydrate(rawSeason),
      seasonId = String(season.id);
    const weeks = inventory.weeks
      .filter((w: DatabaseRecord) => w.seasonId === seasonId)
      .map(hydrate);
    const teams = inventory.teams
      .filter((t: DatabaseRecord) => t.seasonId === seasonId)
      .map(hydrate);
    const dayFiles = manifest.files.filter(
      (f: { table: string; id: string }) =>
        f.table === "playerDayStatLines" &&
        weeks.some((w: DatabaseRecord) => w.id === f.id),
    );
    if (dayFiles.length !== weeks.length)
      throw Error("Incomplete source-week snapshot");
    const days: DatabaseRecord[] = (
      await Promise.all(
        dayFiles.map(async (f: { path: string }) =>
          JSON.parse(await readFile(resolve(snapshot, f.path), "utf8")),
        ),
      )
    ).flat();
    const sourceKeys = new Set();
    for (const day of days) {
      const k = `${day.playerId}|${day.date}`;
      if (
        sourceKeys.has(k) ||
        day.seasonId !== seasonId ||
        !teams.some((t: DatabaseRecord) => t.id === day.gshlTeamId) ||
        !weeks.some((w: DatabaseRecord) => w.id === day.weekId)
      )
        throw Error(`Invalid source membership: ${k}`);
      sourceKeys.add(k);
    }
    const generated = buildSeasonStatLines(
      seasonId,
      days,
      season,
      weeks,
      teams,
      new Date(asOf),
    );
    coverage.push({
      seasonId,
      name: season.name,
      sourceDays: days.length,
      usedDays: generated.playerDays.length,
      weeks: weeks.length,
      teams: teams.length,
    });
    for (const [model, table, field] of models) {
      const expected = generated[field].map((row) =>
        prepareSeasonAggregateWriteRow(
          model,
          Object.fromEntries(
            Object.entries(row).filter(([f]) => !protectedField(f)),
          ),
        ),
      );
      const existing: DatabaseRecord[] = JSON.parse(
        await readFile(resolve(snapshot, `${table}-${seasonId}.json`), "utf8"),
      );
      const byKey = new Map(existing.map((row) => [key(model, row), row]));
      if (
        byKey.size !== existing.length ||
        new Set(expected.map((row) => key(model, row))).size !== expected.length
      )
        throw Error(`Duplicate aggregate keys: ${table}/${seasonId}`);
      const changed = expected
        .filter((row) => {
          const prev = byKey.get(key(model, row));
          return (
            !prev || Object.entries(row).some(([f, v]) => !equal(prev[f], v))
          );
        })
        .map((row) => {
          const prev = byKey.get(key(model, row));
          return {
            ...row,
            ...(prev?.legacyId !== undefined
              ? { legacyId: prev.legacyId }
              : {}),
          };
        });
      const expectedKeys = new Set(expected.map((row) => key(model, row)));
      const stale = existing.filter(
        (row) => !expectedKeys.has(key(model, row)),
      );
      const inactiveResets = stale.map((row) => ({
        seasonId,
        ...Object.fromEntries(
          getCompositeKeyColumnsForModel(model).map((f) => [f, row[f]]),
        ),
        ...(row.weekId !== undefined ? { weekId: row.weekId } : {}),
        ...Object.fromEntries(
          Object.entries(row)
            .filter(([f]) => countFields.has(f) || f === "GAA" || f === "SVP")
            .map(([f, v]) => [
              f,
              f === "GAA" || f === "SVP" ? "" : v === null || v === "" ? v : 0,
            ]),
        ),
        ...(row.legacyId !== undefined ? { legacyId: row.legacyId } : {}),
      }));
      changed.push(
        ...inactiveResets.filter((row) => {
          const prev = byKey.get(key(model, row))!;
          return Object.entries(row).some(([f, v]) => !equal(prev[f], v));
        }),
      );
      const inserted = changed.filter(
        (row) => !byKey.has(key(model, row)),
      ).length;
      jobs.push({
        seasonId,
        table,
        model,
        expected,
        changed,
        stale,
        inactiveResets,
        inserted,
        updated: changed.length - inserted,
      });
    }
  }
  const plan = {
    version: "six-season-rollups-v1",
    deployment: values.deployment,
    asOf,
    snapshotHash: hash(manifestBytes),
    inventoryHash: hash(inventoryBytes),
    code,
    coverage,
    jobs,
  };
  const serialized = JSON.stringify(plan);
  await mkdir(output, { recursive: false });
  await writeFile(resolve(output, "plan.json"), serialized);
  const summary = {
    deployment: values.deployment,
    asOf,
    sourceDays: coverage.reduce((n, s) => n + s.sourceDays, 0),
    seasons: coverage,
    tables: models.map(([, table]) => ({
      table,
      expected: jobs
        .filter((j) => j.table === table)
        .reduce((n, j) => n + j.expected.length, 0),
      inserted: jobs
        .filter((j) => j.table === table)
        .reduce((n, j) => n + j.inserted, 0),
      updated: jobs
        .filter((j) => j.table === table)
        .reduce((n, j) => n + j.updated, 0),
      stalePreserved: jobs
        .filter((j) => j.table === table)
        .reduce((n, j) => n + j.stale.length, 0),
    })),
    apply: values.apply,
  };
  await writeFile(
    resolve(output, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  if (values.apply) {
    if (
      (await readFile(resolve(values["reviewed-plan"]!), "utf8")) !== serialized
    )
      throw Error("Reviewed plan differs from source/calculator");
    const backupPath = resolve(values["backup-manifest"]!);
    if (
      /[\\/]onedrive[\\/]/i.test(backupPath) ||
      backupPath.startsWith(resolve(".") + "\\")
    )
      throw Error("Independent backup required");
    const backup = JSON.parse(await readFile(backupPath, "utf8"));
    for (const f of backup.files)
      if (
        hash(await readFile(resolve(dirname(backupPath), f.path))) !== f.sha256
      )
        throw Error("Backup readback differs");
    for (const digest of [
      hash(serialized),
      hash(inventoryBytes),
      ...manifest.files.map((f: { sha256: string }) => f.sha256),
    ])
      if (!backup.files.some((f: { sha256: string }) => f.sha256 === digest))
        throw Error("Incomplete backup");
    const checks: (() => Promise<void>)[] = [];
    // Check every live-season week, including currently empty weeks.
    const liveSeasons = inventory.seasons.filter((s: DatabaseRecord) => {
      const start = new Date(s.startDate as string | number).getTime();
      const end = new Date(s.endDate as string | number).getTime();
      return start <= Date.parse(asOf) && end + 86400000 >= Date.parse(asOf);
    });
    for (const s of liveSeasons) {
      for (const w of inventory.weeks.filter(
        (w: DatabaseRecord) => w.seasonId === s._id,
      )) {
        checks.push(async () => {
          const rows = await readProductionOperatorQuery(
            `const r=await ctx.db.query("playerDayStatLines").withIndex("by_weekId",q=>q.eq("weekId",${JSON.stringify(w._id)})).take(12001);if(r.length===12001)throw Error("bound");return r;`,
          );
          const before = JSON.parse(
            await readFile(
              resolve(snapshot, `playerDayStatLines-${w._id}.json`),
              "utf8",
            ),
          );
          if (JSON.stringify(rows) !== JSON.stringify(before))
            throw Error("Live season changed; capture/review again");
        });
      }
    }
    // Refuse a stale destination plan before the first production write.
    for (const job of jobs.filter((job) => job.changed.length))
      checks.push(async () => {
        const live = (await readProductionOperatorQuery(
          `const r=await ctx.db.query(${JSON.stringify(job.table)}).withIndex("by_seasonId",q=>q.eq("seasonId",${JSON.stringify(job.seasonId)})).take(12001);if(r.length===12001)throw Error("bound");return r;`,
        )) as DatabaseRecord[];
        const before = JSON.parse(
          await readFile(
            resolve(snapshot, `${job.table}-${job.seasonId}.json`),
            "utf8",
          ),
        ) as DatabaseRecord[];
        const original = new Map(
          before.map((row) => [key(job.model, row), row]),
        );
        const current = new Map(live.map((row) => [key(job.model, row), row]));
        if (current.size !== live.length)
          throw Error("Concurrent duplicate destination key");
        for (const row of job.changed)
          if (
            JSON.stringify(current.get(key(job.model, row))) !==
            JSON.stringify(original.get(key(job.model, row)))
          )
            throw Error("Aggregate preimage changed; capture/review again");
      });
    const checkWorker = async () => {
      while (checks.length) await checks.shift()!();
    };
    await Promise.all(Array.from({ length: 5 }, checkWorker));
    const writer = await createProductionAggregateWriter();
    for (const job of jobs) {
      const pending = Array.from(
        { length: Math.ceil(job.changed.length / 25) },
        (_, i) => job.changed.slice(i * 25, (i + 1) * 25),
      );
      let updated = 0,
        inserted = 0;
      const work = async () => {
        while (pending.length) {
          const result = await writer(job.table, pending.shift()!);
          updated += result.updated;
          inserted += result.inserted;
        }
      };
      await Promise.all(Array.from({ length: 4 }, work));
      if (updated !== job.updated || inserted !== job.inserted)
        throw Error("Mutation update/insert counts differ from reviewed plan");
      await writeFile(
        resolve(output, `${job.table}-${job.seasonId}-applied.json`),
        JSON.stringify({ changed: job.changed.length }),
      );
      if (job.changed.length)
        console.log(
          JSON.stringify({
            seasonId: job.seasonId,
            table: job.table,
            changed: job.changed.length,
          }),
        );
    }
  }
  console.log(JSON.stringify(summary));
}
