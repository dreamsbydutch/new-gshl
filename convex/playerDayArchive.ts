/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/prefer-optional-chain */
import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

const ARCHIVE_VERSION = 1;
const MAX_DELETE_BATCH = 20;
const MAX_HIGHLIGHT_BATCH = 20;

function requireServerSecret(serverSecret: string) {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || serverSecret !== expected) {
    throw new Error("Unauthorized server request");
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

async function archiveForSeason(ctx: any, seasonId: string) {
  return ctx.db
    .query("seasonDataArchives")
    .withIndex("by_seasonId", (q: any) => q.eq("seasonId", seasonId))
    .first();
}

async function requireCompletedSeason(ctx: any, seasonId: string) {
  const season = await ctx.db.get(seasonId);
  if (!season) throw new Error("Season not found");
  if (season.isActive) throw new Error("Active seasons cannot be archived");
  const endDate =
    typeof season.endDate === "number"
      ? season.endDate
      : Date.parse(String(season.endDate ?? ""));
  if (!Number.isFinite(endDate) || endDate >= Date.now()) {
    throw new Error("Only completed seasons can be archived");
  }
  return season;
}

export const getArchiveState = queryGeneric({
  args: { serverSecret: v.string(), seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    return archiveForSeason(ctx, args.seasonId);
  },
});

export const beginArchive = mutationGeneric({
  args: {
    serverSecret: v.string(),
    seasonId: v.id("seasons"),
    replaceExisting: v.boolean(),
    archiveKey: v.string(),
    sourceRowCount: v.number(),
    sourceChecksum: v.string(),
    firstDate: v.optional(v.string()),
    lastDate: v.optional(v.string()),
    highlightCount: v.number(),
    aggregateChecksums: v.record(v.string(), v.string()),
    activitySnapshot: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    await requireCompletedSeason(ctx, args.seasonId);
    if (args.activitySnapshot.length > 30) {
      throw new Error("Activity snapshots are limited to 30 events");
    }
    const existing = await archiveForSeason(ctx, args.seasonId);
    if (
      existing &&
      existing.sourceChecksum !== args.sourceChecksum &&
      !args.replaceExisting
    ) {
      throw new Error("A different archive already exists for this season");
    }
    if (existing?.status === "deleting") {
      throw new Error("An archive deletion is already in progress");
    }
    const now = Date.now();
    const values = {
      status: "exporting" as const,
      archiveVersion: ARCHIVE_VERSION,
      archiveKey: args.archiveKey,
      sourceRowCount: args.sourceRowCount,
      sourceChecksum: args.sourceChecksum,
      firstDate: args.firstDate,
      lastDate: args.lastDate,
      highlightCount: args.highlightCount,
      aggregateChecksums: args.aggregateChecksums,
      activitySnapshot: args.activitySnapshot,
      exportedAt: now,
      verifiedAt: undefined,
      deletedAt: undefined,
      restoredAt: undefined,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, values);
      return existing._id;
    }
    return ctx.db.insert("seasonDataArchives", {
      seasonId: args.seasonId,
      ...values,
      createdAt: now,
    });
  },
});

