import { v, type Infer } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  nhlSeasonValueMetadata,
  nhlSeasonValueResult,
} from "./lib/nhlSeasonValueFields";
import type { nhlStatLineHockeyRating } from "./lib/nhlSeasonValueFields";
import type { Doc, Id } from "./_generated/dataModel";

export function validateSeasonValue(
  result: Infer<typeof nhlSeasonValueResult>,
  modelVersion = "nhl-season-value-v1",
) {
  const gameModel = modelVersion === "nhl-season-value-v3";
  const overallModel = modelVersion === "nhl-hockey-overall-reviewed-v1";
  if (gameModel !== Boolean(result.gameValue))
    throw new Error("Model version and game-value details differ");
  if (overallModel !== Boolean(result.hockeyOverall))
    throw new Error("Model version and hockey-overall details differ");
  if (gameModel) {
    const detail = result.gameValue!;
    const checkFinite = (value: unknown): void => {
      if (typeof value === "number" && !Number.isFinite(value))
        throw new Error("Non-finite game value");
      if (value && typeof value === "object")
        Object.values(value).forEach(checkFinite);
    };
    checkFinite(detail);
    const { offensiveProcess, defensiveProcess, adjustedProcess } =
      detail.components;
    if (
      (offensiveProcess === undefined) !== (defensiveProcess === undefined) ||
      (offensiveProcess !== undefined &&
        defensiveProcess !== undefined &&
        Math.abs(offensiveProcess + defensiveProcess - adjustedProcess) >
          0.000151)
    )
      throw new Error(
        "Offensive and defensive process must reconcile with adjusted process",
      );
    if (
      ![
        "2026-09-30-partial-games-and-penalty-shots",
        "2026-10-18-fitted-process-coverage",
        "2026-10-18-reviewed-process-and-penalties",
      ].includes(detail.revision) ||
      result.impactPer60 !== null ||
      !Number.isInteger(detail.includedGames) ||
      detail.includedGames < 0 ||
      detail.includedGames > result.games ||
      !Number.isInteger(detail.verifiedGames) ||
      detail.verifiedGames < 0 ||
      detail.verifiedGames > detail.includedGames ||
      detail.modeledMinutes < 0 ||
      detail.coverage < 0 ||
      Object.values(detail.componentCoverage).some((x) => x < 0)
    )
      throw new Error("Invalid game-value exposure or revision");
    if (
      result.status === "rated" &&
      (detail.abilityPer60 === null ||
        detail.abilityRank === null ||
        !Number.isInteger(detail.abilityRank) ||
        detail.abilityRank < 1)
    )
      throw new Error("Qualified game values require ability rank");
    if (result.status !== "rated" && detail.abilityRank !== null)
      throw new Error("Unqualified game values cannot have ability rank");
    if (
      result.status === "incomplete" &&
      (detail.observedValue !== null || detail.abilityPer60 !== null)
    )
      throw new Error("Incomplete game values cannot have ability scores");
    if (
      detail.samplingInterval &&
      (detail.samplingInterval.low > detail.samplingInterval.high ||
        detail.samplingInterval.bestRank < 1 ||
        detail.samplingInterval.bestRank > detail.samplingInterval.worstRank)
    )
      throw new Error("Invalid sampling interval");
  }
  for (const [name, value] of Object.entries(result)) {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error(`Non-finite ${name}`);
  }
  if (
    !Number.isInteger(result.nhlPlayerId) ||
    result.nhlPlayerId <= 0 ||
    !Number.isInteger(result.games) ||
    result.games <= 0 ||
    result.minutes <= 0
  )
    throw new Error("Invalid NHL identity or exposure");
  if (overallModel) {
    validateHockeyOverall(result);
    return;
  }
  if (result.status === "incomplete") {
    if (
      !result.missing.length ||
      [
        result.seasonValue,
        result.seasonRating,
        result.impactPer60,
        result.rank,
      ].some((x) => x !== null)
    )
      throw new Error("Incomplete results must not have scores");
  } else {
    if (
      result.missing.length ||
      result.seasonValue === null ||
      (!gameModel && result.impactPer60 === null)
    )
      throw new Error("Complete results require values");
    if (
      result.status === "rated" &&
      (result.rank === null ||
        !Number.isInteger(result.rank) ||
        result.rank < 1 ||
        result.seasonRating === null)
    )
      throw new Error("Qualified results require rank and percentile");
    if (
      result.status === "provisional" &&
      (result.rank !== null || result.seasonRating !== null)
    )
      throw new Error("Provisional results cannot have official ranks");
  }
  for (const score of [result.seasonRating, result.impactPer60])
    if (score !== null && (score < 0 || score > 100))
      throw new Error("Display rating outside 0–100");
}

