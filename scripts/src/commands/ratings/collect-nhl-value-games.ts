import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  HockeyDataCache,
  fetchSeasonGames,
  fetchGameSources,
  fetchPenaltyShotHistory,
  prefetchSeasonSupport,
} from "../../integrations/nhl/game-value-source";
import { runGameReconciliation } from "./reconcile-nhl-value-games";

const { values } = parseArgs({
  options: {
    season: { type: "string" },
    cache: { type: "string" },
    output: { type: "string" },
    "game-type": { type: "string", default: "2" },
    "shot-source": { type: "string", default: "nhl" },
    limit: { type: "string" },
    "repair-audit": { type: "string" },
    offline: { type: "boolean" },
    "reconcile-input": { type: "string" },
    "reconcile-output": { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Collect public NHL game/shift/roster data. --season 20242025 --cache <directory> --output <new manifest.json> [--game-type 2|3] [--shot-source nhl|moneypuck] [--limit <games>] [--offline] [--repair-audit <v3 game-audit.json>] [--reconcile-input <v2 root> --reconcile-output <new ledger.json>]. MoneyPuck shot ZIPs are only collected when explicitly selected. Repair mode collects alternate official TOI reports for quarantined games; it does not approve replacements. Batch roster/shift reads, globally throttled requests, bounded retries and persistent hash-verified cache. No database access.",
  );
else {
  if (!values.cache || !values.output)
    throw new Error("--cache and --output required");
  const season = Number(values.season),
    gameType = Number(values["game-type"]);
  if (gameType !== 2 && gameType !== 3) throw new Error("Invalid game type");
  if (!["nhl", "moneypuck"].includes(values["shot-source"]!))
    throw new Error("Invalid shot source");
  const cache = new HockeyDataCache(resolve(values.cache), values.offline);
  if (
    Boolean(values["reconcile-input"]) !== Boolean(values["reconcile-output"])
  )
    throw new Error("Supply both reconciliation paths");
  const reconciliation = values["reconcile-input"]
    ? runGameReconciliation(
        values["reconcile-input"],
        cache,
        values["reconcile-output"]!,
      )
    : Promise.resolve();
  const schedule = await fetchSeasonGames(cache, season, gameType);
  await fetchPenaltyShotHistory(cache, season, gameType);
  const limit = values.limit ? Number(values.limit) : schedule.length;
  if (!Number.isInteger(limit) || limit <= 0)
    throw new Error("Invalid game limit");
  let games = schedule.slice(0, limit);
  if (values["repair-audit"]) {
    if (values.limit)
      throw new Error("Repair scope cannot be combined with --limit");
    const audit = JSON.parse(
      await readFile(resolve(values["repair-audit"]), "utf8"),
    ) as {
      season: number;
      games: Array<{ gameId: number; eligible: boolean }>;
    };
    const ids = new Set(schedule.map((g) => g.id));
    if (
      audit.season !== season ||
      !Array.isArray(audit.games) ||
      audit.games.some(
        (g) => !ids.has(g.gameId) || typeof g.eligible !== "boolean",
      ) ||
      new Set(audit.games.map((g) => g.gameId)).size !== audit.games.length
    )
      throw new Error("Repair audit does not match official season/game scope");
    const targets = new Set(
      audit.games.filter((g) => !g.eligible).map((g) => g.gameId),
    );
    games = schedule.filter((g) => targets.has(g.id));
  }
  if (values["shot-source"] === "moneypuck")
    await cache.bytes(
      `https://peter-tanner.com/moneypuck/downloads/shots_${Math.floor(season / 10000)}.zip`,
    );
  await prefetchSeasonSupport(cache, games);
  let next = 0,
    completed = 0;
  const failed: Array<{ gameId: number; error: string }> = [];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < games.length) {
        const game = games[next++]!;
        try {
          await fetchGameSources(
            cache,
            game.id,
            values["repair-audit"] ? "nhl-toi-report" : undefined,
          );
        } catch (error) {
          failed.push({
            gameId: game.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        completed++;
        if (completed % 50 === 0 || completed === games.length)
          console.log(
            JSON.stringify({
              season,
              completed,
              total: games.length,
              failed: failed.length,
            }),
          );
      }
    }),
  );
  await writeFile(
    resolve(values.output),
    JSON.stringify(
      {
        season,
        gameType,
        shotSource: values["shot-source"],
        completedAt: new Date().toISOString(),
        cache: resolve(values.cache),
        completeSeasonScope: games.length === schedule.length,
        shiftSource: values["repair-audit"] ? "nhl-toi-report" : "automatic",
        games,
        failed,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  await reconciliation;
  if (failed.length) process.exitCode = 1;
}
