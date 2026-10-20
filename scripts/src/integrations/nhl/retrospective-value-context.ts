import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ImpactModel } from "../../runtime/nhl-adjusted-impact";
import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";
import type {
  ShotQualityModel,
  fitPenaltyShotBaseline,
} from "../../runtime/nhl-shot-quality";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
type SourceHash = { gameId: number; sha256: string };
type Original = {
  model: ImpactModel;
  ratings: GameSeasonRating[];
  shotQuality: { model: ShotQualityModel };
};
type Frozen = { model: ImpactModel; ratings: GameSeasonRating[] };
export type RetrospectiveSourceManifest = {
  version: "nhl-retrospective-source-manifest-v1";
  publishable: false;
  season: number;
  gameType: 2 | 3;
  officialTeamCount: number;
  officialGames: number;
  loadedGames: number;
  canonicalSourceSha256: string;
  abilityPriorsSha256: string;
  gameSourcesHash: string;
  gameSourceHashes: SourceHash[];
  rowsSha256: string;
  rowsFileSha256: string;
  scheduleSha256: string;
  penaltyShotModel: ReturnType<typeof fitPenaltyShotBaseline>;
  penaltyShotHistorySha256: string;
  penaltyShotReportSha256: string;
  sourceGates: Record<string, boolean>;
  passesSourceGates: boolean;
  sourceAuditSha256: string;
  sourcePreparationCodeHashes: Array<{ path: string; sha256: string }>;
};
export type RetrospectiveValueContext = {
  mode: "reviewed-four-way" | "source-manifest-two-way";
  season: number;
  gameType: 2 | 3;
  officialTeamCount: number;
  officialGames: number;
  sourceText: string;
  priorText: string;
  gameSourcesHash: string;
  gameSourceHashes: SourceHash[];
  penaltyShotModel: { probability: number };
  lambdas: { glm: number; gb: number };
  original: Original | null;
  frozen: Frozen | null;
  manifest: RetrospectiveSourceManifest | null;
  policySha256: string | null;
  provenance: Record<string, unknown>;
};

