/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/prefer-optional-chain */
// @ts-nocheck
import { makeFunctionReference, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  requireCommissioner,
  requireOwnerOrCommissioner,
} from "./lib/auth";
import { buildLeagueActivity } from "../src/lib/utils/features/league-activity";
import {
  buildLockKey,
  canonicalJobName,
  JOB_NAMES,
  JOB_STATUSES,
} from "./jobCatalog";

type Row = Record<string, unknown> & {
  _id: string;
  _creationTime: number;
};
type Direction = "asc" | "desc";

const listArgs = {
  where: v.optional(v.record(v.string(), v.any())),
  orderBy: v.optional(
    v.record(v.string(), v.union(v.literal("asc"), v.literal("desc"))),
  ),
  take: v.optional(v.number()),
};

const indexedFields: Record<string, Set<string>> = {
  seasons: new Set(["legacyId"]),
  weeks: new Set(["legacyId", "seasonId", "isActive"]),
  teams: new Set(["legacyId", "seasonId", "franchiseId", "confId"]),
  franchises: new Set(["legacyId", "ownerId", "confId"]),
  conferences: new Set(["legacyId"]),
  owners: new Set(["legacyId"]),
  players: new Set(["legacyId", "gshlTeamId", "isActive"]),
  contracts: new Set(["legacyId", "playerId", "ownerId", "seasonId"]),
  draftPicks: new Set(["legacyId", "seasonId", "gshlTeamId", "playerId"]),
  matchups: new Set([
    "legacyId",
    "seasonId",
    "weekId",
    "homeTeamId",
    "awayTeamId",
  ]),
  events: new Set(["legacyId", "seasonId", "date"]),
  awards: new Set(["legacyId", "seasonId", "winnerId"]),
  playerAwards: new Set(["legacyId", "seasonId", "playerId"]),
  teamAwards: new Set(["legacyId", "seasonId", "ownerId", "teamId"]),
  nhlTeams: new Set(["legacyId"]),
  playerDayStatLines: new Set([
    "legacyId",
    "seasonId",
    "gshlTeamId",
    "playerId",
    "weekId",
    "date",
  ]),
  playerWeekStatLines: new Set([
    "legacyId",
    "seasonId",
    "gshlTeamId",
    "playerId",
    "weekId",
  ]),
  playerSplitStatLines: new Set([
    "legacyId",
    "seasonId",
    "gshlTeamId",
    "playerId",
    "seasonType",
  ]),
  playerTotalStatLines: new Set([
    "legacyId",
    "seasonId",
    "playerId",
    "seasonType",
  ]),
  playerCareerSplitStatLines: new Set([
    "legacyId",
    "gshlTeamId",
    "playerId",
    "seasonType",
  ]),
  playerCareerTotalStatLines: new Set([
    "legacyId",
    "playerId",
    "seasonType",
  ]),
  playerNhlStatLines: new Set(["legacyId", "seasonId", "playerId"]),
  teamDayStatLines: new Set([
    "legacyId",
    "seasonId",
    "gshlTeamId",
    "weekId",
    "date",
  ]),
  teamWeekStatLines: new Set([
    "legacyId",
    "seasonId",
    "gshlTeamId",
    "weekId",
  ]),
  teamSeasonStatLines: new Set([
    "legacyId",
    "seasonId",
    "gshlTeamId",
    "seasonType",
  ]),
};

function comparable(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const number = Number(trimmed);
    return trimmed && Number.isFinite(number) ? number : trimmed;
  }
  return JSON.stringify(value);
}

function equal(left: unknown, right: unknown) {
  return comparable(left) === comparable(right);
}

function publicRow(row: Row): Record<string, any> {
  return { ...row, id: row._id };
}

function matches(row: Record<string, unknown>, where?: Record<string, unknown>) {
  return Object.entries(where ?? {}).every(
    ([field, expected]) => expected === undefined || equal(row[field], expected),
  );
}

function compare(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  orderBy?: Record<string, Direction>,
) {
  for (const [field, direction] of Object.entries(orderBy ?? {})) {
    const a = comparable(left[field]);
    const b = comparable(right[field]);
    if (a === b) continue;
    if (a === null) return 1;
    if (b === null) return -1;
    const result =
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b));
    return direction === "desc" ? -result : result;
  }
  return 0;
}

