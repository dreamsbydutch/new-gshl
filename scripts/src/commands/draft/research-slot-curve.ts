import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { env } from "../../env";
import * as store from "../../integrations/data/convex-store";
import {
  analyzeDraftHistory,
  type DraftResearchSource,
} from "../../domains/ranking/draft-slot-research";

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      cached: { type: "boolean" },
      output: { type: "string" },
    },
  });
  if (values.help) {
    console.log(
      "Read-only production draft curve research. --cached reuses local source; --output <directory> defaults to ../.local-data/draft-slot-research. No mutations.",
    );
    return;
  }
  const directory = resolve(
    values.output ?? "../.local-data/draft-slot-research",
  );
  const sourcePath = resolve(directory, "source.json");
  let source: DraftResearchSource;
  if (values.cached)
    source = JSON.parse(
      await readFile(sourcePath, "utf8"),
    ) as DraftResearchSource;
  else {
    store.configureConvexTarget("production");
    const deployment = env.CONVEX_DEPLOYMENT?.startsWith("prod:")
      ? env.CONVEX_DEPLOYMENT.trim()
      : env.CONVEX_DEPLOY_KEY?.split("|", 1)[0]?.trim();
    const url =
      env.CONVEX_PROD_URL ??
      (deployment?.startsWith("prod:")
        ? `https://${deployment.slice(5)}.convex.cloud`
        : "");
    const target = new URL(url).origin;
    env.CONVEX_PROD_URL = target;
    console.log(
      JSON.stringify({
        target,
        mode: "read-only",
        scope: "all configured seasons",
      }),
    );
    const [seasonRows, draftPickRows] = await Promise.all([
      store.fetchModel("Season"),
      store.fetchModel("DraftPick"),
    ]);
    source = {
      target,
      fetchedAt: new Date().toISOString(),
      seasonRows,
      draftPickRows,
      playerTotalRows: [],
      playerSplitRows: [],
      playerNhlRows: [],
      teamSeasonRows: [],
    };
    for (const season of seasonRows) {
      const seasonId = String(season.id);
      const [totals, splits, nhl, teams] = await Promise.all([
        store.fetchAggregateRows("PlayerTotalStatLine", seasonId),
        store.fetchAggregateRows("PlayerSplitStatLine", seasonId),
        store.fetchAggregateRows("PlayerNHLStatLine", seasonId),
        store.fetchAggregateRows("TeamSeasonStatLine", seasonId),
      ]);
      source.playerTotalRows.push(...totals);
      source.playerSplitRows.push(...splits);
      source.playerNhlRows.push(...nhl);
      source.teamSeasonRows.push(...teams);
      console.log(
        JSON.stringify({
          season: season.year,
          totals: totals.length,
          splits: splits.length,
          nhl: nhl.length,
          teams: teams.length,
        }),
      );
    }
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, JSON.stringify(source, null, 2));
  }
  const result = analyzeDraftHistory(source);
  await writeFile(
    resolve(directory, "analysis.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Research failed");
  process.exitCode = 1;
});
