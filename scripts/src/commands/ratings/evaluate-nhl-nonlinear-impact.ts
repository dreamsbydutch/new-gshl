import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  HockeyDataCache,
  fetchSeasonGames,
  fetchGamePlayByPlay,
} from "../../integrations/nhl/game-value-source";
import { loadVerifiedGame } from "../../domains/nhl/verified-game-source";
import {
  extractShotTrainingRows,
  buildGameValueData,
  type GameValueData,
} from "../../domains/nhl/game-value-input";
import { summarizeGameAudit } from "../../domains/nhl/game-value-audit";
import { buildNhlRatingInput } from "../../domains/nhl/season-rating-input";
import {
  predictShotQuality,
  type ShotQualityModel,
  type ShotTrainingRow,
} from "../../runtime/nhl-shot-quality";
import {
  parseNhlNonlinearShotModel,
  predictNhlNonlinearShot,
} from "../../runtime/nhl-shot-nonlinear";
import { chronologicalNhlNonlinearImpactExperiment } from "../../runtime/nhl-nonlinear-impact-experiment";
import {
  rankGameSeason,
  type GameSeasonRating,
} from "../../runtime/nhl-game-season-value";
import { rankNhlReplacementPreview } from "../../runtime/nhl-overall-rating";
import type {
  ImpactModel,
  evaluateImpact,
} from "../../runtime/nhl-adjusted-impact";

