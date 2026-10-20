import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { extractShotTrainingRows } from "../../domains/nhl/game-value-input";
import { penaltyShotGameMatches } from "../../domains/nhl/official-penalty-shot-report";
import {
  HockeyDataCache,
  fetchSeasonGames,
  fetchGamePlayByPlay,
  fetchSeasonPenaltyShotGames,
} from "../../integrations/nhl/game-value-source";
import { chronologicalShotContextExperiment } from "../../runtime/nhl-shot-context-experiment";
import type { ShotTrainingRow } from "../../runtime/nhl-shot-quality";

const { values } = parseArgs({
  options: {
    cache: { type: "string" },
    season: { type: "string" },
    "game-type": { type: "string", default: "2" },
    output: { type: "string" },
    "save-rows": { type: "boolean" },
    help: { type: "boolean" },
  },
});
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const write = (file: string, value: unknown) =>
  writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });

if (values.help)
  console.log(
    "Offline NHL shot-context experiment. --cache <complete public NHL cache> --season <YYYYYYYY> --output <NEW directory> [--game-type 2|3] [--save-rows]. Reads hash-verified cached schedule, play-by-play and penalty-shot reconciliation only; missing sources fail without network access. Reports fixed-policy context-calibration comparison and 2,000 paired game bootstrap draws. No production model, rating, gate or remote writes.",
  );
