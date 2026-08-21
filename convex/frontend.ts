/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/prefer-optional-chain */
// @ts-nocheck
import { makeFunctionReference, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCommissioner, requireOwnerOrCommissioner } from "./lib/auth";
import { buildLeagueActivity } from "../src/lib/utils/features/league-activity";
import {
  buildLockKey,
  canonicalJobName,
  JOB_NAMES,
  JOB_STATUSES,
} from "./jobCatalog";
import {
  normalizeTimestampFields,
  timestampFieldsForTable,
  toUtcTimestamp,
  utcTimestampToDateKey,
} from "./lib/timestamps";
import { loadLatestNhlStats, loadUfaCatalog } from "./lib/ufaCatalog";
import {
  canTakeFrontendRowsBeforeFiltering,
  selectFrontendIndexPlan,
} from "./lib/frontendQuery";
import {
  pickDefinedFields,
  PLAYER_NHL_DISPLAY_FIELDS,
} from "./lib/publicProjection";
import {
  buildContractedSeasonRosterPlayers,
  prepareDraftBoardPlayers,
} from "../src/lib/utils/features/draft-board-list";
import {
  buildMockDraftProjection,
  compactMockDraftProjection,
  getMockDraftReferencedNhlAbbreviations,
} from "../src/lib/utils/features/mock-draft";
import {
  buildOwnerRankings,
  compactOwnerRankings,
} from "../src/lib/utils/features/owner-rankings";
import { buildPowerRankings } from "../src/lib/utils/features/power-rankings";
import { projectStandingsPowerHistory } from "./lib/standingsProjection";
import {
  buildUfaCatalogCandidates,
  resolveUfaViewerContext,
  selectUfaHomeCatalogPlayerIds,
} from "../src/lib/utils/features/ufa";

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