const { values } = parseArgs({
  options: {
    report: { type: "string" },
    baseline: { type: "string" },
    cache: { type: "string" },
    model: { type: "string" },
    parity: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Offline nonlinear-shot to impact research. --report <complete reviewed v3 directory> --baseline <v2 root> --cache <complete NHL cache> --model <validated numeric nonlinear model.json> --parity <successful parity ledger.json> --output <NEW directory>. Exact source hashes and baseline held-out reproduction required. No network, database, publication or default model changes.",
  );
else {
  if (
    !values.report ||
    !values.baseline ||
    !values.cache ||
    !values.model ||
    !values.parity ||
    !values.output
  )
    throw new Error(
      "--report, --baseline, --cache, --model, --parity and --output required",
    );
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  const codeHashCaptureStartedAt = new Date().toISOString();
  const codeHashes = await Promise.all(
    [
      "scripts/src/commands/ratings/evaluate-nhl-nonlinear-impact.ts",
      "scripts/src/runtime/nhl-nonlinear-impact-experiment.ts",
      "scripts/src/runtime/nhl-shot-nonlinear.ts",
      "scripts/src/runtime/nhl-adjusted-impact.ts",
      "scripts/src/domains/nhl/game-value-input.ts",
      "scripts/src/runtime/nhl-game-season-value.ts",
      "scripts/src/runtime/nhl-overall-rating.ts",
    ].map(async (path) => ({
      path,
      sha256: hash(await readFile(path, "utf8")),
    })),
  );
  const reportText = await readFile(
    resolve(values.report, "ratings.json"),
    "utf8",
  );
  const report = JSON.parse(reportText) as {
    version: string;
    season: number;
    gameType: 2 | 3;
    completeSourceScope: boolean;
    officialTeamCount: number;
    config: { revision: string };
    sourceHash: string;
    priorHash: string;
    gameSourcesHash: string;
    model: ImpactModel;
    ratings: GameSeasonRating[];
    shotQuality: { model: ShotQualityModel };
    penaltyShotModel: { probability: number };
    qualityGate: {
      passes: boolean;
      sourceCoverage: unknown;
      gates: Record<string, boolean>;
    };
    evaluation: {
      trainingDatesBefore: string;
      testDatesFrom: string;
      selectedLambda: number;
      model: ReturnType<typeof evaluateImpact>;
    };
  };
  if (
    report.version !== "nhl-season-value-v3" ||
    !report.completeSourceScope ||
    !report.model.converged ||
    !report.qualityGate.passes ||
    !report.shotQuality?.model
  )
    throw new Error(
      "Complete passing converged NHL-event-xG v3 source required",
    );
  const modelText = await readFile(resolve(values.model), "utf8");
  const nonlinear = parseNhlNonlinearShotModel(JSON.parse(modelText));
  if (
    nonlinear.provenance.trainedBefore !==
      report.evaluation.trainingDatesBefore ||
    nonlinear.provenance.testFrom !== report.evaluation.testDatesFrom
  )
    throw new Error(
      "Nonlinear shot chronology differs from exact saved impact boundaries",
    );
  const parityText = await readFile(resolve(values.parity), "utf8");
  const parity = JSON.parse(parityText) as {
    passed: boolean;
    modelSha256: string;
    sourceRowsSha256: string;
    sourcePredictionsSha256: string;
    maximumAbsoluteError: number;
    predictions: number;
  };
  if (
    parity.passed !== true ||
    parity.modelSha256 !== hash(modelText) ||
    parity.sourceRowsSha256 !== nonlinear.provenance.sourceRowsSha256 ||
    parity.sourcePredictionsSha256 !==
      nonlinear.provenance.sourcePredictionsSha256 ||
    !(parity.predictions > 0) ||
    !(parity.maximumAbsoluteError < 1e-12)
  )
    throw new Error(
      "Complete hash-bound Python/TypeScript probability parity required",
    );
  const audit = JSON.parse(
    await readFile(resolve(values.report, "game-audit.json"), "utf8"),
  ) as {
    gameSourceHashes: Array<{ gameId: number; sha256: string }>;
    failed: unknown[];
    officialGames: number;
    loadedGames: number;
  };
  if (
    audit.failed.length ||
    audit.loadedGames !== audit.officialGames ||
    hash(JSON.stringify(audit.gameSourceHashes)) !== report.gameSourcesHash
  )
    throw new Error("Incomplete source ledger");
  const sourceText = await readFile(
    resolve(values.baseline, String(report.season), "source.json"),
    "utf8",
  );
  const priorText = await readFile(
    resolve(values.baseline, String(report.season), "ratings.json"),
    "utf8",
  );
  if (
    hash(sourceText) !== report.sourceHash ||
    hash(priorText) !== report.priorHash
  )
    throw new Error("Canonical official source or ability priors differ");
  const source = JSON.parse(sourceText) as {
    nhl: Parameters<typeof buildNhlRatingInput>[0];
  };
  const priors = JSON.parse(priorText) as {
    calibration: Record<string, { prior: number }>;
  };
  const reference = buildNhlRatingInput(source.nhl).players.filter(
    (p) => p.games > 0 && p.minutes > 0,
  );
  const cache = new HockeyDataCache(resolve(values.cache), true);
  const schedule = await fetchSeasonGames(
    cache,
    report.season,
    report.gameType,
  );
  const teams = new Set(
    schedule.flatMap((g) => [g.homeTeamId, g.visitingTeamId]),
  ).size;
  if (
    teams !== report.officialTeamCount ||
    schedule.length !== audit.officialGames
  )
    throw new Error("Official season scope differs");
  const expected = new Map(
    audit.gameSourceHashes.map((g) => [g.gameId, g.sha256]),
  );
  if (expected.size !== schedule.length)
    throw new Error("Invalid source hash identities");
  const baselineGames: GameValueData[] = [],
    candidateGames: GameValueData[] = [],
    allRows: ShotTrainingRow[] = [];
  for (const scheduled of schedule) {
    const pbp = await fetchGamePlayByPlay(cache, scheduled.id);
    const rows = extractShotTrainingRows(pbp);
    allRows.push(...rows);
    if (
      rows.some(
        (r) => r.gameId !== scheduled.id || r.date !== scheduled.gameDate,
      )
    )
      throw new Error("Shot row schedule identity mismatch");
    const oldProbabilities = new Map(
      rows.map((r) => [
        r.eventId,
        predictShotQuality(report.shotQuality.model, r.features),
      ]),
    );
    const probabilities = new Map(
      rows.map((r) => [r.eventId, predictNhlNonlinearShot(nonlinear, r)]),
    );
    const loaded = await loadVerifiedGame(
      cache,
      scheduled.id,
      [],
      oldProbabilities,
      report.penaltyShotModel.probability,
    );
    if (hash(JSON.stringify(loaded.sources)) !== expected.get(scheduled.id))
      throw new Error(`Saved source differs for ${scheduled.id}`);
    const candidate = buildGameValueData(
      loaded.sources,
      [],
      probabilities,
      report.penaltyShotModel.probability,
    );
    for (const shot of candidate.shots)
      if (shot.attribution !== "penalty-shot")
        shot.probabilitySource = nonlinear.version;
    if (
      JSON.stringify(summarizeGameAudit(candidate)) !==
      JSON.stringify(summarizeGameAudit(loaded.game))
    )
      throw new Error("Source coverage, attribution or eligibility changed");
    baselineGames.push(loaded.game);
    candidateGames.push(candidate);
    if (candidateGames.length % 300 === 0)
      console.log(
        `Verified nonlinear-label source games ${candidateGames.length}/${schedule.length}`,
      );
  }
  if (
    hash(JSON.stringify(allRows)) !== nonlinear.provenance.sourceRowsSha256 ||
    allRows.filter((row) => row.date >= nonlinear.provenance.testFrom)
      .length !== parity.predictions
  )
    throw new Error(
      "Reconstructed shot rows or complete parity support differ from frozen nonlinear model",
    );
  const output = resolve(values.output);
  await mkdir(output);
  const save = (name: string, value: unknown) =>
    writeFile(resolve(output, name), JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
  const provenance = {
    season: report.season,
    sourceReportSha256: hash(reportText),
    modelSha256: hash(modelText),
    paritySha256: hash(parityText),
    sourceRowsReconstructedSha256: hash(JSON.stringify(allRows)),
    nonlinearProvenance: nonlinear.provenance,
    canonicalSourceSha256: hash(sourceText),
    abilityPriorsSha256: hash(priorText),
    gameSourcesHash: report.gameSourcesHash,
    allSourceHashesMatch: true,
    allGameSourceAuditsIdentical: true,
    unchangedPenaltyShotProbability: report.penaltyShotModel.probability,
    sourceQualityGate: report.qualityGate,
    codeHashCaptureStartedAt,
    codeHashCaptureTiming:
      "Immediately after required flags, before report/cache reconstruction; hashes are an immutable start-of-command disk snapshot.",
    codeHashes,
  };
  await save("source-audit.json", provenance);
  console.log(
    "Exact source reconstruction complete; reproducing baseline and fitting unchanged independent-prior nonlinear-label impact.",
  );
  const experiment = chronologicalNhlNonlinearImpactExperiment(
    baselineGames,
    candidateGames,
    report.evaluation,
  );
  const ranked = rankGameSeason(
    candidateGames,
    experiment.model,
    reference,
    priors.calibration,
  );
  const overall = rankNhlReplacementPreview({
    model: experiment.model,
    ratings: ranked.ratings,
    numberOfTeams: teams,
  });
  const baselineOverall = rankNhlReplacementPreview({
    model: report.model,
    ratings: report.ratings,
    numberOfTeams: teams,
  });
  const researchOverall = {
    ...overall,
    version: "nhl-nonlinear-impact-overall-research-v1",
    publishable: false,
    interpretation:
      "Research only; nonlinear shot-label impact, default independent prior and same-season replacement-depth policy. No default model promotion.",
  };
  await save("analysis.json", {
    ...experiment,
    provenance,
    sourceGatesUnchanged: true,
    baselineTop20: baselineOverall.ratings.slice(0, 20),
    candidateTop20: overall.ratings.slice(0, 20),
    interpretation:
      "Research only; actual-goal paired comparison. Different xG labels cannot be compared as improvement. One season cannot satisfy the frozen two-season screen.",
  });
  await save("ratings.json", {
    experiment: experiment.config.version,
    publishable: false,
    season: report.season,
    model: experiment.model,
    ratings: ranked.ratings,
    penaltyDiagnostics: ranked.penaltyDiagnostics,
    provenance,
  });
  await save("overall.json", researchOverall);
  console.log(
    JSON.stringify(
      {
        season: report.season,
        baseline: experiment.baselineEvaluation,
        candidate: experiment.evaluation.model,
        comparison: experiment.comparison,
        screen: experiment.screen,
        output,
      },
      null,
      2,
    ),
  );
}
