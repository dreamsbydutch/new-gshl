import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs, isDeepStrictEqual } from "node:util";
import { env } from "../../env";
import * as store from "../../integrations/data/convex-store";
import {
  planDraftSignings,
  signingPickWriteData,
  type DraftRepairRow,
  type DraftSigningSource,
} from "../../domains/maintenance/draft-signings";

const help = `Repair missing contract signing draft picks (production; dry-run by default).
Run from scripts/: node --use-system-ca ../node_modules/tsx/dist/cli.mjs src/commands/draft/repair-signing-picks.ts [options]
  --season-id <id>      Restrict to a canonical or legacy season ID; default all configured seasons.
  --report <path>       JSON audit output; default ../.local-data/draft-signings/dry-run.json
  --apply               Fill latest available empty picks; append snake slots only if needed.
  --expect-hash <hash>   Required with --apply; must match the reviewed dry-run plan.
  --help                Show this text without accessing data.
Existing filled picks, contracts, and rosters are preserved. Unresolved identities/order are reported, not guessed.
No deletes, replacement, deployment, ratings rebuild, or roster rebuild is performed.`;

function targetName() {
  const deployment = env.CONVEX_DEPLOYMENT?.startsWith("prod:")
    ? env.CONVEX_DEPLOYMENT
    : env.CONVEX_DEPLOY_KEY?.split("|", 1)[0];
  const url =
    env.CONVEX_PROD_URL ??
    (deployment?.startsWith("prod:")
      ? `https://${deployment.slice(5)}.convex.cloud`
      : "");
  if (!url) throw new Error("An explicit production deployment is required");
  return new URL(url).hostname;
}