async function rows(
  ctx: any,
  table: string,
  args: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, Direction>;
    take?: number;
  },
): Promise<Record<string, any>[]> {
  const where = { ...args.where };
  if ("id" in where && typeof where.id === "string") {
    try {
      const row = (await ctx.db.get(where.id)) as Row | null;
      return row && matches(publicRow(row), where) ? [publicRow(row)] : [];
    } catch {
      return [];
    }
  }

  if (table === "players" && where.teamId !== undefined) {
    where.gshlTeamId = where.teamId;
    delete where.teamId;
  }
  if (table === "draftPicks" && where.teamId !== undefined) {
    where.gshlTeamId = where.teamId;
    delete where.teamId;
  }

  const indexed = Object.entries(where).find(
    ([field, value]) =>
      value !== undefined && indexedFields[table]?.has(field),
  );
  let query: any = ctx.db.query(table as never);
  if (indexed) {
    const [field, value] = indexed;
    query = query.withIndex(`by_${field}`, (q: any) => q.eq(field, value));
  }

  const candidates = args.take && !args.orderBy && !Object.keys(where).length
    ? await query.take(args.take)
    : await query.collect();
  const result = (candidates as Row[])
    .map(publicRow)
    .filter((row) => matches(row, where))
    .sort((a, b) => compare(a, b, args.orderBy));
  return args.take ? result.slice(0, args.take) : result;
}

function list(table: string) {
  return query({
    args: listArgs,
    handler: (ctx, args) => rows(ctx, table, args),
  });
}

export const seasons = list("seasons");
export const weeks = list("weeks");
export const franchises = list("franchises");
export const conferences = list("conferences");
export const players = list("players");
export const contracts = list("contracts");
export const draftPicks = list("draftPicks");
export const matchups = list("matchups");
export const events = list("events");
export const awards = list("awards");
export const playerAwards = list("playerAwards");
export const teamAwards = list("teamAwards");
export const nhlTeams = list("nhlTeams");
export const playerDayStats = list("playerDayStatLines");
export const playerWeekStats = list("playerWeekStatLines");
export const playerSplitStats = list("playerSplitStatLines");
export const playerTotalStats = list("playerTotalStatLines");
export const playerCareerSplitStats = list("playerCareerSplitStatLines");
export const playerCareerTotalStats = list("playerCareerTotalStatLines");
export const playerNhlStats = list("playerNhlStatLines");
export const teamDayStats = list("teamDayStatLines");
export const teamWeekStats = list("teamWeekStatLines");
export const teamSeasonStats = list("teamSeasonStatLines");

export const owners = query({
  args: listArgs,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const user = identity
      ? await ctx.db.get(identity.subject as Id<"authUsers">)
      : null;
    const includePrivate = user?.status === "active";
    return (await rows(ctx, "owners", args)).map((owner) =>
      includePrivate ? owner : { ...owner, email: null, owing: 0 },
    );
  },
});

export const teams = query({
  args: listArgs,
  handler: async (ctx, args) => {
    const teamRows = await rows(ctx, "teams", args);
    if (!teamRows.length) return [];
    const [franchiseRows, ownerRows, conferenceRows] = await Promise.all([
      rows(ctx, "franchises", {}),
      rows(ctx, "owners", {}),
      rows(ctx, "conferences", {}),
    ]);
    const identity = await ctx.auth.getUserIdentity();
    const user = identity
      ? await ctx.db.get(identity.subject as Id<"authUsers">)
      : null;
    const includePrivate = user?.status === "active";
    const franchisesById = new Map(franchiseRows.map((row) => [row.id, row]));
    const ownersById = new Map(ownerRows.map((row) => [row.id, row]));
    const conferencesById = new Map(
      conferenceRows.map((row) => [row.id, row]),
    );

    return teamRows.map((team) => {
      const franchise = franchisesById.get(String(team.franchiseId));
      const owner = ownersById.get(String(franchise?.ownerId));
      const conference = conferencesById.get(
        String(team.confId ?? franchise?.confId),
      );
      return {
        ...team,
        name: franchise?.name ?? null,
        abbr: franchise?.abbr ?? null,
        logoUrl: franchise?.logoUrl ?? null,
        isActive: franchise?.isActive ?? false,
        confName: conference?.name ?? null,
        confAbbr: conference?.abbr ?? null,
        confLogoUrl: conference?.logoUrl ?? null,
        ownerId: owner?.id ?? null,
        ownerFirstName: owner?.firstName ?? null,
        ownerLastName: owner?.lastName ?? null,
        ownerNickname: owner?.nickName ?? null,
        ownerEmail: includePrivate ? (owner?.email ?? null) : null,
        ownerOwing: includePrivate ? (owner?.owing ?? null) : null,
        ownerIsActive: owner?.isActive ?? false,
      };
    });
  },
});

