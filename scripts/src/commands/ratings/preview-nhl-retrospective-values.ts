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
import { loadAuditedRetrospectiveShots } from "../../integrations/nhl/retrospective-shot-source";
import { loadRetrospectiveValueContext } from "../../integrations/nhl/retrospective-value-context";
import {
  buildGameValueData,
  extractShotTrainingRows,
  type GameValueData,
} from "../../domains/nhl/game-value-input";
import { summarizeGameAudit } from "../../domains/nhl/game-value-audit";
import { reconcileSeasonExposure } from "../../domains/nhl/game-reconciliation";
import { buildNhlRatingInput } from "../../domains/nhl/season-rating-input";
import { fitAdjustedImpact } from "../../runtime/nhl-adjusted-impact";
import {
  predictShotQuality,
  fitPenaltyShotBaseline,
  type ShotTrainingRow,
} from "../../runtime/nhl-shot-quality";
import {
  rankGameSeason,
  type GameSeasonRating,
} from "../../runtime/nhl-game-season-value";
import { rankNhlReplacementPreview } from "../../runtime/nhl-overall-rating";

const { values } = parseArgs({
  options: {
    report: { type: "string" },
    "source-manifest": { type: "string" },
    policy: { type: "string" },
    baseline: { type: "string" },
    cache: { type: "string" },
    oof: { type: "string" },
    rows: { type: "string" },
    "chronological-impact": { type: "string" },
    output: { type: "string" },
    "prepare-only": { type: "boolean" },
    help: { type: "boolean" },
  },
});
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const residualAccounting = (games: GameValueData[]) => {
  const totals = {
    guardedNet: { shots: 0, finishing: 0, saving: 0, maximumPairError: 0 },
    emptyNet: { shots: 0, finishing: 0, saving: 0 },
    penaltyShot: { shots: 0, finishing: 0, saving: 0, maximumPairError: 0 },
  };
  for (const game of games)
    for (const shot of game.shots) {
      const finishing = Number(shot.kind === "GOAL") - shot.xg;
      const saving = shot.goalie ? -finishing : 0;
      const bucket =
        shot.attribution === "penalty-shot"
          ? totals.penaltyShot
          : shot.goalie
            ? totals.guardedNet
            : totals.emptyNet;
      bucket.shots++;
      bucket.finishing += finishing;
      bucket.saving += saving;
      if (
        "maximumPairError" in bucket &&
        typeof bucket.maximumPairError === "number"
      )
        bucket.maximumPairError = Math.max(
          bucket.maximumPairError,
          Math.abs(finishing + saving),
        );
    }
  if (
    totals.guardedNet.maximumPairError > 1e-12 ||
    totals.penaltyShot.maximumPairError > 1e-12
  )
    throw new Error("Attributed finishing/saving residuals do not cancel");
  return totals;
};

/** Compare stored ranker credit with a separately accumulated raw-event ledger. */
const reconcileRankedResiduals = (
  games: GameValueData[],
  ratings: GameSeasonRating[],
) => {
  const expected = new Map<number, { finishing: number; saving: number }>();
  const entry = (id: number) => {
    let value = expected.get(id);
    if (!value) {
      value = { finishing: 0, saving: 0 };
      expected.set(id, value);
    }
    return value;
  };
  for (const game of games)
    for (const shot of game.shots) {
      entry(shot.shooter).finishing += Number(shot.kind === "GOAL") - shot.xg;
      if (shot.goalie)
        entry(shot.goalie).saving += shot.xg - Number(shot.kind === "GOAL");
    }
  let maximumPlayerError = 0;
  const sums = {
    expectedFinishing: 0,
    expectedSaving: 0,
    storedFinishing: 0,
    storedSaving: 0,
  };
  const identities = new Set<number>();
  for (const player of ratings) {
    if (identities.has(player.playerId))
      throw new Error("Duplicate ranked identity");
    identities.add(player.playerId);
    const value = expected.get(player.playerId) ?? { finishing: 0, saving: 0 };
    for (const component of ["finishing", "saving"] as const) {
      const error = Math.abs(value[component] - player.components[component]);
      if (!Number.isFinite(error) || error > 0.000050001)
        throw new Error(
          `Stored ${component} differs from raw events for ${player.playerId}`,
        );
      maximumPlayerError = Math.max(maximumPlayerError, error);
    }
    sums.expectedFinishing += value.finishing;
    sums.expectedSaving += value.saving;
    sums.storedFinishing += player.components.finishing;
    sums.storedSaving += player.components.saving;
  }
  const unrepresentedEventPlayers = [...expected]
    .filter(([id]) => !identities.has(id))
    .map(([playerId, value]) => ({ playerId, ...value }));
  if (unrepresentedEventPlayers.length)
    throw new Error(
      "Event credit belongs to a player outside season population",
    );
  const aggregateRoundingBound = ratings.length * 0.000050001;
  if (
    Math.abs(sums.storedFinishing - sums.expectedFinishing) >
      aggregateRoundingBound ||
    Math.abs(sums.storedSaving - sums.expectedSaving) > aggregateRoundingBound
  )
    throw new Error("Aggregate residual credit exceeds storage rounding bound");
  return {
    passed: true,
    playersIncludingProvisional: ratings.length,
    maximumPlayerError,
    perPlayerRoundingTolerance: 0.000050001,
    aggregateRoundingBound,
    sums,
    unrepresentedEventPlayers,
    eventPartition: residualAccounting(games),
    interpretation:
      "Actual stored credit reconciles per player to raw verified events, including provisional players. Empty-net finishing is separate. Unverified events are not imputed. Four-decimal storage rounding is bounded.",
  };
};