/** This model stores its sole overall score in signed goal units, never a percentile. */
function validateHockeyOverall(result: Infer<typeof nhlSeasonValueResult>) {
  const detail = result.hockeyOverall!;
  const finite = (value: unknown): void => {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error("Non-finite hockey-overall detail");
    if (value && typeof value === "object")
      Object.values(value).forEach(finite);
  };
  finite(detail);
  const positiveRank = (value: number | null) =>
    value === null || (Number.isInteger(value) && value > 0);
  if (
    detail.method !== "nhl-hockey-overall-reviewed-v1" ||
    detail.revision !== "2026-10-19-reviewed-annual-crossfit" ||
    detail.reference !== "annual-depth-proxy" ||
    detail.units !== "goals-above-same-position-reference" ||
    detail.sourceStatus !== result.status ||
    result.seasonRating !== null ||
    result.impactPer60 !== null
  )
    throw new Error(
      "Invalid hockey-overall method or separate ability contract",
    );
  if (
    [
      detail.sourceArtifactHash,
      detail.rawValueArtifactHash,
      detail.referenceArtifactHash,
    ].some((h) => !/^[a-f0-9]{64}$/.test(h))
  )
    throw new Error("Invalid hockey-overall provenance");
  if (
    !Number.isInteger(detail.includedGames) ||
    detail.includedGames < 0 ||
    detail.includedGames > result.games ||
    !Number.isInteger(detail.verifiedGames) ||
    detail.verifiedGames < 0 ||
    detail.verifiedGames > detail.includedGames ||
    detail.modeledMinutes < 0 ||
    !Number.isInteger(detail.coverage.missingGoals) ||
    Object.values(detail.coverage).some((v) => v < 0) ||
    !positiveRank(detail.abilityPositionRank)
  )
    throw new Error("Invalid hockey-overall exposure or ability rank");
  if (
    (result.status === "rated" &&
      (detail.abilityPer60 === null || detail.abilityPositionRank === null)) ||
    (result.status !== "rated" && detail.abilityPositionRank !== null) ||
    (result.status === "incomplete" && detail.abilityPer60 !== null)
  )
    throw new Error("Invalid separate hockey ability qualification");
  // Source qualification is independent of whether replacement references exist.
  if (result.status === "rated") {
    const minutesTolerance = 0.000051 * result.minutes + 0.000051;
    const officialMinutes = result.minutes * detail.coverage.officialMinutes;
    const modeledRatio =
      result.position === "G"
        ? detail.coverage.officialMinutes
        : detail.coverage.processMinutes;
    if (
      detail.coverage.missingGoals !== 0 ||
      [
        detail.coverage.officialMinutes,
        detail.coverage.individualShots,
        ...(result.position === "G" ? [] : [detail.coverage.processMinutes]),
      ].some((c) => c < 0.95 || c > 1.03) ||
      officialMinutes + minutesTolerance <
        (result.position === "G" ? 300 : 200) ||
      detail.modeledMinutes > result.minutes * 1.03 + minutesTolerance ||
      Math.abs(detail.modeledMinutes - modeledRatio * result.minutes) >
        minutesTolerance
    )
      throw new Error("Invalid source-rated hockey exposure");
  }
  if (detail.qualification === "ranked") {
    if (
      result.status !== "rated" ||
      result.missing.length ||
      detail.components === null ||
      result.seasonValue === null ||
      result.rank === null ||
      !positiveRank(result.rank) ||
      detail.coverage.missingGoals !== 0 ||
      [
        detail.coverage.officialMinutes,
        detail.coverage.individualShots,
        ...(result.position === "G" ? [] : [detail.coverage.processMinutes]),
      ].some((c) => c < 0.95 || c > 1.03)
    )
      throw new Error("Invalid ranked hockey-overall qualification");
    if (
      Math.abs(
        Object.values(detail.components).reduce(
          (sum, value) => sum + value,
          0,
        ) - result.seasonValue,
      ) > 1e-8
    )
      throw new Error("Hockey-overall components do not reconcile");
    if (
      result.position === "G"
        ? detail.components.offensiveProcess !== 0 ||
          detail.components.defensiveProcess !== 0
        : detail.components.saving !== 0
    )
      throw new Error("Invalid position components");
  } else {
    if (
      result.seasonValue !== null ||
      result.rank !== null ||
      detail.components !== null ||
      (detail.qualification === "insufficient-reference"
        ? result.status !== "rated"
        : detail.qualification !== result.status)
    )
      throw new Error("Unqualified hockey-overall results cannot have scores");
  }
  if ((result.status === "incomplete") !== Boolean(result.missing.length))
    throw new Error("Invalid missing-source qualification");
  for (const alternative of Object.values(detail.depthSensitivity)) {
    if (
      (alternative.value === null) !== (alternative.rank === null) ||
      !positiveRank(alternative.rank) ||
      (detail.qualification !== "ranked" &&
        result.status !== "rated" &&
        alternative.value !== null)
    )
      throw new Error("Invalid replacement-depth sensitivity");
  }
}