export const playersPage = query({
  args: {
    active: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const db = ctx.db as any;
    const query = args.active === undefined
      ? db.query("players")
      : db
          .query("players")
          .withIndex("by_isActive", (q) => q.eq("isActive", args.active!));
    const page = await query.paginate(args.paginationOpts);
    return { ...page, page: page.page.map((row) => publicRow(row as Row)) };
  },
});

export const playersByIds = query({
  args: { ids: v.array(v.id("players")) },
  handler: async (ctx, args) =>
    (
      await Promise.all(
        [...new Set(args.ids)].map((id) => ctx.db.get(id)),
      )
    )
      .filter((row) => row !== null)
      .map((row) => publicRow(row as unknown as Row)),
});

export const playerTotalsByPlayers = query({
  args: { playerIds: v.array(v.id("players")) },
  handler: async (ctx, args) => {
    const pages = await Promise.all(
      [...new Set(args.playerIds)].map((playerId) =>
        ctx.db
          .query("playerTotalStatLines")
          .withIndex("by_playerId", (q) => q.eq("playerId", playerId))
          .collect(),
      ),
    );
    return pages.flat().map((row) => publicRow(row as unknown as Row));
  },
});

export const playerNhlByPlayers = query({
  args: { playerIds: v.array(v.id("players")) },
  handler: async (ctx, args) => {
    const pages = await Promise.all(
      [...new Set(args.playerIds)].map((playerId) =>
        ctx.db
          .query("playerNhlStatLines")
          .withIndex("by_playerId", (q) => q.eq("playerId", playerId))
          .collect(),
      ),
    );
    return pages.flat().map((row) => publicRow(row as unknown as Row));
  },
});

export const careerSplitsByTeams = query({
  args: { teamIds: v.array(v.id("teams")) },
  handler: async (ctx, args) => {
    const pages = await Promise.all(
      [...new Set(args.teamIds)].map((gshlTeamId) =>
        ctx.db
          .query("playerCareerSplitStatLines")
          .withIndex("by_gshlTeamId", (q) =>
            q.eq("gshlTeamId", gshlTeamId),
          )
          .collect(),
      ),
    );
    return pages.flat().map((row) => publicRow(row as unknown as Row));
  },
});

export const draftPicksPage = query({
  args: {
    seasonId: v.id("seasons"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const page = await (ctx.db as any)
      .query("draftPicks")
      .withIndex("by_seasonId_round_pick", (q) =>
        q.eq("seasonId", args.seasonId),
      )
      .paginate(args.paginationOpts);
    return { ...page, page: page.page.map((row) => publicRow(row as Row)) };
  },
});

export const authUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireCommissioner(ctx);
    return (await ctx.db.query("authUsers").collect()).map((row) =>
      publicRow(row as unknown as Row),
    );
  },
});