if (values.help)
  console.log(
    "Offline retrospective crossfit season values. --report <passing v3 directory> --baseline <v2 root> --cache <complete NHL cache> --oof <crossfit directory> --rows <hash-bound all-shot rows.json> --chronological-impact <saved nonlinear impact analysis.json> --output <NEW directory> [--prepare-only]. Independently audits every fold/model/held-out probability and exact original sources before two full-season fits. Alternatively --source-manifest <source-only manifest.json> --policy <SEALED protocol.md> replaces --report/--chronological-impact and fixes lambda 4 in both arms. No fabricated baseline or forward selection. Research only, not publishable; no network/database writes.",
  );
else {
  if (
    !values.baseline ||
    !values.cache ||
    !values.oof ||
    !values.rows ||
    !values.output
  )
    throw new Error(
      "All input paths and a new --output directory are required",
    );
  const codeHashCaptureStartedAt = new Date().toISOString();
  const codeHashes = await Promise.all(
    [
      "scripts/src/commands/ratings/preview-nhl-retrospective-values.ts",
      "scripts/src/integrations/nhl/retrospective-shot-source.ts",
      "scripts/src/integrations/nhl/retrospective-value-context.ts",
      "scripts/src/integrations/nhl/game-value-source.ts",
      "scripts/src/domains/nhl/game-value-input.ts",
      "scripts/src/domains/nhl/verified-game-source.ts",
      "scripts/src/runtime/nhl-adjusted-impact.ts",
      "scripts/src/runtime/nhl-shot-quality.ts",
      "scripts/src/runtime/nhl-shot-nonlinear.ts",
      "scripts/src/runtime/nhl-impact-breakdown.ts",
      "scripts/src/runtime/nhl-game-season-value.ts",
      "scripts/src/runtime/nhl-overall-rating.ts",
    ].map(async (path) => ({
      path,
      sha256: hash(await readFile(path, "utf8")),
    })),
  );
  const verifyCodeSnapshot = async () => {
    for (const entry of codeHashes)
      if (hash(await readFile(entry.path, "utf8")) !== entry.sha256)
        throw new Error(
          `Calculation code changed during retrospective preview: ${entry.path}`,
        );
  };
  const context = await loadRetrospectiveValueContext({
    report: values.report,
    sourceManifest: values["source-manifest"],
    chronologicalImpact: values["chronological-impact"],
    policy: values.policy,
    baseline: values.baseline,
  });
  const oof = await loadAuditedRetrospectiveShots(
    resolve(values.oof),
    resolve(values.rows),
  );
  if (
    oof.source.season !== context.season ||
    oof.source.gameType !== context.gameType
  )
    throw new Error("Crossfit season or game type differs");
  if (context.manifest) {
    if (
      oof.analysis.sourceOnly !== true ||
      oof.analysis.sourceMetadataSha256 !==
        context.provenance.sourceManifestSha256 ||
      oof.analysis.policySha256 !== context.policySha256 ||
      oof.audit.sourceRowsFileSha256 !== context.manifest.rowsFileSha256 ||
      oof.source.rowsSha256 !== context.manifest.rowsSha256
    )
      throw new Error(
        "Source-only crossfit input/metadata/sealed policy bindings differ",
      );
  }
  const { sourceText, priorText, lambdas } = context;
  if (Object.values(lambdas).some((x) => !Number.isFinite(x) || x <= 0))
    throw new Error("Invalid fixed lambda");
  const source = JSON.parse(sourceText) as {
    nhl: Parameters<typeof buildNhlRatingInput>[0];
  };
  if (
    source.nhl.season !== context.season ||
    source.nhl.gameType !== context.gameType
  )
    throw new Error(
      "Canonical official source season/game type differs from valuation context",
    );
  const priors = JSON.parse(priorText) as {
    calibration: Record<string, { prior: number }>;
  };
  const frozenRatings = context.frozen;
  const reference = buildNhlRatingInput(source.nhl).players.filter(
    (p) => p.games > 0 && p.minutes > 0,
  );
  const cache = new HockeyDataCache(resolve(values.cache), true);
  const schedule = await fetchSeasonGames(
    cache,
    context.season,
    context.gameType,
  );
  if (context.manifest) {
    const history = await fetchPenaltyShotHistory(
      cache,
      context.season,
      context.gameType,
    );
    const penaltyShotReport = await fetchSeasonPenaltyShotGames(
      cache,
      context.season,
      context.gameType,
    );
    if (
      hash(JSON.stringify(schedule)) !== context.manifest.scheduleSha256 ||
      hash(JSON.stringify(history)) !==
        context.manifest.penaltyShotHistorySha256 ||
      JSON.stringify(fitPenaltyShotBaseline(history)) !==
        JSON.stringify(context.manifest.penaltyShotModel) ||
      hash(JSON.stringify(penaltyShotReport)) !==
        context.manifest.penaltyShotReportSha256
    )
      throw new Error(
        "Cached schedule or independent penalty-shot prior/report differs from source manifest",
      );
  }
  const teams = new Set(
    schedule.flatMap((g) => [g.homeTeamId, g.visitingTeamId]),
  ).size;
  const expected = new Map(
    context.gameSourceHashes.map((g) => [g.gameId, g.sha256]),
  );
  if (
    schedule.length !== context.officialGames ||
    expected.size !== schedule.length ||
    teams !== context.officialTeamCount
  )
    throw new Error("Official schedule scope differs");
  const predictions = new Map(
    oof.predictions.map((p) => [`${p.gameId}:${p.eventId}`, p]),
  );
  const glmGames: GameValueData[] = [],
    gbGames: GameValueData[] = [],
    allRows: ShotTrainingRow[] = [];
  for (const scheduled of schedule) {
    const pbp = await fetchGamePlayByPlay(cache, scheduled.id);
    const rows = extractShotTrainingRows(pbp);
    allRows.push(...rows);
    const old = new Map<number, number>(),
      glm = new Map<number, number>(),
      gb = new Map<number, number>();
    for (const row of rows) {
      const prediction = predictions.get(`${row.gameId}:${row.eventId}`);
      if (
        !prediction ||
        row.gameId !== scheduled.id ||
        row.date !== scheduled.gameDate ||
        prediction.date !== row.date ||
        prediction.goal !== row.goal
      )
        throw new Error("Missing or mismatched crossfit event");
      old.set(
        row.eventId,
        context.original
          ? predictShotQuality(context.original.shotQuality.model, row.features)
          : 0,
      );
      glm.set(row.eventId, prediction.baseline);
      gb.set(row.eventId, prediction.candidate);
    }
    const loaded = await loadVerifiedGame(
      cache,
      scheduled.id,
      [],
      old,
      context.penaltyShotModel.probability,
    );
    if (hash(JSON.stringify(loaded.sources)) !== expected.get(scheduled.id))
      throw new Error(`Original sources differ for ${scheduled.id}`);
    for (const [probabilities, target, label] of [
      [glm, glmGames, "nhl-event-xg-crossfit-glm-v1"],
      [gb, gbGames, "nhl-event-xg-crossfit-gb-v1"],
    ] as const) {
      const game = buildGameValueData(
        loaded.sources,
        [],
        probabilities,
        context.penaltyShotModel.probability,
      );
      for (const shot of game.shots)
        if (shot.attribution !== "penalty-shot") shot.probabilitySource = label;
      if (
        JSON.stringify(summarizeGameAudit(game)) !==
        JSON.stringify(summarizeGameAudit(loaded.game))
      )
        throw new Error(
          "Crossfit labels changed source eligibility or attribution",
        );
      target.push(game);
    }
    if (glmGames.length % 300 === 0)
      console.log(
        `Verified retrospective source games ${glmGames.length}/${schedule.length}`,
      );
  }
  if (
    hash(JSON.stringify(allRows)) !== oof.source.rowsSha256 ||
    allRows.length !== predictions.size
  )
    throw new Error(
      "Reconstructed event rows differ from audited crossfit rows",
    );
  const reconciliation = reconcileSeasonExposure(glmGames, reference);
  const officialSeconds = glmGames.reduce((sum, g) => sum + g.gameSeconds, 0);
  const usableSeconds = glmGames.reduce(
    (sum, g) => sum + g.usableProcessSeconds,
    0,
  );
  const officialShots = glmGames.reduce((sum, g) => sum + g.officialShots, 0);
  const verifiedShots = glmGames.reduce((sum, g) => sum + g.shots.length, 0);
  const sourceGates = {
    officialSeasonExposureMatches: reconciliation.matches,
    completeDownload: glmGames.length === schedule.length,
    atLeast98PercentProcessExposureVerified:
      usableSeconds / officialSeconds >= 0.98,
    atLeast98PercentIndividualShotsVerified:
      verifiedShots / officialShots >= 0.98,
  };
  if (!Object.values(sourceGates).every(Boolean))
    throw new Error("Retrospective source gates failed");
  const output = resolve(values.output);
  await mkdir(output);
  const save = (name: string, data: unknown) =>
    writeFile(resolve(output, name), JSON.stringify(data, null, 2) + "\n", {
      flag: "wx",
    });
  const provenance = {
    season: context.season,
    ...context.provenance,
    canonicalSourceSha256: hash(sourceText),
    abilityPriorsSha256: hash(priorText),
    abilityPriorKind: Object.keys(priors.calibration).length
      ? "saved-priors-with-default-fallbacks"
      : "defaults-only",
    gameSourcesHash: context.gameSourcesHash,
    rowsSha256: hash(JSON.stringify(allRows)),
    comparisonMode: context.mode,
    lambdas,
    allRowInferenceAudit: oof.audit,
    codeHashCaptureStartedAt,
    codeHashPolicy:
      "Disk snapshot captured before source reconstruction; unchanged hashes required before fitting and before result files are written.",
    codeHashes,
  };
  await verifyCodeSnapshot();
  await save("source-audit.json", {
    version: "nhl-retrospective-value-source-audit-v1",
    publishable: false,
    provenance,
    sourceGates,
    coverage: { officialSeconds, usableSeconds, officialShots, verifiedShots },
    residualAccounting: {
      glm: residualAccounting(glmGames),
      gb: residualAccounting(gbGames),
    },
    interpretation:
      "Source/inference/attribution checks only. These are not forward prediction gates.",
  });
  if (values["prepare-only"])
    console.log(
      "Retrospective source and all-row inference audits complete; full-season fits skipped.",
    );
  else {
    await verifyCodeSnapshot();
    console.log(
      "Fitting exactly two full-season retrospective models at saved lambdas; no forward evaluation.",
    );
    const glmModel = fitAdjustedImpact(glmGames, lambdas.glm);
    const gbModel = fitAdjustedImpact(gbGames, lambdas.gb);
    if (!glmModel.converged || !gbModel.converged)
      throw new Error("Retrospective full-season solver did not converge");
    const glm = rankGameSeason(
      glmGames,
      glmModel,
      reference,
      priors.calibration,
    );
    const gb = rankGameSeason(gbGames, gbModel, reference, priors.calibration);
    const originalById = new Map(
      (context.original?.ratings ?? glm.ratings).map((player) => [
        player.playerId,
        player,
      ]),
    );
    if (originalById.size !== (context.original?.ratings ?? glm.ratings).length)
      throw new Error("Duplicate original player identity");
    for (const [label, players] of [
      ["GLM OOF", glm.ratings],
      ["GB OOF", gb.ratings],
    ] as const) {
      const ids = new Set(players.map((player) => player.playerId));
      if (ids.size !== players.length || ids.size !== originalById.size)
        throw new Error(`${label} player population differs`);
      for (const player of players) {
        const original = originalById.get(player.playerId);
        if (
          !original ||
          original.position !== player.position ||
          original.status !== player.status
        )
          throw new Error(
            `${label} changed player identity, position or qualification`,
          );
        for (const key of Object.keys(original.componentCoverage) as Array<
          keyof GameSeasonRating["componentCoverage"]
        >) {
          const before = original.componentCoverage[key],
            after = player.componentCoverage[key];
          if (
            !Number.isFinite(before) ||
            !Number.isFinite(after) ||
            Math.abs(before - after) > 1e-8
          )
            throw new Error(
              `${label} changed physical component coverage for ${player.playerId}/${key}`,
            );
        }
      }
    }
    const residualCreditAudit = {
      glm: reconcileRankedResiduals(glmGames, glm.ratings),
      gb: reconcileRankedResiduals(gbGames, gb.ratings),
    };
    const glmOverall = rankNhlReplacementPreview({
      model: glmModel,
      ratings: glm.ratings,
      numberOfTeams: teams,
    });
    const gbOverall = rankNhlReplacementPreview({
      model: gbModel,
      ratings: gb.ratings,
      numberOfTeams: teams,
    });
    const oldOverall = context.original
      ? rankNhlReplacementPreview({
          model: context.original.model,
          ratings: context.original.ratings,
          numberOfTeams: teams,
        })
      : null;
    const oldRatings = new Map(
      (context.original?.ratings ?? []).map((p) => [p.playerId, p]),
    );
    const frozenOverall = frozenRatings
      ? rankNhlReplacementPreview({
          model: frozenRatings.model,
          ratings: frozenRatings.ratings,
          numberOfTeams: teams,
        })
      : null;
    const frozenById = new Map(
      (frozenRatings?.ratings ?? []).map((p) => [p.playerId, p]),
    );
    const frozenRanks = new Map(
      (frozenOverall?.ratings ?? []).map((p) => [p.playerId, p]),
    );
    const glmRatings = new Map(glm.ratings.map((p) => [p.playerId, p]));
    const oldRanks = new Map(
      (oldOverall?.ratings ?? []).map((p) => [p.playerId, p]),
    );
    const glmRanks = new Map(glmOverall.ratings.map((p) => [p.playerId, p]));
    const gbRanks = new Map(gbOverall.ratings.map((p) => [p.playerId, p]));
    const movements = gb.ratings.map((p) => {
      const original = oldRatings.get(p.playerId)!,
        baseline = glmRatings.get(p.playerId)!,
        frozen = frozenById.get(p.playerId);
      if (
        !baseline ||
        (context.original && !original) ||
        (context.frozen && !frozen)
      )
        throw new Error("Four-way player population differs");
      return {
        playerId: p.playerId,
        name: p.name,
        position: p.position,
        original: original
          ? {
              seasonValue: original.seasonValue,
              components: original.components,
              overall: oldRanks.get(p.playerId),
            }
          : null,
        glmCrossfit: {
          seasonValue: baseline.seasonValue,
          components: baseline.components,
          overall: glmRanks.get(p.playerId),
        },
        gbChronological: frozen
          ? {
              seasonValue: frozen.seasonValue,
              components: frozen.components,
              overall: frozenRanks.get(p.playerId),
            }
          : null,
        gbCrossfit: {
          seasonValue: p.seasonValue,
          components: p.components,
          overall: gbRanks.get(p.playerId),
        },
      };
    });
    const interpretation =
      "Retrospective descriptive full-season values from excluded-game shot labels. Not forward validation, causal player attribution, predictive ability calibration or publishable production ratings. Replacement is the unchanged same-season depth proxy; ranking intervals are conditional on fitted effects.";
    await verifyCodeSnapshot();
    await save("ratings.json", {
      version: "nhl-retrospective-season-values-research-v1",
      publishable: false,
      season: context.season,
      gameType: context.gameType,
      provenance,
      sourceGates,
      interpretation,
      residualCreditAudit,
      qualificationInvariant: {
        passed: true,
        players: glm.ratings.length,
        compared: context.original
          ? ["original GLM", "GLM OOF", "GB OOF"]
          : ["GLM OOF", "GB OOF"],
        coverageTolerance: 1e-8,
      },
      glm: {
        model: glmModel,
        ratings: glm.ratings,
        penaltyDiagnostics: glm.penaltyDiagnostics,
      },
      gb: {
        model: gbModel,
        ratings: gb.ratings,
        penaltyDiagnostics: gb.penaltyDiagnostics,
      },
    });
    await save("overall.json", {
      version: "nhl-retrospective-overall-research-v1",
      publishable: false,
      season: context.season,
      interpretation,
      glm: glmOverall,
      gb: gbOverall,
    });
    await save("movement.json", {
      version: "nhl-retrospective-movement-research-v1",
      publishable: false,
      interpretation,
      comparisonMode: context.mode,
      unavailableComparisons: context.original
        ? []
        : ["original chronological GLM", "chronological GB"],
      references: {
        original: oldOverall?.references ?? null,
        glm: glmOverall.references,
        gbChronological: frozenOverall?.references ?? null,
        gb: gbOverall.references,
      },
      movements,
    });
    console.log(
      JSON.stringify({
        season: context.season,
        output,
        players: gb.ratings.length,
        lambdas,
        sourceGates,
        converged: true,
      }),
    );
  }
}