const indexFieldsByTable: Record<string, readonly (readonly string[])[]> = {
  seasons: [["legacyId"]],
  weeks: [
    ["legacyId"],
    ["seasonId"],
    ["seasonId", "weekNum"],
    ["seasonId", "startDate"],
  ],
  teams: [
    ["legacyId"],
    ["seasonId"],
    ["franchiseId"],
    ["confId"],
    ["seasonId", "franchiseId"],
  ],
  franchises: [["legacyId"], ["ownerId"], ["confId"]],
  conferences: [["legacyId"]],
  owners: [["legacyId"]],
  players: [
    ["legacyId"],
    ["ownerId"],
    ["gshlTeamId"],
    ["isActive"],
    ["isActive", "overallRk"],
    ["isActive", "overallRating"],
    ["isActive", "isSignable", "isResignable"],
  ],
  playerNhlSalaries: [
    ["legacyId"],
    ["playerId"],
    ["nhlApiId"],
    ["seasonStartYear"],
    ["playerId", "seasonStartYear"],
    ["seasonStartYear", "normalizedSalary"],
  ],
  contracts: [
    ["legacyId"],
    ["playerId"],
    ["ownerId"],
    ["seasonId"],
    ["signingDate"],
    ["seasonId", "signingDate"],
  ],
  draftPicks: [
    ["legacyId"],
    ["seasonId"],
    ["gshlTeamId"],
    ["playerId"],
    ["seasonId", "round", "pick"],
  ],
  matchups: [
    ["legacyId"],
    ["seasonId"],
    ["weekId"],
    ["homeTeamId"],
    ["awayTeamId"],
    ["seasonId", "weekId"],
    ["seasonId", "homeTeamId"],
    ["seasonId", "awayTeamId"],
  ],
  events: [["legacyId"], ["seasonId"], ["date"]],
  awards: [["legacyId"], ["seasonId"], ["winnerId"]],
  playerAwards: [["legacyId"], ["seasonId"], ["playerId"]],
  teamAwards: [
    ["legacyId"],
    ["seasonId"],
    ["ownerId"],
    ["teamId"],
    ["seasonId", "ownerId"],
  ],
  nhlTeams: [["legacyId"], ["abbr"]],
  playerDayStatLines: [
    ["legacyId"],
    ["seasonId"],
    ["gshlTeamId"],
    ["playerId"],
    ["weekId"],
    ["date"],
    ["seasonId", "date"],
    ["seasonId", "weekId", "gshlTeamId"],
    ["seasonId", "playerId", "date"],
    ["seasonId", "gshlTeamId", "playerId", "weekId", "date"],
  ],
  playerDayHighlights: [
    ["legacyId"],
    ["seasonId"],
    ["seasonId", "date"],
    ["seasonId", "ratingRank"],
    ["seasonId", "sourcePlayerDayId"],
  ],
  playerWeekStatLines: [
    ["legacyId"],
    ["seasonId"],
    ["gshlTeamId"],
    ["playerId"],
    ["weekId"],
    ["seasonId", "weekId", "gshlTeamId"],
    ["seasonId", "playerId"],
    ["seasonId", "gshlTeamId", "playerId", "weekId"],
  ],
  playerSplitStatLines: [
    ["legacyId"],
    ["seasonId"],
    ["gshlTeamId"],
    ["playerId"],
    ["seasonType"],
    ["seasonId", "seasonType", "gshlTeamId", "playerId"],
  ],
  playerTotalStatLines: [
    ["legacyId"],
    ["seasonId"],
    ["playerId"],
    ["seasonType"],
    ["seasonId", "seasonType", "playerId"],
  ],
  playerCareerSplitStatLines: [
    ["legacyId"],
    ["gshlTeamId"],
    ["playerId"],
    ["seasonType"],
    ["gshlTeamId", "playerId", "seasonType"],
  ],
  playerCareerTotalStatLines: [
    ["legacyId"],
    ["playerId"],
    ["seasonType"],
    ["playerId", "seasonType"],
  ],
  playerNhlStatLines: [
    ["legacyId"],
    ["seasonId"],
    ["playerId"],
    ["seasonId", "playerId"],
  ],
  teamDayStatLines: [
    ["legacyId"],
    ["seasonId"],
    ["gshlTeamId"],
    ["weekId"],
    ["date"],
    ["seasonId", "date"],
    ["seasonId", "weekId", "gshlTeamId"],
    ["seasonId", "gshlTeamId", "weekId", "date"],
  ],
  teamWeekStatLines: [
    ["legacyId"],
    ["seasonId"],
    ["gshlTeamId"],
    ["weekId"],
    ["seasonId", "weekId", "gshlTeamId"],
  ],
  teamSeasonStatLines: [
    ["legacyId"],
    ["seasonId"],
    ["seasonType"],
    ["gshlTeamId"],
    ["seasonId", "seasonType", "gshlTeamId"],
  ],
};

// The generic facade preserves compatibility equality between numeric strings
// and numbers, and between legacy date strings and UTC timestamps. Convex index
// equality is type-exact, so these fields may only be filtered after the last
// safe index prefix or valid legacy rows would be omitted.
const nonExactIndexFieldsByTable: Record<string, readonly string[]> = {
  weeks: ["weekNum", "startDate"],
  players: ["overallRk", "overallRating"],
  playerNhlSalaries: ["seasonStartYear", "normalizedSalary"],
  contracts: ["signingDate"],
  draftPicks: ["round", "pick"],
  events: ["date"],
  playerDayHighlights: ["ratingRank"],
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
  const output: Record<string, unknown> = { ...row, id: row._id };
  delete output._id;
  delete output._creationTime;
  for (const [field, value] of Object.entries(output)) {
    if (typeof value !== "number") continue;
    if (field.endsWith("At")) {
      output[field] = new Date(value).toISOString();
      continue;
    }
    if (field === "birthday" || field === "date" || field.endsWith("Date")) {
      output[field] = utcTimestampToDateKey(value);
    }
  }
  return output;
}

