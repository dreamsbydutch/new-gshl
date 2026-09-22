import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { env } from "../../env";
import * as store from "../../integrations/data/convex-store";
import { calculateTeamAwards } from "../../../../convex/awardCalculations";

type Row = Record<string, unknown>;
const help = `Reconcile completed-season Calder winners and nominees to stored Calder rankings.
Production only; dry-run by default. No deletions or other award changes.
  --season-id <id>     Optional canonical or legacy season ID.
  --report <path>      JSON audit path (default ../.local-data/calder-winners/dry-run.json).
  --apply              Update existing Calder award rows in place.
  --expect-hash <hash> Required with --apply; must match the reviewed live plan.
  --help               Show help without accessing production.
Missing/duplicate awards or unresolved owners stop the run. Seasons without rated
Calder rankings are reported and preserved. Read-back verifies all award rows.`;

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
    throw new Error("Apply requires --expect-hash");
  const deployment =
    env.CONVEX_DEPLOYMENT?.trim() || env.CONVEX_DEPLOY_KEY?.split("|", 1)[0];
  const url =
    env.CONVEX_PROD_URL ??
    (deployment?.startsWith("prod:")
      ? `https://${deployment.slice(5)}.convex.cloud`
      : "");
  if (!url) throw new Error("Explicit production target required");
  const target = new URL(url).origin;
  store.configureConvexTarget("production");
  console.log(
    JSON.stringify({
      target,
      mode: values.apply ? "apply" : "dry-run",
      scope: values["season-id"] ?? "all completed seasons",
      writes: "Calder winner and two nominees only",
    }),
  );
  const [seasons, teams, franchises, awards] = await Promise.all([
    store.fetchModel<Row>("Season"),
    store.fetchModel<Row>("Team"),
    store.fetchModel<Row>("Franchise"),
    store.fetchModel<Row>("TeamAward"),
  ]);
  const ownerByTeam = new Map(
    teams.map((team) => [
      team.id,
      franchises.find((f) => f.id === team.franchiseId)?.ownerId,
    ]),
  );
  const teamName = (seasonId: unknown, ownerId: unknown) => {
    const team = teams.find(
      (t) => t.seasonId === seasonId && ownerByTeam.get(t.id) === ownerId,
    );
    return (
      team?.name ??
      franchises.find((f) => f.id === team?.franchiseId)?.name ??
      ownerId
    );
  };
  const selected = seasons
    .filter(
      (s) =>
        Date.parse(String(s.endDate)) < Date.now() &&
        (!values["season-id"] ||
          s.id === values["season-id"] ||
          String(s.legacyId) === values["season-id"]),
    )
    .sort((a, b) => Number(a.year) - Number(b.year));
  if (!selected.length) throw new Error("No completed seasons matched");
  const plans = [];
  const skipped = [];
  for (const season of selected) {
    const stats = (
      await store.fetchAggregateRows<Row>(
        "TeamSeasonStatLine",
        String(season.id),
      )
    ).filter(
      (r) =>
        r.seasonType === "RS" &&
        Number(r.calderRating) > 0 &&
        Number(r.calderRk) > 0,
    );
    if (!stats.length) {
      skipped.push({ year: season.year, reason: "No rated Calder rankings" });
      continue;
    }
    const ranks = stats.map((r) => Number(r.calderRk)).sort((a, b) => a - b);
    if (ranks.some((rank, index) => rank !== index + 1))
      throw new Error(`Invalid Calder rank sequence in ${String(season.year)}`);
    if (stats.some((r) => !ownerByTeam.get(r.gshlTeamId)))
      throw new Error(`Unresolved team owner in ${String(season.year)}`);
    const existing = awards.filter(
      (a) => a.seasonId === season.id && a.award === "calder",
    );
    if (existing.length !== 1)
      throw new Error(
        `Expected exactly one Calder award in ${String(season.year)}; found ${existing.length}`,
      );
    const result = calculateTeamAwards({
      seasonId: String(season.id),
      teamSeasonRows: stats,
      teams: teams.map((t) => ({ ...t, _id: t.id })),
      franchises: franchises.map((f) => ({ ...f, _id: f.id })),
      conferences: [],
      matchups: [],
      weeks: [],
    }).find((a) => a.award === "calder");
    if (!result)
      throw new Error(
        `Unable to calculate Calder award in ${String(season.year)}`,
      );
    const before = existing[0]!;
    if (
      before.ownerId === result.ownerId &&
      isDeepStrictEqual(before.nomineeIds, result.nomineeIds)
    )
      continue;
    plans.push({
      id: String(before.id),
      year: season.year,
      before,
      data: {
        ...result,
        legacyId: before.legacyId,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      },
      oldWinner: teamName(season.id, before.ownerId),
      newWinner: teamName(season.id, result.ownerId),
      winnerChanged: before.ownerId !== result.ownerId,
    });
  }
  const hash = createHash("sha256")
    .update(JSON.stringify({ target, plans, skipped }))
    .digest("hex");
  if (values.apply && hash !== values["expect-hash"])
    throw new Error("Live plan differs from reviewed hash");
  const report = resolve(
    values.report ?? "../.local-data/calder-winners/dry-run.json",
  );
  await mkdir(dirname(report), { recursive: true });
  await writeFile(
    report,
    JSON.stringify(
      { target, hash, plans, skipped, beforeAwards: awards },
      null,
      2,
    ),
  );
  if (values.apply) {
    for (const plan of plans)
      await store.updateById("TeamAward", plan.id, plan.data);
    const after = await store.fetchModel<Row>("TeamAward");
    if (after.length !== awards.length)
      throw new Error("Award row count changed");
    for (const before of awards) {
      const actual = after.find((a) => a.id === before.id);
      const plan = plans.find((p) => p.id === before.id);
      const expected = plan
        ? {
            ...before,
            ownerId: plan.data.ownerId,
            winnerId: plan.data.ownerId,
            nomineeIds: plan.data.nomineeIds,
          }
        : before;
      if (!isDeepStrictEqual(actual, expected))
        throw new Error(`Award read-back mismatch for ${String(before.id)}`);
    }
    await writeFile(
      `${report}.verified.json`,
      JSON.stringify(
        {
          target,
          updated: plans.length,
          allAwardRowsVerified: after.length,
          verifiedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }
  console.log(
    JSON.stringify(
      {
        target,
        hash,
        changes: plans.map(({ year, oldWinner, newWinner, winnerChanged }) => ({
          year,
          oldWinner,
          newWinner,
          winnerChanged,
        })),
        skipped,
        applied: !!values.apply,
        report,
      },
      null,
      2,
    ),
  );
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Calder reconciliation failed",
  );
  process.exitCode = 1;
});
