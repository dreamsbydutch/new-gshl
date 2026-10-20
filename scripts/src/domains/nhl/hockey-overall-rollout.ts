import { stableJson } from "./hockey-overall-deployment";

export const rolloutDeployment = "polished-tern-709";
export const rolloutModel = "nhl-hockey-overall-reviewed-v1";
export type RolloutSeason = {
  seasonId: string;
  name: string;
  nhlSeason: number;
  state: "completed" | "current" | "future";
  asOf: string;
  reuse?: unknown;
};
export type RolloutInventory = {
  version: "nhl-hockey-overall-inventory-v1";
  target?: string;
  seasons: RolloutSeason[];
};
export function validateRolloutInventory(value: RolloutInventory) {
  if (
    value.version !== "nhl-hockey-overall-inventory-v1" ||
    (value.target !== undefined && value.target !== rolloutDeployment) ||
    !Array.isArray(value.seasons) ||
    value.seasons.length !== 16 ||
    new Set(value.seasons.map((season) => season.seasonId)).size !== 16 ||
    new Set(value.seasons.map((season) => season.nhlSeason)).size !== 16
  )
    throw Error("Original unique sixteen-season production inventory required");
  for (let start = 2013; start <= 2028; start++) {
    const year = start * 10000 + start + 1;
    const season = value.seasons.find((entry) => entry.nhlSeason === year);
    const state =
      start < 2026 ? "completed" : start === 2026 ? "current" : "future";
    if (
      !season ||
      season.state !== state ||
      !season.seasonId ||
      !season.name ||
      !Number.isFinite(Date.parse(season.asOf))
    )
      throw Error("Production inventory scope or season identity differs");
  }
  return value.seasons;
}
export type ReadyCheckpoint = {
  season: RolloutSeason;
  policySha256: string;
  artifacts: Record<string, unknown>;
};
export function validateRolloutCheckpoint(
  checkpoint: ReadyCheckpoint,
  season: RolloutSeason,
  policySha256: string,
) {
  if (
    season.state === "future" ||
    stableJson(checkpoint.season) !== stableJson(season) ||
    checkpoint.policySha256 !== policySha256 ||
    !checkpoint.artifacts
  )
    throw Error("Checkpoint inventory identity or sealed policy differs");
  for (const key of [
    "valuesDirectory",
    "sourcePath",
    "oofDirectory",
    "shotRowsPath",
  ])
    if (
      typeof checkpoint.artifacts[key] !== "string" ||
      !checkpoint.artifacts[key]
    )
      throw Error("Checkpoint lacks immutable calculation artifact paths");
  for (const key of [
    "ratingsSha256",
    "overallSha256",
    "sourceAuditSha256",
    "sourceSha256",
  ])
    if (!/^[a-f0-9]{64}$/.test(String(checkpoint.artifacts[key])))
      throw Error("Checkpoint lacks exact artifact hashes");
  return checkpoint;
}
export type RolloutCounts = {
  inserted: number;
  updated: number;
  unchanged: number;
  linked: number;
  unlinked: number[];
};
export function validateRolloutCounts(counts: RolloutCounts, rows: number) {
  if (
    !Number.isInteger(rows) ||
    rows < 1 ||
    rows > 5000 ||
    !counts ||
    ![counts.inserted, counts.updated, counts.unchanged, counts.linked].every(
      (count) => Number.isInteger(count) && count >= 0 && count <= rows,
    ) ||
    counts.updated !== 0 ||
    counts.inserted + counts.unchanged !== rows ||
    !Array.isArray(counts.unlinked) ||
    new Set(counts.unlinked).size !== counts.unlinked.length ||
    !counts.unlinked.every((id) => Number.isInteger(id) && id > 0) ||
    counts.linked + counts.unlinked.length !== rows
  )
    throw Error(
      "Additive publication counts do not reconcile or contain updates",
    );
  return counts.inserted === 0 ? "unchanged" : "would-insert";
}
export function validateRolloutPublicationScope(
  input: {
    target: string;
    deployment: string;
    table: string;
    apply: boolean;
    localOnly: boolean;
    policyHash: string;
    inventoryHash: string;
    excluded: unknown[];
    pending: unknown[];
    plans: {
      metadata: {
        seasonId: string;
        nhlSeason: number;
        gameType: number;
        profile: string;
        modelVersion: string;
      };
      results: unknown[];
    }[];
  },
  season: RolloutSeason,
  policyHash: string,
  inventoryHash: string,
  localOnly: boolean,
) {
  const plan = input.plans?.[0];
  if (
    input.target !== "production" ||
    input.deployment !== rolloutDeployment ||
    input.table !== "nhlSeasonValues" ||
    input.apply !== false ||
    input.localOnly !== localOnly ||
    input.policyHash !== policyHash ||
    input.inventoryHash !== inventoryHash ||
    input.plans.length !== 1 ||
    input.excluded.length !== 0 ||
    input.pending.length !== 0 ||
    !plan ||
    plan.metadata.seasonId !== season.seasonId ||
    plan.metadata.nhlSeason !== season.nhlSeason ||
    plan.metadata.gameType !== 2 ||
    plan.metadata.profile !== "core" ||
    plan.metadata.modelVersion !== rolloutModel ||
    !Array.isArray(plan.results) ||
    plan.results.length < 1 ||
    plan.results.length > 5000
  )
    throw Error("Publication plan escapes exact additive season namespace");
  return plan.results.length;
}
/** Mode changes may not change the exact independently verified payload. */
export function validateRolloutPlanIdentity(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
) {
  const payload = (plan: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "apply"));
  if (stableJson(payload(expected)) !== stableJson(payload(actual)))
    throw Error("Publication payload differs from dedicated reviewed dry-run");
}