function matches(
  table: string,
  row: Record<string, unknown>,
  where?: Record<string, unknown>,
) {
  const timestampFields = new Set(timestampFieldsForTable(table));
  return Object.entries(where ?? {}).every(
    ([field, expected]) =>
      expected === undefined ||
      (timestampFields.has(field)
        ? toUtcTimestamp(row[field]) === toUtcTimestamp(expected)
        : equal(row[field], expected)),
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
      const normalizedId = ctx.db.normalizeId(table as never, where.id);
      if (!normalizedId) return [];

      const row = (await ctx.db.get(normalizedId)) as Row | null;
      delete where.id;
      return row && matches(table, row, where) ? [publicRow(row)] : [];
    } catch {
      return [];
    }
  }

  if (table === "draftPicks" && where.teamId !== undefined) {
    where.gshlTeamId = where.teamId;
    delete where.teamId;
  }

  const timestampFields = new Set(timestampFieldsForTable(table));
  const nonExactIndexFields = new Set(nonExactIndexFieldsByTable[table] ?? []);
  const indexPlan = selectFrontendIndexPlan(
    indexFieldsByTable[table] ?? [],
    where,
    nonExactIndexFields,
  );
  let query: any = ctx.db.query(table as never);
  if (indexPlan) {
    query = query.withIndex(indexPlan.indexName, (range: any) => {
      let constrainedRange = range;
      for (const field of indexPlan.constrainedFields) {
        const value = timestampFields.has(field)
          ? (toUtcTimestamp(where[field]) ?? where[field])
          : where[field];
        constrainedRange = constrainedRange.eq(field, value);
      }
      return constrainedRange;
    });
  }

  const candidates =
    args.take &&
    !args.orderBy &&
    canTakeFrontendRowsBeforeFiltering(where, indexPlan)
      ? await query.take(args.take)
      : await query.collect();
  const result = (candidates as Row[])
    .filter((row) => matches(table, row, where))
    .map(publicRow)
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
export const playerNhlSalaries = list("playerNhlSalaries");
export const contracts = list("contracts");
export const draftPicks = list("draftPicks");
export const matchups = list("matchups");
export const events = list("events");
export const awards = list("awards");
export const playerAwards = list("playerAwards");
export const teamAwards = list("teamAwards");
export const nhlTeams = list("nhlTeams");
export const playerDayStats = list("playerDayStatLines");
export const playerDayHighlights = list("playerDayHighlights");
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

async function enrichTeamRows(
  ctx: any,
  teamRows: Record<string, any>[],
  includePrivate: boolean,
) {
  if (!teamRows.length) return [];

  const franchiseIds = [
    ...new Set(teamRows.map((team) => String(team.franchiseId))),
  ];
  const franchises = (
    await Promise.all(
      franchiseIds.map((id) => ctx.db.get(id as Id<"franchises">)),
    )
  ).filter((row) => row !== null);
  const ownerIds = [
    ...new Set(franchises.map((franchise) => String(franchise.ownerId))),
  ];
  const conferenceIds = [
    ...new Set([
      ...teamRows.map((team) => String(team.confId)),
      ...franchises.map((franchise) => String(franchise.confId)),
    ]),
  ];
  const [owners, conferences] = await Promise.all([
    Promise.all(ownerIds.map((id) => ctx.db.get(id as Id<"owners">))),
    Promise.all(conferenceIds.map((id) => ctx.db.get(id as Id<"conferences">))),
  ]);
  const franchisesById = new Map(
    franchises.map((row) => [String(row._id), row]),
  );
  const ownersById = new Map(
    owners.filter((row) => row !== null).map((row) => [String(row._id), row]),
  );
  const conferencesById = new Map(
    conferences
      .filter((row) => row !== null)
      .map((row) => [String(row._id), row]),
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
      ownerId: owner?._id ?? null,
      ownerFirstName: owner?.firstName ?? null,
      ownerLastName: owner?.lastName ?? null,
      ownerNickname: owner?.nickName ?? null,
      ownerEmail: includePrivate ? (owner?.email ?? null) : null,
      ownerOwing: includePrivate ? (owner?.owing ?? null) : null,
      ownerIsActive: owner?.isActive ?? false,
    };
  });
}

