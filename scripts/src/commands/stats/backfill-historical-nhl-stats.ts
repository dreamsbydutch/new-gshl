import { parseArgs, isDeepStrictEqual } from "node:util";
import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { auditHistoricalNativeSource } from "../../integrations/nhl/historical-native-source";
import {
  auditHistoricalIdentityManifest,
  type HistoricalIdentityManifest,
} from "../../integrations/nhl/historical-native-identities";
import { planHistoricalNhlMetadata } from "../../domains/nhl/historical-native-backfill";
import { HockeyDataCache } from "../../integrations/nhl/game-value-source";
import { prepareNightlyIdentities } from "../../integrations/nhl/nightly-identities";
import { capturedCli } from "../../integrations/data/production-operator-cli";
import {
  createNightlyNhlClient,
  prepareNightlyNhlRefresh,
  verifyNightlyNhlRefresh,
  type NightlyDbSnapshot,
} from "../../integrations/nhl/nightly-season-refresh";

const { values } = parseArgs({
  options: {
    phase: { type: "string" },
    source: { type: "string" },
    inventory: { type: "string" },
    "season-id": { type: "string" },
    "identity-cache": { type: "string" },
    identities: { type: "string" },
    output: { type: "string" },
    target: { type: "string" },
    apply: { type: "boolean", default: false },
    "reviewed-plan": { type: "string" },
    "reviewed-plan-sha256": { type: "string" },
    "backup-manifest": { type: "string" },
    "backup-sha256": { type: "string" },
    help: { type: "boolean" },
  },
});
const hash = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
type Row = Record<string, unknown>;
if (values.help)
  console.log(
    "Frozen historical NHL native backfill, ONLY 20082009–20122013; pinned polished-tern-709. --phase metadata|metadata-all|freeze-identities|identities|native --source <saved source.json> --output <NEW directory>. metadata emits an offline single-source plan with --inventory. metadata-all uses --source <native directory with all FIVE season/source.json files> --inventory --target production and atomically provisions exact five seasons plus missing ATL/PHX clubs. freeze-identities requires --inventory --identity-cache <offline cache>. identities/native require --target production --season-id; identities also --identities <frozen identity manifest>. Default dry-run, no source refetch. --apply requires --reviewed-plan <plan.json> --reviewed-plan-sha256 <SHA> --backup-manifest <independent manifest> --backup-sha256 <SHA>. No delete, conflict replacement, salary/ownership changes or holistic model fabrication.",
  );
else
  void main().catch(() => {
    console.error(
      "Historical NHL backfill stopped. Retained local evidence describes completed steps; authenticated diagnostics suppressed.",
    );
    process.exitCode = 1;
  });