/** Normalize actual reviewed artifacts or an explicit unfitted source manifest. */
export async function loadRetrospectiveValueContext(input: {
  report?: string;
  sourceManifest?: string;
  chronologicalImpact?: string;
  policy?: string;
  baseline: string;
}): Promise<RetrospectiveValueContext> {
  if (Boolean(input.report) === Boolean(input.sourceManifest))
    throw new Error("Choose exactly one reviewed report or source manifest");
  if (input.sourceManifest) {
    if (input.chronologicalImpact || !input.policy)
      throw new Error(
        "Source-manifest mode requires --policy and forbids chronological impact inputs",
      );
    const manifestText = await readFile(resolve(input.sourceManifest), "utf8");
    const manifest = JSON.parse(manifestText) as RetrospectiveSourceManifest;
    const policyText = await readFile(resolve(input.policy), "utf8");
    if (!policyText.includes("Status: **SEALED"))
      throw new Error(
        "Retrospective valuation requires an explicitly SEALED policy",
      );
    if (
      manifest.version !== "nhl-retrospective-source-manifest-v1" ||
      !Number.isInteger(manifest.season) ||
      Math.floor(manifest.season / 10000) + 1 !== manifest.season % 10000 ||
      ![2, 3].includes(manifest.gameType) ||
      !Number.isInteger(manifest.officialTeamCount) ||
      manifest.officialTeamCount <= 0 ||
      !Number.isInteger(manifest.officialGames) ||
      !Number.isInteger(manifest.loadedGames) ||
      manifest.publishable !== false ||
      !manifest.passesSourceGates ||
      ![
        "officialSeasonExposureMatches",
        "completeDownload",
        "atLeast98PercentProcessExposureVerified",
        "atLeast98PercentIndividualShotsVerified",
      ].every((key) => manifest.sourceGates?.[key] === true) ||
      manifest.loadedGames !== manifest.officialGames ||
      manifest.officialGames <= 0 ||
      hash(JSON.stringify(manifest.gameSourceHashes)) !==
        manifest.gameSourcesHash
    )
      throw new Error("Complete passing source-only manifest required");
    const auditText = await readFile(
      resolve(dirname(input.sourceManifest), "game-audit.json"),
      "utf8",
    );
    if (
      hash(auditText) !== manifest.sourceAuditSha256 ||
      !manifest.sourcePreparationCodeHashes?.length
    )
      throw new Error(
        "Source-only physical audit or preparation code binding differs",
      );
    const sourceText = await readFile(
      resolve(input.baseline, String(manifest.season), "source.json"),
      "utf8",
    );
    const priorText = await readFile(
      resolve(input.baseline, String(manifest.season), "ratings.json"),
      "utf8",
    );
    if (
      hash(sourceText) !== manifest.canonicalSourceSha256 ||
      hash(priorText) !== manifest.abilityPriorsSha256
    )
      throw new Error("Source-only canonical source/prior hashes differ");
    if (
      manifest.penaltyShotModel.beforeSeason !== manifest.season ||
      manifest.penaltyShotModel.fromSeason >= manifest.season ||
      manifest.penaltyShotModel.gameType !== manifest.gameType ||
      !(
        manifest.penaltyShotModel.probability > 0 &&
        manifest.penaltyShotModel.probability < 1
      )
    )
      throw new Error(
        "Penalty-shot prior is not an independent past-season baseline",
      );
    return {
      mode: "source-manifest-two-way",
      season: manifest.season,
      gameType: manifest.gameType,
      officialTeamCount: manifest.officialTeamCount,
      officialGames: manifest.officialGames,
      sourceText,
      priorText,
      gameSourcesHash: manifest.gameSourcesHash,
      gameSourceHashes: manifest.gameSourceHashes,
      penaltyShotModel: manifest.penaltyShotModel,
      lambdas: { glm: 4, gb: 4 },
      original: null,
      frozen: null,
      manifest,
      policySha256: hash(policyText),
      provenance: {
        sourceManifestSha256: hash(manifestText),
        sourcePolicySha256: hash(policyText),
        canonicalSourceSha256: hash(sourceText),
        abilityPriorsSha256: hash(priorText),
        penaltyShotModel: manifest.penaltyShotModel,
        penaltyShotHistorySha256: manifest.penaltyShotHistorySha256,
        sourceInputMode: "source-manifest-two-way",
      },
    };
  }
  if (!input.report || !input.chronologicalImpact || input.policy)
    throw new Error(
      "Reviewed mode requires report and chronological impact; no source-only policy flag",
    );
  const reportText = await readFile(
    resolve(input.report, "ratings.json"),
    "utf8",
  );
  const report = JSON.parse(reportText) as Original & {
    version: string;
    season: number;
    gameType: 2 | 3;
    completeSourceScope: boolean;
    officialTeamCount: number;
    sourceHash: string;
    priorHash: string;
    gameSourcesHash: string;
    penaltyShotModel: { probability: number };
    qualityGate: { passes: boolean };
  };
  if (
    report.version !== "nhl-season-value-v3" ||
    !report.completeSourceScope ||
    report.qualityGate?.passes !== true ||
    !report.model?.converged ||
    !report.shotQuality?.model
  )
    throw new Error(
      "A complete passing converged original v3 report is required",
    );
  const chronologicalText = await readFile(
    resolve(input.chronologicalImpact),
    "utf8",
  );
  const chronological = JSON.parse(chronologicalText) as {
    model: ImpactModel;
    provenance: {
      season: number;
      sourceReportSha256: string;
      gameSourcesHash: string;
      canonicalSourceSha256: string;
      abilityPriorsSha256: string;
    };
  };
  if (
    !chronological.model?.converged ||
    chronological.provenance?.season !== report.season ||
    chronological.provenance.sourceReportSha256 !== hash(reportText) ||
    chronological.provenance.gameSourcesHash !== report.gameSourcesHash
  )
    throw new Error(
      "Frozen GB lambda must come from the same source's chronological impact report",
    );
  const frozenText = await readFile(
    resolve(dirname(input.chronologicalImpact), "ratings.json"),
    "utf8",
  );
  const frozen = JSON.parse(frozenText) as Frozen & {
    season: number;
    provenance: typeof chronological.provenance;
  };
  if (
    frozen.season !== report.season ||
    JSON.stringify(frozen.model) !== JSON.stringify(chronological.model) ||
    JSON.stringify(frozen.provenance) !==
      JSON.stringify(chronological.provenance)
  )
    throw new Error(
      "Frozen GB ratings model/provenance differs from chronological analysis",
    );
  const auditText = await readFile(
    resolve(input.report, "game-audit.json"),
    "utf8",
  );
  const audit = JSON.parse(auditText) as {
    officialGames: number;
    loadedGames: number;
    failed: unknown[];
    gameSourceHashes: SourceHash[];
  };
  if (
    audit.failed.length ||
    audit.loadedGames !== audit.officialGames ||
    hash(JSON.stringify(audit.gameSourceHashes)) !== report.gameSourcesHash
  )
    throw new Error("Original source audit is incomplete or differs");
  const sourceText = await readFile(
    resolve(input.baseline, String(report.season), "source.json"),
    "utf8",
  );
  const priorText = await readFile(
    resolve(input.baseline, String(report.season), "ratings.json"),
    "utf8",
  );
  if (
    hash(sourceText) !== report.sourceHash ||
    hash(priorText) !== report.priorHash ||
    frozen.provenance.canonicalSourceSha256 !== hash(sourceText) ||
    frozen.provenance.abilityPriorsSha256 !== hash(priorText)
  )
    throw new Error("Canonical source/prior hashes differ");
  return {
    mode: "reviewed-four-way",
    season: report.season,
    gameType: report.gameType,
    officialTeamCount: report.officialTeamCount,
    officialGames: audit.officialGames,
    sourceText,
    priorText,
    gameSourcesHash: report.gameSourcesHash,
    gameSourceHashes: audit.gameSourceHashes,
    penaltyShotModel: report.penaltyShotModel,
    lambdas: { glm: report.model.lambda, gb: chronological.model.lambda },
    original: report,
    frozen,
    manifest: null,
    policySha256: null,
    provenance: {
      sourceReportSha256: hash(reportText),
      sourceAuditSha256: hash(auditText),
      canonicalSourceSha256: hash(sourceText),
      abilityPriorsSha256: hash(priorText),
      chronologicalImpactSha256: hash(chronologicalText),
      chronologicalRatingsSha256: hash(frozenText),
      sourceInputMode: "reviewed-four-way",
    },
  };
}