export const teams = query({
  args: listArgs,
  handler: async (ctx, args) => {
    const teamRows = await rows(ctx, "teams", args);
    if (!teamRows.length) return [];
    const identity = await ctx.auth.getUserIdentity();
    const user = identity
      ? await ctx.db.get(identity.subject as Id<"authUsers">)
      : null;
    const includePrivate = user?.status === "active";
    return enrichTeamRows(ctx, teamRows, includePrivate);
  },
});

export const ownerRankings = query({
  args: {},
  handler: async (ctx) => {
    const [owners, seasons, matchups, weeks, rawTeams, teamAwards, powerStats] =
      await Promise.all([
        rows(ctx, "owners", {}),
        rows(ctx, "seasons", {}),
        rows(ctx, "matchups", {}),
        rows(ctx, "weeks", {}),
        rows(ctx, "teams", {}),
        rows(ctx, "teamAwards", {}),
        rows(ctx, "teamWeekStatLines", {}),
      ]);
    const teamRows = await enrichTeamRows(ctx, rawTeams, false);
    const view = buildOwnerRankings({
      owners,
      seasons,
      matchups,
      weeks,
      teams: teamRows,
      teamAwards,
      powerRankingStats: powerStats,
    });

    return compactOwnerRankings(view);
  },
});

export const powerRankingsPreview = query({
  args: { seasonId: v.id("seasons"), take: v.number() },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) return null;

    const [rawTeams, weeks, seasonStats] = await Promise.all([
      rows(ctx, "teams", { where: { seasonId: args.seasonId } }),
      ctx.db
        .query("weeks")
        .withIndex("by_seasonId_startDate", (range) =>
          range.eq("seasonId", args.seasonId),
        )
        .order("desc")
        .collect(),
      rows(ctx, "teamSeasonStatLines", {
        where: { seasonId: args.seasonId, seasonType: "RS" },
      }),
    ]);
    const teamRows = await enrichTeamRows(ctx, rawTeams, false);
    const teamIds = new Set(teamRows.map((team) => String(team.id)));
    const rankedWeeks = [];
    const rankedWeeklyStats = [];

    for (const week of weeks) {
      const projected = projectStandingsPowerHistory({
        weeks: [week],
        weeklyStats: await ctx.db
          .query("teamWeekStatLines")
          .withIndex("by_seasonId_weekId_gshlTeamId", (range) =>
            range.eq("seasonId", args.seasonId).eq("weekId", week._id),
          )
          .collect(),
      });
      const currentTeamStats = projected.weeklyStats.filter((stat) =>
        teamIds.has(String(stat.gshlTeamId)),
      );
      if (!currentTeamStats.length) continue;

      rankedWeeks.push(...projected.weeks);
      rankedWeeklyStats.push(...currentTeamStats);
      if (rankedWeeks.length === 2) break;
    }

    const rankings = buildPowerRankings({
      teams: teamRows,
      weeks: rankedWeeks,
      weeklyStats: rankedWeeklyStats,
      seasonStats,
    });
    const requestedTake = Number.isFinite(args.take) ? args.take : 8;
    const limit = Math.min(Math.max(Math.trunc(requestedTake), 1), 16);

    return {
      season: {
        id: String(season._id),
        name: season.name,
        isActive: season.isActive,
      },
      latestWeek: rankings.latestWeek
        ? {
            weekNum: rankings.latestWeek.weekNum,
          }
        : null,
      entries: rankings.entries.slice(0, limit).map((entry) => ({
        team: {
          id: entry.team.id,
          name: entry.team.name,
          abbr: entry.team.abbr,
          logoUrl: entry.team.logoUrl,
        },
        rank: entry.rank,
        rating: entry.rating,
        rankChange: entry.rankChange,
        color: entry.color,
      })),
    };
  },
});