async function main() {
  if (values.phase === "metadata-all") return metadataAll();
  if (
    !values.source ||
    !values.output ||
    !["metadata", "freeze-identities", "identities", "native"].includes(
      values.phase ?? "",
    )
  )
    throw Error("Explicit phase, frozen source and NEW output required");
  const output = resolve(values.output);
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output);
  const save = async (name: string, data: unknown) =>
    writeFile(resolve(output, name), JSON.stringify(data, null, 2) + "\n", {
      flag: "wx",
    });
  const sourceBytes = await readFile(resolve(values.source)),
    sourceSha256 = hash(sourceBytes),
    audited = await auditHistoricalNativeSource(
      JSON.parse(sourceBytes.toString("utf8")),
    );
  const { source } = audited;
  const binding = {
    version: "nhl-historical-native-import-v1",
    deployment: "polished-tern-709",
    phase: values.phase,
    season: source.season,
    sourcePath: resolve(values.source),
    sourceSha256,
    codeHashes: await codeHashes(),
  };
  await writeFile(resolve(output, "source.json"), sourceBytes, { flag: "wx" });
  if (values.phase === "metadata" || values.phase === "freeze-identities") {
    if (values.apply || !values.inventory)
      throw Error(
        "Local metadata/identity-freeze requires inventory and prohibits apply",
      );
    const inventoryBytes = await readFile(resolve(values.inventory));
    const inventory = JSON.parse(inventoryBytes.toString("utf8")) as {
      deployment: string;
      seasons: Row[];
      nhlTeams: Row[];
      players: { nhlApiId?: string | null }[];
    };
    if (inventory.deployment !== binding.deployment)
      throw Error("Inventory target mismatch");
    const metadata = planHistoricalNhlMetadata({
      season: source.season,
      games: audited.games,
      officialTeams: audited.officialTeams,
      requiredTeams: source.teams,
      seasons: inventory.seasons,
      teams: inventory.nhlTeams,
    });
    if (values.phase === "metadata")
      await save("plan.json", {
        ...binding,
        inventorySha256: hash(inventoryBytes),
        metadata,
        apply: false,
      });
    else {
      if (!values["identity-cache"])
        throw Error("Offline identity cache required");
      const cache = new HockeyDataCache(
        resolve(values["identity-cache"]),
        true,
      );
      const identities = await prepareNightlyIdentities(
        inventory.players,
        source.players,
        (url) => cache.json(url),
      );
      const capturedAt = Date.now();
      for (const identity of identities)
        identity.official.sourceFetchedAt = capturedAt;
      const manifest: HistoricalIdentityManifest = {
        version: "nhl-historical-identities-v1",
        sourceSha256,
        capturedAt,
        identities,
      };
      await auditHistoricalIdentityManifest(
        manifest,
        sourceSha256,
        source.players,
      );
      await save("identities.json", manifest);
      await save("plan.json", {
        ...binding,
        inventorySha256: hash(inventoryBytes),
        identitiesSha256: hash(JSON.stringify(manifest, null, 2) + "\n"),
        identities: identities.length,
        apply: false,
      });
    }
    return;
  }
  if (values.target !== "production" || !values["season-id"])
    throw Error("Explicit production canonical season required");
  const client = await createNightlyNhlClient();
  let before = await client.snapshot(values["season-id"]);
  const expected = planHistoricalNhlMetadata({
    season: source.season,
    games: audited.games,
    officialTeams: audited.officialTeams,
    requiredTeams: source.teams,
    seasons: [before.season],
    teams: before.teams,
  });
  if (
    expected.seasonOperation.action !== "existing" ||
    expected.teams.some((t) => t.action !== "existing")
  )
    throw Error("Canonical historical season/clubs must be provisioned first");
  await save("before.json", before);
  let plan: Row;
  if (values.phase === "identities") {
    if (!values.identities) throw Error("Frozen identity manifest required");
    const identityBytes = await readFile(resolve(values.identities));
    const manifest = JSON.parse(
      identityBytes.toString("utf8"),
    ) as HistoricalIdentityManifest;
    const identities = await auditHistoricalIdentityManifest(
      manifest,
      sourceSha256,
      source.players,
    );
    const known = new Set(before.players.map((p) => Number(p.nhlApiId)));
    const pending = identities.filter(
      (i) => !known.has(i.official.nhlPlayerId),
    );
    const covered = new Set([
      ...known,
      ...pending.map((i) => i.official.nhlPlayerId),
    ]);
    if (source.players.some((p) => !covered.has(p.nhlPlayerId)))
      throw Error("Frozen identities do not cover every unknown source player");
    const identityNames = pending.map((i) =>
      `${i.official.firstName} ${i.official.lastName}`
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""),
    );
    if (new Set(identityNames).size !== identityNames.length)
      throw Error(
        "Cross-batch historical names require independent identity review",
      );
    const identityBatches = [];
    for (let i = 0; i < pending.length; i += 100)
      identityBatches.push(pending.slice(i, i + 100));
    const preflight = [];
    for (const batch of identityBatches) {
      const result = await client.provisionHistoricalIdentities({
        officials: batch.map((i) => i.official),
        historicalSeasonId: values["season-id"],
        expectedPlayerPopulation: before.players,
        apply: false,
      });
      if (
        result.apply ||
        result.matched !== batch.length ||
        result.created + result.linked + result.existing !== batch.length ||
        result.rows.length !== batch.length
      )
        throw Error("Historical identity preflight count mismatch");
      preflight.push(result);
    }
    plan = {
      ...binding,
      seasonId: values["season-id"],
      identitiesSha256: hash(identityBytes),
      expectedSeason: before.season,
      expectedPlayers: before.players,
      pending: pending.map((i) => i.official),
      preflight,
    };
    await save("plan.json", plan);
    if (values.apply) {
      await authorizeApply(plan, before, output);
      const population = new Map(before.players.map((p) => [p._id, p]));
      for (let i = 0; i < identityBatches.length; i++) {
        const batch = identityBatches[i]!;
        const result = await client.provisionHistoricalIdentities({
          officials: batch.map((identity) => identity.official),
          historicalSeasonId: values["season-id"],
          expectedPlayerPopulation: [...population.values()],
          apply: true,
        });
        if (
          !result.apply ||
          result.matched !== batch.length ||
          result.created !== preflight[i]!.created ||
          result.linked !== preflight[i]!.linked ||
          result.existing !== preflight[i]!.existing ||
          result.rows.length !== batch.length
        )
          throw Error("Historical identity apply count mismatch");
        for (const [j, row] of result.rows.entries()) {
          if (
            !row.playerId ||
            row.nhlPlayerId !== batch[j]!.official.nhlPlayerId ||
            row.action !== preflight[i]!.rows[j]!.action
          )
            throw Error(
              "Identity write returned unexpected canonical assignment",
            );
          population.set(row.playerId, {
            _id: row.playerId,
            nhlApiId: String(row.nhlPlayerId),
          });
        }
        await save(`identity-batch-${i}.json`, result);
      }
    }
    const after = await client.snapshot(values["season-id"]);
    await save("after.json", after);
    if (
      !isDeepStrictEqual(before.stats, after.stats) ||
      !isDeepStrictEqual(before.teamStats, after.teamStats)
    )
      throw Error("Identity phase changed native stats");
    await save("result.json", {
      passed: true,
      apply: values.apply,
      identities: pending.length,
      planSha256: hash(JSON.stringify(plan, null, 2) + "\n"),
    });
  } else {
    const prepared = await prepareNightlyNhlRefresh(
      before,
      source.players,
      source.teams,
    );
    plan = {
      ...binding,
      seasonId: values["season-id"],
      expectedSeason: before.season,
      expectedPlayers: before.players,
      expectedStats: before.stats,
      expectedTeamStats: before.teamStats,
      prepared,
    };
    await save("plan.json", plan);
    const batches = [];
    for (let i = 0; i < prepared.players.length; i += 64)
      batches.push({
        players: prepared.players.slice(i, i + 64),
        teams: i === 0 ? prepared.teams : [],
      });
    for (let i = 0; i < batches.length; i++) {
      const result = await client.refreshBatch({
        ...batches[i],
        seasonId: values["season-id"],
        expectedSeason: before.season,
        expectedStatsPopulation: before.stats,
        sourceFetchedAt: Date.parse(source.sourceFetchedAt),
        sourceSha256,
        apply: false,
      });
      if (
        result.apply ||
        result.matched !==
          batches[i]!.players.length + batches[i]!.teams.length ||
        result.updated !== 0
      )
        throw Error("Native preflight counts invalid");
      await save(`preflight-${i}.json`, result);
    }
    if (values.apply) {
      await authorizeApply(plan, before, output);
      const population = new Map(before.stats.map((r) => [r.playerId, r]));
      for (let i = 0; i < batches.length; i++) {
        const result = await client.refreshBatch({
          ...batches[i],
          seasonId: values["season-id"],
          expectedSeason: before.season,
          expectedStatsPopulation: [...population.values()],
          sourceFetchedAt: Date.parse(source.sourceFetchedAt),
          sourceSha256,
          apply: true,
        });
        if (
          !result.apply ||
          result.matched !==
            batches[i]!.players.length + batches[i]!.teams.length ||
          result.updated !== result.changed
        )
          throw Error("Native apply counts invalid");
        for (const item of result.rows)
          if (item.table === "playerNhlStatLines")
            population.set(
              String(item.row.playerId),
              item.row as NightlyDbSnapshot["stats"][number],
            );
        await save(`applied-${i}.json`, result);
      }
    }
    const after = await client.snapshot(values["season-id"]);
    await save("after.json", after);
    if (values.apply) {
      verifyNightlyNhlRefresh(
        after,
        prepared,
        sourceSha256,
        Date.parse(source.sourceFetchedAt),
      );
      if (
        !isDeepStrictEqual(before.season, after.season) ||
        !isDeepStrictEqual(before.players, after.players) ||
        !isDeepStrictEqual(before.teams, after.teams)
      )
        throw Error("Native refresh changed canonical metadata");
      for (const [oldRows, newRows, entries] of [
        [before.stats, after.stats, prepared.players],
        [before.teamStats, after.teamStats, prepared.teams],
      ] as const) {
        for (const row of oldRows) {
          const current = newRows.find((r) => r._id === row._id);
          if (!current)
            throw Error("Native refresh deleted/replaced an existing row");
          const managed = new Set([
            ...Object.keys(entries[0]?.fields ?? {}),
            "nhlStatsSourceSha256",
            "nhlStatsSourceFetchedAt",
            "sourceSha256",
            "sourceFetchedAt",
            "hockeyRating",
            "updatedAt",
          ]);
          const unmanaged = (r: Row) =>
            Object.fromEntries(
              Object.entries(r).filter(([key]) => !managed.has(key)),
            );
          if (!isDeepStrictEqual(unmanaged(row), unmanaged(current)))
            throw Error("Native refresh changed unmanaged fields");
        }
      }
    }
    await save("result.json", {
      passed: true,
      apply: values.apply,
      players: prepared.players.length,
      teams: prepared.teams.length,
      planSha256: hash(JSON.stringify(plan, null, 2) + "\n"),
    });
  }
}