async function main() {
  const { values } = parseArgs({
    options: {
      "season-id": { type: "string" },
      report: { type: "string" },
      apply: { type: "boolean" },
      "expect-hash": { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  if (values.apply && !values["expect-hash"])
    throw new Error("Apply requires the reviewed --expect-hash");
  store.configureConvexTarget("production");
  const target = targetName();
  console.log(
    JSON.stringify({
      target,
      mode: values.apply ? "apply" : "dry-run",
      scope: values["season-id"] ?? "all configured seasons",
      source: "contracts, draft picks, season teams, opening-day rosters",
    }),
  );
  const [seasons, teams, franchises, contracts, picks, rawPlayers] =
    await Promise.all([
      store.fetchModel<DraftRepairRow>("Season"),
      store.fetchModel<DraftRepairRow>("Team"),
      store.fetchModel<DraftRepairRow>("Franchise"),
      store.fetchModel<DraftRepairRow>("Contract"),
      store.fetchModel<DraftRepairRow>("DraftPick"),
      store.fetchModel<DraftRepairRow>("Player"),
    ]);
  const selected = values["season-id"]
    ? seasons.filter(
        (s) =>
          s.id === values["season-id"] ||
          String(s.legacyId) === values["season-id"],
      )
    : seasons;
  if (!selected.length) throw new Error("Requested season does not exist");
  const source: DraftSigningSource = {
    seasons,
    teams,
    franchises,
    contracts,
    picks,
    players: rawPlayers.map((p) => ({ id: p.id, fullName: p.fullName })),
    openings: [],
  };
  for (const season of selected) {
    const start = String(season.startDate ?? "").slice(0, 10);
    if (
      !start ||
      start > new Date().toISOString().slice(0, 10) ||
      !picks.some((p) => p.seasonId === season.id)
    )
      continue;
    if (
      !contracts.some(
        (c) => String(c.startDate) <= start && String(c.expiryDate) >= start,
      )
    )
      continue;
    const rows = await store.fetchPlayerDayDate(season.id, start);
    if (rows.length)
      source.openings.push({
        seasonId: season.id,
        date: start,
        rows: rows.map((r) => ({
          playerId: String(r.playerId),
          gshlTeamId: String(r.gshlTeamId),
        })),
      });
  }
  const plans = planDraftSignings(
    source,
    selected.map((s) => s.id),
  );
  const hash = createHash("sha256")
    .update(JSON.stringify({ target, plans }))
    .digest("hex");
  const reportPath = resolve(
    values.report ??
      `../.local-data/draft-signings/${values.apply ? "apply" : "dry-run"}.json`,
  );
  await mkdir(dirname(reportPath), { recursive: true });
  const report = {
    target,
    hash,
    mode: values.apply ? "apply" : "dry-run",
    createdAt: new Date().toISOString(),
    plans,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.table(
    plans.map((p) => ({
      season: p.season,
      eligible: p.eligible,
      accounted: p.accounted,
      fill: p.changes.filter((c) => c.kind === "fill").length,
      insert: p.changes.filter((c) => c.kind === "insert").length,
      excluded: p.excluded.length,
      issues: p.issues.length,
    })),
  );
  console.log(
    JSON.stringify({
      hash,
      report: reportPath,
      changes: plans.reduce((sum, p) => sum + p.changes.length, 0),
    }),
  );
  if (!values.apply) return;
  if (hash !== values["expect-hash"])
    throw new Error(
      "Source or plan changed; review a new dry run before applying",
    );
  // Preserve a local before-image for this additive repair. No source is deleted.
  await writeFile(
    `${reportPath}.before.json`,
    JSON.stringify(source, null, 2),
    { flag: "wx" },
  );
  const applied: Array<{
    season: string;
    kind: string;
    player: string;
    id?: string;
  }> = [];
  for (const plan of plans) {
    if (!plan.changes.length) continue;
    const latest = (await store.fetchModel<DraftRepairRow>("DraftPick")).filter(
      (p) => p.seasonId === plan.seasonId,
    );
    const expected = picks.filter((p) => p.seasonId === plan.seasonId);
    if (JSON.stringify(latest) !== JSON.stringify(expected))
      throw new Error(
        "Draft changed since preflight; no more writes will be attempted",
      );
    for (const change of plan.changes) {
      if (change.kind === "fill") {
        if (!change.id || change.before?.playerId)
          throw new Error("Refusing to replace an occupied pick");
        await store.updateById("DraftPick", change.id, {
          ...signingPickWriteData(change),
          updatedAt: new Date(),
        });
      } else {
        const result = await store.upsertByCompositeKey(
          "DraftPick",
          ["seasonId", "pick"],
          [change.data],
          { merge: true },
        );
        if (
          result.inserted !== 1 ||
          result.updated ||
          result.deleted ||
          result.duplicateDeletes
        )
          throw new Error("Unexpected insert outcome; stopped for review");
      }
      applied.push({
        season: plan.season,
        kind: change.kind,
        player: change.player,
        id: change.id,
      });
      await writeFile(
        `${reportPath}.applied.json`,
        JSON.stringify(applied, null, 2),
      );
    }
    console.log(`${plan.season}: applied ${plan.changes.length} signing picks`);
  }
  const refreshed = await store.fetchModel<DraftRepairRow>("DraftPick");
  const changesById = new Map(
    plans.flatMap((plan) =>
      plan.changes
        .filter((change) => change.id)
        .map((change) => [change.id, change]),
    ),
  );
  const inserted = plans.reduce(
    (sum, plan) =>
      sum + plan.changes.filter((change) => change.kind === "insert").length,
    0,
  );
  if (refreshed.length !== picks.length + inserted)
    throw new Error("Unexpected draft row count after repair");
  for (const before of picks) {
    const actual = refreshed.find((pick) => pick.id === before.id);
    const change = changesById.get(before.id);
    const expected = change
      ? {
          ...before,
          ...signingPickWriteData(change),
          updatedAt: actual?.updatedAt,
        }
      : before;
    if (!actual || !isDeepStrictEqual(actual, expected))
      throw new Error(`Pick ${before.id} did not preserve its expected fields`);
  }
  for (const plan of plans)
    for (const change of plan.changes) {
      const matches = refreshed.filter(
        (pick) =>
          pick.seasonId === plan.seasonId &&
          pick.playerId === change.data.playerId,
      );
      if (
        matches.length !== 1 ||
        !matches[0]?.isSigning ||
        matches[0]?.isTraded ||
        matches[0]?.gshlTeamId !== change.data.gshlTeamId
      ) {
        throw new Error(`Signing verification failed for ${change.player}`);
      }
    }
  const remaining = planDraftSignings(
    { ...source, picks: refreshed },
    selected.map((s) => s.id),
  );
  await writeFile(
    `${reportPath}.verified.json`,
    JSON.stringify({ target, plans: remaining }, null, 2),
  );
  const count = remaining.reduce((sum, p) => sum + p.changes.length, 0);
  console.log(
    JSON.stringify({ applied: applied.length, remainingChanges: count }),
  );
  if (count)
    throw new Error(
      "Repair is not yet idempotent; inspect verification report",
    );
}

main().catch((error) => {
  // Never print Convex request arguments or credentials from transport errors.
  const message = error instanceof Error ? error.message : "Unknown failure";
  const secret = env.CONVEX_SERVER_SECRET;
  console.error(secret ? message.split(secret).join("[redacted]") : message);
  process.exitCode = 1;
});