/** Internal-only: invoked by the authenticated deployment operator, never browsers. */
export const importBatch = internalMutation({
  args: {
    seasonId: v.id("seasons"),
    ...nhlSeasonValueMetadata,
    results: v.array(nhlSeasonValueResult),
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.results.length > 250)
      throw new Error("Import batches are limited to 250 players");
    if (
      ![
        "nhl-season-value-v1",
        "nhl-season-value-v3",
        "nhl-hockey-overall-reviewed-v1",
      ].includes(args.modelVersion)
    )
      throw new Error("Unsupported NHL rating version");
    if (
      args.modelVersion === "nhl-hockey-overall-reviewed-v1" &&
      (args.gameType !== 2 || args.profile !== "core")
    )
      throw new Error(
        "Reviewed hockey overall supports regular-season core data only",
      );
    if (
      !/^[a-f0-9]{64}$/.test(args.sourceHash) ||
      !Number.isFinite(args.sourceFetchedAt) ||
      args.sourceFetchedAt <= 0
    )
      throw new Error("Invalid source provenance");
    const season = await ctx.db.get(args.seasonId);
    if (
      !season ||
      args.nhlSeason !== Number(`${Number(season.year) - 1}${season.year}`)
    )
      throw new Error("NHL and database seasons differ");
    const identities = new Set<number>();
    let inserted = 0,
      updated = 0,
      unchanged = 0,
      linked = 0;
    const unlinked: number[] = [];
    for (const result of args.results) {
      validateSeasonValue(result, args.modelVersion);
      if (identities.has(result.nhlPlayerId))
        throw new Error("Duplicate player in batch");
      identities.add(result.nhlPlayerId);
      const players = await ctx.db
        .query("players")
        .withIndex("by_nhlApiId", (q) =>
          q.eq("nhlApiId", String(result.nhlPlayerId)),
        )
        .take(2);
      if (players.length > 1)
        throw new Error(`Ambiguous NHL identity ${result.nhlPlayerId}`);
      const playerId = players[0]?._id;
      if (playerId) linked++;
      else unlinked.push(result.nhlPlayerId);
      const existing = await ctx.db
        .query("nhlSeasonValues")
        .withIndex("by_identity", (q) =>
          q
            .eq("seasonId", args.seasonId)
            .eq("gameType", args.gameType)
            .eq("profile", args.profile)
            .eq("modelVersion", args.modelVersion)
            .eq("nhlPlayerId", result.nhlPlayerId),
        )
        .unique();
      const document = {
        seasonId: args.seasonId,
        playerId,
        nhlSeason: args.nhlSeason,
        gameType: args.gameType,
        profile: args.profile,
        modelVersion: args.modelVersion,
        sourceFetchedAt: args.sourceFetchedAt,
        sourceHash: args.sourceHash,
        ...result,
      };
      const equalResult =
        existing &&
        Object.entries(result).every(
          ([key, value]) =>
            JSON.stringify(existing[key as keyof typeof result]) ===
            JSON.stringify(value),
        );
      if (
        equalResult &&
        existing.playerId === playerId &&
        existing.sourceHash === args.sourceHash &&
        existing.sourceFetchedAt === args.sourceFetchedAt
      ) {
        unchanged++;
        continue;
      }
      if (existing?.gameValue?.finalization)
        throw new Error(
          "Finalized NHL season values are locked against routine imports",
        );
      // Updating another snapshot/version requires a separately reviewed workflow.
      if (existing && existing.sourceHash !== args.sourceHash)
        throw new Error(
          "A different source snapshot already exists for this identity",
        );
      if (existing) {
        updated++;
        if (args.apply)
          await ctx.db.patch(existing._id, {
            ...document,
            updatedAt: Date.now(),
          });
      } else {
        inserted++;
        if (args.apply)
          await ctx.db.insert("nhlSeasonValues", {
            ...document,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
      }
    }
    return { inserted, updated, unchanged, linked, unlinked };
  },
});

const reviewedHockeyModel = "nhl-hockey-overall-reviewed-v1" as const;

const repairStatFields = [
  "GP",
  "GS",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "QS",
  "RBS",
  "TOI",
] as const;
const repairBioFields = [
  "firstName",
  "lastName",
  "fullName",
  "birthday",
  "country",
  "posGroup",
  "nhlPos",
] as const;

function repairObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Repair document must be an object");
  return value as Record<string, unknown>;
}

function repairAllowFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error(
      "Repair attempts to change a protected or unsupported field",
    );
}

function repairNhlIdentity(value: number): string {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error("Repair requires a positive integer NHL player ID");
  return String(value);
}

function repairCompleteStats(row: Record<string, unknown>) {
  if (!["F", "D", "G"].includes(String(row.posGroup)))
    throw new Error("Repair requires an explicit NHL position group");
  const required =
    row.posGroup === "G"
      ? ["GP", "GS", "W", "GA", "GAA", "SV", "SA", "SVP", "SO", "TOI"]
      : ["GP", "G", "A", "P", "PM", "PIM", "PPP", "SOG", "HIT", "BLK", "TOI"];
  for (const key of required) {
    // A goalie with no shots has no defined save percentage. Preserve source null.
    if (key === "SVP" && row.SVP === null && row.SA === 0 && row.SV === 0)
      continue;
    if (typeof row[key] !== "number" || !Number.isFinite(row[key]))
      throw new Error(
        "Repair requires complete finite official role statistics",
      );
  }
  for (const key of repairStatFields) {
    const value = row[key];
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        (key !== "PM" && value < 0))
    )
      throw new Error("Invalid repaired NHL statistic");
    if (
      value !== undefined &&
      value !== null &&
      !["TOI", "GAA", "SVP"].includes(key) &&
      !Number.isInteger(value)
    )
      throw new Error("NHL counting statistics must be integers");
  }
  if (
    typeof row.seasonRating !== "number" ||
    !Number.isFinite(row.seasonRating) ||
    row.seasonRating < 0
  )
    throw new Error("Repair requires a finite category season rating");
  if (
    row.nhlPos !== undefined &&
    row.nhlPos !== null &&
    (!Array.isArray(row.nhlPos) ||
      !row.nhlPos.every((p) => typeof p === "string"))
  )
    throw new Error("Invalid repaired position list");
  if (
    row.nhlTeam !== undefined &&
    row.nhlTeam !== null &&
    (!Array.isArray(row.nhlTeam) ||
      !row.nhlTeam.every((p) => typeof p === "string"))
  )
    throw new Error("Invalid repaired NHL team list");
  if (
    row.age !== undefined &&
    row.age !== null &&
    (typeof row.age !== "number" || !Number.isFinite(row.age) || row.age < 0)
  )
    throw new Error("Invalid repaired age");
}

