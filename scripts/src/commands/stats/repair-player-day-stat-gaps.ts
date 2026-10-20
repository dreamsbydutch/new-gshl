import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";
import {
  createProductionOperatorWriter,
  readProductionOperatorQuery,
} from "../../integrations/data/production-operator-cli";

type Row = Record<string, unknown> & { _id: string; weekId: string };
type Operation = {
  id: string;
  expectedRow: Row;
  fields: Record<string, unknown>;
  requiresAtomicSameRowWrite?: boolean;
  independentFieldAgreement?: Record<string, Record<string, unknown>>;
  evidence?: Array<{ path: string; sha256: string; url: string }>;
};
const { values } = parseArgs({
  options: {
    deployment: { type: "string" },
    plan: { type: "string" },
    "backup-manifest": { type: "string" },
    "evidence-manifest": { type: "string" },
    output: { type: "string" },
    "reviewed-plan": { type: "string" },
    apply: { type: "boolean", default: false },
    "allow-reviewed-native-corrections": { type: "boolean", default: false },
    help: { type: "boolean" },
  },
});
const sha = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const missing = (value: unknown) =>
  value === null || value === undefined || value === "";
const native = new Set([
  "GP",
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
  "GAA",
  "GA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "TOI",
]);
const derived = new Set(["GS", "MG", "IR", "IRplus", "Rating"]);
if (values.help)
  console.log(
    "Repair reviewed, source-proven player-day statistics. Defaults to missing-only dry-run. --deployment polished-tern-709 --plan JSONL --backup-manifest INDEPENDENT_MANIFEST --evidence-manifest HASH_BOUND_SOURCES --output NEW_DIRECTORY [--apply --reviewed-plan DRY_RUN/plan.json]. --allow-reviewed-native-corrections explicitly permits at most 25 rows with two-source field agreement and atomic complete goalie workload/rates. No inserts/deletes/roster edits. GS/MG/IR/IRplus edits require missing GP restoration; Rating edits require supported gameplay repair. Full preimages checked before each batch, fields and preservation verified afterward. Repeat dry-run must report zero changes.",
  );