export const activity = query({
  args: {
    seasonId: v.id("seasons"),
    take: v.number(),
  },
  handler: async (ctx, args) => {
    const [contracts, playerDays, teams, franchises] = await Promise.all([
      (ctx.db as any).query("contracts").withIndex("by_signingDate").order("desc").take(100),
      (ctx.db as any)
        .query("playerDayStatLines")
        .withIndex("by_seasonId_date", (q) => q.eq("seasonId", args.seasonId))
        .order("desc")
        .take(1500),
      (ctx.db as any)
        .query("teams")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", args.seasonId))
        .collect(),
      ctx.db.query("franchises").collect(),
    ]);
    const playerIds = new Set<string>();
    contracts.forEach((row) => playerIds.add(row.playerId));
    playerDays.forEach((row) => playerIds.add(row.playerId));
    const players = (
      await Promise.all(
        [...playerIds].map((id) => ctx.db.get(id as Id<"players">)),
      )
    ).filter((row) => row !== null);

    return buildLeagueActivity({
      contracts: contracts.map((row) => publicRow(row as unknown as Row)) as never,
      playerDays: playerDays.map((row) => publicRow(row as unknown as Row)) as never,
      players: players.map((row) => publicRow(row as unknown as Row)) as never,
      teams: teams.map((row) => publicRow(row as unknown as Row)) as never,
      franchises: franchises.map((row) => publicRow(row as unknown as Row)) as never,
      limit: Math.min(Math.max(args.take, 1), 30),
    });
  },
});

export const updatePlayer = mutation({
  args: {
    id: v.id("players"),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrCommissioner(ctx);
    const player = await ctx.db.get(args.id);
    if (!player) throw new Error("Player not found");

    if (user.role === "owner") {
      const fields = Object.keys(args.data).filter(
        (field) => args.data[field] !== undefined,
      );
      if (fields.length !== 1 || fields[0] !== "lineupPos" || !user.ownerId) {
        throw new Error("Forbidden");
      }
      const team = player.gshlTeamId
        ? await ctx.db.get(player.gshlTeamId)
        : null;
      const franchise = team ? await ctx.db.get(team.franchiseId) : null;
      if (!franchise || franchise.ownerId !== user.ownerId) {
        throw new Error("Forbidden");
      }
    }

    const patch: Record<string, unknown> = { ...args.data };
    if (patch.gshlTeamId === null || patch.gshlTeamId === "") {
      patch.gshlTeamId = undefined;
    }
    patch.updatedAt = new Date().toISOString();
    await ctx.db.patch(args.id, patch as never);
    return publicRow((await ctx.db.get(args.id)) as unknown as Row);
  },
});

export const updateDraftPick = mutation({
  args: {
    id: v.id("draftPicks"),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const patch = { ...args.data };
    if ("teamId" in patch) {
      patch.gshlTeamId = patch.teamId;
      delete patch.teamId;
    }
    patch.updatedAt = new Date().toISOString();
    await ctx.db.patch(args.id, patch as never);
    return publicRow((await ctx.db.get(args.id)) as unknown as Row);
  },
});

export const updateAuthUserAccess = mutation({
  args: {
    id: v.id("authUsers"),
    role: v.union(
      v.literal("viewer"),
      v.literal("owner"),
      v.literal("commissioner"),
    ),
    status: v.union(v.literal("active"), v.literal("disabled")),
    ownerId: v.optional(v.id("owners")),
  },
  handler: async (ctx, args) => {
    const current = await requireCommissioner(ctx);
    if (
      current._id === args.id &&
      (args.role !== "commissioner" || args.status !== "active")
    ) {
      throw new Error("You cannot remove your own commissioner access");
    }
    if (args.role === "owner" && !args.ownerId) {
      throw new Error("Owners must be linked to an owner record");
    }
    await ctx.db.patch(args.id, {
      role: args.role,
      status: args.status,
      ownerId:
        args.role === "owner" || args.role === "commissioner"
          ? args.ownerId
          : undefined,
      updatedAt: new Date().toISOString(),
    });
    return publicRow((await ctx.db.get(args.id)) as unknown as Row);
  },
});

