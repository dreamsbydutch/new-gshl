import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { ImpactModel } from "../../runtime/nhl-adjusted-impact";
import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";
import type { AbilitySeasonSnapshot } from "../../domains/ranking/nhl-ability-experiment";
import {
  NHL_REPLACEMENT_DEPTH_PRESETS,
  rankNhlReplacementPreview,
} from "../../runtime/nhl-overall-rating";
import { rankNhlPooledGoalieReferencePreview } from "../../runtime/nhl-pooled-goalie-reference";

const METHOD = "nhl-hockey-overall-reviewed-v1";
const gateKeys = [
  "officialSeasonExposureMatches",
  "completeDownload",
  "atLeast98PercentProcessExposureVerified",
  "atLeast98PercentIndividualShotsVerified",
] as const;
type FileBinding = { path: string; sha256: string };
type ReviewRow = {
  arm: string;
  policy: string;
  supported: boolean;
  annualMse: number;
  blendMse: number;
  conditionalInterval: number[];
  passes: boolean;
};
type ReferenceReview = {
  version: string;
  publishable: boolean;
  seal: FileBinding;
  inputs: FileBinding[];
  config: {
    targetSeasons: number[];
    pseudoMinutes: number;
    bootstrapSeed: number;
    bootstrapReplicates: number;
    folds: number;
    seeds: number[];
  };
  decision: { supported: boolean; rows: ReviewRow[] };
  caveats: string[];
};
type Provenance = {
  season: number;
  rowsSha256: string;
  allRowInferenceAudit: {
    passed: boolean;
    shots: number;
    games: number;
    sourceRowsSha256: string;
    maximumGbProbabilityError: number;
    maximumGlmProbabilityError: number;
    policySha256?: string;
  };
};
type ValueReport = {
  version: string;
  publishable: boolean;
  season: number;
  gameType: number;
  provenance: Provenance;
  sourceGates: Record<string, boolean>;
  qualificationInvariant: { passed: boolean; players: number };
  residualCreditAudit: {
    gb: {
      passed: boolean;
      maximumPlayerError: number;
      perPlayerRoundingTolerance: number;
      unrepresentedEventPlayers: unknown[];
    };
  };
  gb: { model: ImpactModel; ratings: GameSeasonRating[] };
  glm: { ratings: GameSeasonRating[] };
};
type Overall = ReturnType<typeof rankNhlReplacementPreview>;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function requireTrue(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}
async function readJson<T>(path: string) {
  const text = await readFile(resolve(path), "utf8");
  return {
    path: resolve(path),
    text,
    sha256: hash(text),
    value: JSON.parse(text) as T,
  };
}
const { values } = parseArgs({
  options: {
    input: { type: "string" },
    history: { type: "string" },
    teams: { type: "string" },
    "reference-review": { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Local NHL hockey-overall composition. --input <completed retrospective-values directory> --history <exact legacy snapshot.json> --teams <verified season->teamCount JSON or retained teamsBySeason report> --reference-review <sealed goalie-reference holdouts.json> --output <NEW directory>. Fixed GB crossfit plus ANNUAL same-position references. Writes one primary JSON/CSV rating and separate ability/sensitivities. The experimental reference review is recorded honestly, never used to select the primary reference. Earlier seasons may apply the reviewed method; newer seasons need a matching review. No estimator fitting, network, publication or database writes.",
  );
else {
  if (
    !values.input ||
    !values.history ||
    !values.teams ||
    !values["reference-review"] ||
    !values.output
  )
    throw Error(
      "--input, --history, --teams, --reference-review and --output required",
    );
  const codePaths = [
    "scripts/src/commands/ratings/preview-nhl-hockey-overall.ts",
    "scripts/src/runtime/nhl-overall-rating.ts",
    "scripts/src/runtime/nhl-pooled-goalie-reference.ts",
    "scripts/src/runtime/nhl-impact-breakdown.ts",
    "scripts/src/domains/ranking/nhl-reference-stability.ts",
  ];
  const codeHashes = await Promise.all(
    codePaths.map(async (path) => ({
      path,
      sha256: hash(await readFile(path, "utf8")),
    })),
  );
  const [input, base, audit, history, teamFile, review] = await Promise.all([
    readJson<ValueReport>(resolve(values.input, "ratings.json")),
    readJson<{
      version: string;
      publishable: boolean;
      season: number;
      gb: Overall;
    }>(resolve(values.input, "overall.json")),
    readJson<{
      version: string;
      publishable: boolean;
      provenance: Provenance;
      sourceGates: Record<string, boolean>;
    }>(resolve(values.input, "source-audit.json")),
    readJson<AbilitySeasonSnapshot>(values.history),
    readJson<Record<string, unknown>>(values.teams),
    readJson<ReferenceReview>(values["reference-review"]),
  ]);
  const report = input.value,
    referenceReview = review.value;
  requireTrue(
    report.version === "nhl-retrospective-season-values-research-v1" &&
      report.publishable === false &&
      report.gameType === 2,
    "Completed regular-season retrospective research values required",
  );
  requireTrue(
    base.value.version === "nhl-retrospective-overall-research-v1" &&
      base.value.publishable === false &&
      base.value.season === report.season,
    "Overall sidecar version/scope differs",
  );
  requireTrue(
    audit.value.version === "nhl-retrospective-value-source-audit-v1" &&
      audit.value.publishable === false &&
      JSON.stringify(audit.value.provenance) ===
        JSON.stringify(report.provenance),
    "Source audit provenance differs",
  );
  requireTrue(
    gateKeys.every(
      (key) =>
        report.sourceGates[key] === true &&
        audit.value.sourceGates[key] === true,
    ),
    "All four physical source gates must pass",
  );
  const inference = report.provenance.allRowInferenceAudit;
  requireTrue(
    inference.passed === true &&
      inference.shots > 0 &&
      inference.games > 0 &&
      inference.sourceRowsSha256 === report.provenance.rowsSha256 &&
      Number.isFinite(inference.maximumGbProbabilityError) &&
      inference.maximumGbProbabilityError >= 0 &&
      inference.maximumGbProbabilityError < 1e-12 &&
      Number.isFinite(inference.maximumGlmProbabilityError) &&
      inference.maximumGlmProbabilityError >= 0 &&
      inference.maximumGlmProbabilityError < 1e-12,
    "Complete all-row native inference audit required",
  );
  requireTrue(
    report.gb.model.converged && report.gb.model.lambda === 4,
    "Converged fixed-lambda4 GB impact model required",
  );
  const residual = report.residualCreditAudit.gb;
  requireTrue(
    residual.passed === true &&
      Number.isFinite(residual.maximumPlayerError) &&
      residual.maximumPlayerError <= 0.000050001 &&
      residual.perPlayerRoundingTolerance <= 0.000050001 &&
      residual.unrepresentedEventPlayers.length === 0,
    "Per-player actual-event residual audit must pass",
  );
  requireTrue(
    report.qualificationInvariant.passed === true &&
      report.qualificationInvariant.players === report.gb.ratings.length,
    "Qualification invariant must pass",
  );
  const glmById = new Map(
    report.glm.ratings.map((player) => [player.playerId, player]),
  );
  requireTrue(
    glmById.size === report.glm.ratings.length &&
      glmById.size === report.gb.ratings.length,
    "Unique matched learner populations required",
  );
  const playerIds = new Set<number>();
  for (const player of report.gb.ratings) {
    const old = glmById.get(player.playerId);
    requireTrue(
      !playerIds.has(player.playerId) &&
        old &&
        [
          "name",
          "position",
          "status",
          "games",
          "minutes",
          "componentCoverage",
          "situations",
        ].every(
          (key) =>
            JSON.stringify(player[key as keyof GameSeasonRating]) ===
            JSON.stringify(old[key as keyof GameSeasonRating]),
        ),
      "Player identity/status/exposure differs between learners",
    );
    requireTrue(
      Object.values(player.components).every(Number.isFinite),
      "Nonfinite player component",
    );
    const total =
      (player.position === "G"
        ? player.components.saving
        : player.components.adjustedProcess) +
      player.components.finishing +
      player.components.penalties;
    requireTrue(
      player.seasonValue === null ||
        (Number.isFinite(player.seasonValue) &&
          Math.abs(total - player.seasonValue) <= 0.000200001),
      "Player season components do not reconcile",
    );
    playerIds.add(player.playerId);
  }

  requireTrue(
    referenceReview.version ===
      "nhl-2025-goalie-reference-holdout-research-v1" &&
      referenceReview.publishable === false &&
      referenceReview.config.pseudoMinutes === 10000 &&
      referenceReview.config.folds === 5 &&
      referenceReview.config.bootstrapSeed === 282761 &&
      referenceReview.config.bootstrapReplicates === 2000 &&
      JSON.stringify(referenceReview.config.seeds) ===
        JSON.stringify([193, 721, 1297]),
    "Recognized frozen experimental reference review required",
  );
  requireTrue(
    referenceReview.config.targetSeasons.length === 1,
    "One explicit reference-review target season required",
  );
  const confirmationSeason = referenceReview.config.targetSeasons[0];
  requireTrue(
    Number.isInteger(report.season) && report.season <= confirmationSeason,
    "Newer input seasons require their own matching reference review",
  );
  const seenReview = new Set<string>();
  for (const row of referenceReview.decision.rows) {
    const key = `${row.arm}:${row.policy}`;
    requireTrue(
      ["glm", "gb"].includes(row.arm) &&
        ["narrower", "default", "wider"].includes(row.policy) &&
        !seenReview.has(key),
      "Reference decision identities differ",
    );
    requireTrue(
      Number.isFinite(row.annualMse) &&
        row.annualMse >= 0 &&
        Number.isFinite(row.blendMse) &&
        row.blendMse >= 0 &&
        row.conditionalInterval.length === 2 &&
        row.conditionalInterval.every(Number.isFinite) &&
        row.conditionalInterval[0] <= row.conditionalInterval[1],
      "Reference decision errors are invalid",
    );
    const expected =
      row.supported &&
      (row.policy === "default"
        ? row.blendMse < row.annualMse && row.conditionalInterval[1] <= 0
        : row.blendMse <= 1.05 * row.annualMse);
    requireTrue(
      row.passes === expected,
      "Reference decision disagrees with frozen criteria",
    );
    seenReview.add(key);
  }
  requireTrue(
    seenReview.size === 6 &&
      referenceReview.decision.supported ===
        referenceReview.decision.rows.every((row) => row.passes),
    "Incomplete or inconsistent reference review",
  );
  const seal = await readJson<{
    version: string;
    protocol: FileBinding;
    evidence: FileBinding[];
    coreImplementation: FileBinding[];
    sourceManifest: FileBinding;
  }>(referenceReview.seal.path);
  requireTrue(
    seal.sha256 === referenceReview.seal.sha256 &&
      seal.value.version === "nhl-retrospective-2025-protocol-seal-v1",
    "Reference seal binding differs",
  );
  requireTrue(
    referenceReview.inputs.some((item) => item.sha256 === history.sha256) &&
      seal.value.evidence.some((item) => item.sha256 === history.sha256),
    "Exact reference-review legacy history required",
  );
  if (report.season === confirmationSeason) {
    requireTrue(
      referenceReview.inputs.some((item) => item.sha256 === input.sha256),
      "Same-season valuation must match reference-review input bytes",
    );
    requireTrue(
      inference.policySha256 === seal.value.protocol.sha256,
      "Same-season shot model policy differs from sealed review",
    );
  }
  const retainedTeams = referenceReview.inputs.find((item) =>
    /(^|[\\/])analysis-contrast\.json$/.test(item.path),
  );
  requireTrue(
    retainedTeams,
    "Reference-review verified team-count source missing",
  );
  const verifiedTeams = await readJson<{
    teamsBySeason: Record<number, number>;
  }>(retainedTeams.path);
  requireTrue(
    verifiedTeams.sha256 === retainedTeams.sha256,
    "Reference-review team-count source changed",
  );
  const teams = (teamFile.value.teamsBySeason ?? teamFile.value) as Record<
    number,
    number
  >;
  for (const season of history.value.seasons.filter(
    (s) => s.season <= confirmationSeason,
  ))
    requireTrue(
      Number.isInteger(teams[season.season]) &&
        teams[season.season] > 0 &&
        teams[season.season] ===
          verifiedTeams.value.teamsBySeason[season.season],
      "Supplied historical team counts differ from reviewed source",
    );
  requireTrue(
    teams[report.season] === base.value.gb.numberOfTeams,
    "Current verified team count differs",
  );
  const current = { model: report.gb.model, ratings: report.gb.ratings };
  const annual = rankNhlReplacementPreview({
    ...current,
    numberOfTeams: teams[report.season],
  });
  requireTrue(
    JSON.stringify(annual) === JSON.stringify(base.value.gb),
    "Saved annual GB overall does not exactly reproduce",
  );
  const sourcePlayers = new Map(report.gb.ratings.map((p) => [p.playerId, p]));
  const ratings = annual.ratings.map((player) => {
    const raw = sourcePlayers.get(player.playerId)!;
    return {
      playerId: player.playerId,
      name: player.name,
      position: player.position,
      rating: player.overallValue,
      rank: player.overallRank,
      qualification: player.qualification,
      status: player.status,
      components: player.components,
      games: raw.games,
      minutes: raw.minutes,
      componentCoverage: raw.componentCoverage,
      ability: {
        per60: raw.abilityPer60,
        positionRank: raw.abilityRank,
        status: raw.status,
      },
      warnings: [...player.warnings],
    };
  });
  const sensitivities = Object.entries(NHL_REPLACEMENT_DEPTH_PRESETS).map(
    ([preset, depth]) => {
      const result = rankNhlReplacementPreview({
        ...current,
        numberOfTeams: teams[report.season],
        depth,
      });
      return {
        preset,
        depth,
        ratings: result.ratings.map((p) => ({
          playerId: p.playerId,
          rating: p.overallValue,
          rank: p.overallRank,
          qualification: p.qualification,
        })),
        references: result.references,
      };
    },
  );
  const pool = rankNhlPooledGoalieReferencePreview({
    currentSeason: report.season,
    currentRevision: `${report.version}:gb`,
    current,
    baseOverall: annual,
    historical: history.value,
    teamsBySeason: teams,
  });
  for (const entry of codeHashes)
    requireTrue(
      hash(await readFile(entry.path, "utf8")) === entry.sha256,
      "Composition code changed during export",
    );
  const metadata = {
    method: METHOD,
    season: report.season,
    gameType: report.gameType,
    localOnly: true,
    researchOnly: true,
    publishable: false,
    published: false,
    primary: {
      learner: "GB whole-game crossfit",
      reference: "annual same-position depth proxy",
      units: "goals above same-position depth reference",
      depth: NHL_REPLACEMENT_DEPTH_PRESETS.default,
    },
    ability:
      "Separate shrinkage-based contribution per60 estimate and within-position rank, copied unchanged from source; predictive calibration remains exploratory",
    referenceReview: {
      confirmationSeason,
      appliesTo:
        report.season === confirmationSeason
          ? "same target valuation bytes"
          : "historical application of reviewed fixed annual method",
      experimentalCandidate: "10000-minute blended goalie saving reference",
      experimentalCandidateConfirmed: referenceReview.decision.supported,
      decisionRows: referenceReview.decision.rows,
      primaryReferenceSelection:
        "Annual for every input season; reference-review result never selects a method",
      caveats: referenceReview.caveats,
    },
    inputs: [input, base, audit, history, teamFile, review, seal].map(
      ({ path, sha256 }) => ({ path, sha256 }),
    ),
    codeHashes,
    limitations: [
      "Local reviewed composition, not published or publisher-compatible.",
      "Depth sensitivities are policy alternatives, not confidence intervals.",
      "2025 legacy outcomes were inspected before new reconstructed-pipeline confirmation; no globally untouched-season or causal-attribution claim.",
      "Annual replacement is an exposure-defined proxy, not demonstrated freely available talent.",
      "Goalie puck handling, rebound control and chance prevention are not separately identified or credited; saving plus recorded finishing/penalty contributions do not establish complete goalie value.",
    ],
  };
  const output = resolve(values.output);
  await mkdir(output);
  const save = (name: string, value: unknown) =>
    writeFile(resolve(output, name), JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
  await save("ratings.json", { ...metadata, ratings });
  await save("sensitivity.json", {
    method: METHOD,
    season: report.season,
    notConfidenceIntervals: true,
    sensitivities,
  });
  await save("references.json", {
    method: METHOD,
    season: report.season,
    primaryAnnual: annual.references,
    experimentalOnly: {
      purePool: pool.reference,
      historicalSeasons: pool.historicalSeasons,
      blendedCandidateReview: metadata.referenceReview,
    },
  });
  const columns = [
    "playerId",
    "name",
    "position",
    "ratingGoalsAboveReference",
    "overallRank",
    "qualification",
    "status",
    "offensiveProcess",
    "defensiveProcess",
    "finishing",
    "penalties",
    "saving",
    "abilityPer60",
    "abilityPositionRank",
  ];
  const cell = (value: unknown) => {
    const s = value == null ? "" : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const csv =
    [
      columns,
      ...ratings.map((p) => [
        p.playerId,
        p.name,
        p.position,
        p.rating,
        p.rank,
        p.qualification,
        p.status,
        p.components?.offensiveProcess,
        p.components?.defensiveProcess,
        p.components?.finishing,
        p.components?.penalties,
        p.components?.saving,
        p.ability.per60,
        p.ability.positionRank,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\n") + "\n";
  await writeFile(resolve(output, "ratings.csv"), csv, { flag: "wx" });
  console.log(
    JSON.stringify({
      method: METHOD,
      season: report.season,
      players: ratings.length,
      ranked: ratings.filter((p) => p.rank !== null).length,
      primaryReference: "annual",
      experimentalBlendConfirmed: referenceReview.decision.supported,
      output,
    }),
  );
}
