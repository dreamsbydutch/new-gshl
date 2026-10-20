import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  HockeyDataCache,
  fetchSeasonGames,
  fetchGamePlayByPlay,
  fetchPenaltyShotHistory,
  fetchSeasonPenaltyShotGames,
} from "../../integrations/nhl/game-value-source";
import { loadVerifiedGame } from "../../domains/nhl/verified-game-source";
import {
  extractShotTrainingRows,
  type GameValueData,
} from "../../domains/nhl/game-value-input";
import { penaltyShotGameMatches } from "../../domains/nhl/official-penalty-shot-report";
import { summarizeGameAudit } from "../../domains/nhl/game-value-audit";
import { reconcileSeasonExposure } from "../../domains/nhl/game-reconciliation";
import { buildNhlRatingInput } from "../../domains/nhl/season-rating-input";
import {
  fitPenaltyShotBaseline,
  type ShotTrainingRow,
} from "../../runtime/nhl-shot-quality";
import type { RetrospectiveSourceManifest } from "../../integrations/nhl/retrospective-value-context";

const { values } = parseArgs({
  options: {
    season: { type: "string" },
    "game-type": { type: "string", default: "2" },
    baseline: { type: "string" },
    cache: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
if (values.help)
  console.log(
    "Offline retrospective source-only preparation. --season <YYYYYYYY> --baseline <canonical v2 root> --cache <complete NHL cache> --output <NEW directory> [--game-type 2|3]. Writes real shot rows, physical audit, exact source hashes, canonical reference/prior bindings and independent past-season penalty-shot prior. No ordinary shot/impact fit, accuracy evaluation, player scores, network or database writes. Ineligible games remain explicit repair targets; all source gates must pass before valuation.",
  );
else {
  if (!values.season || !values.baseline || !values.cache || !values.output)
    throw new Error("--season, --baseline, --cache and --output required");
  const season = Number(values.season),
    gameType = Number(values["game-type"]);
  if (
    !Number.isInteger(season) ||
    Math.floor(season / 10000) + 1 !== season % 10000 ||
    (gameType !== 2 && gameType !== 3)
  )
    throw new Error("Invalid source scope");
  const codeHashes = await Promise.all(
    [
      "scripts/src/commands/ratings/prepare-nhl-retrospective-source.ts",
      "scripts/src/integrations/nhl/game-value-source.ts",
      "scripts/src/domains/nhl/game-value-input.ts",
      "scripts/src/domains/nhl/verified-game-source.ts",
      "scripts/src/domains/nhl/game-reconciliation.ts",
      "scripts/src/runtime/nhl-shot-quality.ts",
    ].map(async (path) => ({
      path,
      sha256: hash(await readFile(path, "utf8")),
    })),
  );
  const cache = new HockeyDataCache(resolve(values.cache), true);
  const schedule = await fetchSeasonGames(cache, season, gameType);
  if (!schedule.length) throw new Error("No complete games in cached scope");
  const sourceText = await readFile(
    resolve(values.baseline, String(season), "source.json"),
    "utf8",
  );
  const priorText = await readFile(
    resolve(values.baseline, String(season), "ratings.json"),
    "utf8",
  );
  const canonical = JSON.parse(sourceText) as {
    nhl: Parameters<typeof buildNhlRatingInput>[0];
  };
  if (canonical.nhl.season !== season || canonical.nhl.gameType !== gameType)
    throw new Error("Canonical source scope differs");
  const reference = buildNhlRatingInput(canonical.nhl).players.filter(
    (p) => p.games > 0 && p.minutes > 0,
  );
  const history = await fetchPenaltyShotHistory(cache, season, gameType);
  const penaltyShotModel = fitPenaltyShotBaseline(history);
  const penaltyShotGames = await fetchSeasonPenaltyShotGames(
    cache,
    season,
    gameType,
  );
  const rows: ShotTrainingRow[] = [],
    games: GameValueData[] = [];
  const gameSourceHashes: Array<{ gameId: number; sha256: string }> = [];
  const effectiveGameSourceHashes: Array<{
    gameId: number;
    sha256: string;
    shots: number;
  }> = [];
  const shiftReviews = [];
  const seen = new Set<string>();
  for (const entry of schedule) {
    const pbp = await fetchGamePlayByPlay(cache, entry.id);
    if (
      !penaltyShotGameMatches(
        pbp,
        penaltyShotGames.rows.filter((p) => p.gameId === entry.id),
      )
    )
      throw new Error(`Penalty-shot reconciliation missing for ${entry.id}`);
    const extracted = extractShotTrainingRows(pbp);
    for (const row of extracted) {
      const key = `${row.gameId}:${row.eventId}`;
      if (
        row.gameId !== entry.id ||
        row.date !== entry.gameDate ||
        seen.has(key)
      )
        throw new Error("Shot scope or identity conflict");
      seen.add(key);
    }
    rows.push(...extracted);
    effectiveGameSourceHashes.push({
      gameId: entry.id,
      sha256: hash(JSON.stringify(pbp)),
      shots: extracted.length,
    });
    // Ordinary-shot constants only establish physical source presence. These
    // placeholders are never retained in rows or used to value a player.
    const presence = new Map(extracted.map((row) => [row.eventId, 0]));
    const loaded = await loadVerifiedGame(
      cache,
      entry.id,
      [],
      presence,
      penaltyShotModel.probability,
    );
    if (
      loaded.game.date !== entry.gameDate ||
      loaded.game.homeTeam !== entry.homeTeamId ||
      loaded.game.awayTeam !== entry.visitingTeamId
    )
      throw new Error("Game schedule identity differs");
    games.push(loaded.game);
    gameSourceHashes.push({
      gameId: entry.id,
      sha256: hash(JSON.stringify(loaded.sources)),
    });
    if (loaded.review.attempted) shiftReviews.push(loaded.review);
    if (games.length % 200 === 0)
      console.log(
        JSON.stringify({
          loadedGames: games.length,
          eligible: games.filter((g) => g.eligible).length,
        }),
      );
  }
  const reconciliation = reconcileSeasonExposure(games, reference);
  const sum = (key: "gameSeconds" | "usableProcessSeconds" | "officialShots") =>
    games.reduce((n, g) => n + g[key], 0);
  const officialSeconds = sum("gameSeconds"),
    usableSeconds = sum("usableProcessSeconds"),
    officialShots = sum("officialShots"),
    verifiedShots = games.reduce((n, g) => n + g.shots.length, 0);
  const sourceGates = {
    officialSeasonExposureMatches: reconciliation.matches,
    completeDownload: games.length === schedule.length,
    atLeast98PercentProcessExposureVerified:
      officialSeconds > 0 && usableSeconds / officialSeconds >= 0.98,
    atLeast98PercentIndividualShotsVerified:
      officialShots > 0 && verifiedShots / officialShots >= 0.98,
  };
  const rowsObject = {
    season,
    gameType,
    offlineOnly: true,
    completedScheduleGames: schedule.length,
    scheduleSha256: hash(JSON.stringify(schedule)),
    penaltyShotReportSha256: hash(JSON.stringify(penaltyShotGames)),
    rowsSha256: hash(JSON.stringify(rows)),
    effectiveGameSourceHashes,
    rows,
  };
  const rowsText = JSON.stringify(rowsObject, null, 2) + "\n";
  const auditText =
    JSON.stringify(
      {
        season,
        officialGames: schedule.length,
        loadedGames: games.length,
        failed: [],
        interpretation:
          "Source-only presence/physical audit; no ordinary shot model, valuation or accuracy diagnostics.",
        codeHashes,
        gameSourceHashes,
        sourceGates,
        referenceReconciliation: reconciliation,
        coverage: {
          officialSeconds,
          usableSeconds,
          officialShots,
          verifiedShots,
        },
        shiftReviews,
        games: games.map((game) => {
          const { penaltyShots: _omittedOutcomes, ...summary } =
            summarizeGameAudit(game);
          return summary;
        }),
      },
      null,
      2,
    ) + "\n";
  const manifest: RetrospectiveSourceManifest = {
    version: "nhl-retrospective-source-manifest-v1",
    publishable: false,
    season,
    gameType,
    officialTeamCount: new Set(
      schedule.flatMap((g) => [g.homeTeamId, g.visitingTeamId]),
    ).size,
    officialGames: schedule.length,
    loadedGames: games.length,
    canonicalSourceSha256: hash(sourceText),
    abilityPriorsSha256: hash(priorText),
    gameSourcesHash: hash(JSON.stringify(gameSourceHashes)),
    gameSourceHashes,
    rowsSha256: rowsObject.rowsSha256,
    rowsFileSha256: hash(rowsText),
    scheduleSha256: rowsObject.scheduleSha256,
    penaltyShotModel,
    penaltyShotHistorySha256: hash(JSON.stringify(history)),
    penaltyShotReportSha256: rowsObject.penaltyShotReportSha256,
    sourceGates,
    passesSourceGates: Object.values(sourceGates).every(Boolean),
    sourceAuditSha256: hash(auditText),
    sourcePreparationCodeHashes: codeHashes,
  };
  for (const entry of codeHashes)
    if (hash(await readFile(entry.path, "utf8")) !== entry.sha256)
      throw new Error("Source code changed during preparation");
  const output = resolve(values.output);
  await mkdir(output);
  const save = (name: string, data: unknown) =>
    writeFile(resolve(output, name), JSON.stringify(data, null, 2) + "\n", {
      flag: "wx",
    });
  await writeFile(resolve(output, "shot-rows.json"), rowsText, { flag: "wx" });
  await save("source-manifest.json", manifest);
  await writeFile(resolve(output, "game-audit.json"), auditText, {
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      output,
      sourceGates,
      shots: rows.length,
      loadedGames: games.length,
      eligible: games.filter((g) => g.eligible).length,
      repairTargets: games.filter((g) => !g.eligible).length,
    }),
  );
  if (!manifest.passesSourceGates) process.exitCode = 1;
}