export const upsertHighlightsBatch = mutationGeneric({
  args: {
    serverSecret: v.string(),
    seasonId: v.id("seasons"),
    sourceChecksum: v.string(),
    rows: v.array(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    if (args.rows.length > MAX_HIGHLIGHT_BATCH) {
      throw new Error(`Highlight writes are limited to ${MAX_HIGHLIGHT_BATCH}`);
    }
    const archive = await archiveForSeason(ctx, args.seasonId);
    if (
      !archive ||
      archive.status !== "exporting" ||
      archive.sourceChecksum !== args.sourceChecksum
    ) {
      throw new Error("Archive is not accepting highlight rows");
    }
    let updated = 0;
    let inserted = 0;
    for (const raw of args.rows) {
      if (raw.seasonId !== args.seasonId) {
        throw new Error("Highlight belongs to a different season");
      }
      const sourcePlayerDayId = String(raw.sourcePlayerDayId ?? "");
      if (!sourcePlayerDayId) throw new Error("Missing source player-day id");
      const existing = await ctx.db
        .query("playerDayHighlights")
        .withIndex("by_seasonId_sourcePlayerDayId", (q: any) =>
          q
            .eq("seasonId", args.seasonId)
            .eq("sourcePlayerDayId", sourcePlayerDayId),
        )
        .first();
      const doc = { ...raw };
      delete doc.id;
      delete doc._id;
      delete doc._creationTime;
      const now = Date.now();
      if (existing) {
        await ctx.db.patch(existing._id, { ...doc, updatedAt: now });
        updated += 1;
      } else {
        await ctx.db.insert("playerDayHighlights", {
          ...doc,
          createdAt: now,
          updatedAt: now,
        });
        inserted += 1;
      }
    }
    return { updated, inserted };
  },
});

export const removeStaleHighlightsBatch = mutationGeneric({
  args: {
    serverSecret: v.string(),
    seasonId: v.id("seasons"),
    sourceChecksum: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const rows = await ctx.db
      .query("playerDayHighlights")
      .withIndex("by_seasonId", (q: any) => q.eq("seasonId", args.seasonId))
      .collect();
    const stale = rows
      .filter((row: any) => row.archiveChecksum !== args.sourceChecksum)
      .slice(0, MAX_HIGHLIGHT_BATCH);
    let deleted = 0;
    for (const row of stale) {
      await ctx.db.delete(row._id);
      deleted += 1;
    }
    return { deleted };
  },
});

export const finalizeVerification = mutationGeneric({
  args: {
    serverSecret: v.string(),
    seasonId: v.id("seasons"),
    sourceChecksum: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const archive = await archiveForSeason(ctx, args.seasonId);
    if (
      !archive ||
      archive.status !== "exporting" ||
      archive.sourceChecksum !== args.sourceChecksum
    ) {
      throw new Error("Archive cannot be verified from its current state");
    }
    const highlights = await ctx.db
      .query("playerDayHighlights")
      .withIndex("by_seasonId", (q: any) => q.eq("seasonId", args.seasonId))
      .collect();
    const matching = highlights.filter(
      (row: any) => row.archiveChecksum === args.sourceChecksum,
    );
    if (matching.length !== archive.highlightCount) {
      throw new Error("The staged highlight count does not match the manifest");
    }
    const now = Date.now();
    await ctx.db.patch(archive._id, {
      status: "verified",
      verifiedAt: now,
      updatedAt: now,
    });
    return { highlightCount: matching.length };
  },
});

export const prepareDeletion = mutationGeneric({
  args: {
    serverSecret: v.string(),
    seasonId: v.id("seasons"),
    sourceChecksum: v.string(),
    backupName: v.string(),
    backupChecksum: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    await requireCompletedSeason(ctx, args.seasonId);
    const archive = await archiveForSeason(ctx, args.seasonId);
    if (
      !archive ||
      archive.status !== "verified" ||
      archive.sourceChecksum !== args.sourceChecksum
    ) {
      throw new Error("Only a verified matching archive can be deleted");
    }
    await ctx.db.patch(archive._id, {
      status: "deleting",
      preDeleteBackupName: args.backupName,
      preDeleteBackupChecksum: args.backupChecksum,
      updatedAt: Date.now(),
    });
    return { ready: true };
  },
});

export const deleteVerifiedSourceBatch = mutationGeneric({
  args: {
    serverSecret: v.string(),
    seasonId: v.id("seasons"),
    sourceChecksum: v.string(),
    rows: v.array(
      v.object({ id: v.id("playerDayStatLines"), canonicalJson: v.string() }),
    ),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    if (args.rows.length > MAX_DELETE_BATCH) {
      throw new Error(`Archive deletes are limited to ${MAX_DELETE_BATCH}`);
    }
    const archive = await archiveForSeason(ctx, args.seasonId);
    if (
      !archive ||
      archive.status !== "deleting" ||
      archive.sourceChecksum !== args.sourceChecksum
    ) {
      throw new Error("Archive deletion is not prepared");
    }
    const loaded = await Promise.all(
      args.rows.map(async (expected) => ({
        expected,
        row: await ctx.db.get(expected.id),
      })),
    );
    for (const item of loaded) {
      if (!item.row) continue;
      if (item.row.seasonId !== args.seasonId) {
        throw new Error("Refusing to delete a row from another season");
      }
      if (canonicalJson(item.row) !== item.expected.canonicalJson) {
        throw new Error(
          `Player-day row ${item.expected.id} changed after export`,
        );
      }
    }
    let deleted = 0;
    let missing = 0;
    for (const item of loaded) {
      if (!item.row) {
        missing += 1;
        continue;
      }
      await ctx.db.delete(item.expected.id);
      deleted += 1;
    }
    return { deleted, missing };
  },
});

export const completeDeletion = mutationGeneric({
  args: {
    serverSecret: v.string(),
    seasonId: v.id("seasons"),
    sourceChecksum: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const archive = await archiveForSeason(ctx, args.seasonId);
    if (
      !archive ||
      archive.status !== "deleting" ||
      archive.sourceChecksum !== args.sourceChecksum
    ) {
      throw new Error("Archive deletion is not in progress");
    }
    const remaining = await ctx.db
      .query("playerDayStatLines")
      .withIndex("by_seasonId", (q: any) => q.eq("seasonId", args.seasonId))
      .first();
    if (remaining) throw new Error("Player-day source rows still remain");
    const now = Date.now();
    await ctx.db.patch(archive._id, {
      status: "archived",
      deletedAt: now,
      updatedAt: now,
    });
    return { archived: true };
  },
});

export const completeRestore = mutationGeneric({
  args: {
    serverSecret: v.string(),
    seasonId: v.id("seasons"),
    sourceChecksum: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const archive = await archiveForSeason(ctx, args.seasonId);
    if (
      !archive ||
      !["archived", "restored"].includes(archive.status) ||
      archive.sourceChecksum !== args.sourceChecksum
    ) {
      throw new Error("Archive checksum does not match the restored source");
    }
    const now = Date.now();
    await ctx.db.patch(archive._id, {
      status: "restored",
      restoredAt: now,
      updatedAt: now,
    });
    return { restored: true };
  },
});

export const markFailed = mutationGeneric({
  args: { serverSecret: v.string(), seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const archive = await archiveForSeason(ctx, args.seasonId);
    if (!archive) return { updated: false };
    await ctx.db.patch(archive._id, {
      status: "failed",
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});