export const createContract = mutation({
  args: {
    teamId: v.id("teams"),
    playerId: v.id("players"),
    contractLength: v.union(v.literal(1), v.literal(2), v.literal(3)),
  },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const [team, player, seasons] = await Promise.all([
      ctx.db.get(args.teamId),
      ctx.db.get(args.playerId),
      ctx.db.query("seasons").collect(),
    ]);
    if (!team || !player) throw new Error("Team or player not found");
    const ordered = [...seasons].sort(
      (a, b) => Number(a.year) - Number(b.year),
    );
    const signingSeason = ordered.find((season) => season.isActive);
    if (!signingSeason || team.seasonId !== signingSeason._id) {
      throw new Error("The selected team is not in the active signing season");
    }
    const franchise = await ctx.db.get(team.franchiseId);
    if (!franchise?.ownerId) throw new Error("Team owner not found");
    const duplicate = await ctx.db
      .query("contracts")
      .withIndex("by_playerId", (q) => q.eq("playerId", args.playerId))
      .filter((q) => q.eq(q.field("seasonId"), signingSeason._id))
      .first();
    if (duplicate) throw new Error("Player already has a contract");
    const seasonIndex = ordered.findIndex(
      (season) => season._id === signingSeason._id,
    );
    const expirySeason =
      ordered[seasonIndex + args.contractLength - 1] ?? signingSeason;
    const now = new Date().toISOString();
    const id = await ctx.db.insert("contracts", {
      playerId: args.playerId,
      ownerId: franchise.ownerId,
      seasonId: signingSeason._id,
      contractType: "STANDARD",
      contractLength: args.contractLength,
      contractSalary: Number(player.salary ?? 0),
      signingDate: now.slice(0, 10),
      startDate: String(signingSeason.startDate),
      signingStatus: "Drafted",
      expiryStatus: "UFA",
      expiryDate: String(expirySeason.endDate),
      capHit: Number(player.salary ?? 0),
      capHitEndDate: String(expirySeason.endDate),
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.playerId, {
      gshlTeamId: args.teamId,
      updatedAt: now,
    });
    return publicRow((await ctx.db.get(id)) as unknown as Row);
  },
});

const runJob = makeFunctionReference<"action", { runId: string }>(
  "jobRunner:run",
);

export const jobCatalog = query({
  args: {},
  handler: async (ctx) => {
    await requireCommissioner(ctx);
    return { jobs: JOB_NAMES, statuses: JOB_STATUSES };
  },
});

export const jobRuns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    return (
      await ctx.db
        .query("jobRuns")
        .order("desc")
        .take(Math.min(Math.max(args.limit ?? 50, 1), 200))
    ).map((row) => publicRow(row as unknown as Row));
  },
});

export const startJob = mutation({
  args: {
    jobName: v.string(),
    args: v.optional(v.record(v.string(), v.any())),
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCommissioner(ctx);
    const jobName = canonicalJobName(args.jobName);
    const jobArgs = args.args ?? {};
    const now = Date.now();
    const runId = await ctx.db.insert("jobRuns", {
      jobName,
      args: jobArgs,
      apply: args.apply === true,
      mode: "manual",
      status: "queued",
      lockKey: buildLockKey(jobName, jobArgs),
      attempt: 1,
      requestedBy: user.email,
      createdAt: now,
      progress: { processed: 0 },
    });
    await ctx.scheduler.runAfter(0, runJob, { runId });
    return publicRow((await ctx.db.get(runId)) as unknown as Row);
  },
});

export const cancelJob = mutation({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");
    await ctx.db.patch(args.runId, {
      status: run.status === "running" ? "cancelling" : "cancelled",
      finishedAt: run.status === "running" ? undefined : Date.now(),
    });
    return publicRow((await ctx.db.get(args.runId)) as unknown as Row);
  },
});

export const retryJob = mutation({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const user = await requireCommissioner(ctx);
    const previous = await ctx.db.get(args.runId);
    if (!previous || !["failed", "cancelled"].includes(previous.status)) {
      throw new Error("Only failed or cancelled runs can be retried");
    }
    const runId = await ctx.db.insert("jobRuns", {
      jobName: previous.jobName,
      args: previous.args,
      apply: previous.apply,
      mode: "retry",
      status: "queued",
      lockKey: previous.lockKey,
      attempt: previous.attempt + 1,
      requestedBy: user.email,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, runJob, { runId });
    return publicRow((await ctx.db.get(runId)) as unknown as Row);
  },
});
