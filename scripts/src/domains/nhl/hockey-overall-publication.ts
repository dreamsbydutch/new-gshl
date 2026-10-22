import { createHash } from "node:crypto";
import {
  rankNhlReplacementPreview,
  NHL_REPLACEMENT_DEPTH_PRESETS,
} from "../../runtime/nhl-overall-rating";
import type { ImpactModel } from "../../runtime/nhl-adjusted-impact";
import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";
import {
  buildNhlRatingInput,
  type NhlRatingSource,
} from "./season-rating-input";
import {
  assertOfficialGoalQualification,
  type summarizeOfficialGoalCoverage,
} from "./official-goal-coverage";
import {
  assertOfficialOnGoalQualification,
  type summarizeOfficialOnGoalCoverage,
  type summarizeOfficialSourceCoverage,
} from "./official-on-goal-coverage";

export const NHL_HOCKEY_OVERALL_PUBLICATION = {
  modelVersion: "nhl-hockey-overall-reviewed-v1",
  revision: "2026-10-19-reviewed-annual-crossfit",
  units: "goals-above-same-position-reference",
  reference: "annual-depth-proxy",
} as const;
export type HockeyInferenceProof = {
  passed: boolean;
  sourceRowsSha256: string;
  sourceRowsFileSha256: string;
  analysisSha256: string;
  predictionsSha256: string;
  foldManifestSha256: string;
  foldFitManifestSha256: string;
  shots: number;
  games: number;
  maximumGbProbabilityError: number;
  maximumGlmProbabilityError: number;
};
export type HockeyValueReport = {
  version: string;
  season: number;
  gameType: number;
  provenance: {
    season: number;
    canonicalSourceSha256: string;
    rowsSha256: string;
    allRowInferenceAudit: HockeyInferenceProof;
    codeHashes: Array<{ path: string; sha256: string }>;
    sourceCacheDirectory?: string;
    gameSourceHashes?: Array<{ gameId: number; sha256: string }>;
    gameSourcesHash?: string;
    penaltyShotModel?: { probability: number };
  };
  sourceGates: Record<string, boolean>;
  residualCreditAudit: {
    gb: {
      passed: boolean;
      maximumPlayerError: number;
      perPlayerRoundingTolerance: number;
      unrepresentedEventPlayers: unknown[];
    };
  };
  qualificationInvariant: { passed: boolean; players: number };
  gb: { model: ImpactModel; ratings: GameSeasonRating[] };
  glm: { ratings: GameSeasonRating[] };
  officialGoalCoverage?: {
    glm: ReturnType<typeof summarizeOfficialGoalCoverage>;
    gb: ReturnType<typeof summarizeOfficialGoalCoverage>;
  };
  officialOnGoalCoverage?: {
    glm: ReturnType<typeof summarizeOfficialOnGoalCoverage>;
    gb: ReturnType<typeof summarizeOfficialOnGoalCoverage>;
  };
};
export type HockeyOverallResult = {
  nhlPlayerId: number;
  name: string;
  team: string;
  position: "F" | "D" | "G";
  games: number;
  minutes: number;
  status: GameSeasonRating["status"];
  missing: string[];
  seasonValue: number | null;
  seasonRating: null;
  impactPer60: null;
  rank: number | null;
  hockeyOverall: {
    revision: typeof NHL_HOCKEY_OVERALL_PUBLICATION.revision;
    method: typeof NHL_HOCKEY_OVERALL_PUBLICATION.modelVersion;
    units: typeof NHL_HOCKEY_OVERALL_PUBLICATION.units;
    reference: typeof NHL_HOCKEY_OVERALL_PUBLICATION.reference;
    qualification:
      | "ranked"
      | "provisional"
      | "incomplete"
      | "insufficient-reference";
    sourceStatus: GameSeasonRating["status"];
    components: {
      offensiveProcess: number;
      defensiveProcess: number;
      finishing: number;
      penalties: number;
      saving: number;
    } | null;
    abilityPer60: number | null;
    abilityPositionRank: number | null;
    coverage: GameSeasonRating["componentCoverage"];
    modeledMinutes: number;
    includedGames: number;
    verifiedGames: number;
    sourceArtifactHash: string;
    rawValueArtifactHash: string;
    referenceArtifactHash: string;
    warnings: string[];
    depthSensitivity: {
      narrower: { value: number | null; rank: number | null };
      wider: { value: number | null; rank: number | null };
    };
  };
};
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function insist(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
const sourceGates = [
  "officialSeasonExposureMatches",
  "completeDownload",
  "atLeast98PercentProcessExposureVerified",
  "atLeast98PercentIndividualShotsVerified",
] as const;

/** Pure publication bridge: verify source/results and reconstruct the selected math. */
export function prepareHockeyOverallPublication(input: {
  season: number;
  sourceText: string;
  valueText: string;
  overallText: string;
  auditText: string;
  policyText: string;
  policyHash: string;
  nativeInference: HockeyInferenceProof;
  officialGoalProof?: {
    passed: boolean;
    season: number;
    gameType: number;
    canonicalSourceSha256: string;
    gameSourcesHash: string;
    goalCoverage: ReturnType<typeof summarizeOfficialGoalCoverage>;
    onGoalCoverage?: ReturnType<typeof summarizeOfficialOnGoalCoverage>;
    sourceCoverage?: ReturnType<typeof summarizeOfficialSourceCoverage>;
  };
}) {
  const source = JSON.parse(input.sourceText) as { nhl: NhlRatingSource };
  const report = JSON.parse(input.valueText) as HockeyValueReport;
  const saved = JSON.parse(input.overallText) as {
    version: string;
    season: number;
    gb: ReturnType<typeof rankNhlReplacementPreview>;
  };
  const audit = JSON.parse(input.auditText) as {
    version: string;
    provenance: HockeyValueReport["provenance"];
    sourceGates: Record<string, boolean>;
    officialGoalCoverage?: HockeyValueReport["officialGoalCoverage"];
    officialOnGoalCoverage?: HockeyValueReport["officialOnGoalCoverage"];
    coverage: {
      officialSeconds: number;
      usableSeconds: number;
      officialShots: number;
      verifiedShots: number;
    };
  };
  insist(
    hash(input.policyText) === input.policyHash &&
      input.policyText.includes("Status: **SEALED fixed production method") &&
      input.policyText.includes("# Reviewed NHL hockey overall method"),
    "Sealed production method policy required",
  );
  insist(
    source.nhl.season === input.season &&
      source.nhl.gameType === 2 &&
      source.nhl.profile === "core" &&
      report.season === input.season &&
      report.gameType === 2 &&
      report.provenance.season === input.season &&
      saved.season === input.season,
    "Publication season/source scope differs",
  );
  insist(
    report.version === "nhl-retrospective-season-values-research-v1" &&
      saved.version === "nhl-retrospective-overall-research-v1" &&
      audit.version === "nhl-retrospective-value-source-audit-v1",
    "Recognized immutable calculation artifacts required",
  );
  insist(
    report.provenance.canonicalSourceSha256 === hash(input.sourceText) &&
      JSON.stringify(audit.provenance) === JSON.stringify(report.provenance),
    "Canonical source/audit provenance differs",
  );
  insist(
    sourceGates.every(
      (key) =>
        report.sourceGates[key] === true && audit.sourceGates[key] === true,
    ),
    "All four physical publication gates must pass",
  );
  const coverage = audit.coverage;
  if (input.officialGoalProof || report.officialGoalCoverage) {
    const proof = input.officialGoalProof;
    insist(
      proof?.passed === true &&
        proof.season === input.season &&
        proof.gameType === 2 &&
        proof.canonicalSourceSha256 === hash(input.sourceText) &&
        proof.gameSourcesHash === report.provenance.gameSourcesHash,
      "Fresh independent official goal coverage proof required",
    );
    assertOfficialGoalQualification(
      source.nhl,
      proof.goalCoverage,
      report.gb.ratings,
    );
    assertOfficialGoalQualification(
      source.nhl,
      proof.goalCoverage,
      report.glm.ratings,
    );
    insist(
      report.officialGoalCoverage &&
        JSON.stringify(report.officialGoalCoverage.gb) ===
          JSON.stringify(proof.goalCoverage) &&
        JSON.stringify(report.officialGoalCoverage.glm) ===
          JSON.stringify(proof.goalCoverage),
      "Retained official goal ledger differs from independent source replay",
    );
    insist(
      JSON.stringify(audit.officialGoalCoverage) ===
        JSON.stringify(report.officialGoalCoverage),
      "Official goal audit and value report differ",
    );
  }
  if (
    input.officialGoalProof?.onGoalCoverage ||
    report.officialOnGoalCoverage
  ) {
    const proof = input.officialGoalProof;
    insist(
      proof?.passed === true &&
        proof.onGoalCoverage &&
        proof.season === input.season &&
        proof.gameType === 2 &&
        proof.canonicalSourceSha256 === hash(input.sourceText) &&
        proof.gameSourcesHash === report.provenance.gameSourcesHash,
      "Fresh independent official on-goal coverage proof required",
    );
    assertOfficialOnGoalQualification(
      source.nhl,
      proof.onGoalCoverage,
      report.gb.ratings,
    );
    assertOfficialOnGoalQualification(
      source.nhl,
      proof.onGoalCoverage,
      report.glm.ratings,
    );
    insist(
      report.officialOnGoalCoverage &&
        JSON.stringify(report.officialOnGoalCoverage.gb) ===
          JSON.stringify(proof.onGoalCoverage) &&
        JSON.stringify(report.officialOnGoalCoverage.glm) ===
          JSON.stringify(proof.onGoalCoverage),
      "Retained official on-goal ledger differs from independent source replay",
    );
    insist(
      JSON.stringify(audit.officialOnGoalCoverage) ===
        JSON.stringify(report.officialOnGoalCoverage),
      "Official on-goal audit and value report differ",
    );
    insist(
      proof.sourceCoverage &&
        JSON.stringify(proof.sourceCoverage.coverage) ===
          JSON.stringify(coverage) &&
        JSON.stringify(proof.sourceCoverage.sourceGates) ===
          JSON.stringify(report.sourceGates) &&
        JSON.stringify(proof.sourceCoverage.sourceGates) ===
          JSON.stringify(audit.sourceGates),
      "Fresh aggregate source coverage/gates differ from retained evidence",
    );
  }
  insist(
    [
      coverage.officialSeconds,
      coverage.usableSeconds,
      coverage.officialShots,
      coverage.verifiedShots,
    ].every((x) => Number.isFinite(x) && x >= 0) &&
      coverage.officialSeconds > 0 &&
      coverage.officialShots > 0 &&
      coverage.usableSeconds / coverage.officialSeconds >= 0.98 &&
      coverage.verifiedShots / coverage.officialShots >= 0.98,
    "Physical coverage evidence does not support gates",
  );
  const proof = input.nativeInference,
    retained = report.provenance.allRowInferenceAudit;
  insist(
    proof.passed === true &&
      retained.passed === true &&
      proof.shots > 0 &&
      proof.games > 0 &&
      proof.sourceRowsSha256 === report.provenance.rowsSha256 &&
      [proof.maximumGbProbabilityError, proof.maximumGlmProbabilityError].every(
        (x) => Number.isFinite(x) && x >= 0 && x < 1e-12,
      ),
    "Fresh complete native all-row inference replay required",
  );
  for (const key of [
    "sourceRowsSha256",
    "sourceRowsFileSha256",
    "analysisSha256",
    "predictionsSha256",
    "foldManifestSha256",
    "foldFitManifestSha256",
    "shots",
    "games",
    "maximumGbProbabilityError",
    "maximumGlmProbabilityError",
  ] as const)
    insist(
      proof[key] === retained[key],
      "Fresh inference proof differs from raw value artifacts",
    );
  insist(
    report.gb.model.converged &&
      report.gb.model.lambda === 4 &&
      !report.gb.model.experimentalCohortRegularization &&
      Object.values(report.gb.model.coefficients).every(Number.isFinite),
    "Selected independent-prior GB model must converge at lambda4",
  );
  const residual = report.residualCreditAudit.gb;
  insist(
    residual.passed === true &&
      Number.isFinite(residual.maximumPlayerError) &&
      residual.maximumPlayerError >= 0 &&
      residual.maximumPlayerError <= 0.000050001 &&
      Number.isFinite(residual.perPlayerRoundingTolerance) &&
      residual.perPlayerRoundingTolerance >= 0 &&
      residual.maximumPlayerError <= residual.perPlayerRoundingTolerance &&
      residual.perPlayerRoundingTolerance <= 0.000050001 &&
      !residual.unrepresentedEventPlayers.length,
    "Per-player event-credit audit failed",
  );
  insist(
    report.qualificationInvariant.passed === true &&
      report.qualificationInvariant.players === report.gb.ratings.length,
    "Qualification invariance not verified",
  );
  const official = buildNhlRatingInput(source.nhl).players.filter(
    (p) => p.games > 0 && p.minutes > 0,
  );
  const officialTeams = new Set<string>();
  for (const player of official) {
    const teams = player.team.split(",").map((team) => team.trim());
    insist(
      teams.every(
        (team) =>
          /^[A-Z]{3}$/.test(team) &&
          !["UNK", "TOT", "TBD", "TBA", "NHL", "ALL"].includes(team),
      ),
      "Canonical official team abbreviations are incomplete or ambiguous",
    );
    teams.forEach((team) => officialTeams.add(team));
  }
  insist(
    officialTeams.size > 0 && saved.gb.numberOfTeams === officialTeams.size,
    "Saved replacement team count differs from independently observed official teams",
  );
  const officialById = new Map(official.map((p) => [p.playerId, p]));
  const glmById = new Map(report.glm.ratings.map((p) => [p.playerId, p]));
  const ids = new Set<number>();
  insist(
    official.length === report.gb.ratings.length &&
      glmById.size === report.gb.ratings.length,
    "Official/matched player populations differ",
  );
  for (const p of report.gb.ratings) {
    const expected = officialById.get(p.playerId),
      other = glmById.get(p.playerId);
    insist(
      expected &&
        other &&
        !ids.has(p.playerId) &&
        p.name === expected.name &&
        p.position === expected.position &&
        p.games === expected.games &&
        p.minutes === expected.minutes,
      "Player identity/official exposure differs",
    );
    ids.add(p.playerId);
    insist(
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
          JSON.stringify(p[key as keyof GameSeasonRating]) ===
          JSON.stringify(other[key as keyof GameSeasonRating]),
      ),
      "Player source status/coverage changed between learners",
    );
    insist(
      Object.values(p.components).every(Number.isFinite) &&
        Object.values(p.componentCoverage).every(
          (x) => Number.isFinite(x) && x >= 0,
        ) &&
        Number.isFinite(p.modeledMinutes) &&
        p.modeledMinutes >= 0 &&
        Number.isInteger(p.includedGames) &&
        Number.isInteger(p.verifiedGames) &&
        p.verifiedGames >= 0 &&
        p.verifiedGames <= p.includedGames &&
        p.includedGames <= p.games,
      "Invalid raw player evidence",
    );
    const value =
      (p.position === "G"
        ? p.components.saving
        : p.components.adjustedProcess) +
      p.components.finishing +
      p.components.penalties;
    insist(
      p.seasonValue === null ||
        (Number.isFinite(p.seasonValue) &&
          Math.abs(value - p.seasonValue) <= 0.000200001),
      "Raw season components do not reconcile",
    );
    insist(
      p.abilityPer60 === null || Number.isFinite(p.abilityPer60),
      "Nonfinite separate ability",
    );
    insist(
      p.status === "rated"
        ? p.abilityPer60 !== null &&
            p.abilityRank !== null &&
            Number.isInteger(p.abilityRank) &&
            p.abilityRank > 0
        : p.abilityRank === null,
      "Separate ability qualification differs",
    );
  }
  const current = { model: report.gb.model, ratings: report.gb.ratings };
  const annual = rankNhlReplacementPreview({
    ...current,
    numberOfTeams: saved.gb.numberOfTeams,
  });
  insist(
    JSON.stringify(annual) === JSON.stringify(saved.gb),
    "Saved annual GB values/references/ranks do not exactly reproduce",
  );
  const narrow = rankNhlReplacementPreview({
    ...current,
    numberOfTeams: saved.gb.numberOfTeams,
    depth: NHL_REPLACEMENT_DEPTH_PRESETS.narrow,
  });
  const wide = rankNhlReplacementPreview({
    ...current,
    numberOfTeams: saved.gb.numberOfTeams,
    depth: NHL_REPLACEMENT_DEPTH_PRESETS.wide,
  });
  const alternatives = {
    narrower: new Map(narrow.ratings.map((p) => [p.playerId, p])),
    wider: new Map(wide.ratings.map((p) => [p.playerId, p])),
  };
  const rawById = new Map(report.gb.ratings.map((p) => [p.playerId, p]));
  const sourceArtifactHash = hash(input.sourceText),
    rawValueArtifactHash = hash(input.valueText),
    referenceArtifactHash = hash(input.overallText);
  const results: HockeyOverallResult[] = annual.ratings.map((p) => {
    const raw = rawById.get(p.playerId)!;
    const qualification =
      p.qualification === "unqualified" && raw.status !== "rated"
        ? raw.status
        : p.qualification;
    insist(
      qualification === "ranked" ||
        qualification === "provisional" ||
        qualification === "incomplete" ||
        qualification === "insufficient-reference",
      "Unknown overall qualification",
    );
    const expected = officialById.get(p.playerId)!;
    return {
      nhlPlayerId: p.playerId,
      name: p.name,
      team: expected.team,
      position: p.position,
      games: raw.games,
      minutes: raw.minutes,
      status: raw.status,
      missing: raw.status === "incomplete" ? ["hockeyOverall.coverage"] : [],
      seasonValue: p.overallValue,
      seasonRating: null,
      impactPer60: null,
      rank: p.overallRank,
      hockeyOverall: {
        revision: NHL_HOCKEY_OVERALL_PUBLICATION.revision,
        units: NHL_HOCKEY_OVERALL_PUBLICATION.units,
        reference: NHL_HOCKEY_OVERALL_PUBLICATION.reference,
        method: NHL_HOCKEY_OVERALL_PUBLICATION.modelVersion,
        qualification,
        sourceStatus: raw.status,
        components: p.components ? { ...p.components } : null,
        abilityPer60: raw.abilityPer60,
        abilityPositionRank: raw.abilityRank,
        coverage: { ...raw.componentCoverage },
        modeledMinutes: raw.modeledMinutes,
        includedGames: raw.includedGames,
        verifiedGames: raw.verifiedGames,
        sourceArtifactHash,
        rawValueArtifactHash,
        referenceArtifactHash,
        warnings: [
          ...new Set([
            ...raw.warnings,
            ...p.warnings,
            "Depth sensitivities are fixed policy alternatives, not confidence intervals.",
            "Goalie puck handling, rebound control and chance prevention are not separately identified or credited.",
          ]),
        ],
        depthSensitivity: {
          narrower: {
            value: alternatives.narrower.get(p.playerId)!.overallValue,
            rank: alternatives.narrower.get(p.playerId)!.overallRank,
          },
          wider: {
            value: alternatives.wider.get(p.playerId)!.overallValue,
            rank: alternatives.wider.get(p.playerId)!.overallRank,
          },
        },
      },
    };
  });
  const sourceFetchedAt = Date.parse(source.nhl.fetchedAt);
  insist(
    Number.isFinite(sourceFetchedAt) && sourceFetchedAt > 0,
    "Invalid canonical source timestamp",
  );
  return {
    metadata: {
      nhlSeason: input.season,
      gameType: 2 as const,
      profile: "core" as const,
      modelVersion: NHL_HOCKEY_OVERALL_PUBLICATION.modelVersion,
      sourceFetchedAt,
      sourceHash: hash(
        JSON.stringify({
          method: NHL_HOCKEY_OVERALL_PUBLICATION,
          sourceArtifactHash,
          rawValueArtifactHash,
          referenceArtifactHash,
          auditHash: hash(input.auditText),
          policyHash: hash(input.policyText),
          inference: {
            sourceRowsSha256: proof.sourceRowsSha256,
            analysisSha256: proof.analysisSha256,
            predictionsSha256: proof.predictionsSha256,
            foldManifestSha256: proof.foldManifestSha256,
            foldFitManifestSha256: proof.foldFitManifestSha256,
          },
        }),
      ),
    },
    results,
  };
}