/** Explicit, backed-up repairs only. Identity and season-data phases are separate. */
export const repairNhlSeasonData = internalMutation({
  args: {
    planSha256: v.string(),
    backupSha256: v.string(),
    seasonId: v.id("seasons"),
    expectedSeason: v.any(),
    allowStatLineDeletes: v.optional(v.boolean()),
    apply: v.optional(v.boolean()),
    playerOps: v.optional(
      v.array(
        v.union(
          v.object({
            kind: v.literal("patchIdentity"),
            playerId: v.id("players"),
            expectedRow: v.any(),
            nhlPlayerId: v.number(),
            fields: v.optional(v.any()),
          }),
          v.object({
            kind: v.literal("insert"),
            nhlPlayerId: v.number(),
            document: v.any(),
          }),
        ),
      ),
    ),
    statOps: v.optional(
      v.array(
        v.union(
          v.object({
            kind: v.literal("patch"),
            id: v.id("playerNhlStatLines"),
            expectedRow: v.any(),
            playerId: v.id("players"),
            nhlPlayerId: v.number(),
            fields: v.any(),
          }),
          v.object({
            kind: v.literal("insert"),
            playerId: v.id("players"),
            nhlPlayerId: v.number(),
            document: v.any(),
          }),
          v.object({
            kind: v.literal("delete"),
            id: v.id("playerNhlStatLines"),
            expectedRow: v.any(),
            reason: v.string(),
          }),
        ),
      ),
    ),
    valueLinkOps: v.optional(
      v.array(
        v.object({
          id: v.id("nhlSeasonValues"),
          expectedRow: v.any(),
          playerId: v.id("players"),
          nhlPlayerId: v.number(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    if (
      ![args.planSha256, args.backupSha256].every((s) =>
        /^[a-f0-9]{64}$/.test(s),
      )
    )
      throw new Error(
        "Repair requires exact plan and independent backup SHA256",
      );
    const playerOps = args.playerOps ?? [],
      statOps = args.statOps ?? [],
      links = args.valueLinkOps ?? [];
    const count = playerOps.length + statOps.length + links.length;
    if (
      count < 1 ||
      count > 100 ||
      (playerOps.length > 0 && statOps.length + links.length > 0)
    )
      throw new Error(
        "Require 1–100 operations in a separate identity or season-data phase",
      );
    const season = await ctx.db.get(args.seasonId);
    if (
      !season ||
      stableRatingJson(season) !== stableRatingJson(args.expectedSeason)
    )
      throw new Error("Reviewed repair season changed");
    const seen = new Set<string>();
    const once = (id: string) => {
      if (seen.has(id)) throw new Error("Duplicate repair operation identity");
      seen.add(id);
    };
    const exact = (actual: unknown, expected: unknown) => {
      if (
        !actual ||
        stableRatingJson(actual) !== stableRatingJson(repairObject(expected))
      )
        throw new Error("Repair row differs from exact reviewed snapshot");
    };
    const canonical = async (id: Id<"players">, nhlId: number) => {
      const token = repairNhlIdentity(nhlId);
      if (ctx.db.normalizeId("players", id) !== id)
        throw new Error("Repair requires a canonical player ID");
      const player = await ctx.db.get(id);
      const matches = await ctx.db
        .query("players")
        .withIndex("by_nhlApiId", (q) => q.eq("nhlApiId", token))
        .take(2);
      if (
        player?.nhlApiId !== token ||
        matches.length !== 1 ||
        matches[0]!._id !== id
      )
        throw new Error(
          "Repair requires one exact canonical NHL player identity",
        );
      return player;
    };
    const plannedPlayers: Array<{
      kind: "insert" | "patchIdentity";
      id?: Id<"players">;
      fields: Record<string, unknown>;
      changed: boolean;
    }> = [];
    const plannedStats: Array<{
      kind: "insert" | "patch" | "delete";
      id?: Id<"playerNhlStatLines">;
      fields?: Record<string, unknown>;
      changed: boolean;
    }> = [];
    const plannedLinks: Array<{
      id: Id<"nhlSeasonValues">;
      playerId: Id<"players">;
      changed: boolean;
    }> = [];
    const plannedNhlIds = new Set<string>();
    for (const op of playerOps) {
      const token = repairNhlIdentity(op.nhlPlayerId);
      if (plannedNhlIds.has(token))
        throw new Error("Duplicate desired NHL identity");
      plannedNhlIds.add(token);
      const matches = await ctx.db
        .query("players")
        .withIndex("by_nhlApiId", (q) => q.eq("nhlApiId", token))
        .take(2);
      if (op.kind === "patchIdentity") {
        once(op.playerId);
        const player = await ctx.db.get(op.playerId);
        exact(player, op.expectedRow);
        if (matches.some((p) => p._id !== op.playerId))
          throw new Error("NHL identity already belongs to another player");
        const fields = op.fields === undefined ? {} : repairObject(op.fields);
        repairAllowFields(fields, repairBioFields);
        for (const [key, value] of Object.entries(fields)) {
          if (
            key === "birthday"
              ? typeof value !== "number" ||
                !Number.isFinite(value) ||
                value < 0
              : key === "nhlPos"
                ? !Array.isArray(value) ||
                  !value.every((p) => typeof p === "string")
                : typeof value !== "string"
          )
            throw new Error("Invalid reviewed player biography field");
        }
        const patch = { ...fields, nhlApiId: token };
        plannedPlayers.push({
          kind: op.kind,
          id: op.playerId,
          fields: patch,
          changed: Object.entries(patch).some(
            ([k, value]) =>
              stableRatingJson(player![k as keyof typeof player]) !==
              stableRatingJson(value),
          ),
        });
      } else {
        if (matches.length) throw new Error("NHL player already exists");
        const document = repairObject(op.document);
        repairAllowFields(document, [
          ...repairBioFields,
          "nhlTeam",
          "isActive",
          "isSignable",
          "isResignable",
          "nhlApiId",
          "createdAt",
          "updatedAt",
          "salary",
          "overallRating",
        ]);
        if (
          document.nhlApiId !== token ||
          ["firstName", "lastName", "fullName", "posGroup"].some(
            (key) =>
              typeof document[key] !== "string" ||
              !String(document[key]).trim(),
          ) ||
          !["F", "D", "G"].includes(String(document.posGroup)) ||
          ["isActive", "isSignable", "isResignable"].some(
            (key) => typeof document[key] !== "boolean",
          ) ||
          document.isSignable !== false ||
          document.isResignable !== false ||
          ["salary", "overallRating"].some(
            (key) => document[key] !== undefined && document[key] !== null,
          )
        )
          throw new Error(
            "New player requires reviewed minimal biography and explicit activity flags without financial values",
          );
        for (const key of ["createdAt", "updatedAt"])
          if (
            document[key] !== undefined &&
            (typeof document[key] !== "number" ||
              !Number.isFinite(document[key]) ||
              document[key] < 0)
          )
            throw new Error("Invalid new-player timestamp");
        for (const key of ["nhlPos", "nhlTeam"])
          if (
            document[key] !== undefined &&
            document[key] !== null &&
            (!Array.isArray(document[key]) ||
              !(document[key] as unknown[]).every((p) => typeof p === "string"))
          )
            throw new Error("Invalid new-player NHL list");
        if (
          document.birthday !== undefined &&
          (typeof document.birthday !== "number" ||
            !Number.isFinite(document.birthday) ||
            document.birthday < 0)
        )
          throw new Error(
            "New player birthday must be a finite nonnegative UTC epoch",
          );
        for (const key of ["country"])
          if (
            document[key] !== undefined &&
            document[key] !== null &&
            typeof document[key] !== "string"
          )
            throw new Error("Invalid new-player biography");
        plannedPlayers.push({
          kind: "insert",
          fields: document,
          changed: true,
        });
      }
    }
    for (const op of links) {
      once(op.id);
      const source = await ctx.db.get(op.id);
      exact(source, op.expectedRow);
      await canonical(op.playerId, op.nhlPlayerId);
      if (
        source!.seasonId !== args.seasonId ||
        source!.nhlPlayerId !== op.nhlPlayerId
      )
        throw new Error(
          "Value relink differs from explicit season and NHL identity",
        );
      plannedLinks.push({
        id: op.id,
        playerId: op.playerId,
        changed: source!.playerId !== op.playerId,
      });
    }
    const deletedIds = new Set(
      statOps.filter((op) => op.kind === "delete").map((op) => op.id),
    );
    const patchedIds = new Set(
      statOps.filter((op) => op.kind === "patch").map((op) => op.id),
    );
    const desiredPlayers = new Set<string>();
    for (const op of statOps) {
      if (op.kind !== "insert") {
        once(op.id);
        const row = await ctx.db.get(op.id);
        exact(row, op.expectedRow);
        if (row!.seasonId !== args.seasonId)
          throw new Error("Stat repair is outside reviewed season");
      }
      if (op.kind === "delete") {
        if (!args.allowStatLineDeletes || !op.reason.trim())
          throw new Error(
            "Explicit cleanup authorization and deletion reason required",
          );
        plannedStats.push({ kind: "delete", id: op.id, changed: true });
        continue;
      }
      const player = await canonical(op.playerId, op.nhlPlayerId);
      if (desiredPlayers.has(op.playerId))
        throw new Error("Duplicate desired season/player stat line");
      desiredPlayers.add(op.playerId);
      const fields = repairObject(
        op.kind === "patch" ? op.fields : op.document,
      );
      const baseAllowed = [
        ...repairStatFields,
        "nhlPos",
        "posGroup",
        "nhlTeam",
        "age",
        "seasonRating",
      ];
      repairAllowFields(
        fields,
        op.kind === "insert"
          ? [
              ...baseAllowed,
              "seasonId",
              "playerId",
              "salary",
              "overallRating",
              "createdAt",
              "updatedAt",
            ]
          : baseAllowed,
      );
      if (
        op.kind === "insert" &&
        (fields.seasonId !== args.seasonId ||
          fields.playerId !== op.playerId ||
          ["salary", "overallRating"].some(
            (key) => fields[key] !== undefined && fields[key] !== null,
          ))
      )
        throw new Error(
          "New stat line has wrong identity or financial/talent values",
        );
      if (op.kind === "insert")
        for (const key of ["createdAt", "updatedAt"])
          if (
            fields[key] !== undefined &&
            (typeof fields[key] !== "number" ||
              !Number.isFinite(fields[key]) ||
              fields[key] < 0)
          )
            throw new Error("Invalid new-stat timestamp");
      const old = op.kind === "patch" ? await ctx.db.get(op.id) : null;
      const desired = {
        ...old,
        ...fields,
        seasonId: args.seasonId,
        playerId: op.playerId,
      };
      repairCompleteStats(desired);
      const existing = await ctx.db
        .query("playerNhlStatLines")
        .withIndex("by_seasonId_playerId", (q) =>
          q.eq("seasonId", args.seasonId).eq("playerId", op.playerId),
        )
        .take(102);
      if (player.legacyId && player.legacyId !== op.playerId) {
        const aliases = await ctx.db
          .query("players")
          .withIndex("by_legacyId", (q) => q.eq("legacyId", player.legacyId))
          .take(2);
        if (aliases.length !== 1 || aliases[0]!._id !== op.playerId)
          throw new Error(
            "Ambiguous legacy alias for desired canonical player",
          );
        const legacyStats = await ctx.db
          .query("playerNhlStatLines")
          .withIndex("by_seasonId_playerId", (q) =>
            q.eq("seasonId", args.seasonId).eq("playerId", player.legacyId!),
          )
          .take(102);
        if (legacyStats.length === 102)
          throw new Error(
            "Legacy stat population exceeds bounded repair guard",
          );
        existing.push(...legacyStats);
      }
      if (
        existing.length === 102 ||
        existing.some(
          (row) => !deletedIds.has(row._id) && !patchedIds.has(row._id),
        )
      )
        throw new Error(
          "Existing season/player stat line conflicts with reviewed post-repair uniqueness",
        );
      const sources = await ctx.db
        .query("nhlSeasonValues")
        .withIndex("by_identity", (q) =>
          q
            .eq("seasonId", args.seasonId)
            .eq("gameType", 2)
            .eq("profile", "core")
            .eq("modelVersion", reviewedHockeyModel)
            .eq("nhlPlayerId", op.nhlPlayerId),
        )
        .take(2);
      if (sources.length > 1)
        throw new Error("Duplicate authoritative hockey source");
      const source = sources[0];
      let hockeyRating: Infer<typeof nhlStatLineHockeyRating>;
      if (source) {
        validateSeasonValue(source, reviewedHockeyModel);
        const targetLink =
          plannedLinks.find((p) => p.id === source._id)?.playerId ??
          source.playerId;
        if (
          targetLink !== op.playerId ||
          source.games !== desired.GP ||
          (source.position === "G") !== (desired.posGroup === "G")
        )
          throw new Error(
            "Authoritative hockey source identity, games or goalie role differs",
          );
        hockeyRating = {
          modelVersion: reviewedHockeyModel,
          units: "goals-above-same-position-reference",
          sourceId: source._id,
          sourceFetchedAt: source.sourceFetchedAt,
          nhlPlayerId: source.nhlPlayerId,
          sourceGames: source.games,
          sourcePosition: source.position,
          identityResolution: "canonical",
          seasonValue: source.seasonValue,
          rank: source.rank,
          qualification: source.hockeyOverall!.qualification,
          reasons: [
            ...new Set([
              ...source.missing,
              ...source.hockeyOverall!.warnings,
              ...(desired.posGroup !== source.position
                ? [
                    `Source position ${source.position} differs from stat-line position ${desired.posGroup}.`,
                  ]
                : []),
            ]),
          ],
        };
      } else if (
        desired.GP === 0 ||
        (Number(desired.GP) > 0 && desired.TOI === 0)
      ) {
        hockeyRating = {
          modelVersion: reviewedHockeyModel,
          units: "goals-above-same-position-reference",
          nhlPlayerId: op.nhlPlayerId,
          identityResolution: "canonical",
          seasonValue: null,
          rank: null,
          qualification: desired.GP === 0 ? "no-nhl-games" : "missing-source",
          reasons: [
            desired.GP === 0
              ? "Stat line reports no NHL games played"
              : "Official appearance has zero recorded ice time; no reviewed hockey source",
          ],
        };
      } else
        throw new Error(
          "Played stat repair requires an authoritative hockey source",
        );
      const patch = { ...fields, playerId: op.playerId, hockeyRating };
      plannedStats.push({
        kind: op.kind,
        ...(op.kind === "patch" ? { id: op.id } : {}),
        fields: patch,
        changed:
          !old ||
          Object.entries(patch).some(
            ([key, value]) =>
              stableRatingJson(old[key as keyof typeof old]) !==
              stableRatingJson(value),
          ),
      });
    }
    // Every CAS, authorization, identity, source and uniqueness guard precedes writes.
    const results: Array<{ kind: string; id?: string; changed: boolean }> = [];
    for (const op of plannedPlayers) {
      let id = op.id;
      if (args.apply && op.changed) {
        if (op.kind === "insert")
          id = await ctx.db.insert(
            "players",
            op.fields as Omit<Doc<"players">, "_id" | "_creationTime">,
          );
        else await ctx.db.patch(id!, op.fields as Partial<Doc<"players">>);
      }
      results.push({
        kind: `player-${op.kind}`,
        ...(id ? { id } : {}),
        changed: op.changed,
      });
    }
    // Delete explicitly reviewed duplicates before inserts; this remains one transaction.
    for (const op of [
      ...plannedStats.filter((p) => p.kind === "delete"),
      ...plannedStats.filter((p) => p.kind !== "delete"),
    ]) {
      let id = op.id;
      if (args.apply && op.changed) {
        if (op.kind === "delete") await ctx.db.delete(id!);
        else if (op.kind === "insert")
          id = await ctx.db.insert(
            "playerNhlStatLines",
            op.fields as Omit<
              Doc<"playerNhlStatLines">,
              "_id" | "_creationTime"
            >,
          );
        else
          await ctx.db.patch(
            id!,
            op.fields as Partial<Doc<"playerNhlStatLines">>,
          );
      }
      results.push({
        kind: `stat-${op.kind}`,
        ...(id ? { id } : {}),
        changed: op.changed,
      });
    }
    for (const op of plannedLinks) {
      if (args.apply && op.changed)
        await ctx.db.patch(op.id, { playerId: op.playerId });
      results.push({ kind: "value-link", id: op.id, changed: op.changed });
    }
    const changed = results.filter((op) => op.changed).length;
    return {
      apply: args.apply ?? false,
      planSha256: args.planSha256,
      backupSha256: args.backupSha256,
      matched: count,
      changed,
      unchanged: count - changed,
      updated: args.apply ? changed : 0,
      results,
    };
  },
});

function stableRatingJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, entry]) => entry !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    return item;
  };
  return JSON.stringify(normalize(value)) ?? "undefined";
}

function statLinePrecondition(row: Record<string, unknown>): string {
  return stableRatingJson(
    Object.fromEntries(
      Object.entries(row).filter(([key]) => key !== "seasonRating"),
    ),
  );
}

/** Reconcile explicit existing rows; never recompute salary or multi-season talent. */
export const reconcileStatLineRatings = internalMutation({
  args: {
    entries: v.array(
      v.object({
        statLineId: v.id("playerNhlStatLines"),
        expectedRow: v.any(),
        expectedSeasonRating: v.optional(v.union(v.number(), v.null())),
        fantasySeasonRating: v.optional(v.number()),
        reviewedSource: v.optional(
          v.object({
            sourceId: v.id("nhlSeasonValues"),
            reviewHash: v.string(),
            reason: v.string(),
          }),
        ),
      }),
    ),
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (
      args.entries.length < 1 ||
      args.entries.length > 100 ||
      new Set(args.entries.map((entry) => entry.statLineId)).size !==
        args.entries.length
    )
      throw new Error("Require 1–100 unique explicit NHL stat-line IDs");
    const plans = [];
    for (const entry of args.entries) {
      const row = await ctx.db.get(entry.statLineId);
      if (!row) throw new Error("NHL stat line does not exist");
      if (
        !entry.expectedRow ||
        typeof entry.expectedRow !== "object" ||
        Array.isArray(entry.expectedRow) ||
        statLinePrecondition(row) !==
          statLinePrecondition(entry.expectedRow as Record<string, unknown>) ||
        row.seasonRating !== entry.expectedSeasonRating
      )
        throw new Error("NHL stat line changed since the reviewed snapshot");
      if (
        row.hockeyRating?.identityResolution === "reviewed-source" &&
        !entry.reviewedSource
      )
        throw new Error(
          "Existing reviewed-source association requires fresh reviewed-source evidence",
        );
      if (
        entry.fantasySeasonRating !== undefined &&
        (!Number.isFinite(entry.fantasySeasonRating) ||
          entry.fantasySeasonRating < 0)
      )
        throw new Error("Invalid GSHL category season rating");
      let hockeyRating: Infer<typeof nhlStatLineHockeyRating> = {
        modelVersion: reviewedHockeyModel,
        units: "goals-above-same-position-reference",
        seasonValue: null,
        rank: null,
        qualification: "missing-source",
        reasons: [],
      };
      const games =
        row.GP === null || row.GP === undefined || row.GP === ""
          ? null
          : Number(row.GP);
      if (entry.reviewedSource) {
        const review = entry.reviewedSource;
        if (!/^[a-f0-9]{64}$/.test(review.reviewHash) || !review.reason.trim())
          throw new Error(
            "Reviewed source requires an evidence SHA256 and reason",
          );
        if (games === null || !Number.isFinite(games) || games <= 0)
          throw new Error("Reviewed source requires positive stat-line games");
        const source = await ctx.db.get(review.sourceId);
        if (
          source?.seasonId !== row.seasonId ||
          source.gameType !== 2 ||
          source.profile !== "core" ||
          source.modelVersion !== reviewedHockeyModel
        )
          throw new Error("Reviewed source season or model namespace differs");
        validateSeasonValue(source, reviewedHockeyModel);
        const sourceSeason = await ctx.db.get(row.seasonId);
        if (
          !sourceSeason ||
          source.nhlSeason !==
            Number(`${Number(sourceSeason.year) - 1}${sourceSeason.year}`) ||
          !Number.isFinite(source.sourceFetchedAt) ||
          source.sourceFetchedAt <= 0 ||
          !/^[a-f0-9]{64}$/.test(source.sourceHash)
        )
          throw new Error("Reviewed source metadata differs from its season");
        if (
          source.games !== games ||
          (["F", "D", "G"].includes(row.posGroup) &&
            (row.posGroup === "G") !== (source.position === "G"))
        )
          throw new Error("Reviewed source games or goalie role differs");
        const identities = await ctx.db
          .query("nhlSeasonValues")
          .withIndex("by_identity", (q) =>
            q
              .eq("seasonId", row.seasonId)
              .eq("gameType", 2)
              .eq("profile", "core")
              .eq("modelVersion", reviewedHockeyModel)
              .eq("nhlPlayerId", source.nhlPlayerId),
          )
          .take(2);
        if (identities.length !== 1 || identities[0]!._id !== source._id)
          throw new Error("Duplicate reviewed NHL season value");
        hockeyRating = {
          modelVersion: reviewedHockeyModel,
          units: "goals-above-same-position-reference",
          sourceId: source._id,
          sourceFetchedAt: source.sourceFetchedAt,
          nhlPlayerId: source.nhlPlayerId,
          sourceGames: source.games,
          sourcePosition: source.position,
          seasonValue: source.seasonValue,
          rank: source.rank,
          qualification: source.hockeyOverall!.qualification,
          identityResolution: "reviewed-source",
          identityReviewHash: review.reviewHash,
          reasons: [
            ...new Set([
              ...source.missing,
              ...source.hockeyOverall!.warnings,
              `Reviewed source association: ${review.reason.trim()}`,
              ...(row.posGroup && row.posGroup !== source.position
                ? [
                    `Source position ${source.position} differs from stat-line position ${row.posGroup}.`,
                  ]
                : []),
            ]),
          ],
        };
      } else if (games !== null && Number.isFinite(games) && games <= 0) {
        hockeyRating.qualification = "no-nhl-games";
        hockeyRating.reasons = ["Stat line reports no NHL games played"];
      } else {
        const canonicalId = ctx.db.normalizeId("players", row.playerId);
        let player = canonicalId ? await ctx.db.get(canonicalId) : null;
        if (!player) {
          const legacy = await ctx.db
            .query("players")
            .withIndex("by_legacyId", (q) => q.eq("legacyId", row.playerId))
            .take(2);
          if (legacy.length > 1)
            throw new Error("Ambiguous legacy player identity");
          player = legacy[0] ?? null;
        }
        const token = String(player?.nhlApiId ?? "");
        const nhlPlayerId = Number(token);
        if (
          !player ||
          !/^[1-9]\d*$/.test(token) ||
          !Number.isSafeInteger(nhlPlayerId)
        ) {
          hockeyRating.qualification = "unresolved-player";
          hockeyRating.reasons = ["No unique player with a valid NHL API ID"];
        } else {
          const identities = await ctx.db
            .query("players")
            .withIndex("by_nhlApiId", (q) => q.eq("nhlApiId", token))
            .take(2);
          if (identities.length !== 1 || identities[0]!._id !== player._id)
            throw new Error("Ambiguous NHL player identity");
          hockeyRating.nhlPlayerId = nhlPlayerId;
          const sources = await ctx.db
            .query("nhlSeasonValues")
            .withIndex("by_identity", (q) =>
              q
                .eq("seasonId", row.seasonId)
                .eq("gameType", 2)
                .eq("profile", "core")
                .eq("modelVersion", reviewedHockeyModel)
                .eq("nhlPlayerId", nhlPlayerId),
            )
            .take(2);
          if (sources.length > 1)
            throw new Error("Duplicate reviewed NHL season value");
          const source = sources[0];
          if (!source) {
            hockeyRating.reasons = [
              "No reviewed regular-season hockey value for this player and season",
            ];
          } else {
            validateSeasonValue(source, reviewedHockeyModel);
            if (source.playerId && source.playerId !== player._id)
              throw new Error(
                "Reviewed source has a different canonical player",
              );
            const goalieRoleMismatch =
              ["F", "D", "G"].includes(row.posGroup) &&
              (row.posGroup === "G") !== (source.position === "G");
            const sourceMatches = games === source.games && !goalieRoleMismatch;
            hockeyRating = {
              modelVersion: reviewedHockeyModel,
              units: "goals-above-same-position-reference",
              sourceId: source._id,
              nhlPlayerId,
              sourceFetchedAt: source.sourceFetchedAt,
              sourceGames: source.games,
              sourcePosition: source.position,
              identityResolution: "canonical",
              seasonValue: sourceMatches ? source.seasonValue : null,
              rank: sourceMatches ? source.rank : null,
              qualification: sourceMatches
                ? source.hockeyOverall!.qualification
                : "source-stat-mismatch",
              reasons: [
                ...new Set([
                  ...source.missing,
                  ...source.hockeyOverall!.warnings,
                  ...(games !== source.games
                    ? [
                        `Hockey source covers ${source.games} games; stat line reports ${games ?? "unknown"}. Association withheld pending source reconciliation.`,
                      ]
                    : []),
                  ...(row.posGroup && row.posGroup !== source.position
                    ? [
                        `Source position ${source.position} differs from stat-line position ${row.posGroup}.`,
                      ]
                    : []),
                ]),
              ],
            };
          }
        }
      }
      const seasonRatingChanged =
        entry.fantasySeasonRating !== undefined &&
        entry.fantasySeasonRating !== row.seasonRating;
      const changed =
        stableRatingJson(row.hockeyRating) !== stableRatingJson(hockeyRating) ||
        seasonRatingChanged;
      plans.push({
        statLineId: row._id,
        hockeyRating,
        seasonRatingChanged,
        ...(entry.fantasySeasonRating !== undefined
          ? { fantasySeasonRating: entry.fantasySeasonRating }
          : {}),
        changed,
      });
    }
    // All reviewed preconditions and source identities pass before any write.
    if (args.apply)
      for (const plan of plans)
        if (plan.changed)
          await ctx.db.patch(plan.statLineId, {
            hockeyRating: plan.hockeyRating,
            ...(plan.seasonRatingChanged
              ? { seasonRating: plan.fantasySeasonRating }
              : {}),
          });
    const changed = plans.filter((plan) => plan.changed).length;
    return {
      apply: args.apply ?? false,
      matched: plans.length,
      changed,
      updated: args.apply ? changed : 0,
      unchanged: plans.length - changed,
      rows: plans,
    };
  },
});