export const playersPage = query({
  args: {
    active: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const db = ctx.db as any;
    const query =
      args.active === undefined
        ? db.query("players")
        : db
            .query("players")
            .withIndex("by_isActive_overallRating", (q) =>
              q.eq("isActive", args.active!),
            )
            .order("desc");
    const page = await query.paginate(args.paginationOpts);
    return { ...page, page: page.page.map((row) => publicRow(row as Row)) };
  },
});

export const playersByIds = query({
  args: { ids: v.array(v.id("players")) },
  handler: async (ctx, args) =>
    (await Promise.all([...new Set(args.ids)].map((id) => ctx.db.get(id))))
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

export const playerNhlSalaryHistory = query({
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
    return pages
      .flat()
      .map((row) =>
        pickDefinedFields(publicRow(row as unknown as Row), [
          "playerId",
          "seasonId",
          "salary",
        ]),
      );
  },
});

export const latestPlayerNhlStats = query({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const [targetSeason, seasons] = await Promise.all([
      ctx.db.get(args.seasonId),
      ctx.db.query("seasons").collect(),
    ]);
    if (!targetSeason) return [];
    const targetYear = Number(targetSeason.year);
    const orderedSeasons = seasons
      .filter((season) => Number(season.year) <= targetYear)
      .sort((left, right) => Number(left.year) - Number(right.year));
    const stats = await loadLatestNhlStats(
      ctx.db,
      orderedSeasons,
      targetSeason,
    );
    return stats.map((row) =>
      pickDefinedFields(
        publicRow(row as unknown as Row),
        PLAYER_NHL_DISPLAY_FIELDS,
      ),
    );
  },
});

const UFA_SEASON_FIELDS = [
  "id",
  "year",
  "startDate",
  "endDate",
  "isActive",
  "signingEndDate",
] as const;
const UFA_PLAYER_FIELDS = [
  "id",
  "fullName",
  "nhlPos",
  "posGroup",
  "nhlTeam",
  "isActive",
  "overallRk",
  "salary",
  "seasonRating",
  "overallRating",
] as const;
const UFA_NHL_TEAM_FIELDS = ["abbr", "logoUrl"] as const;
const UFA_FRANCHISE_FIELDS = [
  "id",
  "ownerId",
  "name",
  "logoUrl",
  "isActive",
] as const;
const UFA_TEAM_FIELDS = ["seasonId", "franchiseId"] as const;
const UFA_CONTRACT_FIELDS = [
  "playerId",
  "ownerId",
  "seasonId",
  "contractType",
  "contractLength",
  "contractSalary",
  "startDate",
  "expiryStatus",
  "expiryDate",
  "capHit",
  "capHitEndDate",
] as const;

const projectUfaRows = (rows: any[], fields: readonly string[]) =>
  rows.map((row) =>
    pickDefinedFields(publicRow(row as unknown as Row), fields),
  );

function projectUfaCatalog(
  catalog: Awaited<ReturnType<typeof loadUfaCatalog>>,
  overrides: {
    players?: any[];
    nhlStats?: any[];
    contracts?: any[];
  } = {},
) {
  return {
    seasons: projectUfaRows(catalog.seasons, UFA_SEASON_FIELDS),
    players: projectUfaRows(
      overrides.players ?? catalog.players,
      UFA_PLAYER_FIELDS,
    ),
    nhlStats: projectUfaRows(
      overrides.nhlStats ?? catalog.nhlStats,
      PLAYER_NHL_DISPLAY_FIELDS,
    ),
    nhlTeams: projectUfaRows(catalog.nhlTeams, UFA_NHL_TEAM_FIELDS),
    franchises: projectUfaRows(catalog.franchises, UFA_FRANCHISE_FIELDS),
    teams: projectUfaRows(catalog.teams, UFA_TEAM_FIELDS),
    contracts: projectUfaRows(
      overrides.contracts ?? catalog.contracts,
      UFA_CONTRACT_FIELDS,
    ),
  };
}

