import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type {
  MatchupPreviewArticle,
  MatchupPreviewEvidence,
} from "../src/lib/types/matchup-preview-article";
import {
  buildMatchupPreviewRequest,
  easternHour,
  isPreviewDue,
  matchupPreviewStartsAt,
  parseMatchupPreviewArticle,
  PREVIEW_WINDOW_MS,
} from "../src/lib/utils/features/matchup-preview-articles";
import {
  extractWeeklyEditionOpenAiText,
  resolveNewsroomModel,
} from "../src/lib/utils/features/weekly-edition-openai";
import { utcTimestampToDateKey } from "./lib/timestamps";
import { loadMatchupPreviewEvidence } from "./lib/matchupPreviewEvidence";

async function windowFor(
  ctx: QueryCtx | MutationCtx,
  matchupId: Id<"matchups">,
) {
  const matchup = await ctx.db.get(matchupId);
  if (
    !matchup ||
    matchup.isComplete ||
    matchup.homeWin ||
    matchup.awayWin ||
    matchup.tie
  )
    return null;
  const week = await ctx.db.get(matchup.weekId);
  const startsAt = matchupPreviewStartsAt(
    utcTimestampToDateKey(week?.startDate),
  );
  return startsAt === null ? null : { matchup, startsAt };
}

/** Public copy only. Expired articles stay hidden even if cleanup is delayed. */
export const forMatchup = query({
  args: { matchupId: v.string() },
  handler: async (ctx, args): Promise<MatchupPreviewArticle[]> => {
    const id = ctx.db.normalizeId("matchups", args.matchupId);
    if (!id) return [];
    const window = await windowFor(ctx, id);
    if (!window || window.startsAt <= Date.now()) return [];
    const rows = await ctx.db
      .query("matchupPreviews")
      .withIndex("by_matchupId_teamId", (q) => q.eq("matchupId", id))
      .collect();
    return rows.flatMap((row) =>
      row.status === "published" &&
      row.writer &&
      row.headline &&
      row.paragraphs &&
      row.publishedAt != null &&
      [window.matchup.homeTeamId, window.matchup.awayTeamId].includes(
        row.teamId,
      )
        ? [
            {
              teamId: String(row.teamId),
              writer: row.writer,
              headline: row.headline,
              paragraphs: row.paragraphs,
              publishedAt: row.publishedAt,
            },
          ]
        : [],
    );
  },
});

async function removeIfExpired(ctx: MutationCtx, id: Id<"matchupPreviews">) {
  const row = await ctx.db.get(id);
  if (!row) return;
  const window = await windowFor(ctx, row.matchupId);
  if (
    !window ||
    window.startsAt <= Date.now() ||
    ![window.matchup.homeTeamId, window.matchup.awayTeamId].includes(row.teamId)
  ) {
    await ctx.db.delete(id);
    return;
  }
  // A rescheduled matchup keeps its article until the new start.
  await ctx.db.patch(id, { startsAt: window.startsAt });
  await ctx.scheduler.runAfter(
    window.startsAt - Date.now(),
    internal.matchupPreviews.expire,
    { id },
  );
}

export const expire = internalMutation({
  args: { id: v.id("matchupPreviews") },
  handler: async (ctx, { id }): Promise<void> => removeIfExpired(ctx, id),
});

export const cleanup = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const rows = await ctx.db
      .query("matchupPreviews")
      .withIndex("by_startsAt", (q) => q.lte("startsAt", Date.now()))
      .take(100);
    for (const row of rows) await removeIfExpired(ctx, row._id);
    if (rows.length === 100)
      await ctx.scheduler.runAfter(0, internal.matchupPreviews.cleanup, {});
  },
});

