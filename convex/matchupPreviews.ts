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
  matchupPreviewExpiresAt,
  parseMatchupPreviewArticle,
  PREVIEW_WINDOW_MS,
  matchupPreviewAnalysisIsDuplicate,
  MatchupPreviewDuplicateAnalysisError,
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
  if (!matchup) return null;
  const week = await ctx.db.get(matchup.weekId);
  const date = utcTimestampToDateKey(week?.startDate);
  const startsAt = matchupPreviewStartsAt(date);
  const expiresAt = matchupPreviewExpiresAt(date);
  return startsAt === null || expiresAt === null
    ? null
    : { matchup, startsAt, expiresAt };
}

/** Public copy only. Expired articles stay hidden even if cleanup is delayed. */
export const forMatchup = query({
  args: { matchupId: v.string() },
  handler: async (ctx, args): Promise<MatchupPreviewArticle[]> => {
    const id = ctx.db.normalizeId("matchups", args.matchupId);
    if (!id) return [];
    const window = await windowFor(ctx, id);
    if (!window || window.expiresAt <= Date.now()) return [];
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
    window.expiresAt <= Date.now() ||
    ![window.matchup.homeTeamId, window.matchup.awayTeamId].includes(row.teamId)
  ) {
    await ctx.db.delete(id);
    return;
  }
  // Also upgrades legacy rows when their old start-time expiry job runs.
  await ctx.db.patch(id, {
    startsAt: window.startsAt,
    expiresAt: window.expiresAt,
  });
  await ctx.scheduler.runAfter(
    window.expiresAt - Date.now(),
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
      .withIndex("by_expiresAt", (q) =>
        q.gte("expiresAt", 0).lte("expiresAt", Date.now()),
      )
      .take(100);
    const legacy = await ctx.db
      .query("matchupPreviews")
      .withIndex("by_expiresAt", (q) => q.eq("expiresAt", undefined))
      .take(100);
    for (const row of rows) await removeIfExpired(ctx, row._id);
    for (const row of legacy) await removeIfExpired(ctx, row._id);
    if (rows.length === 100 || legacy.length === 100)
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
      const expiresAt = matchupPreviewExpiresAt(
        utcTimestampToDateKey(week.startDate),
      );
      if (
        !isPreviewDue(startsAt, now) ||
        startsAt === null ||
        expiresAt === null
      )
        continue;
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
        const teamIds = [matchup.homeTeamId, matchup.awayTeamId];
        // Rotate who writes first; the other writer keeps an independent club perspective.
        if (Number(week.weekNum) % 2 === 0) teamIds.reverse();
        const claimed: Id<"matchupPreviews">[] = [];
        for (const teamId of new Set(teamIds)) {
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
            expiresAt,
            status: "generating" as const,
            attemptAt: now,
          };
          const id =
            existing?._id ?? (await ctx.db.insert("matchupPreviews", values));
          if (existing)
            await ctx.db.patch(id, { ...values, failure: undefined });
          claimed.push(id);
          await ctx.scheduler.runAfter(
            expiresAt - now,
            internal.matchupPreviews.expire,
            { id },
          );
        }
        // finish chains the second writer after the first settles, so the pair can be reviewed.
        if (claimed[0])
          await ctx.scheduler.runAfter(
            queued++ * 10000,
            internal.matchupPreviews.generate,
            { id: claimed[0], attemptAt: now },
          );
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
      window.matchup.isComplete ||
      window.matchup.homeWin ||
      window.matchup.awayWin ||
      window.matchup.tie ||
      !isPreviewDue(window.startsAt, Date.now()) ||
      ![window.matchup.homeTeamId, window.matchup.awayTeamId].includes(
        row.teamId,
      )
    )
      return null;
    const packet = await loadMatchupPreviewEvidence(
      ctx,
      window.matchup,
      row.teamId,
      window.startsAt,
      Date.now(),
    );
    if (!packet) return null;
    const opponentId =
      row.teamId === window.matchup.homeTeamId
        ? window.matchup.awayTeamId
        : window.matchup.homeTeamId;
    const opposing = await ctx.db
      .query("matchupPreviews")
      .withIndex("by_matchupId_teamId", (q) =>
        q.eq("matchupId", row.matchupId).eq("teamId", opponentId),
      )
      .unique();
    return {
      ...packet,
      ...(opposing?.status === "published" &&
      opposing.writer &&
      opposing.headline &&
      opposing.paragraphs
        ? {
            opposingArticle: {
              writer: opposing.writer,
              headline: opposing.headline,
              paragraphs: opposing.paragraphs,
            },
          }
        : {}),
    };
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
      window.expiresAt <= Date.now() ||
      ![window.matchup.homeTeamId, window.matchup.awayTeamId].includes(
        row.teamId,
      )
    ) {
      await ctx.db.delete(row._id);
      return;
    }
    if (
      window.matchup.isComplete ||
      window.matchup.homeWin ||
      window.matchup.awayWin ||
      window.matchup.tie ||
      !isPreviewDue(window.startsAt, Date.now())
    ) {
      await ctx.db.patch(row._id, {
        status: "failed",
        failure: "Pregame writing window has closed or the matchup moved",
      });
      return;
    }
    const opponentId =
      row.teamId === window.matchup.homeTeamId
        ? window.matchup.awayTeamId
        : window.matchup.homeTeamId;
    const opposing = await ctx.db
      .query("matchupPreviews")
      .withIndex("by_matchupId_teamId", (q) =>
        q.eq("matchupId", row.matchupId).eq("teamId", opponentId),
      )
      .unique();
    if (
      args.article &&
      opposing?.status === "published" &&
      opposing.paragraphs &&
      matchupPreviewAnalysisIsDuplicate(
        args.article.paragraphs,
        opposing.paragraphs,
      )
    ) {
      await ctx.db.patch(row._id, {
        status: "failed",
        failure: "Preview repeats opposing analysis; will retry overnight",
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
    if (
      opposing?.status === "generating" &&
      opposing.attemptAt === args.attemptAt
    )
      await ctx.scheduler.runAfter(0, internal.matchupPreviews.generate, {
        id: opposing._id,
        attemptAt: opposing.attemptAt,
      });
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
      let rejectedArticle:
        | { headline: string; paragraphs: string[] }
        | undefined;
      let article: ReturnType<typeof parseMatchupPreviewArticle> | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            buildMatchupPreviewRequest(
              resolveNewsroomModel(
                undefined,
                process.env.OPENAI_NEWSROOM_MODEL,
              ),
              packet,
              rejectedArticle,
            ),
          ),
          signal: AbortSignal.timeout(90000),
        });
        if (!response.ok) throw new Error("Preview generation failed");
        const payload: unknown = await response.json();
        const text = extractWeeklyEditionOpenAiText(payload);
        try {
          article = parseMatchupPreviewArticle(text, packet);
          break;
        } catch (error) {
          if (
            !(error instanceof MatchupPreviewDuplicateAnalysisError) ||
            attempt > 0
          )
            throw error;
          const draft = parseMatchupPreviewArticle(text, {
            ...packet,
            opposingArticle: undefined,
          });
          rejectedArticle = {
            headline: draft.headline,
            paragraphs: draft.paragraphs.slice(0, -1),
          };
        }
      }
      if (!article)
        throw new Error("Preview could not be written independently");
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