async function activeViewerOwnerId(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  const user = identity
    ? await ctx.db.get(identity.subject as Id<"authUsers">)
    : null;
  return user?.status === "active" && user.ownerId ? user.ownerId : null;
}

async function unresolvedUfaOfferGroups(ctx: any) {
  const pages = await Promise.all(
    ["open", "failed", "resolving"].map((status) =>
      ctx.db
        .query("ufaOfferGroups")
        .withIndex("by_status_deadline", (range: any) =>
          range.eq("status", status),
        )
        .collect(),
    ),
  );
  return pages.flat();
}

export const ufaCatalog = query({
  args: {},
  handler: async (ctx) => {
    const [catalog, viewerOwnerId] = await Promise.all([
      loadUfaCatalog(ctx.db),
      activeViewerOwnerId(ctx),
    ]);
    const activePlayerIds = new Set(
      catalog.players.map((player) => String(player._id)),
    );
    const contracts = catalog.contracts.filter(
      (contract) =>
        activePlayerIds.has(String(contract.playerId)) ||
        (viewerOwnerId !== null &&
          String(contract.ownerId) === String(viewerOwnerId)),
    );
    return projectUfaCatalog(catalog, { contracts });
  },
});

export const ufaHomeCatalog = query({
  args: {},
  handler: async (ctx) => {
    const [catalog, viewerOwnerId, groups] = await Promise.all([
      loadUfaCatalog(ctx.db),
      activeViewerOwnerId(ctx),
      unresolvedUfaOfferGroups(ctx),
    ]);
    const unresolvedGroupIds = new Set(
      groups.map((group) => String(group._id)),
    );
    const viewerPendingOffers = viewerOwnerId
      ? (
          await ctx.db
            .query("ufaOffers")
            .withIndex("by_owner_status", (range) =>
              range.eq("ownerId", viewerOwnerId).eq("status", "pending"),
            )
            .collect()
        ).filter((offer) => unresolvedGroupIds.has(String(offer.groupId)))
      : [];
    const selectionCatalog = projectUfaCatalog(catalog, {
      nhlStats: [],
      contracts: catalog.contracts,
    });
    const activeSeason = selectionCatalog.seasons.find(
      (season) => season.isActive,
    );
    const viewer = resolveUfaViewerContext({
      ownerId: viewerOwnerId ? String(viewerOwnerId) : undefined,
      signingSeasonId: activeSeason?.id,
      franchises: selectionCatalog.franchises,
      teams: selectionCatalog.teams,
    });
    const candidates = buildUfaCatalogCandidates({
      players: selectionCatalog.players,
      signingSeason: activeSeason ?? null,
      seasons: selectionCatalog.seasons,
      contracts: selectionCatalog.contracts,
      ownerId: viewerOwnerId ? String(viewerOwnerId) : undefined,
      groups: groups.map((group) => ({
        id: String(group._id),
        seasonId: String(group.seasonId),
      })),
      offers: viewerPendingOffers.map((offer) => ({
        groupId: String(offer.groupId),
        contractLength: offer.contractLength,
        salary: offer.salary,
        status: offer.status,
        isMine: true,
      })),
    });
    const selectedPlayerIds = selectUfaHomeCatalogPlayerIds({
      candidates,
      isSignedInOwner: viewer.isSignedInOwner,
      offerGroupPlayerIds: groups.map((group) => group.playerId),
    });
    const catalogPlayerById = new Map(
      catalog.players.map((player) => [String(player._id), player]),
    );
    const missingPlayers = (
      await Promise.all(
        selectedPlayerIds
          .filter((playerId) => !catalogPlayerById.has(playerId))
          .map((playerId) => ctx.db.get(playerId as Id<"players">)),
      )
    ).filter((player) => player !== null);
    const selectedPlayerById = new Map([
      ...catalogPlayerById,
      ...missingPlayers.map((player) => [String(player._id), player] as const),
    ]);
    const selectedPlayers = selectedPlayerIds.flatMap((playerId) => {
      const player = selectedPlayerById.get(playerId);
      return player ? [player] : [];
    });
    const selectedPlayerIdSet = new Set(selectedPlayerIds);
    const nhlStats = catalog.nhlStats.filter((row) =>
      selectedPlayerIdSet.has(String(row.playerId)),
    );
    const contracts = catalog.contracts.filter(
      (contract) =>
        selectedPlayerIdSet.has(String(contract.playerId)) ||
        (viewerOwnerId !== null &&
          String(contract.ownerId) === String(viewerOwnerId)),
    );

    return projectUfaCatalog(catalog, {
      players: selectedPlayers,
      nhlStats,
      contracts,
    });
  },
});

