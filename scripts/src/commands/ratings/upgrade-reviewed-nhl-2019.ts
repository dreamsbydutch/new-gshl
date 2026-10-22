import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, lstat } from "node:fs/promises";
import { resolve, relative, dirname, isAbsolute, sep } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { loadHockeyOverallPublication } from "../../integrations/nhl/hockey-overall-publication";
import { capturedCli } from "../../integrations/data/production-operator-cli";

const deployment = "polished-tern-709";
const version = "nhl-reviewed-season-atomic-upgrade-plan-v2";
const legacyVersion = "nhl-reviewed-2019-atomic-upgrade-plan-v1";
const model = "nhl-hockey-overall-reviewed-v1";
const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
type Row = Record<string, any>;
function supportedSeason(
  value: unknown = 20192020,
): 20102011 | 20112012 | 20122013 | 20142015 | 20192020 {
  const season = Number(value);
  if (![20102011, 20112012, 20122013, 20142015, 20192020].includes(season))
    throw Error(
      "Only reviewed 2010, 2011, 2012, 2014 and 2019 season upgrades are supported",
    );
  return season as 20102011 | 20112012 | 20122013 | 20142015 | 20192020;
}
function cohortCount(payload: Row) {
  const count = Array.isArray(payload.results) ? payload.results.length : 0;
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 1200 ||
    !Array.isArray(payload.expectedValues) ||
    payload.expectedValues.length !== count ||
    !Array.isArray(payload.expectedStats) ||
    payload.expectedStats.length !== count
  )
    throw Error("Complete bounded source/native cohort required");
  return count;
}
type Plan = {
  version: string;
  target: string;
  deployment: string;
  buildPath: string;
  buildSha256: string;
  snapshotSha256: string;
  backup: { directory: string; manifestSha256: string; sourceSha256: string };
  nativeProof: {
    summaryHash: string;
    policyHash: string;
    inventoryHash: string;
  };
  toolCodeHashes: Array<{ path: string; sha256: string }>;
  payload: Row;
};
async function json(path: string) {
  const bytes = await readFile(path);
  return {
    bytes,
    sha256: hash(bytes),
    value: JSON.parse(bytes.toString("utf8")) as Row,
  };
}
async function save(path: string, data: unknown) {
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
}
async function noLinks(path: string) {
  let current = resolve(path);
  for (;;) {
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw Error("Backup links are not allowed");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
async function verifyBackup(plan: Plan, planSha256: string) {
  const root = resolve(homedir(), "gshl-backups"),
    directory = resolve(plan.backup.directory),
    rel = relative(root, directory);
  if (
    !rel ||
    rel.startsWith("..") ||
    isAbsolute(rel) ||
    directory.split(sep).some((p) => p.toLowerCase() === "onedrive")
  )
    throw Error(
      "Independent backup must be a new directory below the operator home gshl-backups root",
    );
  await noLinks(directory);
  const manifest = await json(resolve(directory, "manifest.json")),
    source = await json(resolve(directory, "source-before.json"));
  const backupPlan = await readFile(resolve(directory, "reviewed-plan.json"));
  if (
    manifest.sha256 !== plan.backup.manifestSha256 ||
    source.sha256 !== plan.backup.sourceSha256 ||
    manifest.value.sourceSha256 !== source.sha256 ||
    manifest.value.snapshotSha256 !== plan.snapshotSha256 ||
    manifest.value.deployment !== deployment ||
    manifest.value.nhlSeason !== supportedSeason(plan.payload.nhlSeason) ||
    hash(backupPlan) !== planSha256
  )
    throw Error("Independent backup hash/provenance mismatch");
  const savedValues = (source.value.values as Row[]).filter(
    (row) =>
      row.modelVersion === model &&
      row.gameType === 2 &&
      row.profile === "core",
  );
  if (
    source.value.season?._id !== plan.payload.seasonId ||
    Number(source.value.season?.year) !==
      supportedSeason(plan.payload.nhlSeason) % 10000 ||
    !equal(savedValues, plan.payload.expectedValues) ||
    !equal(source.value.stats, plan.payload.expectedStats)
  )
    throw Error("Reviewed CAS preimages differ from independent source backup");
}
async function codeHashes() {
  return await Promise.all(
    [
      "scripts/src/commands/ratings/upgrade-reviewed-nhl-2019.ts",
      "scripts/src/integrations/nhl/hockey-overall-publication.ts",
      "convex/nhlReviewedSeasonUpgrade.ts",
      "scripts/src/domains/nhl/hockey-overall-publication.ts",
      "scripts/src/integrations/data/production-operator-cli.ts",
      "convex/nhlSeasonValues.ts",
      "convex/lib/nhlSeasonValueFields.ts",
    ].map(async (path) => ({ path, sha256: hash(await readFile(path)) })),
  );
}
async function native(
  buildPath: string,
  nhlSeason: 20102011 | 20112012 | 20122013 | 20142015 | 20192020,
) {
  const prepared = await loadHockeyOverallPublication(buildPath, nhlSeason);
  if (
    prepared.plans.length !== 1 ||
    prepared.excluded.length ||
    prepared.pending.length
  )
    throw Error(
      "Exactly one independently verified completed allowlisted season build required",
    );
  const p = prepared.plans[0]!;
  if (
    p.season.state !== "completed" ||
    p.results.length < 1 ||
    p.results.length > 1200 ||
    p.metadata.nhlSeason !== nhlSeason ||
    p.season.nhlSeason !== nhlSeason ||
    p.metadata.modelVersion !== model
  )
    throw Error(
      "Expected a complete bounded reviewed source cohort for the selected season",
    );
  return { prepared, p };
}
async function call(payload: Row, apply: boolean) {
  const nhlSeason = supportedSeason(payload.nhlSeason),
    count = cohortCount(payload);
  const endpoint = `upgradeReviewed${Math.floor(nhlSeason / 10000)}Season`;
  const result = JSON.parse(
    await capturedCli([
      "run",
      "--deployment",
      deployment,
      "--codegen",
      "disable",
      "--typecheck",
      "disable",
      `nhlReviewedSeasonUpgrade:${endpoint}`,
      JSON.stringify({ ...payload, apply }),
    ]),
  ) as Row;
  if (
    result.nhlSeason !== nhlSeason ||
    result.modelVersion !== model ||
    result.sourceRows !== count ||
    result.nativeRows !== count ||
    result.apply !== apply ||
    result.sourceHash !== payload.sourceHash ||
    result.reviewHash !== payload.reviewHash ||
    result.backupSha256 !== payload.backupSha256 ||
    typeof result.already !== "boolean" ||
    result.updated !== (apply && !result.already ? count : 0) ||
    result.wouldUpdate !== (!apply && !result.already ? count : 0)
  )
    throw Error("Atomic upgrade response differs from exact reviewed scope");
  return result;
}
const { values } = parseArgs({
  options: {
    input: { type: "string" },
    snapshot: { type: "string" },
    backup: { type: "string" },
    output: { type: "string" },
    plan: { type: "string" },
    "plan-sha256": { type: "string" },
    target: { type: "string" },
    deployment: { type: "string" },
    season: { type: "string" },
    apply: { type: "boolean", default: false },
    "local-only": { type: "boolean", default: false },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Prepare: --input VERIFIED_BUILD_SUMMARY --snapshot FRESH_BEFORE_JSON --backup NEW_HOME_BACKUP_DIRECTORY --output NEW_DIRECTORY --target production --deployment polished-tern-709 [--season 20102011|20112012|20122013|20142015|20192020] [--local-only]. Preparation defaults to 20192020. The entire cohort count must match the independently verified source and full native/source preimages (1–1200). This performs native all-row/model replay, preserves an independent complete source preimage and reviewed plan, and defaults to remote dry-run only. Apply: --plan REVIEWED_PLAN_JSON --plan-sha256 EXACT_SHA --output NEW_DIRECTORY --target production --deployment polished-tern-709 --apply [--season EXACT_PLAN_SEASON]. Apply infers the allowlisted season from the reviewed plan, replays native proof, verifies backup/tool/input hashes, runs full atomic CAS dry-run, then one atomic update and idempotent verification. Separately pinned 2010, 2011, 2012, 2014 and 2019 backend endpoints share strict validation. No deploy, insertion, deletion, legacy model edits, category/stat/salary changes. Only reviewed nhlSeasonValues fields and existing native hockeyRating associations change together. No automatic model/forecast artifact promotion.",
  );
} else {
  const requestedSeason =
    values.season === undefined ? undefined : supportedSeason(values.season);
  if (
    values.target !== "production" ||
    values.deployment !== deployment ||
    !values.output ||
    (values.apply && values["local-only"])
  )
    throw Error(
      "Explicit pinned production target and new output directory required",
    );
  const output = resolve(values.output);
  await mkdir(output);
  let plan: Plan, planSha256: string;
  if (values.plan) {
    if (
      !values.apply ||
      values.input ||
      values.snapshot ||
      values.backup ||
      !/^[a-f0-9]{64}$/.test(values["plan-sha256"] ?? "")
    )
      throw Error("Apply requires only an exact reviewed plan SHA and output");
    const read = await json(resolve(values.plan));
    if (read.sha256 !== values["plan-sha256"])
      throw Error("Reviewed plan SHA differs");
    plan = read.value as Plan;
    planSha256 = read.sha256;
  } else {
    if (values.apply || !values.input || !values.snapshot || !values.backup)
      throw Error(
        "Preparation requires build, fresh snapshot and independent new backup",
      );
    const buildPath = resolve(values.input),
      snapshot = await json(resolve(values.snapshot)),
      { prepared, p } = await native(buildPath, requestedSeason ?? 20192020);
    const expectedPlayers = p.results.length;
    const cohorts = snapshot.value.seasons as Array<Row>;
    const matching = cohorts.filter((s) => s.season?._id === p.season.seasonId);
    if (
      snapshot.value.deployment !== deployment ||
      matching.length !== 1 ||
      Number(matching[0]?.season?.year) !== p.metadata.nhlSeason % 10000
    )
      throw Error("Fresh snapshot deployment/season identity differs");
    const before = matching[0]!,
      stats = before.stats as Row[],
      allValues = before.values as Row[];
    const oldValues = allValues.filter(
      (v) =>
        v.modelVersion === model && v.gameType === 2 && v.profile === "core",
    );
    if (
      stats.length !== expectedPlayers ||
      oldValues.length !== expectedPlayers ||
      stats.some((s) => !(Number(s.GP) > 0))
    )
      throw Error(
        "Full native/source population must exactly match verified source count",
      );
    const oldByNhl = new Map(oldValues.map((v) => [v.nhlPlayerId, v]));
    const byPlayer = new Map(oldValues.map((v) => [v.playerId, v]));
    if (oldByNhl.size !== expectedPlayers || byPlayer.size !== expectedPlayers)
      throw Error("Duplicate original reviewed identity");
    for (const next of p.results) {
      const old = oldByNhl.get(next.nhlPlayerId);
      if (
        !old ||
        old.games !== next.games ||
        old.minutes !== next.minutes ||
        old.position !== next.position ||
        old.name !== next.name ||
        old.team !== next.team ||
        old.hockeyOverall?.sourceArtifactHash !==
          next.hockeyOverall.sourceArtifactHash ||
        old.sourceHash === p.metadata.sourceHash
      )
        throw Error(
          "Official/source population differs or no source upgrade exists",
        );
    }
    for (const row of stats) {
      const old = byPlayer.get(row.playerId);
      if (
        !old ||
        row.hockeyRating?.sourceId !== old._id ||
        row.hockeyRating?.nhlPlayerId !== old.nhlPlayerId ||
        Number(row.GP) !== old.games ||
        (row.posGroup === "G") !== (old.position === "G")
      )
        throw Error("Native reviewed source association differs");
    }
    const directory = resolve(values.backup),
      allowed = resolve(homedir(), "gshl-backups"),
      rel = relative(allowed, directory);
    if (!rel || rel.startsWith("..") || isAbsolute(rel))
      throw Error(
        "Backup must be independent under the operator home gshl-backups root",
      );
    await noLinks(directory);
    await mkdir(directory);
    await save(resolve(directory, "source-before.json"), before);
    const sourceSha256 = hash(
      await readFile(resolve(directory, "source-before.json")),
    );
    const backupManifest = {
      version: "nhl-reviewed-season-source-backup-v1",
      deployment,
      nhlSeason: p.metadata.nhlSeason,
      snapshotSha256: snapshot.sha256,
      sourceSha256,
      sourceRows: allValues.length,
      nativeRows: stats.length,
      createdAt: new Date().toISOString(),
    };
    await save(resolve(directory, "manifest.json"), backupManifest);
    const manifestSha256 = hash(
      await readFile(resolve(directory, "manifest.json")),
    );
    const body = {
      ...p.metadata,
      results: p.results,
      expectedValues: oldValues,
      expectedStats: stats,
      backupSha256: manifestSha256,
      reviewedAt: Date.now(),
    };
    const payload = { ...body, reviewHash: hash(JSON.stringify(body)) };
    if (Buffer.byteLength(JSON.stringify(payload)) > 8 * 1024 * 1024)
      throw Error("Atomic payload exceeds conservative8MiB budget");
    plan = {
      version,
      target: "production",
      deployment,
      buildPath,
      buildSha256: hash(await readFile(buildPath)),
      snapshotSha256: snapshot.sha256,
      backup: { directory, manifestSha256, sourceSha256 },
      nativeProof: {
        summaryHash: prepared.summaryHash,
        policyHash: prepared.policyHash,
        inventoryHash: prepared.inventoryHash,
      },
      toolCodeHashes: await codeHashes(),
      payload,
    };
    await save(resolve(output, "plan.json"), plan);
    planSha256 = hash(await readFile(resolve(output, "plan.json")));
    await writeFile(
      resolve(directory, "reviewed-plan.json"),
      await readFile(resolve(output, "plan.json")),
      { flag: "wx" },
    );
  }
  if (
    !(
      plan.version === version ||
      (plan.version === legacyVersion && plan.payload.nhlSeason === 20192020)
    ) ||
    plan.target !== "production" ||
    plan.deployment !== deployment
  )
    throw Error("Unsupported reviewed atomic plan");
  const planSeason = supportedSeason(plan.payload.nhlSeason),
    expectedPlayers = cohortCount(plan.payload);
  if (requestedSeason !== undefined && requestedSeason !== planSeason)
    throw Error("Explicit requested season differs from reviewed plan");
  await verifyBackup(plan, planSha256);
  if (!equal(await codeHashes(), plan.toolCodeHashes))
    throw Error("Reviewed upgrade tool bytes changed");
  if (hash(await readFile(plan.buildPath)) !== plan.buildSha256)
    throw Error("Reviewed build summary changed");
  const { prepared, p } = await native(plan.buildPath, planSeason);
  if (p.results.length !== expectedPlayers)
    throw Error("Reviewed cohort count differs from replayed complete source");
  if (
    !equal(plan.nativeProof, {
      summaryHash: prepared.summaryHash,
      policyHash: prepared.policyHash,
      inventoryHash: prepared.inventoryHash,
    }) ||
    !equal(p.results, plan.payload.results) ||
    Object.entries(p.metadata).some(([k, v]) => !equal(v, plan.payload[k]))
  )
    throw Error("Native publication replay differs from reviewed plan");
  const { reviewHash, ...body } = plan.payload;
  if (
    hash(JSON.stringify(body)) !== reviewHash ||
    plan.payload.backupSha256 !== plan.backup.manifestSha256
  )
    throw Error("Atomic payload review binding differs");
  const receipts: Row[] = [];
  if (!values["local-only"]) {
    receipts.push(await call(plan.payload, false));
    if (values.apply) {
      await verifyBackup(plan, planSha256);
      if (!equal(await codeHashes(), plan.toolCodeHashes))
        throw Error("Code changed before apply");
      receipts.push(await call(plan.payload, true));
      const verify = await call(plan.payload, false);
      if (!verify.already || verify.updated !== 0 || verify.wouldUpdate !== 0)
        throw Error("Atomic upgrade idempotency verification failed");
      receipts.push(verify);
    }
  }
  await save(resolve(output, "receipt.json"), {
    version: "nhl-reviewed-season-atomic-upgrade-receipt-v1",
    deployment,
    apply: values.apply,
    localOnly: values["local-only"],
    planSha256,
    backupSha256: plan.backup.manifestSha256,
    nhlSeason: planSeason,
    sourceRows: expectedPlayers,
    nativeRows: expectedPlayers,
    receipts,
    completedAt: new Date().toISOString(),
  });
  console.log(
    JSON.stringify({
      output,
      apply: values.apply,
      localOnly: values["local-only"],
      nhlSeason: planSeason,
      sourceRows: expectedPlayers,
      nativeRows: expectedPlayers,
      verified: values.apply ? receipts.at(-1)?.already === true : false,
      planSha256,
    }),
  );
}
