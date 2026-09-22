import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { env } from "../../env";
import * as store from "../../integrations/data/convex-store";
import type { DatabaseRecord } from "../../integrations/data/records";
import {
  planCalderBackfill,
  type CalderPatch,
} from "../../domains/ranking/calder-backfill";
import { buildDraftHistoryPicks } from "../../../../src/lib/utils/features/draft-history";

const help = `Recalculate historical draft benchmarks and Calder ratings (production).
Run from scripts/: node --use-system-ca ../node_modules/tsx/dist/cli.mjs src/commands/draft/recalculate-draft-ratings.ts [options]
  --season-id <id>       Restrict to one canonical or legacy season ID.
  --report <path>        JSON report, defaults to ../.local-data/draft-ratings/dry-run.json.
  --apply                Patch only TeamSeasonStatLine.calderRating and calderRk.
  --expect-hash <hash>    Required with --apply; use the reviewed dry-run hash.
  --help                Print help without accessing data.
All started seasons with draft picks and regular-season team rows are included.
Draft slot expectations and over-slot values are calculated, not stored on draft picks.
The report includes every pick's recalculated values and every proposed Calder patch.
No source rows are deleted. Award recipients, other award ratings and power are preserved.`;

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
  store.configureConvexTarget("production");
  const deployment =
    env.CONVEX_DEPLOYMENT?.trim() || env.CONVEX_DEPLOY_KEY?.split("|", 1)[0];
  const url =
    env.CONVEX_PROD_URL ??
    (deployment?.startsWith("prod:")
      ? `https://${deployment.slice(5)}.convex.cloud`
      : "");
  if (!url) throw new Error("Explicit production target required");
  const target = new URL(url).origin;
  console.log(
    JSON.stringify({
      target,
      mode: values.apply ? "apply" : "dry-run",
      scope: values["season-id"] ?? "all started seasons",
      writes: [
        "teamSeasonStatLines.calderRating",
        "teamSeasonStatLines.calderRk",
      ],
    }),
  );
  const [seasons, picks] = await Promise.all([
    store.fetchModel<DatabaseRecord>("Season"),
    store.fetchModel<DatabaseRecord>("DraftPick"),
  ]);
  const selected = seasons
    .filter(
      (season) =>
        (!values["season-id"] ||
          season.id === values["season-id"] ||
          String(season.legacyId) === values["season-id"]) &&
        Date.parse(String(season.startDate)) <= Date.now() &&
        picks.some((pick) => pick.seasonId === season.id),
    )
    .sort((a, b) => Number(a.year) - Number(b.year));
  if (!selected.length) throw new Error("No started seasons matched");
  const nhlRows: DatabaseRecord[] = [];
  for (const season of seasons) {
    if (Date.parse(String(season.startDate)) <= Date.now())
      nhlRows.push(
        ...(await store.fetchAggregateRows<DatabaseRecord>(
          "PlayerNHLStatLine",
          String(season.id),
        )),
      );
  }
  const patches: CalderPatch[] = [];
  const reports = [];
  for (const season of selected) {
    const seasonId = String(season.id);
    const [teams, totals, splits] = await Promise.all([
      store.fetchAggregateRows<DatabaseRecord>("TeamSeasonStatLine", seasonId),
      store.fetchAggregateRows<DatabaseRecord>("PlayerTotalStatLine", seasonId),
      store.fetchAggregateRows<DatabaseRecord>("PlayerSplitStatLine", seasonId),
    ]);
    const draft = picks.filter((pick) => pick.seasonId === season.id);
    if (!teams.some((team) => team.seasonType === "RS")) {
      reports.push({
        seasonId,
        year: season.year,
        skipped: "No regular-season team rows",
      });
      continue;
    }
    const changes = await planCalderBackfill(teams, {
      seasonRows: seasons,
      teamSeasonRows: teams,
      playerTotalRows: totals,
      playerSplitRows: splits,
      playerNhlRows: nhlRows,
      draftPickRows: draft,
    });
    patches.push(...changes);
    const performance = (row: DatabaseRecord) => ({
      playerId: String(row.playerId),
      teamId: String(row.gshlTeamId),
      rating: row.Rating as number | string | null,
      days: row.days as number | string | null,
      position: String(row.posGroup),
    });
    const results = buildDraftHistoryPicks({
      picks: draft.map((pick) => ({
        id: String(pick.id),
        teamId: String(pick.gshlTeamId),
        playerId: pick.playerId ? String(pick.playerId) : null,
        pick: pick.pick as number | string | null,
        round: pick.round as number | string,
        isSigning: pick.isSigning === true || pick.isSigning === "true",
      })),
      teamIds: [...new Set(draft.map((pick) => String(pick.gshlTeamId)))],
      totals: totals.filter((row) => row.seasonType === "RS").map(performance),
      splits: splits.filter((row) => row.seasonType === "RS").map(performance),
      players: [],
    }).map(
      ({
        id,
        playerId,
        pick,
        signing,
        overallRating,
        expectedRating,
        surplus,
      }) => ({
        id,
        playerId,
        pick,
        signing,
        overallRating,
        expectedRating,
        surplus,
      }),
    );
    reports.push({
      seasonId,
      year: season.year,
      picks: results,
      calderChanges: changes.length,
    });
    console.log(
      JSON.stringify({
        year: season.year,
        picks: results.length,
        calderChanges: changes.length,
      }),
    );
  }
  const hash = createHash("sha256")
    .update(JSON.stringify({ target, patches, reports }))
    .digest("hex");
  if (values.apply && hash !== values["expect-hash"])
    throw new Error("Live plan differs from reviewed hash; run a new dry run");
  const reportPath = resolve(
    values.report ?? "../.local-data/draft-ratings/dry-run.json",
  );
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        target,
        hash,
        mode: values.apply ? "apply" : "dry-run",
        patches,
        seasons: reports,
      },
      null,
      2,
    ),
  );
  let updated = 0;
  if (values.apply) {
    updated = await store.updateRowsById(
      "TeamSeasonStatLine",
      patches.map(({ id, data }) => ({ id, data })),
    );
    await writeFile(
      `${reportPath}.applied.json`,
      JSON.stringify(
        { target, hash, updated, completedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
  }
  console.log(
    JSON.stringify({
      target,
      seasons: reports.length,
      proposed: patches.length,
      updated,
      hash,
      reportPath,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Draft recalculation failed",
  );
  process.exitCode = 1;
});