export const mockDraftPreview = query({
  args: { seasonId: v.id("seasons"), take: v.number() },
  handler: async (ctx, args) => {
    const requestedTake = Number.isFinite(args.take) ? args.take : 4;
    const limit = Math.min(Math.max(Math.trunc(requestedTake), 1), 12);
    const season = await ctx.db.get(args.seasonId);
    if (!season) return { projectedDraftPicks: [], nhlTeams: [] };

    const [players, contracts, picks, teamRows] = await Promise.all([
      ctx.db
        .query("players")
        .withIndex("by_isActive_overallRating", (query) =>
          query.eq("isActive", true),
        )
        .collect(),
      ctx.db.query("contracts").collect(),
      ctx.db
        .query("draftPicks")
        .withIndex("by_seasonId_round_pick", (query) =>
          query.eq("seasonId", args.seasonId),
        )
        .collect(),
      ctx.db
        .query("teams")
        .withIndex("by_seasonId", (query) =>
          query.eq("seasonId", args.seasonId),
        )
        .collect(),
    ]);
    const publicSeason = publicRow(season as unknown as Row);
    const publicPlayers = players.map((row) =>
      publicRow(row as unknown as Row),
    );
    const publicContracts = contracts.map((row) =>
      publicRow(row as unknown as Row),
    );
    const publicPicks = picks.map((row) => publicRow(row as unknown as Row));
    const franchiseIds = [...new Set(teamRows.map((row) => row.franchiseId))];
    const franchises = (
      await Promise.all(
        franchiseIds.map((franchiseId) => ctx.db.get(franchiseId)),
      )
    ).filter((row) => row !== null);
    const franchiseById = new Map(
      franchises.map((row) => [String(row._id), row]),
    );
    const teams = teamRows.map((row) => {
      const franchise = franchiseById.get(String(row.franchiseId));
      return {
        ...publicRow(row as unknown as Row),
        name: franchise?.name ?? null,
        abbr: franchise?.abbr ?? null,
        logoUrl: franchise?.logoUrl ?? null,
        isActive: franchise?.isActive ?? false,
        ownerId: franchise?.ownerId ?? null,
      };
    });
    const draftPlayers = prepareDraftBoardPlayers(
      publicPlayers,
      publicContracts,
      publicSeason.startDate,
    );
    const rosterPlayers = buildContractedSeasonRosterPlayers(
      publicPlayers,
      publicContracts,
      publicSeason.startDate,
    );
    const projectedDraftPicks = compactMockDraftProjection(
      buildMockDraftProjection({
        seasonDraftPicks: publicPicks,
        draftPlayers,
        rosterPlayers,
        teams,
        take: limit,
      }),
    );
    const referencedNhlAbbreviations =
      getMockDraftReferencedNhlAbbreviations(projectedDraftPicks);
    const nhlTeams = (
      await Promise.all(
        referencedNhlAbbreviations.map((abbr) =>
          ctx.db
            .query("nhlTeams")
            .withIndex("by_abbr", (query) => query.eq("abbr", abbr))
            .first(),
        ),
      )
    ).flatMap((row) =>
      row
        ? [
            {
              abbr: row.abbr,
              name: row.name,
              logoUrl: row.logoUrl,
            },
          ]
        : [],
    );

    return {
      projectedDraftPicks,
      nhlTeams,
    };
  },
});

