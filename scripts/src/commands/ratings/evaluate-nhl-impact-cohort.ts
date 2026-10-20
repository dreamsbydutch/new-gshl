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
import { extractShotTrainingRows } from "../../domains/nhl/game-value-input";
import { buildNhlRatingInput } from "../../domains/nhl/season-rating-input";
import {
  predictShotQuality,
  type ShotQualityModel,
} from "../../runtime/nhl-shot-quality";
import {
  evaluateImpact,
  fitAdjustedImpact,
  type ImpactModel,
} from "../../runtime/nhl-adjusted-impact";
import { chronologicalImpactCohortExperiment } from "../../runtime/nhl-impact-cohort-experiment";
import {
  rankGameSeason,
  type GameSeasonRating,
} from "../../runtime/nhl-game-season-value";
import { rankNhlReplacementPreview } from "../../runtime/nhl-overall-rating";

const { values } = parseArgs({
  options: {
    report: { type: "string" },
    baseline: { type: "string" },
    cache: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Offline shared-cohort impact experiment. --report <complete v3 report directory> --baseline <v2 report root> --cache <complete public source cache> --output <NEW directory>. Reconstructs and verifies exact saved source hashes; selects experimental priors before held-out games. No API/database access, publication or default rating change.",
  );
} else {
  if (!values.report || !values.baseline || !values.cache || !values.output)
    throw new Error("--report, --baseline, --cache and --output required");
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
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
    qualityGate: unknown;
    evaluation: {
      trainingDatesBefore: string;
      testDatesFrom: string;
      selectedLambda: number;
      model: ReturnType<typeof evaluateImpact>;
    };
  };
  if (
    report.version !== "nhl-season-value-v3" ||
    ![2, 3].includes(report.gameType) ||
    !report.completeSourceScope ||
    !report.shotQuality?.model ||
    !report.model.converged
  )
    throw new Error(
      "Complete converged NHL-event-xG v3 source report required",
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
    throw new Error("Incomplete or inconsistent source audit");
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
    throw new Error(
      "Canonical source or ability priors differ from the fitted report",
    );
  const source = JSON.parse(sourceText) as {
    nhl: Parameters<typeof buildNhlRatingInput>[0];
  };
  const priors = JSON.parse(priorText) as {
    calibration: Record<string, { prior: number }>;
  };
  const reference = buildNhlRatingInput(source.nhl).players.filter(
    (p) => p.games > 0 && p.minutes > 0,
  );
  const positions = Object.fromEntries(
    reference.map((p) => [p.playerId, p.position]),
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
    throw new Error("Official source scope differs from the saved model");
  const expected = new Map(
    audit.gameSourceHashes.map((g) => [g.gameId, g.sha256]),
  );
  if (expected.size !== schedule.length)
    throw new Error("Invalid source hash identities");
  const games = [];
  for (const scheduled of schedule) {
    const pbp = await fetchGamePlayByPlay(cache, scheduled.id);
    const rows = extractShotTrainingRows(pbp);
    if (
      rows.some(
        (r) => r.gameId !== scheduled.id || r.date !== scheduled.gameDate,
      )
    )
      throw new Error("Shot-training identity differs from official schedule");
    const probabilities = new Map(
      rows.map((r) => [
        r.eventId,
        predictShotQuality(report.shotQuality.model, r.features),
      ]),
    );
    const loaded = await loadVerifiedGame(
      cache,
      scheduled.id,
      [],
      probabilities,
      report.penaltyShotModel.probability,
    );
    if (hash(JSON.stringify(loaded.sources)) !== expected.get(scheduled.id))
      throw new Error(`Saved source differs for ${scheduled.id}`);
    games.push(loaded.game);
    if (games.length % 300 === 0)
      console.log(`Verified source games ${games.length}/${schedule.length}`);
  }
  const output = resolve(values.output);
  await mkdir(output);
  const save = (name: string, value: unknown) =>
    writeFile(resolve(output, name), JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
  await save("source-audit.json", {
    reportSha256: hash(reportText),
    revision: report.config.revision,
    season: report.season,
    games: games.length,
    allHashesMatch: true,
    sourceQualityGate: report.qualityGate,
  });
  console.log(
    "Fitting frozen shared-cohort candidates and held-out comparisons.",
  );
  const candidate = chronologicalImpactCohortExperiment(
    games,
    positions,
    teams,
    {
      trainEnd: report.evaluation.trainingDatesBefore,
      testFrom: report.evaluation.testDatesFrom,
    },
  );
  if (
    candidate.trainEnd !== report.evaluation.trainingDatesBefore ||
    candidate.testFrom !== report.evaluation.testDatesFrom
  )
    throw new Error("Candidate chronology differs from baseline");
  const eligible = games
    .filter((g) => g.eligible)
    .sort((a, b) => a.date.localeCompare(b.date) || a.gameId - b.gameId);
  const baselineTestModel = fitAdjustedImpact(
    eligible.filter((g) => g.date < candidate.testFrom),
    report.evaluation.selectedLambda,
  );
  const test = eligible.filter((g) => g.date >= candidate.testFrom);
  const baselineEvaluation = evaluateImpact(baselineTestModel, test);
  if (
    JSON.stringify(baselineEvaluation) !==
    JSON.stringify(report.evaluation.model)
  )
    throw new Error(
      "Default fit no longer exactly reproduces the saved baseline evaluation",
    );
  const paired = test.map((game) => ({
    gameId: game.gameId,
    baseline: evaluateImpact(baselineTestModel, [game]),
    candidate: evaluateImpact(candidate.testModel, [game]),
  }));
  const matched = paired.filter(
    (g) => g.baseline.games === 1 && g.candidate.games === 1,
  );
  if (!matched.length) throw new Error("No shared supported held-out games");
  let seed = 73219;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const bootstrap = Object.fromEntries(
    (["xgDifferentialMse", "goalDifferentialMse", "teamGoalMse"] as const).map(
      (metric) => {
        const deltas = matched.map(
          (g) => g.candidate[metric]! - g.baseline[metric]!,
        );
        const replicates = Array.from({ length: 2000 }, () => {
          let total = 0;
          for (let i = 0; i < deltas.length; i++)
            total += deltas[Math.floor(random() * deltas.length)]!;
          return total / deltas.length;
        }).sort((a, b) => a - b);
        return [
          metric,
          {
            difference: deltas.reduce((a, b) => a + b, 0) / deltas.length,
            lower: replicates[Math.floor(replicates.length * 0.025)],
            upper: replicates[Math.floor(replicates.length * 0.975)],
          },
        ];
      },
    ),
  );
  const ratings = rankGameSeason(
    games,
    candidate.model,
    reference,
    priors.calibration,
  ).ratings;
  const overall = rankNhlReplacementPreview({
    model: candidate.model,
    ratings,
    numberOfTeams: teams,
  });
  const baselineOverall = rankNhlReplacementPreview({
    model: report.model,
    ratings: report.ratings,
    numberOfTeams: teams,
  });
  const screen = {
    allFitsConverged:
      candidate.model.converged &&
      candidate.testModelConverged &&
      candidate.trials.every((t) => t.converged) &&
      baselineTestModel.converged,
    sameSupportedCohort:
      matched.length === baselineEvaluation.games &&
      matched.length === candidate.evaluation.games,
    minimumSupport:
      matched.length / test.length >=
      candidate.config.acceptance.minimumSupportedFraction,
    improvesXg:
      candidate.evaluation.xgDifferentialMse! <
      baselineEvaluation.xgDifferentialMse!,
    goalGuardrail:
      candidate.evaluation.goalDifferentialMse! <=
      1.01 * baselineEvaluation.goalDifferentialMse!,
    teamGoalGuardrail:
      candidate.evaluation.teamGoalMse! <=
      1.01 * baselineEvaluation.teamGoalMse!,
  };
  await save("analysis.json", {
    ...candidate,
    season: report.season,
    sourceReportSha256: hash(reportText),
    baselineEvaluation,
    paired,
    bootstrap,
    screen,
    singleSeasonScreenPasses: Object.values(screen).every(Boolean),
    baselineTop20: baselineOverall.ratings.slice(0, 20),
    candidateTop20: overall.ratings.slice(0, 20),
    interpretation:
      "Research comparison only; neither this artifact nor its overall preview is a publishable v3 report. Bootstrap conditions on each frozen fitted model and cannot establish individual causal attribution.",
  });
  await save("overall.json", overall);
  await save("ratings.json", {
    experiment: candidate.config.version,
    model: candidate.model,
    ratings,
  });
  console.log(
    JSON.stringify({
      season: report.season,
      baseline: baselineEvaluation,
      candidate: candidate.evaluation,
      bootstrap,
      screen,
      ranked: overall.ratings.filter((p) => p.overallRank !== null).length,
      output,
    }),
  );
}