async function codeHashes() {
  const paths = [
    "scripts/src/commands/stats/backfill-historical-nhl-stats.ts",
    "scripts/src/domains/nhl/historical-native-backfill.ts",
    "scripts/src/integrations/nhl/historical-native-source.ts",
    "scripts/src/integrations/nhl/historical-native-identities.ts",
    "scripts/src/integrations/nhl/nightly-identities.ts",
    "scripts/src/integrations/nhl/nightly-season-refresh.ts",
    "scripts/src/integrations/nhl/nightly-season-source.ts",
    "scripts/src/domains/nhl/nightly-season-stats.ts",
    "convex/nightlyNhlStats.ts",
    "convex/lib/nhlIdentity.ts",
    "convex/lib/nightlyNhlStatFields.ts",
    "convex/lib/nhlSeasonValueFields.ts",
    "convex/nhlSeasonValues.ts",
    "convex/historicalNhlMetadata.ts",
    "scripts/src/domains/ranking/ranking-engine.ts",
    "scripts/src/runtime/RankingEngine/config.js",
    "scripts/src/runtime/RankingEngine/player-pure.js",
    "scripts/src/runtime/RankingEngine/team-pure.js",
    "scripts/src/runtime/RankingEngine/index.js",
  ];
  return Promise.all(
    paths.map(async (path) => ({
      path,
      sha256: hash(await readFile(resolve(path))),
    })),
  );
}
async function authorizeApply(plan: Row, before: unknown, output: string) {
  if (
    !values["reviewed-plan"] ||
    !values["reviewed-plan-sha256"] ||
    !values["backup-manifest"] ||
    !values["backup-sha256"]
  )
    throw Error("Reviewed plan and independent backup required");
  const bytes = await readFile(resolve(values["reviewed-plan"]));
  if (
    hash(bytes) !== values["reviewed-plan-sha256"] ||
    !isDeepStrictEqual(JSON.parse(bytes.toString("utf8")), plan)
  )
    throw Error("Reviewed dry-run plan/source/code/preimages changed");
  const backupPath = await realpath(resolve(values["backup-manifest"]));
  const cwd = await realpath(process.cwd());
  const rel = relative(cwd, backupPath);
  if (
    (!rel.startsWith("..") && !isAbsolute(rel)) ||
    backupPath.toLowerCase().includes("onedrive")
  )
    throw Error(
      "Backup must be independently stored outside workspace/OneDrive",
    );
  const backupBytes = await readFile(backupPath);
  if (hash(backupBytes) !== values["backup-sha256"])
    throw Error("Backup manifest hash mismatch");
  const backup = JSON.parse(backupBytes.toString("utf8")) as {
    passed?: boolean;
    deployment?: string;
    files?: { file: string; sha256: string }[];
  };
  if (
    backup.passed !== true ||
    backup.deployment !== "polished-tern-709" ||
    !Array.isArray(backup.files) ||
    !backup.files.length
  )
    throw Error("Invalid independent backup proof");
  let containsBefore = false;
  for (const file of backup.files) {
    const path = resolve(dirname(backupPath), file.file);
    const bound = relative(dirname(backupPath), path);
    if (isAbsolute(bound) || bound.startsWith(".."))
      throw Error("Backup file escapes manifest");
    const content = await readFile(path);
    if (hash(content) !== file.sha256)
      throw Error("Independent backup readback failed");
    try {
      if (isDeepStrictEqual(JSON.parse(content.toString("utf8")), before))
        containsBefore = true;
    } catch {}
  }
  if (!containsBefore)
    throw Error(
      "Independent backup does not contain exact fresh full season snapshot",
    );
  await writeFile(
    resolve(output, "authorization.json"),
    JSON.stringify(
      {
        reviewedPlanSha256: hash(bytes),
        backupManifestSha256: hash(backupBytes),
        backupPath,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
}

async function metadataAll() {
  if (
    !values.source ||
    !values.inventory ||
    !values.output ||
    values.target !== "production"
  )
    throw Error(
      "metadata-all requires explicit production target, native source directory, inventory and NEW output",
    );
  const output = resolve(values.output);
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output);
  const inventoryBytes = await readFile(resolve(values.inventory));
  const inventory = JSON.parse(inventoryBytes.toString("utf8")) as {
    deployment: string;
    seasons: Row[];
    nhlTeams: Row[];
  };
  if (inventory.deployment !== "polished-tern-709")
    throw Error("Historical inventory deployment mismatch");
  const plans = [];
  const sources = [];
  for (const season of [20082009, 20092010, 20102011, 20112012, 20122013]) {
    const path = resolve(values.source, String(season), "source.json"),
      bytes = await readFile(path),
      a = await auditHistoricalNativeSource(JSON.parse(bytes.toString("utf8")));
    if (a.source.season !== season)
      throw Error("Historical source directory season mismatch");
    plans.push(
      planHistoricalNhlMetadata({
        season,
        games: a.games,
        officialTeams: a.officialTeams,
        requiredTeams: a.source.teams,
        seasons: inventory.seasons,
        teams: inventory.nhlTeams,
      }),
    );
    sources.push({ path, sha256: hash(bytes) });
  }
  const clubs = new Map<
    string,
    { officialTeamId: number; abbr: string; name: string; logoUrl: string }
  >();
  for (const plan of plans)
    for (const team of plan.teams)
      if (team.action === "insert") {
        const row = { officialTeamId: team.officialTeamId, ...team.document };
        const previous = clubs.get(row.abbr);
        if (previous && !isDeepStrictEqual(previous, row))
          throw Error("Historical club evidence conflicts across seasons");
        clubs.set(row.abbr, row);
      }
  const mutationArgs = {
    expectedSeasons: inventory.seasons,
    expectedTeams: inventory.nhlTeams,
    seasons: plans.map((p) => p.seasonOperation.document),
    teams: [...clubs.values()],
    sourceSha256s: sources.map((s) => s.sha256),
  };
  const plan = {
    version: "nhl-historical-native-metadata-v1",
    deployment: "polished-tern-709",
    inventorySha256: hash(inventoryBytes),
    sources,
    codeHashes: await codeHashes(),
    mutationArgs,
  };
  await writeFile(
    resolve(output, "plan.json"),
    JSON.stringify(plan, null, 2) + "\n",
    { flag: "wx" },
  );
  const call = async (apply: boolean) =>
    JSON.parse(
      await capturedCli([
        "run",
        "--deployment",
        "polished-tern-709",
        "--codegen",
        "disable",
        "--typecheck",
        "disable",
        "historicalNhlMetadata:provision",
        JSON.stringify({ ...mutationArgs, apply }),
      ]),
    ) as {
      apply: boolean;
      insertedSeasons: number;
      insertedTeams: number;
      seasons: unknown[];
      teams: unknown[];
    };
  const preview = await call(false);
  if (
    preview.apply ||
    preview.seasons.length !== 5 ||
    preview.teams.length !== clubs.size ||
    preview.insertedSeasons !==
      plans.filter((p) => p.seasonOperation.action === "insert").length ||
    preview.insertedTeams !== clubs.size
  )
    throw Error("Historical metadata preflight counts mismatch");
  await writeFile(
    resolve(output, "preflight.json"),
    JSON.stringify(preview, null, 2) + "\n",
    { flag: "wx" },
  );
  if (values.apply) {
    await authorizeApply(plan, inventory, output);
    const result = await call(true);
    if (
      !result.apply ||
      result.insertedSeasons !== preview.insertedSeasons ||
      result.insertedTeams !== preview.insertedTeams
    )
      throw Error("Historical metadata apply counts mismatch");
    await writeFile(
      resolve(output, "result.json"),
      JSON.stringify(result, null, 2) + "\n",
      { flag: "wx" },
    );
  }
}
