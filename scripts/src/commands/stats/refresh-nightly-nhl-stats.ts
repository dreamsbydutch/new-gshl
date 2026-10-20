import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { prepareNightlyIdentities } from "../../integrations/nhl/nightly-identities";
import { fetchNightlyNhlSnapshot } from "../../integrations/nhl/nightly-season-source";
import {
  createNightlyNhlClient,
  prepareNightlyNhlRefresh,
  verifyNightlyNhlRefresh,
} from "../../integrations/nhl/nightly-season-refresh";

const { values } = parseArgs({
  options: {
    target: { type: "string" },
    "season-id": { type: "string" },
    date: { type: "string" },
    output: { type: "string" },
    apply: { type: "boolean", default: false },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Nightly official NHL regular-season player/team statistics and pooled GSHL category season ratings. --target production --season-id <canonical season ID> --date YYYY-MM-DD [--output <new audit directory>] [--apply]. Default is read-only. Requires all requested-date NHL games final and reconciled official reports; deferred apply exits nonzero. Fresh native changes explicitly withhold stale holistic hockey scores; this command does not refit or publish hockey models. Canonical IDs only, no player deletion, names matching, salary changes, deployment or GSHL rollups.",
  );
} else {
  try {
    await main();
  } catch {
    console.error(
      "Nightly NHL refresh failed; inspect retained local source/plan evidence. Private operator diagnostics suppressed.",
    );
    process.exitCode = 1;
  }
}
async function main() {
  if (values.target !== "production" || !values["season-id"] || !values.date)
    throw Error("Explicit production target, season-id and date required");
  const output = resolve(
    values.output ?? `.local-data/nhl-nightly/${Date.now()}-${process.pid}`,
  );
  await mkdir(resolve(output, ".."), { recursive: true });
  await mkdir(output, { recursive: false });
  const save = async (name: string, body: unknown) =>
    writeFile(resolve(output, name), JSON.stringify(body, null, 2) + "\n", {
      flag: "wx",
    });
  const client = await createNightlyNhlClient();
  let before = await client.snapshot(values["season-id"]);
  const year = Number(before.season.year),
    season = (year - 1) * 10000 + year;
  if (!Number.isSafeInteger(year) || year < 1918 || year > 2200)
    throw Error("Canonical NHL season year invalid");
  await save("before.json", before);
  const source = await fetchNightlyNhlSnapshot(values.date, season);
  const text = JSON.stringify(source, null, 2) + "\n",
    sourceSha256 = createHash("sha256").update(text).digest("hex");
  await writeFile(resolve(output, "source.json"), text, { flag: "wx" });
  if (source.status !== "ready") {
    await save("result.json", {
      status: "deferred",
      deployment: client.deployment,
      apply: values.apply,
      writes: 0,
      readiness: source.readiness,
      sourceSha256,
    });
    console.log(
      JSON.stringify({
        status: "deferred",
        reason: source.readiness.reason,
        output,
      }),
    );
    if (values.apply) process.exitCode = 2;
    return;
  }
  const identities = await prepareNightlyIdentities(
    before.players,
    source.players,
  );
  await save("identity-source.json", identities);
  const pending: {
    playerId: string;
    action: "existing" | "create" | "link";
    nhlPlayerId: number;
  }[] = [];
  for (const identity of identities) {
    const resolved = await client.provisionIdentity({
      expectedPlayerPopulation: before.players,
      official: identity.official,
      apply: values.apply ?? false,
    });
    if (values.apply) before = await client.snapshot(values["season-id"]);
    else {
      const playerId =
        resolved.playerId ?? `pending:${identity.official.nhlPlayerId}`;
      pending.push({
        playerId,
        action: resolved.action,
        nhlPlayerId: identity.official.nhlPlayerId,
      });
    }
  }
  await save("identity-result.json", {
    apply: values.apply,
    identities: identities.length,
    pending,
  });
  const planningSnapshot = pending.length
    ? {
        ...before,
        players: [
          ...before.players.filter(
            (p) => !pending.some((x) => x.playerId === p._id),
          ),
          ...pending.map((p) => ({
            _id: p.playerId,
            nhlApiId: String(p.nhlPlayerId),
          })),
        ],
      }
    : before;
  const plan = await prepareNightlyNhlRefresh(
    planningSnapshot,
    source.players,
    source.teams,
  );
  await save("plan.json", {
    seasonId: values["season-id"],
    sourceSha256,
    sourceFetchedAt: source.sourceFetchedAt,
    ...plan,
  });
  if (!values.apply && pending.length) {
    await save("result.json", {
      status: "dry-run",
      deployment: client.deployment,
      players: plan.players.length,
      teams: plan.teams.length,
      identities: pending,
      statPreflightDeferredForIdentities: true,
      writes: 0,
    });
    console.log(
      JSON.stringify({
        status: "dry-run",
        players: plan.players.length,
        teams: plan.teams.length,
        identities: pending,
        statPreflightDeferredForIdentities: true,
        output,
      }),
    );
    return;
  }
  const stats = new Map(before.stats.map((r) => [r._id, r]));
  let matched = 0,
    changed = 0,
    updated = 0;
  // All batches preflight without writes against the original complete rating-cohort snapshot.
  const batches = Array.from(
    { length: Math.max(Math.ceil(plan.players.length / 64), 1) },
    (_, i) => ({
      players: plan.players.slice(i * 64, (i + 1) * 64),
      teams: i === 0 ? plan.teams : [],
    }),
  );
  const args = (batch: (typeof batches)[number], apply: boolean) => ({
    seasonId: values["season-id"],
    expectedSeason: before.season,
    expectedStatsPopulation: [...stats.values()],
    sourceFetchedAt: Date.parse(source.sourceFetchedAt),
    sourceSha256,
    ...batch,
    apply,
  });
  for (const batch of batches) await client.refreshBatch(args(batch, false));
  for (const batch of batches) {
    const result = await client.refreshBatch(
      args(batch, values.apply ?? false),
    );
    matched += result.matched;
    changed += result.changed;
    updated += result.updated;
    for (const { table, row } of result.rows)
      if (table === "playerNhlStatLines")
        stats.set(row._id, row as (typeof before.stats)[number]);
  }
  const after = await client.snapshot(values["season-id"]);
  await save("after.json", after);
  if (values.apply)
    verifyNightlyNhlRefresh(
      after,
      plan,
      sourceSha256,
      Date.parse(source.sourceFetchedAt),
    );
  await save("result.json", {
    status: values.apply ? "applied" : "dry-run",
    deployment: client.deployment,
    seasonId: values["season-id"],
    nhlSeason: season,
    sourceFetchedAt: source.sourceFetchedAt,
    sourceSha256,
    matched,
    changed,
    updated,
    players: plan.players.length,
    teams: plan.teams.length,
    hockeyModelRefitted: false,
  });
  console.log(
    JSON.stringify({
      status: values.apply ? "applied" : "dry-run",
      matched,
      changed,
      updated,
      players: plan.players.length,
      teams: plan.teams.length,
      output,
    }),
  );
}
