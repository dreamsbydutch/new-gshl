import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { reconcileSeasonExposure } from "../../domains/nhl/game-reconciliation";
import { loadVerifiedGame } from "../../domains/nhl/verified-game-source";
import {
  HockeyDataCache,
  fetchSeasonGames,
  fetchGamePlayByPlay,
  fetchPenaltyShotHistory,
  unzipCsv,
} from "../../integrations/nhl/game-value-source";
import {
  parseShotFile,
  extractShotTrainingRows,
  type GameValueData,
  type Shot,
} from "../../domains/nhl/game-value-input";
import {
  chronologicalShotQuality,
  predictShotQuality,
  fitPenaltyShotBaseline,
  type ShotTrainingRow,
} from "../../runtime/nhl-shot-quality";
import {
  chronologicalImpact,
  NHL_ADJUSTED_IMPACT_CONFIG,
} from "../../runtime/nhl-adjusted-impact";
import {
  rankGameSeason,
  type SeasonPlayerReference,
} from "../../runtime/nhl-game-season-value";
import {
  buildNhlRatingInput,
  type NhlRatingSource,
} from "../../domains/nhl/season-rating-input";

const { values } = parseArgs({
  options: {
    season: { type: "string" },
    baseline: { type: "string" },
    cache: { type: "string" },
    output: { type: "string" },
    offline: { type: "boolean", default: true },
    "shot-source": { type: "string", default: "nhl" },
    "allow-partial": { type: "boolean" },
    "prepare-only": { type: "boolean" },
    help: { type: "boolean" },
  },
});
const write = (path: string, data: unknown) =>
  writeFile(path, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
if (values.help)
  console.log(
    "Game-level NHL v3 local preview. --season 20242025 --baseline <v2 report root> --cache <public cache> --output <NEW directory> [--shot-source nhl|moneypuck] [--allow-partial] [--prepare-only]. Prepare-only writes the source audit without fitting impact, for alternate-report repair. Offline by default; collect sources first. NHL shot model has its own chronological validation and provenance. Partial runs are development diagnostics, not complete-season leaderboards. No database writes.",
  );
else {
  if (!values.baseline || !values.cache || !values.output)
    throw new Error("--baseline, --cache, --output required");
  const season = Number(values.season);
  const priorDirectory = resolve(values.baseline, String(season));
  const sourceText = await readFile(
    resolve(priorDirectory, "source.json"),
    "utf8",
  );
  const source = JSON.parse(sourceText) as { nhl: NhlRatingSource };
  const priorText = await readFile(
    resolve(priorDirectory, "ratings.json"),
    "utf8",
  );
  const oldReport = JSON.parse(priorText) as {
    season: number;
    calibration: Record<string, { prior: number }>;
  };
  if (source.nhl.season !== season || oldReport.season !== season)
    throw new Error("Baseline season mismatch");
  const reference: SeasonPlayerReference[] = buildNhlRatingInput(
    source.nhl,
  ).players.filter((p) => p.games > 0 && p.minutes > 0);
  const cache = new HockeyDataCache(resolve(values.cache), values.offline);
  const schedule = await fetchSeasonGames(cache, season, source.nhl.gameType);
  const penaltyShotHistory = await fetchPenaltyShotHistory(
    cache,
    season,
    source.nhl.gameType,
  );
  const penaltyShotModel = fitPenaltyShotBaseline(penaltyShotHistory);
  if (!["nhl", "moneypuck"].includes(values["shot-source"]!))
    throw new Error("Invalid shot source");
  const zip = await cache.bytes(
    `https://peter-tanner.com/moneypuck/downloads/shots_${Math.floor(season / 10000)}.zip`,
  );
  console.log(
    "Parsing public shot probabilities; then reconciling official game identities and shifts.",
  );
  const shots =
    values["shot-source"] === "moneypuck"
      ? parseShotFile(
          unzipCsv(zip, `shots_${Math.floor(season / 10000)}.csv`),
          season,
        )
      : new Map<number, Shot[]>();
  const games: GameValueData[] = [],
    failed: Array<{ gameId: number; error: string }> = [];
  let shotQuality: ReturnType<typeof chronologicalShotQuality> | null = null;
  const training: ShotTrainingRow[] = [];
  const unavailable = new Set<number>();
  if (values["shot-source"] === "nhl") {
    for (const g of schedule) {
      try {
        const rows = extractShotTrainingRows(
          await fetchGamePlayByPlay(cache, g.id),
        );
        if (rows.some((r) => r.gameId !== g.id || r.date !== g.gameDate))
          throw new Error("Shot-training schedule identity mismatch");
        training.push(...rows);
      } catch (error) {
        if (!values["allow-partial"]) throw error;
        unavailable.add(g.id);
        failed.push({
          gameId: g.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    console.log(
      `Training and validating NHL shot quality on ${training.length} official shot events.`,
    );
    shotQuality = chronologicalShotQuality(training);
  }
  const probabilityByGame = new Map<number, Map<number, number>>();
  const gameSourceHashes: Array<{ gameId: number; sha256: string }> = [];
  const shiftReviews: Awaited<ReturnType<typeof loadVerifiedGame>>["review"][] =
    [];
  if (shotQuality)
    for (const r of training) {
      const probabilities =
        probabilityByGame.get(r.gameId) ?? new Map<number, number>();
      probabilities.set(
        r.eventId,
        predictShotQuality(shotQuality.model, r.features),
      );
      probabilityByGame.set(r.gameId, probabilities);
    }
  for (const g of schedule) {
    if (unavailable.has(g.id)) continue;
    try {
      const { sources, game, review } = await loadVerifiedGame(
        cache,
        g.id,
        shots.get(g.id) ?? [],
        shotQuality ? (probabilityByGame.get(g.id) ?? new Map()) : undefined,
        penaltyShotModel.probability,
      );
      if (review.attempted) shiftReviews.push(review);
      gameSourceHashes.push({
        gameId: g.id,
        sha256: createHash("sha256")
          .update(JSON.stringify(sources))
          .digest("hex"),
      });
      if (
        game.date !== g.gameDate ||
        game.homeTeam !== g.homeTeamId ||
        game.awayTeam !== g.visitingTeamId
      )
        throw new Error("Game schedule/source identity mismatch");
      games.push(game);
    } catch (error) {
      if (!values["allow-partial"]) throw error;
      failed.push({
        gameId: g.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if ((games.length + failed.length) % 100 === 0)
      console.log(
        JSON.stringify({
          processed: games.length + failed.length,
          loaded: games.length,
          eligible: games.filter((g) => g.eligible).length,
          failed: failed.length,
        }),
      );
  }
  await mkdir(resolve(values.output));
  // Write the data ledger before fitting so source problems remain reviewable even if fitting fails.
  const attribution =
    values["shot-source"] === "nhl"
      ? "Official NHL events, game reports and shifts; locally fitted nhl-event-xg-v1; MoneyPuck.com historical shrinkage calibration via v2"
      : "Official NHL events, game reports and shifts; MoneyPuck.com shot probabilities";
  await write(resolve(values.output, "game-audit.json"), {
    season,
    attribution,
    officialGames: schedule.length,
    loadedGames: games.length,
    failed,
    gameSourceHashes,
    shiftReviews,
    games: games.map(({ stints, shots, ...game }) => ({
      ...game,
      stints: stints.length,
      verifiedShotCount: shots.length,
      individualOnlyShots: shots.filter(
        (s) => s.attribution === "individual-only",
      ),
      penaltyShots: shots.filter((s) => s.attribution === "penalty-shot"),
    })),
  });
  if (values["prepare-only"]) {
    console.log(
      "Source audit complete; impact fitting skipped for preparation.",
    );
    process.exit(0);
  }
  console.log(
    `Fitting ${games.filter((g) => g.eligible).length} verified games; chronological model selection and untouched test block.`,
  );
  const { model, evaluation } = chronologicalImpact(
    games,
    shotQuality ?? undefined,
  );
  const { ratings, penaltyDiagnostics } = rankGameSeason(
    games,
    model,
    reference,
    oldReport.calibration,
  );
  if (failed.length)
    for (const player of ratings) {
      player.seasonRank = null;
      player.abilityRank = null;
      player.seasonRating = null;
      if (player.status === "rated") player.status = "provisional";
      player.warnings.push(
        "Partial development run: season ranks withheld for every player",
      );
    }
  const verifiedFraction =
    games.filter((g) => g.eligible).length / schedule.length;
  const referenceReconciliation = reconcileSeasonExposure(games, reference);
  const gates = {
    officialSeasonExposureMatches: referenceReconciliation.matches,
    completeDownload: failed.length === 0 && games.length === schedule.length,
    atLeast95PercentGamesVerified: verifiedFraction >= 0.95,
    impactModelsConverged:
      model.converged &&
      evaluation.testModelConverged &&
      evaluation.baselineConverged &&
      evaluation.trials.every((t) => t.converged),
    shotModelsConverged:
      !shotQuality ||
      (shotQuality.model.converged &&
        shotQuality.trials.every((t) => t.converged)),
    atLeast100HeldOutGames: evaluation.model.games >= 100,
    heldOutSituationCoverage:
      evaluation.model.games /
        (evaluation.model.games + evaluation.model.unsupportedGames) >=
      0.95,
    improvesHeldOutXg:
      evaluation.model.xgDifferentialMse !== null &&
      evaluation.situationOnlyBaseline.xgDifferentialMse !== null &&
      evaluation.model.xgDifferentialMse <
        evaluation.situationOnlyBaseline.xgDifferentialMse,
    improvesHeldOutGoals:
      evaluation.model.goalDifferentialMse !== null &&
      evaluation.situationOnlyBaseline.goalDifferentialMse !== null &&
      evaluation.model.goalDifferentialMse <
        evaluation.situationOnlyBaseline.goalDifferentialMse,
    shotModelBeatsConstant:
      !shotQuality ||
      (shotQuality.evaluation.brier !== null &&
        shotQuality.evaluation.baselineBrier !== null &&
        shotQuality.evaluation.brier < shotQuality.evaluation.baselineBrier),
    shotGoalTotalWithin10Percent:
      !shotQuality ||
      (shotQuality.evaluation.actualGoals > 0 &&
        Math.abs(
          shotQuality.evaluation.expectedGoals -
            shotQuality.evaluation.actualGoals,
        ) /
          shotQuality.evaluation.actualGoals <=
          0.1),
  };
  const report = {
    version: NHL_ADJUSTED_IMPACT_CONFIG.version,
    season,
    gameType: source.nhl.gameType,
    config: NHL_ADJUSTED_IMPACT_CONFIG,
    completeSourceScope: !failed.length,
    sourceHash: createHash("sha256").update(sourceText).digest("hex"),
    priorHash: createHash("sha256").update(priorText).digest("hex"),
    penaltyShotHistoryHash: createHash("sha256")
      .update(JSON.stringify(penaltyShotHistory))
      .digest("hex"),
    penaltyShotModel,
    inclusion: {
      policy:
        "All loaded games contribute verified components; full verification remains required for model fitting/evaluation",
      includedGames: games.length,
      fullyVerifiedGames: games.filter((g) => g.eligible).length,
      penaltyShotAttempts: games.reduce(
        (n, g) =>
          n + g.shots.filter((s) => s.attribution === "penalty-shot").length,
        0,
      ),
      individualOnlyAttempts: games.reduce(
        (n, g) =>
          n + g.shots.filter((s) => s.attribution === "individual-only").length,
        0,
      ),
    },
    gameSourcesHash: createHash("sha256")
      .update(JSON.stringify(gameSourceHashes))
      .digest("hex"),
    shotsHash: createHash("sha256").update(zip).digest("hex"),
    attribution,
    qualityGate: {
      gates,
      passes: Object.values(gates).every(Boolean),
      verifiedFraction,
      interpretation:
        "Minimum local review criteria, not proof of causal value or authorization to publish",
    },
    referenceReconciliation,
    shotQuality,
    probabilitySource: values["shot-source"],
    uncertaintyInterpretation:
      "95% game-cluster resampling range conditional on fixed fitted coefficients; not a calibrated total model confidence interval",
    model,
    evaluation,
    ratings,
    penaltyDiagnostics,
  };
  await write(resolve(values.output, "ratings.json"), report);
  const keys = [
    "playerId",
    "name",
    "position",
    "status",
    "games",
    "verifiedGames",
    "includedGames",
    "minutes",
    "modeledMinutes",
    "coverage",
    "seasonValue",
    "observedValue",
    "abilityPer60",
    "seasonRank",
    "abilityRank",
    "seasonRating",
  ] as const;
  await writeFile(
    resolve(values.output, "ratings.csv"),
    [
      keys.join(","),
      ...ratings.map((p) =>
        keys
          .map((key) => `"${String(p[key] ?? "").replaceAll('"', '""')}"`)
          .join(","),
      ),
    ].join("\n") + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      {
        season,
        scope: !failed.length
          ? "complete source season"
          : "PARTIAL DEVELOPMENT RUN",
        loaded: games.length,
        verified: games.filter((g) => g.eligible).length,
        counts: Object.fromEntries(
          ["rated", "provisional", "incomplete"].map((status) => [
            status,
            ratings.filter((p) => p.status === status).length,
          ]),
        ),
        evaluation,
      },
      null,
      2,
    ),
  );
}