else {
  if (!values.cache || !values.season || !values.output)
    throw new Error("--cache, --season and --output required");
  const season = Number(values.season),
    gameType = Number(values["game-type"]);
  if (
    !Number.isInteger(season) ||
    Math.floor(season / 10000) + 1 !== season % 10000 ||
    ![2, 3].includes(gameType)
  )
    throw new Error("Invalid season or game type");
  const cache = new HockeyDataCache(resolve(values.cache), true);
  const schedule = await fetchSeasonGames(cache, season, gameType as 2 | 3);
  if (!schedule.length)
    throw new Error("No completed games in cached season schedule");
  const penaltyShotGames = await fetchSeasonPenaltyShotGames(
    cache,
    season,
    gameType,
  );
  const rows: ShotTrainingRow[] = [];
  const sourceHashes: Array<{ gameId: number; sha256: string; shots: number }> =
    [];
  for (const game of schedule) {
    const pbp = await fetchGamePlayByPlay(cache, game.id);
    const identity = pbp as unknown as {
      id: number;
      gameDate: string;
      homeTeam: { id: number };
      awayTeam: { id: number };
    };
    if (
      identity.id !== game.id ||
      identity.gameDate !== game.gameDate ||
      identity.homeTeam.id !== game.homeTeamId ||
      identity.awayTeam.id !== game.visitingTeamId
    )
      throw new Error(`Cached game schedule identity mismatch: ${game.id}`);
    if (
      !penaltyShotGameMatches(
        pbp,
        penaltyShotGames.rows.filter((p) => p.gameId === game.id),
      )
    )
      throw new Error(
        `Cached penalty-shot reconciliation incomplete: ${game.id}`,
      );
    const extracted = extractShotTrainingRows(pbp);
    if (
      extracted.some(
        (row) => row.gameId !== game.id || row.date !== game.gameDate,
      )
    )
      throw new Error(`Shot-row identity mismatch: ${game.id}`);
    rows.push(...extracted);
    sourceHashes.push({
      gameId: game.id,
      sha256: hash(pbp),
      shots: extracted.length,
    });
    if (sourceHashes.length % 200 === 0)
      console.log(
        JSON.stringify({
          loadedGames: sourceHashes.length,
          scheduledGames: schedule.length,
          shots: rows.length,
        }),
      );
  }
  const output = resolve(values.output);
  await mkdir(output);
  const provenance = {
    season,
    gameType,
    offlineOnly: true,
    completedScheduleGames: schedule.length,
    scheduleSha256: hash(schedule),
    penaltyShotReportSha256: hash(penaltyShotGames),
    rowsSha256: hash(rows),
    effectiveGameSourceHashes: sourceHashes,
  };
  if (values["save-rows"])
    await write(resolve(output, "shot-rows.json"), { ...provenance, rows });
  console.log(
    JSON.stringify({
      phase: "fit-frozen-candidate",
      games: schedule.length,
      shots: rows.length,
    }),
  );
  const analysis = chronologicalShotContextExperiment(rows);
  const paired = analysis.pairedTestGames;
  const replicates = 2000,
    seed = 14731;
  let state = seed;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const brierDraws: number[] = [],
    lossDraws: number[] = [];
  for (let draw = 0; draw < replicates; draw++) {
    let shots = 0,
      brier = 0,
      loss = 0;
    for (let i = 0; i < paired.length; i++) {
      const game = paired[Math.floor(random() * paired.length)]!;
      shots += game.shots;
      brier += game.candidateBrierSum - game.baselineBrierSum;
      loss += game.candidateLogLossSum - game.baselineLogLossSum;
    }
    brierDraws.push(brier / shots);
    lossDraws.push(loss / shots);
  }
  const range = (draws: number[], point: number) => {
    const sorted = [...draws].sort((a, b) => a - b);
    return {
      point,
      low: sorted[Math.floor((sorted.length - 1) * 0.025)]!,
      high: sorted[Math.floor((sorted.length - 1) * 0.975)]!,
    };
  };
  const pairedBootstrap = {
    replicates,
    seed,
    clusters: paired.length,
    clusterUnit: "whole game",
    brierDifference: range(
      brierDraws,
      analysis.candidate.evaluation.brier! -
        analysis.baseline.evaluation.brier!,
    ),
    logLossDifference: range(
      lossDraws,
      analysis.logLoss.candidate - analysis.logLoss.baseline,
    ),
    interpretation:
      "Candidate minus baseline; paired game resampling with fitted models fixed. Does not include model-refitting uncertainty or persistent team/season dependence. A single-season range does not satisfy the frozen pooled two-season requirement.",
  };
  const common = analysis.calibrationByShootingContext.filter(
    (group) => group.context !== "unknown" && group.shots >= 1000,
  );
  const policy = {
    frozenBeforeCandidateRuns: true,
    requiredSeasons: [20242025, 20232024],
    overallBrierAndLogLossImproveInBothSeasons: true,
    pooledPairedGameBootstrapUpper95BelowZero: true,
    minimumCommonContextTestShots: 1000,
    maximumCommonContextRelativeBrierRegression: 0.02,
    maximumAbsoluteGoalTotalRelativeBias: 0.1,
    laterImpactAndOverallComparisonsRequired: true,
    reference: "docs/product/nhl-shot-context-experiment.md",
  };
  const singleSeasonScreen = {
    baselineAndCandidateConverged:
      analysis.baseline.model.converged && analysis.candidate.converged,
    improvesBrier:
      analysis.candidate.evaluation.brier! <
      analysis.baseline.evaluation.brier!,
    improvesLogLoss: analysis.logLoss.candidate < analysis.logLoss.baseline,
    commonContextNoMaterialRegression: common.every(
      (g) => g.candidateBrier <= g.baselineBrier * 1.02,
    ),
    goalTotalBiasWithin10Percent:
      analysis.candidate.evaluation.actualGoals > 0 &&
      Math.abs(
        analysis.candidate.evaluation.expectedGoals -
          analysis.candidate.evaluation.actualGoals,
      ) /
        analysis.candidate.evaluation.actualGoals <=
        0.1,
    interpretation:
      "Research screen only. Single-season checks cannot promote a model or satisfy the two-season policy.",
  };
  await write(resolve(output, "analysis.json"), {
    ...provenance,
    policy,
    ...analysis,
    pairedBootstrap,
    singleSeasonScreen,
  });
  console.log(
    JSON.stringify({
      output,
      shots: rows.length,
      testShots: analysis.baseline.evaluation.shots,
      baselineBrier: analysis.baseline.evaluation.brier,
      candidateBrier: analysis.candidate.evaluation.brier,
      logLoss: analysis.logLoss,
      pairedBootstrap,
      singleSeasonScreen,
    }),
  );
}
