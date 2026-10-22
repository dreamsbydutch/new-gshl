import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadAuditedRetrospectiveShots } from "./retrospective-shot-source";
import { verifyOfficialGoalCoverageFromCache } from "./official-goal-physical-audit";
import {
  prepareHockeyOverallPublication,
  type HockeyValueReport,
} from "../../domains/nhl/hockey-overall-publication";

export type HockeyBuildSeason = {
  seasonId: string;
  name: string;
  nhlSeason: number;
  state: "completed" | "current" | "future";
  asOf: string;
  status: "ready" | "failed" | "pending";
  valuesDirectory?: string;
  ratingsSha256?: string;
  overallSha256?: string;
  sourceAuditSha256?: string;
  sourcePath?: string;
  sourceSha256?: string;
  oofDirectory?: string;
  shotRowsPath?: string;
  error?: string;
};
export type HockeyBuildSummary = {
  version: string;
  policy: { path: string; sha256: string };
  inventory: { path: string; sha256: string };
  codeHashes: Array<{ path: string; sha256: string }>;
  seasons: HockeyBuildSeason[];
  pending: HockeyBuildSeason[];
};
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function insist(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
export async function loadHockeyOverallPublication(
  summaryPath: string,
  season?: number,
) {
  const summaryText = await readFile(resolve(summaryPath), "utf8"),
    summary = JSON.parse(summaryText) as HockeyBuildSummary;
  insist(
    summary.version === "nhl-hockey-overall-build-v1" &&
      Array.isArray(summary.seasons),
    "Verified build summary required",
  );
  const [policyText, inventoryText] = await Promise.all([
    readFile(summary.policy.path, "utf8"),
    readFile(summary.inventory.path, "utf8"),
  ]);
  insist(
    hash(policyText) === summary.policy.sha256 &&
      hash(inventoryText) === summary.inventory.sha256,
    "Production policy/inventory bytes changed",
  );
  const inventory = JSON.parse(inventoryText) as {
    version: string;
    seasons: Array<{
      seasonId: string;
      name: string;
      nhlSeason: number;
      state: string;
      asOf: string;
    }>;
  };
  insist(
    inventory.version === "nhl-hockey-overall-inventory-v1" &&
      new Set(inventory.seasons.map((s) => s.seasonId)).size ===
        inventory.seasons.length &&
      new Set(inventory.seasons.map((s) => s.nhlSeason)).size ===
        inventory.seasons.length,
    "Unique explicit database-season inventory required",
  );
  for (const entry of summary.codeHashes)
    insist(
      hash(await readFile(entry.path, "utf8")) === entry.sha256,
      `Build code changed: ${entry.path}`,
    );
  const selected = summary.seasons.filter(
    (s) => season === undefined || s.nhlSeason === season,
  );
  insist(
    selected.length > 0 &&
      new Set(selected.map((s) => s.nhlSeason)).size === selected.length,
    "Selected season absent or duplicate",
  );
  const plans = [];
  const excluded = [];
  for (const entry of selected) {
    const identity = inventory.seasons.find(
      (s) => s.nhlSeason === entry.nhlSeason,
    );
    insist(
      identity &&
        identity.seasonId === entry.seasonId &&
        identity.name === entry.name &&
        identity.state === entry.state,
      "Build/database inventory identity differs",
    );
    if (entry.status !== "ready") {
      excluded.push(entry);
      continue;
    }
    insist(
      entry.state !== "future" &&
        entry.valuesDirectory &&
        entry.sourcePath &&
        entry.sourceSha256 &&
        entry.oofDirectory &&
        entry.shotRowsPath,
      "Ready season lacks source artifact paths",
    );
    const [sourceText, valueText, overallText, auditText] = await Promise.all([
      readFile(entry.sourcePath, "utf8"),
      ...["ratings.json", "overall.json", "source-audit.json"].map((name) =>
        readFile(resolve(entry.valuesDirectory!, name), "utf8"),
      ),
    ]);
    insist(
      hash(sourceText) === entry.sourceSha256 &&
        hash(valueText) === entry.ratingsSha256 &&
        hash(overallText) === entry.overallSha256 &&
        hash(auditText) === entry.sourceAuditSha256,
      "Immutable season artifact hashes differ",
    );
    const raw = JSON.parse(valueText) as HockeyValueReport;
    const requiredCore = [
      "nhl-adjusted-impact.ts",
      "nhl-game-season-value.ts",
      "nhl-overall-rating.ts",
      "nhl-shot-quality.ts",
      "nhl-shot-nonlinear.ts",
    ];
    for (const name of requiredCore) {
      const binding = raw.provenance.codeHashes.find((item) =>
        item.path.endsWith(`/runtime/${name}`),
      );
      insist(
        binding &&
          hash(await readFile(binding.path, "utf8")) === binding.sha256,
        `Calculation core differs from raw artifact: ${name}`,
      );
    }
    const replay = await loadAuditedRetrospectiveShots(
      entry.oofDirectory,
      entry.shotRowsPath,
    );
    insist(
      raw.provenance.sourceCacheDirectory &&
        raw.provenance.gameSourceHashes &&
        raw.provenance.gameSourcesHash &&
        raw.provenance.penaltyShotModel &&
        raw.officialOnGoalCoverage,
      "Fresh source-bound official goal/on-goal audits required; regenerate an audited value report for this archived calculation",
    );
    const officialGoalProof = await verifyOfficialGoalCoverageFromCache({
      cacheDirectory: raw.provenance.sourceCacheDirectory,
      sourceText,
      season: entry.nhlSeason,
      gameType: 2,
      expectedCanonicalSourceSha256: entry.sourceSha256,
      gameSourceHashes: raw.provenance.gameSourceHashes,
      expectedGameSourcesHash: raw.provenance.gameSourcesHash,
      penaltyShotProbability: raw.provenance.penaltyShotModel.probability,
    });
    const prepared = prepareHockeyOverallPublication({
      season: entry.nhlSeason,
      sourceText,
      valueText,
      overallText,
      auditText,
      policyText,
      policyHash: summary.policy.sha256,
      nativeInference: replay.audit,
      officialGoalProof,
    });
    plans.push({
      season: entry,
      metadata: { seasonId: entry.seasonId, ...prepared.metadata },
      results: prepared.results,
      officialGoalProof,
    });
  }
  const pending = summary.pending.filter(
    (s) => season === undefined || s.nhlSeason === season,
  );
  return {
    summaryHash: hash(summaryText),
    policyHash: summary.policy.sha256,
    inventoryHash: summary.inventory.sha256,
    plans,
    excluded,
    pending,
  };
}
