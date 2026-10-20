import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";
import {
  createProductionOperatorWriter,
  readProductionOperatorQuery,
} from "../../integrations/data/production-operator-cli";

const { values } = parseArgs({
  options: {
    deployment: { type: "string" },
    plan: { type: "string" },
    "backup-manifest": { type: "string" },
    output: { type: "string" },
    "reviewed-plan": { type: "string" },
    apply: { type: "boolean", default: false },
    help: { type: "boolean" },
  },
});
const sha = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
type Row = Record<string, unknown> & {
  _id: string;
  playerId: string;
  gshlTeamId: string;
};
if (values.help)
  console.log(
    "Restore source-reviewed missing player-day roster rows. Dry-run by default. --deployment polished-tern-709 --plan JSON --backup-manifest INDEPENDENT_MANIFEST --output NEW_DIRECTORY [--apply --reviewed-plan DRY_RUN/plan.json]. Requires dated roster evidence, adjacent-day identity corroboration, complete date preimages, hash-verified independent backup and exact reviewed source/code plan. Inserts only; no changes to existing rows. Repeating must report zero missing rows.",
  );
else {
  if (
    values.deployment !== "polished-tern-709" ||
    !values.plan ||
    !values["backup-manifest"] ||
    !values.output ||
    (values.apply && !values["reviewed-plan"])
  )
    throw Error(
      "Explicit deployment, reviewed plan, independent backup and output required",
    );
  const planBytes = await readFile(resolve(values.plan)),
    plan = JSON.parse(planBytes.toString());
  if (
    plan.version !== "reviewed-roster-day-restore-v1" ||
    plan.deployment !== values.deployment ||
    !Array.isArray(plan.rows) ||
    !plan.rows.length ||
    plan.rows.length > 25
  )
    throw Error("Distinct bounded roster restore plan required");
  const beforeBytes = await readFile(plan.before.path);
  if (sha(beforeBytes) !== plan.before.sha256)
    throw Error("Original snapshot differs");
  const before = JSON.parse(beforeBytes.toString());
  if (
    before.deployment !== values.deployment ||
    before.season._id !== plan.seasonId ||
    before.team._id !== plan.teamId
  )
    throw Error("Snapshot scope differs");
  const backupPath = resolve(values["backup-manifest"]),
    backupBytes = await readFile(backupPath),
    backup = JSON.parse(backupBytes.toString());
  if (
    backupPath.startsWith(resolve(".") + "\\") ||
    /[\\/]onedrive[\\/]/i.test(backupPath) ||
    !backup.passed ||
    !backup.files.some(
      (f: { sha256: string }) => f.sha256 === plan.before.sha256,
    ) ||
    !backup.files.some((f: { sha256: string }) => f.sha256 === sha(planBytes))
  )
    throw Error("Independent before/plan backup required");
  for (const file of backup.files)
    if (
      sha(await readFile(resolve(dirname(backupPath), file.file))) !==
      file.sha256
    )
      throw Error("Independent backup readback differs");
  for (const file of plan.evidence)
    if (
      sha(await readFile(file.path)) !== file.sha256 ||
      !backup.files.some((f: { sha256: string }) => f.sha256 === file.sha256)
    )
      throw Error("Source evidence differs or lacks independent backup");
  const priorDate = new Date(Date.parse(plan.date + "T00:00:00Z") - 86400000)
    .toISOString()
    .slice(0, 10);
  const original: Row[] = before.dates[plan.date],
    prior: Row[] = before.dates[priorDate];
  if (
    !original ||
    !prior ||
    new Set(plan.rows.map((r: Row) => r.playerId)).size !== plan.rows.length
  )
    throw Error("Adjacent complete dates and distinct players required");
  for (const row of plan.rows) {
    if (
      row.seasonId !== plan.seasonId ||
      row.gshlTeamId !== plan.teamId ||
      row.date !== plan.date ||
      row._id ||
      row._creationTime ||
      row.legacyId ||
      row.createdAt ||
      row.updatedAt ||
      original.some((r) => r.playerId === row.playerId) ||
      !prior.some(
        (r) => r.playerId === row.playerId && r.gshlTeamId === plan.teamId,
      ) ||
      !before.players.some((p: Row) => p._id === row.playerId)
    )
      throw Error(
        "Unverified identity, scope, duplicate or copied row identity",
      );
    const week = before.weeks.find((w: Row) => w._id === row.weekId);
    if (
      !week ||
      week.seasonId !== plan.seasonId ||
      String(week.startDate).slice(0, 10) > plan.date ||
      String(week.endDate).slice(0, 10) < plan.date
    )
      throw Error("Invalid scoring week");
  }
  const codePaths = [
    "scripts/src/commands/stats/restore-player-day-roster.ts",
    "scripts/src/integrations/data/production-operator-cli.ts",
  ];
  const binding = {
    deployment: values.deployment,
    planSha256: sha(planBytes),
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
  const save = (name: string, value: unknown) =>
    writeFile(resolve(output, name), JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
  await save("plan.json", binding);
  const desired = new Map<string, Record<string, unknown>>(
    plan.rows.map((r: Row) => [r.playerId, r]),
  );
  const readDate = async () => {
    const rows = (await readProductionOperatorQuery(
      `const r=await ctx.db.query("playerDayStatLines").withIndex("by_seasonId_date",q=>q.eq("seasonId",${JSON.stringify(plan.seasonId)}).eq("date",${JSON.stringify(plan.date)})).take(1001);if(r.length===1001)throw Error('Date bound reached');return r;`,
    )) as Row[];
    const byId = new Map(rows.map((r) => [r._id, r]));
    for (const old of original)
      if (!isDeepStrictEqual(byId.get(old._id), old))
        throw Error("An original date row changed");
    const originalIds = new Set(original.map((r) => r._id));
    for (const row of rows.filter((r) => !originalIds.has(r._id))) {
      const { _id, _creationTime, createdAt, updatedAt, ...doc } = row;
      if (
        !isDeepStrictEqual(doc, desired.get(row.playerId)) ||
        typeof createdAt !== "number" ||
        typeof updatedAt !== "number"
      )
        throw Error("Unexpected added player-day row");
    }
    const missing = plan.rows.filter(
      (r: Row) => !rows.some((x) => x.playerId === r.playerId),
    );
    if (rows.length !== original.length + plan.rows.length - missing.length)
      throw Error("Unexpected roster population");
    return { rows, missing };
  };
  const preflight = await readDate();
  await save("preflight.json", preflight);
  if (values.apply) {
    const reviewed = JSON.parse(
      await readFile(
        resolve(dirname(values["reviewed-plan"]!), "preflight.json"),
        "utf8",
      ),
    );
    if (!isDeepStrictEqual(reviewed, preflight))
      throw Error("Current date differs from reviewed dry-run");
    const fresh = await readDate();
    if (!isDeepStrictEqual(fresh, preflight))
      throw Error("Date changed immediately before insert");
    if (fresh.missing.length) {
      const write = await createProductionOperatorWriter(),
        now = Date.now();
      const result = (await write("data:insertMany", {
        table: "playerDayStatLines",
        rows: fresh.missing.map((r: Row) => ({
          ...r,
          createdAt: now,
          updatedAt: now,
        })),
      })) as { inserted: Array<{ id: string }> };
      if (result.inserted.length !== fresh.missing.length)
        throw Error("Unexpected insertion count");
    }
    const after = await readDate();
    if (after.missing.length) throw Error("Roster restore incomplete");
    await save("after.json", after.rows);
  }
  await save("summary.json", {
    ...binding,
    passed: true,
    apply: values.apply,
    inserts: preflight.missing.length,
    originalDateRows: original.length,
    targetTeamBefore: original.filter((r) => r.gshlTeamId === plan.teamId)
      .length,
    targetTeamAfter:
      original.filter((r) => r.gshlTeamId === plan.teamId).length +
      plan.rows.length,
    completedAt: new Date().toISOString(),
  });
  console.log(
    JSON.stringify({
      passed: true,
      apply: values.apply,
      inserts: preflight.missing.length,
    }),
  );
}