/** Two UTC cron slots are used so exactly one runs at 4 a.m. Eastern year-round. */
export const scan = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const now = Date.now();
    if (easternHour(now) !== 4) return;
    await ctx.scheduler.runAfter(0, internal.matchupPreviews.cleanup, {});
    const weeks = await ctx.db
      .query("weeks")
      .withIndex("by_startDate", (q) =>
        q
          .gte("startDate", now - 86400000)
          .lte("startDate", now + PREVIEW_WINDOW_MS),
      )
      .take(100);
    let queued = 0;
    for (const week of weeks) {
      const startsAt = matchupPreviewStartsAt(
        utcTimestampToDateKey(week.startDate),
      );
      if (!isPreviewDue(startsAt, now) || startsAt === null) continue;
      const matchups = await ctx.db
        .query("matchups")
        .withIndex("by_weekId", (q) => q.eq("weekId", week._id))
        .take(100);
      for (const matchup of matchups) {
        if (
          matchup.isComplete ||
          matchup.homeWin ||
          matchup.awayWin ||
          matchup.tie
        )
          continue;
        for (const teamId of new Set([
          matchup.homeTeamId,
          matchup.awayTeamId,
        ])) {
          const existing = await ctx.db
            .query("matchupPreviews")
            .withIndex("by_matchupId_teamId", (q) =>
              q.eq("matchupId", matchup._id).eq("teamId", teamId),
            )
            .unique();
          if (existing?.status === "published") continue;
          if (
            existing?.status === "generating" &&
            now - existing.attemptAt < 15 * 60 * 1000
          )
            continue;
          const values = {
            matchupId: matchup._id,
            teamId,
            startsAt,
            status: "generating" as const,
            attemptAt: now,
          };
          const id =
            existing?._id ?? (await ctx.db.insert("matchupPreviews", values));
          if (existing)
            await ctx.db.patch(id, { ...values, failure: undefined });
          await ctx.scheduler.runAfter(
            queued++ * 5000,
            internal.matchupPreviews.generate,
            { id, attemptAt: now },
          );
          await ctx.scheduler.runAfter(
            startsAt - now,
            internal.matchupPreviews.expire,
            { id },
          );
        }
      }
    }
  },
});

export const evidence = internalQuery({
  args: { id: v.id("matchupPreviews"), attemptAt: v.number() },
  handler: async (ctx, args): Promise<MatchupPreviewEvidence | null> => {
    const row = await ctx.db.get(args.id);
    if (row?.status !== "generating" || row.attemptAt !== args.attemptAt)
      return null;
    const window = await windowFor(ctx, row.matchupId);
    if (
      !window ||
      !isPreviewDue(window.startsAt, Date.now()) ||
      ![window.matchup.homeTeamId, window.matchup.awayTeamId].includes(
        row.teamId,
      )
    )
      return null;
    return loadMatchupPreviewEvidence(
      ctx,
      window.matchup,
      row.teamId,
      window.startsAt,
      Date.now(),
    );
  },
});

export const finish = internalMutation({
  args: {
    id: v.id("matchupPreviews"),
    attemptAt: v.number(),
    article: v.optional(
      v.object({
        writer: v.string(),
        headline: v.string(),
        paragraphs: v.array(v.string()),
        evidence: v.array(v.object({ id: v.string(), text: v.string() })),
      }),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const row = await ctx.db.get(args.id);
    if (row?.status !== "generating" || row.attemptAt !== args.attemptAt)
      return;
    const window = await windowFor(ctx, row.matchupId);
    if (
      !window ||
      window.startsAt <= Date.now() ||
      ![window.matchup.homeTeamId, window.matchup.awayTeamId].includes(
        row.teamId,
      )
    ) {
      await ctx.db.delete(row._id);
      return;
    }
    if (!isPreviewDue(window.startsAt, Date.now())) {
      await ctx.db.patch(row._id, {
        status: "failed",
        failure: "Matchup moved outside the preview window",
      });
      return;
    }
    await ctx.db.patch(
      row._id,
      args.article
        ? {
            ...args.article,
            status: "published",
            publishedAt: Date.now(),
            failure: undefined,
          }
        : {
            status: "failed",
            failure: "Preview could not be written; will retry overnight",
          },
    );
  },
});

export const generate = internalAction({
  args: { id: v.id("matchupPreviews"), attemptAt: v.number() },
  handler: async (ctx, args): Promise<void> => {
    try {
      const packet = await ctx.runQuery(
        internal.matchupPreviews.evidence,
        args,
      );
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!packet || !apiKey) {
        await ctx.runMutation(internal.matchupPreviews.finish, args);
        return;
      }
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildMatchupPreviewRequest(
            resolveNewsroomModel(undefined, process.env.OPENAI_NEWSROOM_MODEL),
            packet,
          ),
        ),
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) throw new Error("Preview generation failed");
      const payload: unknown = await response.json();
      const article = parseMatchupPreviewArticle(
        extractWeeklyEditionOpenAiText(payload),
        packet,
      );
      const used = new Set(article.evidenceIds);
      await ctx.runMutation(internal.matchupPreviews.finish, {
        ...args,
        article: {
          writer: packet.writer,
          headline: article.headline,
          paragraphs: article.paragraphs,
          evidence: packet.facts.filter((fact) => used.has(fact.id)),
        },
      });
    } catch {
      // Never log model responses, credentials, or raw source packets.
      await ctx.runMutation(internal.matchupPreviews.finish, args);
    }
  },
});
