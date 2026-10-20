import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import {
  buildAllStarDayPatch,
  type AllStarDateEvidence,
} from "../../domains/stats/allstar-game-cleanup";
import type { DatabaseRecord } from "../../integrations/data/records";
import {
  createProductionOperatorWriter,
  readProductionOperatorQuery,
} from "../../integrations/data/production-operator-cli";

type Row = DatabaseRecord & { _id: string };
type FileProof = { path: string; sha256: string };
type ClubProof = {
  sourceId: string;
  nhlTeam: string[];
  before: Row;
  after: Row;
};
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const { values } = parseArgs({
  options: {
    deployment: { type: "string" },
    evidence: { type: "string" },
    output: { type: "string" },
    "reviewed-plan": { type: "string" },
    "backup-manifest": { type: "string" },
    apply: { type: "boolean", default: false },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Clear exhibition game fields only, preserving roster days. Dry-run default. --deployment polished-tern-709 --evidence DIRECTORY --output NEW_DIRECTORY [--apply --reviewed-plan PLAN --backup-manifest INDEPENDENT_MANIFEST]. Requires official NHL All-Star-only schedule evidence and agreeing adjacent club preimages. Never deletes rows or rebuilds aggregates.",
  );
} else {
  if (
    values.deployment !== "polished-tern-709" ||
    !values.evidence ||
    !values.output ||
    (values.apply && (!values["reviewed-plan"] || !values["backup-manifest"]))
  )
    throw Error(
      "Explicit production scope and reviewed backed-up apply required",
    );
  const base = resolve(values.evidence),
    output = resolve(values.output);
  const inputs: FileProof[] = [];
  async function load(path: string) {
    const bytes = await readFile(path);
    inputs.push({ path, sha256: hash(bytes) });
    return JSON.parse(bytes.toString());
  }
  const evidence = (await load(resolve(base, "evidence.json"))) as {
    deployment: string;
    sources: (FileProof & { url: string })[];
    dates: (AllStarDateEvidence & FileProof)[];
  };
  if (evidence.deployment !== values.deployment)
    throw Error("Evidence target differs");
  const calendar = new Map<
    string,
    Map<number, { id: number; gameType: number }>
  >();
  for (const source of evidence.sources) {
    if (
      !/^https:\/\/api-web\.nhle\.com\/v1\/schedule\/\d{4}-\d{2}-\d{2}$/.test(
        source.url,
      )
    )
      throw Error("Unexpected official source URL");
    const schedule = await load(resolve(base, source.path));
    if (inputs.at(-1)!.sha256 !== source.sha256)
      throw Error("Official source checksum differs");
    for (const day of schedule.gameWeek) {
      const games = calendar.get(day.date) ?? new Map();
      for (const game of day.games)
        games.set(game.id, { id: game.id, gameType: game.gameType });
      calendar.set(day.date, games);
    }
  }
  for (const day of evidence.dates) {
    await load(resolve(base, day.path));
    if (inputs.at(-1)!.sha256 !== day.sha256)
      throw Error("Original source preimage checksum differs");
    const actual = [...(calendar.get(day.date)?.values() ?? [])].sort(
      (a, b) => a.id - b.id,
    );
    const expected = day.games
      .map(({ id, gameType }) => ({ id, gameType }))
      .sort((a, b) => a.id - b.id);
    if (
      !isDeepStrictEqual(actual, expected) ||
      !actual.some((g) => g.gameType === 4) ||
      actual.some((g) => g.gameType === 2 || g.gameType === 3)
    )
      throw Error("Date lacks exclusive All-Star evidence");
  }
  if (new Set(evidence.dates.map((d) => d.date)).size !== evidence.dates.length)
    throw Error("Duplicate dates");
  const clubs = (await load(resolve(base, "club-proofs.json"))) as ClubProof[];
  const neighbors = [
    ...new Map(
      clubs.flatMap((p) => [p.before, p.after]).map((r) => [r._id, r]),
    ).values(),
  ];
  for (let i = 0; i < neighbors.length; i += 50) {
    const batch = neighbors.slice(i, i + 50);
    const current = await readProductionOperatorQuery(
      `return await Promise.all(${JSON.stringify(batch.map((r) => r._id))}.map(id=>ctx.db.get(id)));`,
    );
    if (!isDeepStrictEqual(current, batch))
      throw Error("Adjacent club source changed");
  }
  const before: Row[] = [];
  async function readDays() {
    const rows: Row[] = [];
    for (const day of evidence.dates) {
      const found = (await readProductionOperatorQuery(
        `const rows=await ctx.db.query("playerDayStatLines").withIndex("by_date",q=>q.eq("date",${JSON.stringify(day.date)})).take(2001);if(rows.length===2001)throw Error("bound");return rows;`,
      )) as Row[];
      rows.push(...found);
    }
    return rows.sort((a, b) => a._id.localeCompare(b._id));
  }
  before.push(...(await readDays()));
  const changes = before.flatMap((row) => {
    const proof = clubs.find((p) => p.sourceId === row._id);
    if (
      proof &&
      (proof.before.playerId !== row.playerId ||
        proof.after.playerId !== row.playerId ||
        proof.before.seasonId !== row.seasonId ||
        proof.after.seasonId !== row.seasonId ||
        String(proof.before.date) >= String(row.date) ||
        String(proof.after.date) <= String(row.date) ||
        Math.abs(
          Date.parse(String(row.date)) - Date.parse(String(proof.before.date)),
        ) >
          10 * 86400000 ||
        Math.abs(
          Date.parse(String(proof.after.date)) - Date.parse(String(row.date)),
        ) >
          10 * 86400000 ||
        !isDeepStrictEqual(proof.before.nhlTeam, proof.nhlTeam) ||
        !isDeepStrictEqual(proof.after.nhlTeam, proof.nhlTeam))
    )
      throw Error("Invalid adjacent club evidence");
    const patch = buildAllStarDayPatch(
      row,
      evidence.dates.find((d) => d.date === row.date)!,
      proof?.nhlTeam,
    );
    return Object.keys(patch).length
      ? [{ id: row._id, date: row.date, patch }]
      : [];
  });
  for (const path of [
    "scripts/src/commands/stats/clear-allstar-player-days.ts",
    "scripts/src/domains/stats/allstar-game-cleanup.ts",
    "scripts/src/integrations/data/production-operator-cli.ts",
    "convex/data.ts",
    "convex/lib/playerDayPerformanceIndex.ts",
  ]) {
    const absolute = resolve(root, path);
    inputs.push({ path: absolute, sha256: hash(await readFile(absolute)) });
  }
  const plan = { deployment: values.deployment, inputs, before, changes };
  const planBytes = JSON.stringify(plan);
  await mkdir(output, { recursive: false });
  await writeFile(resolve(output, "plan.json"), planBytes);
  const summary = {
    deployment: values.deployment,
    rosterRows: before.length,
    changedRows: changes.length,
    allStarAppearances: before.filter((r) => Number(r.GP) > 0).length,
    dates: evidence.dates.map((d) => ({
      date: d.date,
      changed: changes.filter((c) => c.date === d.date).length,
    })),
    clubCorrections: changes.filter((c) => c.patch.nhlTeam).length,
    inserted: 0,
    deleted: 0,
  };
  await writeFile(
    resolve(output, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary));
  if (values.apply) {
    if (
      hash(await readFile(resolve(values["reviewed-plan"]!))) !==
      hash(planBytes)
    )
      throw Error("Reviewed plan/current preimages differ");
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
        throw Error("Backup checksum differs");
    for (const f of [
      ...inputs,
      { path: "reviewed-plan", sha256: hash(planBytes) },
    ])
      if (!backup.files.some((b) => b.sha256 === f.sha256))
        throw Error("Backup lacks reviewed source/code/preimage");
    const write = await createProductionOperatorWriter();
    const pending = [...changes];
    const updatedAt = Date.now();
    async function worker() {
      while (pending.length) {
        const change = pending.shift()!,
          row = before.find((r) => r._id === change.id)!;
        await write("data:updateById", {
          table: "playerDayStatLines",
          id: change.id,
          data: {
            ...change.patch,
            ...(row.legacyId === undefined ? {} : { legacyId: row.legacyId }),
            updatedAt,
          },
        });
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker));
    const after = await readDays();
    await writeFile(resolve(output, "after.json"), JSON.stringify(after));
    const expected = before.map((row) => {
      const c = changes.find((c) => c.id === row._id);
      return c ? { ...row, ...c.patch, updatedAt } : row;
    });
    if (!isDeepStrictEqual(after, expected))
      throw Error(
        "Production readback differs from exact reviewed field patches",
      );
    for (const row of after)
      if (
        Object.keys(
          buildAllStarDayPatch(
            row,
            evidence.dates.find((d) => d.date === row.date)!,
          ),
        ).length
      )
        throw Error("Residual All-Star contribution");
    const indexes: unknown[] = [];
    for (let i = 0; i < changes.length; i += 50)
      indexes.push(
        ...((await readProductionOperatorQuery(
          `return await Promise.all(${JSON.stringify(changes.slice(i, i + 50).map((c) => c.id))}.map(sourceId=>ctx.db.query("playerDayPerformanceIndex").withIndex("by_sourceId",q=>q.eq("sourceId",sourceId)).unique()));`,
        )) as unknown[]),
      );
    await writeFile(resolve(output, "indexes.json"), JSON.stringify(indexes));
    if (
      indexes.some((index) =>
        Object.entries(
          (index as { scores?: Record<string, number> } | null)?.scores ?? {},
        ).some(([stat, n]) => !["ADD", "days"].includes(stat) && n !== 0),
      )
    )
      throw Error("Residual exhibition performance score");
    await writeFile(
      resolve(output, "proof.json"),
      JSON.stringify(
        {
          passed: true,
          ...summary,
          rosterIdentityAndUnrelatedFieldsPreserved: true,
          performanceIndexVerified: true,
          verifiedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(
      "Verified exact source patches and performance index; no inserted/deleted roster rows.",
    );
  }
}