else {
  if (
    values.deployment !== "polished-tern-709" ||
    !values.plan ||
    !values["backup-manifest"] ||
    !values["evidence-manifest"] ||
    !values.output ||
    (values.apply && !values["reviewed-plan"])
  )
    throw Error(
      "Exact deployment, source plan, independent backup, output and reviewed dry-run required",
    );
  const planBytes = await readFile(resolve(values.plan));
  const evidenceBytes = await readFile(resolve(values["evidence-manifest"]));
  const evidence = JSON.parse(evidenceBytes.toString()) as {
    files: Array<{ path: string; sha256: string }>;
  };
  if (!Array.isArray(evidence.files) || !evidence.files.length)
    throw Error("Hash-bound source evidence required");
  if (
    !evidence.files.some(
      (file) =>
        resolve(file.path) === resolve(values.plan!) &&
        file.sha256 === sha(planBytes),
    )
  )
    throw Error("Evidence does not bind this exact stat repair plan");
  for (const file of evidence.files) {
    if (
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      sha(await readFile(resolve(file.path))) !== file.sha256
    )
      throw Error("Reviewed source evidence differs");
  }
  const operations: Operation[] = planBytes
    .toString()
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  if (
    !operations.length ||
    operations.length > 1000 ||
    new Set(operations.map((o) => o.id)).size !== operations.length
  )
    throw Error("Distinct, bounded exact row operations required");
  if (values["allow-reviewed-native-corrections"] && operations.length > 25)
    throw Error("Reviewed native corrections are limited to 25 exact rows");
  const backupPath = resolve(values["backup-manifest"]);
  if (
    backupPath.toLowerCase().startsWith(resolve(".").toLowerCase() + "\\") ||
    /[\\/]onedrive[\\/]/i.test(backupPath)
  )
    throw Error("Backup must be outside workspace and OneDrive");
  const backupBytes = await readFile(backupPath),
    backup = JSON.parse(backupBytes.toString());
  if (!backup.passed || backup.deployment !== values.deployment)
    throw Error("Verified matching backup required");
  const backedRows = new Map<string, Row>();
  for (const file of backup.files) {
    const bytes = await readFile(resolve(dirname(backupPath), file.file));
    if (sha(bytes) !== file.sha256)
      throw Error("Independent backup readback differs");
    if (/^weeks[\\/]/.test(file.file))
      for (const row of JSON.parse(bytes.toString()))
        backedRows.set(row._id, row);
  }
  for (const op of operations) {
    if (
      op.id !== op.expectedRow._id ||
      !isDeepStrictEqual(backedRows.get(op.id), op.expectedRow) ||
      !Object.keys(op.fields).length
    )
      throw Error("Operation does not match independently backed-up full row");
    const restoresGame = missing(op.expectedRow.GP) && op.fields.GP === 1;
    const corrections = !!values["allow-reviewed-native-corrections"];
    if (corrections) {
      if (
        !op.requiresAtomicSameRowWrite ||
        !op.independentFieldAgreement ||
        !op.evidence ||
        new Set(op.evidence.map((e) => e.url)).size < 2
      )
        throw Error("Native corrections require atomic two-source agreement");
      for (const item of op.evidence) {
        if (
          !/^https:\/\/(?:api-web\.nhle\.com|api\.nhle\.com)\//.test(
            item.url,
          ) ||
          !evidence.files.some(
            (e) =>
              resolve(e.path) === resolve(item.path) &&
              e.sha256 === item.sha256,
          )
        )
          throw Error(
            "Native correction source is not hash-bound official evidence",
          );
      }
      if (op.expectedRow.posGroup === "G") {
        if (
          !["W", "GA", "SV", "SA", "TOI", "GAA", "SVP"].every(
            (k) => typeof op.fields[k] === "number",
          ) ||
          Number(op.fields.SA) <= 0 ||
          Number(op.fields.TOI) <= 0 ||
          Number(op.fields.SV) + Number(op.fields.GA) !==
            Number(op.fields.SA) ||
          Math.abs(
            Number(op.fields.GAA) -
              (Number(op.fields.GA) * 60) / Number(op.fields.TOI),
          ) > 0.0000051 ||
          Math.abs(
            Number(op.fields.SVP) - Number(op.fields.SV) / Number(op.fields.SA),
          ) > 0.0000051
        )
          throw Error(
            "Goalie corrections require consistent complete workload and rates",
          );
      }
    }
    for (const [field, value] of Object.entries(op.fields)) {
      if (native.has(field)) {
        if (
          (!missing(op.expectedRow[field]) && !corrections) ||
          typeof value !== "number" ||
          !Number.isFinite(value)
        )
          throw Error(
            "Native repairs must fill a missing finite numeric value",
          );
        if (
          (field === "GP" && value !== 1) ||
          (field !== "PM" && value < 0) ||
          (!["GAA", "SVP", "TOI"].includes(field) &&
            !Number.isInteger(value)) ||
          (["W", "SO", "SVP"].includes(field) && value > 1)
        )
          throw Error("Native statistic is outside its valid daily domain");
        if (corrections) {
          const agreement = op.independentFieldAgreement![field];
          if (!agreement)
            throw Error("Native correction lacks field agreement");
          const agrees =
            field === "TOI"
              ? agreement.targetMinutes === value &&
                agreement.summarySeconds === agreement.boxscoreSeconds &&
                Math.abs(value * 60 - Number(agreement.summarySeconds)) <
                  0.000001
              : field === "GAA" || field === "SVP"
                ? agreement.summary === value &&
                  agreement.round5Matches === true
                : field === "W"
                  ? agreement.summary === value &&
                    agreement.boxscoreDecision === (value === 1 ? "W" : "L")
                  : agreement.summary === value && agreement.boxscore === value;
          if (!agrees) throw Error("Independent native source values disagree");
        }
      } else if (field === "Rating") {
        if (
          !Object.keys(op.fields).some((k) => native.has(k)) ||
          (typeof value !== "number" && typeof value !== "string") ||
          !Number.isFinite(Number(value)) ||
          String(value).trim() === ""
        )
          throw Error(
            "Rating repair requires a supported gameplay restoration",
          );
      } else if (
        !derived.has(field) ||
        !restoresGame ||
        !(
          typeof value === "string" ||
          (typeof value === "number" && Number.isFinite(value))
        )
      )
        throw Error("Unapproved field or unsupported derived repair");
      else if (
        (field === "GS" &&
          !["", "0", "1", 0, 1].includes(value as string | number)) ||
        (["MG", "IR", "IRplus"].includes(field) && value !== "")
      )
        throw Error("Restored appearances require valid fantasy flags");
    }
  }
  const codePaths = [
    "scripts/src/commands/stats/repair-player-day-stat-gaps.ts",
    "scripts/src/integrations/data/production-operator-cli.ts",
  ];
  const binding = {
    deployment: values.deployment,
    planSha256: sha(planBytes),
    evidenceSha256: sha(evidenceBytes),
    allowReviewedNativeCorrections:
      !!values["allow-reviewed-native-corrections"],
    backupSha256: sha(backupBytes),
    codeHashes: await Promise.all(
      codePaths.map(async (path) => ({
        path,
        sha256: sha(await readFile(path)),
      })),
    ),
  };
  if (
    values.apply &&
    !isDeepStrictEqual(
      JSON.parse(await readFile(resolve(values["reviewed-plan"]!), "utf8")),
      binding,
    )
  )
    throw Error("Apply differs from reviewed source/code/backup plan");
  const output = resolve(values.output);
  await mkdir(output);
  const save = (file: string, data: unknown) =>
    writeFile(resolve(output, file), JSON.stringify(data, null, 2) + "\n", {
      flag: "wx",
    });
  await save("plan.json", binding);
  const groups = new Map<string, Operation[]>();
  for (const op of operations) {
    const list = groups.get(op.expectedRow.weekId) ?? [];
    list.push(op);
    groups.set(op.expectedRow.weekId, list);
  }
  const batches = [...groups.values()].flatMap((group) =>
    Array.from({ length: Math.ceil(group.length / 25) }, (_, i) =>
      group.slice(i * 25, i * 25 + 25),
    ),
  );
  const readBatch = async (batch: Operation[]): Promise<Row[]> => {
    const rows = (await readProductionOperatorQuery(
      `return await Promise.all(${JSON.stringify(batch.map((o) => o.id))}.map(id=>ctx.db.get(id)));`,
    )) as Row[];
    if (
      rows.length !== batch.length ||
      rows.some((r, i) => !r || r._id !== batch[i]!.id)
    )
      throw Error("Live row identity differs");
    return rows;
  };
  const state = (op: Operation, actual: Row) => {
    if (isDeepStrictEqual(actual, op.expectedRow)) return "changed";
    const expected = {
      ...op.expectedRow,
      ...op.fields,
      updatedAt: actual.updatedAt,
    };
    if (isDeepStrictEqual(actual, expected)) return "unchanged";
    throw Error(
      "Live row differs from exact reviewed preimage or completed repair",
    );
  };
  const preflight = [];
  for (const batch of batches) {
    const rows = await readBatch(batch);
    preflight.push(
      ...batch.map((op, i) => ({ id: op.id, state: state(op, rows[i]!) })),
    );
  }
  await save("preflight.json", preflight);
  if (values.apply) {
    const reviewed = JSON.parse(
      await readFile(
        resolve(dirname(values["reviewed-plan"]!), "preflight.json"),
        "utf8",
      ),
    );
    if (!isDeepStrictEqual(preflight, reviewed))
      throw Error("Live preflight differs from reviewed run");
    const write = await createProductionOperatorWriter(),
      after = [];
    for (let index = 0; index < batches.length; index++) {
      const batch = batches[index]!,
        rows = await readBatch(batch);
      const changed = batch.filter(
        (op, i) => state(op, rows[i]!) === "changed",
      );
      if (changed.length) {
        // Exact-ID writes avoid candidate scans and cannot insert rows.
        // Preserve legacyId because normalizeDoc otherwise clears that field.
        for (let start = 0; start < changed.length; start += 3) {
          await Promise.all(
            changed.slice(start, start + 3).map(async (op) => {
              const result = (await write("data:updateById", {
                table: "playerDayStatLines",
                id: op.id,
                data: {
                  ...op.fields,
                  legacyId: op.expectedRow.legacyId,
                  updatedAt: Date.now(),
                },
              })) as Row;
              if (result._id !== op.id)
                throw Error("Mutation returned a different row");
            }),
          );
        }
      }
      const stored = await readBatch(batch);
      batch.forEach((op, i) => {
        if (state(op, stored[i]!) !== "unchanged")
          throw Error("Post-write fields differ");
      });
      after.push(...stored);
      console.log(
        JSON.stringify({
          stage: "apply",
          batches: index + 1,
          total: batches.length,
          rows: after.length,
        }),
      );
    }
    await save("after.json", after);
  }
  await save("summary.json", {
    ...binding,
    apply: values.apply,
    passed: true,
    rows: operations.length,
    fields: operations.reduce((n, op) => n + Object.keys(op.fields).length, 0),
    changed: preflight.filter((r) => r.state === "changed").length,
    unchanged: preflight.filter((r) => r.state === "unchanged").length,
    completedAt: new Date().toISOString(),
  });
  console.log(
    JSON.stringify({
      passed: true,
      apply: values.apply,
      rows: operations.length,
      changed: preflight.filter((r) => r.state === "changed").length,
      output,
    }),
  );
}