export const careerSplitsByTeams = query({
  args: { teamIds: v.array(v.id("teams")) },
  handler: async (ctx, args) => {
    const pages = await Promise.all(
      [...new Set(args.teamIds)].map((gshlTeamId) =>
        ctx.db
          .query("playerCareerSplitStatLines")
          .withIndex("by_gshlTeamId", (q) => q.eq("gshlTeamId", gshlTeamId))
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
    const archived = await ctx.db
      .query("seasonDataArchives")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", args.seasonId))
      .first();
    if (archived?.status === "archived") {
      return archived.activitySnapshot.slice(
        0,
        Math.min(Math.max(args.take, 1), 30),
      ) as ReturnType<typeof buildLeagueActivity>;
    }
    const [contracts, playerDays, teams, franchises] = await Promise.all([
      (ctx.db as any)
        .query("contracts")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", args.seasonId))
        .collect()
        .then((rows: Row[]) =>
          rows
            .sort(
              (left, right) =>
                (toUtcTimestamp(right.signingDate) ?? 0) -
                (toUtcTimestamp(left.signingDate) ?? 0),
            )
            .slice(0, 100),
        ),
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
      contracts: contracts.map((row) =>
        publicRow(row as unknown as Row),
      ) as never,
      playerDays: playerDays.map((row) =>
        publicRow(row as unknown as Row),
      ) as never,
      players: players.map((row) => publicRow(row as unknown as Row)) as never,
      teams: teams.map((row) => publicRow(row as unknown as Row)) as never,
      franchises: franchises.map((row) =>
        publicRow(row as unknown as Row),
      ) as never,
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
      if (player.ownerId !== user.ownerId) {
        throw new Error("Forbidden");
      }
    }

    const patch: Record<string, unknown> = { ...args.data };
    if (patch.ownerId === "") {
      patch.ownerId = null;
    }
    if ("gshlTeamId" in patch) {
      if (patch.gshlTeamId !== null && patch.gshlTeamId !== "") {
        throw new Error("Player ownership must be assigned through ownerId");
      }
      patch.gshlTeamId = undefined;
    }
    patch.updatedAt = Date.now();
    await ctx.db.patch(
      args.id,
      normalizeTimestampFields("players", patch) as never,
    );
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
    const protectedFields = new Set([
      "playerId",
      "onClockStartedAt",
      "onClockExpiresAt",
      "onClockEndedAt",
    ]);
    if (Object.keys(patch).some((field) => protectedFields.has(field))) {
      throw new Error(
        "Live draft selections must use the transactional draft mutation",
      );
    }
    if ("teamId" in patch) {
      patch.gshlTeamId = patch.teamId;
      delete patch.teamId;
    }
    patch.updatedAt = Date.now();
    await ctx.db.patch(
      args.id,
      normalizeTimestampFields("draftPicks", patch) as never,
    );
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
      updatedAt: Date.now(),
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
    const now = Date.now();
    const startDate = toUtcTimestamp(signingSeason.startDate);
    const expiryDate = toUtcTimestamp(expirySeason.endDate);
    if (startDate === null || expiryDate === null) {
      throw new Error("The selected contract seasons have invalid dates");
    }
    const id = await ctx.db.insert("contracts", {
      playerId: args.playerId,
      ownerId: franchise.ownerId,
      seasonId: signingSeason._id,
      contractType: "STANDARD",
      contractLength: args.contractLength,
      contractSalary: Number(player.salary ?? 0),
      signingDate: now,
      startDate,
      signingStatus: "Drafted",
      expiryStatus: "UFA",
      expiryDate,
      capHit: Number(player.salary ?? 0),
      capHitEndDate: expiryDate,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.playerId, {
      ownerId: franchise.ownerId,
      gshlTeamId: undefined,
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
