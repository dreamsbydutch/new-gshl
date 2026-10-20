import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import {
  createProductionOperatorWriter,
  readProductionOperatorQuery,
} from "../../integrations/data/production-operator-cli";

type Row = Record<string, unknown> & { _id: string };
type FileProof = { path: string; sha256: string };
type Proposal = {
  statLineId: string;
  expectedRow: Row;
  patch: Record<string, unknown>;
  kind: string;
};
const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const { values } = parseArgs({
  options: {
    deployment: { type: "string" },
    proposals: { type: "string" },
    evidence: { type: "string" },
    output: { type: "string" },
    "reviewed-plan": { type: "string" },
    "backup-manifest": { type: "string" },
    apply: { type: "boolean", default: false },
    help: { type: "boolean" },
  },
});
const allowed = new Set([
  "GP",
  "GS",
  "MG",
  "IR",
  "IRplus",
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
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "TOI",
  "MS",
  "BS",
  "opp",
  "score",
  "Rating",
]);
const withoutAudit = (row: Row) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => k !== "updatedAt"));
if (values.help)
  console.log(
    "Apply bounded exact reviewed player-day stat patches only. Dry-run default. --deployment polished-tern-709 --proposals JSON --evidence HASH_MANIFEST --output NEW_DIRECTORY [--apply --reviewed-plan DRY_RUN/plan.json --backup-manifest INDEPENDENT_MANIFEST]. Maximum250 source-proven rows. Verifies complete canonical preimages, source/code hashes, independent backup and complete readback. Preserves roster identity, acquisition, eligibility and unrelated fields; never inserts, deletes or recalculates aggregates.",
  );
else {
  if (
    values.deployment !== "polished-tern-709" ||
    !values.proposals ||
    !values.evidence ||
    !values.output ||
    (values.apply && (!values["reviewed-plan"] || !values["backup-manifest"]))
  )
    throw Error("Exact production scope and backed-up reviewed apply required");
  const inputs: FileProof[] = [];
  async function read(path: string) {
    const b = await readFile(resolve(path));
    inputs.push({ path: resolve(path), sha256: hash(b) });
    return JSON.parse(b.toString());
  }
  const proposals = (await read(values.proposals)).proposals as Proposal[];
  const evidence = (await read(values.evidence)) as { files: FileProof[] };
  if (
    !evidence.files.some(
      (f) =>
        resolve(f.path) === resolve(values.proposals!) &&
        f.sha256 === inputs[0]!.sha256,
    )
  )
    throw Error("Evidence must bind exact proposal");
  for (const f of evidence.files) {
    const bytes = await readFile(resolve(f.path));
    inputs.push({ path: resolve(f.path), sha256: hash(bytes) });
    if (inputs.at(-1)!.sha256 !== f.sha256)
      throw Error("Source checksum differs");
  }
  if (
    !proposals.length ||
    proposals.length > 250 ||
    new Set(proposals.map((p) => p.statLineId)).size !== proposals.length
  )
    throw Error("Invalid bounded unique source scope");
  for (const p of proposals)
    if (
      p.statLineId !== p.expectedRow._id ||
      !Object.keys(p.patch).length ||
      Object.keys(p.patch).some((k) => !allowed.has(k))
    )
      throw Error("Unsupported source field or identity patch");
  async function loadRows() {
    const rows: Row[] = [];
    for (let i = 0; i < proposals.length; i += 50) {
      const ids = proposals.slice(i, i + 50).map((p) => p.statLineId);
      const batch = (await readProductionOperatorQuery(
        `return await Promise.all(${JSON.stringify(ids)}.map(id=>ctx.db.get(id)));`,
      )) as (Row | null)[];
      if (batch.some((r) => !r)) throw Error("Source row missing");
      rows.push(...(batch as Row[]));
    }
    return rows;
  }
  const before = await loadRows();
  const changes = proposals.flatMap((p, i) => {
    const current = before[i]!,
      desired = { ...p.expectedRow, ...p.patch };
    if (isDeepStrictEqual(withoutAudit(current), withoutAudit(desired)))
      return [];
    if (!isDeepStrictEqual(current, p.expectedRow))
      throw Error(`Source preimage changed: ${p.statLineId}`);
    const patch = Object.fromEntries(
      Object.entries(p.patch).filter(
        ([k, v]) => !isDeepStrictEqual(current[k], v),
      ),
    );
    return Object.keys(patch).length ? [{ id: p.statLineId, patch }] : [];
  });
  for (const name of [
    "scripts/src/commands/stats/apply-reviewed-player-day-patches.ts",
    "scripts/src/integrations/data/production-operator-cli.ts",
    "convex/data.ts",
    "convex/lib/playerDayPerformanceIndex.ts",
  ]) {
    const path = resolve(root, name);
    inputs.push({ path, sha256: hash(await readFile(path)) });
  }
  const plan = { deployment: values.deployment, inputs, before, changes };
  const bytes = JSON.stringify(plan),
    output = resolve(values.output);
  await mkdir(output, { recursive: false });
  await writeFile(resolve(output, "plan.json"), bytes);
  const summary = {
    deployment: values.deployment,
    sourceRows: proposals.length,
    changedRows: changes.length,
    inserted: 0,
    deleted: 0,
    kinds: Object.fromEntries(
      [...new Set(proposals.map((p) => p.kind))].map((kind) => [
        kind,
        proposals.filter((p) => p.kind === kind).length,
      ]),
    ),
  };
  await writeFile(
    resolve(output, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary));
  if (values.apply) {
    if (hash(await readFile(resolve(values["reviewed-plan"]!))) !== hash(bytes))
      throw Error("Reviewed plan/current source differs");
    const backupPath = resolve(values["backup-manifest"]!);
    if (
      backupPath.toLowerCase().includes("onedrive") ||
      backupPath.toLowerCase().startsWith(root.toLowerCase())
    )
      throw Error("Independent backup required");
    const backup = JSON.parse(await readFile(backupPath, "utf8")) as {
      files: FileProof[];
    };
    for (const f of backup.files)
      if (
        hash(await readFile(resolve(dirname(backupPath), f.path))) !== f.sha256
      )
        throw Error("Backup readback differs");
    for (const f of [...inputs, { path: "reviewed-plan", sha256: hash(bytes) }])
      if (!backup.files.some((b) => b.sha256 === f.sha256))
        throw Error("Backup missing source/code/preimage");
    // Recheck every preimage immediately before starting bounded writes.
    if (!isDeepStrictEqual(await loadRows(), before))
      throw Error("Concurrent source edit");
    const write = await createProductionOperatorWriter(),
      pending = [...changes],
      updatedAt = Date.now();
    async function worker() {
      while (pending.length) {
        const c = pending.shift()!,
          prev = before.find((r) => r._id === c.id)!;
        await write("data:updateById", {
          table: "playerDayStatLines",
          id: c.id,
          data: {
            ...c.patch,
            ...(prev.legacyId === undefined ? {} : { legacyId: prev.legacyId }),
            updatedAt,
          },
        });
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker));
    const after = await loadRows();
    await writeFile(resolve(output, "after.json"), JSON.stringify(after));
    const expected = before.map((r) => {
      const c = changes.find((c) => c.id === r._id);
      return c ? { ...r, ...c.patch, updatedAt } : r;
    });
    if (!isDeepStrictEqual(after, expected))
      throw Error("Exact patched row readback differs");
    await writeFile(
      resolve(output, "proof.json"),
      JSON.stringify(
        {
          passed: true,
          ...summary,
          unrelatedFieldsPreserved: true,
          verifiedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log("Exact source patches and preserved fields verified.");
  }
}
