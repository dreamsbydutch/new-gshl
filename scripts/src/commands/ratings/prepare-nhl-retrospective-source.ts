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
  withOfficialOnGoalAttempts,
  countObservedSkaterOnGoalAttempts,
  summarizeOfficialSourceCoverage,
  summarizeOfficialOnGoalCoverage,
} from "../../domains/nhl/official-on-goal-coverage";
import {
  withOfficialSkaterGoals,
  summarizeOfficialGoalCoverage,
} from "../../domains/nhl/official-goal-coverage";
import { withReviewedOnGoalClassifications } from "../../integrations/nhl/official-on-goal-classification-source";
import {
  fitPenaltyShotBaseline,
  type ShotTrainingRow,
} from "../../runtime/nhl-shot-quality";
import type {
  RetrospectiveSourceManifest,
  ShotTrainingSupport,
} from "../../integrations/nhl/retrospective-value-context";
import type { ShiftAvailability } from "../../domains/nhl/unavailable-shift-proof";
import type { GameSourceBundle } from "../../integrations/nhl/game-value-source";
import type { OfficialPenaltyContextSourceProof } from "../../integrations/nhl/official-penalty-context-source";

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
      "scripts/src/domains/nhl/official-on-goal-coverage.ts",
      "scripts/src/domains/nhl/official-goal-coverage.ts",
      "scripts/src/domains/nhl/official-on-goal-classification.ts",
      "scripts/src/integrations/nhl/official-on-goal-classification-source.ts",
      "scripts/src/domains/nhl/official-shot-credit-reconciliation.ts",
      "scripts/src/integrations/nhl/official-shot-credit-source.ts",
      "scripts/src/domains/nhl/official-primary-event-recovery.ts",
      "scripts/src/integrations/nhl/official-primary-event-source.ts",
      "scripts/src/domains/nhl/reviewed-event-source-availability.ts",
      "scripts/src/integrations/nhl/reviewed-event-source-availability-source.ts",
      "scripts/src/domains/nhl/reviewed-2008-shot-credit.ts",
      "scripts/src/integrations/nhl/reviewed-2008-shot-credit-source.ts",
      "scripts/src/domains/nhl/verified-game-source.ts",
      "scripts/src/domains/nhl/official-penalty-context.ts",
      "scripts/src/integrations/nhl/official-penalty-context-source.ts",
      "scripts/src/domains/nhl/official-shift-report.ts",
      "scripts/src/domains/nhl/unavailable-shift-proof.ts",
      "scripts/src/integrations/nhl/unavailable-shift-source.ts",
      "scripts/src/domains/nhl/official-game-clock.ts",
      "scripts/src/domains/nhl/boundary-shift-reconciliation.ts",
      "scripts/src/domains/nhl/boundary-shift-2008-cases.ts",
      "scripts/src/integrations/nhl/boundary-shift-source.ts",
      "scripts/src/domains/nhl/official-penalty-shot-report.ts",
      "scripts/src/domains/nhl/official-penalty-shot-context.ts",
      "scripts/src/domains/nhl/official-missing-penalty-shot.ts",
      "scripts/src/integrations/nhl/official-penalty-shot-context-source.ts",
      "scripts/src/domains/nhl/official-empty-net-report.ts",
      "scripts/src/domains/nhl/historical-shot-source-bridge.ts",
      "scripts/src/domains/nhl/historical-shot-type-alignment.ts",
      "scripts/src/domains/nhl/reviewed-paired-penalty-shot-source.ts",
      "scripts/src/domains/nhl/reviewed-gs-penalty-source.ts",
      "scripts/src/domains/nhl/reviewed-report-only-penalty-shot-award.ts",
      "scripts/src/domains/nhl/historical-penalty-alignment.ts",
      "scripts/src/domains/nhl/missing-native-shot-source.ts",
      "scripts/src/integrations/nhl/historical-shot-source.ts",
      "scripts/src/domains/nhl/game-value-audit.ts",
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
  const allReference = await withReviewedOnGoalClassifications(
    cache,
    season,
    withOfficialOnGoalAttempts(
      withOfficialSkaterGoals(
        buildNhlRatingInput(canonical.nhl).players,
        canonical.nhl,
      ),
      canonical.nhl,
    ),
  );
  const reference = allReference.filter((p) => p.games > 0 && p.minutes > 0);
  let observedOnGoalAttempts = 0;
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
  const penaltyContextRecoveries: Array<
    OfficialPenaltyContextSourceProof & { sourcesSha256: string }
  > = [];
  const unavailableShiftSources: ShiftAvailability[] = [];
  const reviewedShiftRecoveries: Array<
    NonNullable<GameSourceBundle["shiftRecovery"]>
  > = [];
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
    observedOnGoalAttempts += countObservedSkaterOnGoalAttempts(pbp);
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
    if (
      "shiftAvailability" in loaded.sources &&
      loaded.sources.shiftAvailability
    )
      unavailableShiftSources.push(loaded.sources.shiftAvailability);
    if (loaded.sources.shiftRecovery)
      reviewedShiftRecoveries.push(loaded.sources.shiftRecovery);
    const sourcesSha256 = hash(JSON.stringify(loaded.sources));
    if (loaded.sources.penaltyContextRecovery)
      penaltyContextRecoveries.push({
        ...loaded.sources.penaltyContextRecovery,
        sourcesSha256,
      });
    gameSourceHashes.push({
      gameId: entry.id,
      sha256: sourcesSha256,
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
  // Invoke the exact preview canonical ledgers before authorizing any fitting.
  // Global exposure can hide one player's surplus behind another's deficit.
  const officialGoalCoverage = summarizeOfficialGoalCoverage(games, reference);
  const officialOnGoalCoverage = summarizeOfficialOnGoalCoverage(
    games,
    reference,
  );
  const reconciliation = reconcileSeasonExposure(games, reference);
  const globalSourceCoverage = summarizeOfficialSourceCoverage(
    games,
    allReference,
    canonical.nhl,
    observedOnGoalAttempts,
    {
      officialGames: schedule.length,
      officialSeasonExposureMatches: reconciliation.matches,
    },
  );
  const { officialSeconds, usableSeconds, officialShots, verifiedShots } =
    globalSourceCoverage.coverage;
  const {
    rawObservedAttempts,
    officialSkaterOnGoalAttempts,
    reviewedPrimaryLabelExcess,
    absentOnGoalAttemptsLowerBound,
  } = globalSourceCoverage.onGoalAccounting;
  const sourceGates = globalSourceCoverage.sourceGates;
  const trainingSupport: ShotTrainingSupport = {
    version: "nhl-shot-training-support-v1",
    games: games.map((game, index) => {
      const official = schedule[index]!,
        source = gameSourceHashes[index]!,
        effective = effectiveGameSourceHashes[index]!;
      if (
        game.gameId !== official.id ||
        source.gameId !== official.id ||
        effective.gameId !== official.id ||
        game.date !== official.gameDate ||
        (effective.shots === 0 && (game.eligible || game.shots.length !== 0))
      )
        throw new Error(
          "Training support does not match the official physical source audit",
        );
      return {
        gameId: official.id,
        date: official.gameDate,
        sourceSha256: source.sha256,
        effectivePbpSha256: effective.sha256,
        trainingRows: effective.shots,
        disposition:
          effective.shots > 0 ? "included" : "zero-verified-ordinary-events",
      };
    }),
  };
  const rowsObject = {
    season,
    gameType,
    offlineOnly: true,
    completedScheduleGames: schedule.length,
    completedSchedule: schedule,
    scheduleSha256: hash(JSON.stringify(schedule)),
    penaltyShotReportSha256: hash(JSON.stringify(penaltyShotGames)),
    rowsSha256: hash(JSON.stringify(rows)),
    effectiveGameSourceHashes,
    trainingSupport,
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
        officialGoalCoverage,
        officialOnGoalCoverage,
        trainingSupport,
        referenceReconciliation: reconciliation,
        coverage: {
          officialSeconds,
          usableSeconds,
          officialShots,
          rawObservedAttempts,
          observedOnGoalAttempts,
          officialSkaterOnGoalAttempts,
          reviewedPrimaryLabelExcess,
          absentOnGoalAttemptsLowerBound,
          verifiedShots,
        },
        shiftReviews,
        ...(penaltyContextRecoveries.length
          ? { penaltyContextRecoveries }
          : {}),
        ...(unavailableShiftSources.length ? { unavailableShiftSources } : {}),
        ...(reviewedShiftRecoveries.length ? { reviewedShiftRecoveries } : {}),
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
    trainingSupport,
    penaltyShotModel,
    penaltyShotHistorySha256: hash(JSON.stringify(history)),
    penaltyShotReportSha256: rowsObject.penaltyShotReportSha256,
    sourceGates,
    passesSourceGates: Object.values(sourceGates).every(Boolean),
    sourceAuditSha256: hash(auditText),
    sourcePreparationCodeHashes: codeHashes,
    ...(unavailableShiftSources.length ? { unavailableShiftSources } : {}),
    ...(reviewedShiftRecoveries.length ? { reviewedShiftRecoveries } : {}),
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
