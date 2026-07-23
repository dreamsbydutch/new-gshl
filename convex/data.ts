/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-base-to-string, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion */
import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

type Row = Record<string, unknown>;
type ConvexRow = Row & { _id: string; _creationTime: number };

const queryArgs = {
  serverSecret: v.string(),
  table: v.string(),
  where: v.optional(v.record(v.string(), v.any())),
  orderBy: v.optional(
    v.record(v.string(), v.union(v.literal("asc"), v.literal("desc"))),
  ),
  take: v.optional(v.number()),
  skip: v.optional(v.number()),
};

const pageQueryArgs = {
  serverSecret: v.string(),
  table: v.string(),
  where: v.optional(v.record(v.string(), v.any())),
  orderBy: v.optional(
    v.record(v.string(), v.union(v.literal("asc"), v.literal("desc"))),
  ),
  cursor: v.optional(v.string()),
  limit: v.number(),
};

function requireServerSecret(serverSecret: string) {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || serverSecret !== expected) {
    throw new Error("Unauthorized server request");
  }
}

function publicRow(row: Row & { _id: string; _creationTime: number }) {
  return {
    ...row,
    id: row._id,
  };
}

function toComparable(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const asNumber = Number(trimmed);
    return trimmed !== "" && Number.isFinite(asNumber) ? asNumber : trimmed;
  }
  return JSON.stringify(value);
}

function equals(left: unknown, right: unknown): boolean {
  return toComparable(left) === toComparable(right);
}

function matchesWhere(row: Row, where?: Record<string, unknown>): boolean {
  if (!where) return true;
  return Object.entries(where).every(([field, expected]) => {
    if (expected === undefined) return true;
    return equals(row[field], expected);
  });
}

function compareRows(
  left: Row,
  right: Row,
  orderBy?: Record<string, "asc" | "desc">,
): number {
  if (!orderBy) return 0;
  for (const [field, direction] of Object.entries(orderBy)) {
    const a = toComparable(left[field]);
    const b = toComparable(right[field]);
    if (a === b) continue;
    if (a === null) return 1;
    if (b === null) return -1;
    const sign = direction === "asc" ? 1 : -1;
    if (typeof a === "number" && typeof b === "number") {
      return sign * (a - b);
    }
    return sign * String(a).localeCompare(String(b));
  }
  return 0;
}

const defaultIndexes = ["legacyId"] as const;
const TABLE_INDEX_FIELDS: Record<string, Set<string>> = {
  seasons: new Set(defaultIndexes),
  conferences: new Set(defaultIndexes),
  franchises: new Set(["legacyId", "ownerId", "confId"]),
  teams: new Set(["legacyId", "seasonId", "franchiseId", "confId"]),
  owners: new Set(defaultIndexes),
  players: new Set(["legacyId", "gshlTeamId", "isActive"]),
  contracts: new Set(["legacyId", "playerId", "ownerId", "seasonId"]),
  weeks: new Set(["legacyId", "seasonId"]),
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
  draftPicks: new Set(["legacyId", "seasonId", "gshlTeamId", "playerId"]),
  nhlTeams: new Set(defaultIndexes),
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
  playerCareerTotalStatLines: new Set(["legacyId", "playerId", "seasonType"]),
  playerNhlStatLines: new Set(["legacyId", "seasonId", "playerId"]),
  teamDayStatLines: new Set([
    "legacyId",
    "seasonId",
    "gshlTeamId",
    "weekId",
    "date",
  ]),
  teamWeekStatLines: new Set(["legacyId", "seasonId", "gshlTeamId", "weekId"]),
  teamSeasonStatLines: new Set([
    "legacyId",
    "seasonId",
    "seasonType",
    "gshlTeamId",
  ]),
};

const TABLE_PAGE_INDEXES: Record<
  string,
  Array<{ name: string; equalityField: string; orderFields: string[] }>
> = {
  players: [
    {
      name: "by_isActive_overallRk",
      equalityField: "isActive",
      orderFields: ["overallRk"],
    },
  ],
  draftPicks: [
    {
      name: "by_seasonId_round_pick",
      equalityField: "seasonId",
      orderFields: ["round", "pick"],
    },
  ],
};

const TABLE_EXACT_INDEXES: Record<
  string,
  Array<{ name: string; fields: string[] }>
> = {
  players: [
    {
      name: "by_isActive_isSignable_isResignable",
      fields: ["isActive", "isSignable", "isResignable"],
    },
  ],
};

function resolveExactIndex(table: string, where?: Record<string, unknown>) {
  return TABLE_EXACT_INDEXES[table]?.find((index) =>
    index.fields.every((field) => where?.[field] !== undefined),
  );
}

function resolvePageIndex(
  table: string,
  where?: Record<string, unknown>,
  orderBy?: Record<string, "asc" | "desc">,
) {
  const orderFields = Object.keys(orderBy ?? {});
  return TABLE_PAGE_INDEXES[table]?.find(
    (index) =>
      where?.[index.equalityField] !== undefined &&
      orderFields.length === index.orderFields.length &&
      orderFields.every(
        (field, position) => field === index.orderFields[position],
      ),
  );
}

function indexesForTable(table: string) {
  return TABLE_INDEX_FIELDS[table] ?? new Set(defaultIndexes);
}

function firstIndexedWhere(
  table: string,
  where?: Record<string, unknown>,
): [string, unknown] | null {
  if (!where) return null;
  const indexedFields = indexesForTable(table);
  return (
    Object.entries(where).find(
      ([field, value]) => value !== undefined && indexedFields.has(field),
    ) ?? null
  );
}

async function readCandidateRows(
  ctx: { db: any },
  table: string,
  args: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, "asc" | "desc">;
    take?: number;
    skip?: number;
  },
): Promise<ConvexRow[]> {
  const exactIndex = resolveExactIndex(table, args.where);
  if (exactIndex) {
    return (await ctx.db
      .query(table as never)
      .withIndex(exactIndex.name as never, (q: any) => {
        let range = q;
        for (const field of exactIndex.fields) {
          range = range.eq(field as never, args.where?.[field]);
        }
        return range;
      })
      .collect()) as ConvexRow[];
  }

  const indexedWhere = firstIndexedWhere(table, args.where);
  const needsInMemoryFiltering =
    Boolean(
      args.where && Object.keys(args.where).length > (indexedWhere ? 1 : 0),
    ) || Boolean(args.orderBy);

  if (indexedWhere) {
    const [field, expected] = indexedWhere;
    return (await ctx.db
      .query(table as never)
      .withIndex(`by_${field}` as never, (q: any) =>
        q.eq(field as never, expected),
      )
      .collect()) as ConvexRow[];
  }

  if (!needsInMemoryFiltering && args.take !== undefined) {
    return (await ctx.db
      .query(table as never)
      .take((args.skip ?? 0) + args.take)) as ConvexRow[];
  }

  return (await ctx.db.query(table as never).collect()) as ConvexRow[];
}

function normalizeDoc(input: Row): Row {
  const { id, ...rest } = input;
  delete rest._id;
  delete rest._creationTime;
  return {
    ...rest,
    legacyId:
      rest.legacyId ??
      (typeof id === "string" || typeof id === "number"
        ? String(id)
        : undefined),
  };
}

function keyPart(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(",");
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value).trim();
  }
  return JSON.stringify(value);
}

function compositeKey(row: Row, columns: readonly string[]): string {
  return columns.map((column) => keyPart(row[column])).join("|");
}

const AWARDS_TABLE = "awards";
const PLAYER_AWARDS_TABLE = "playerAwards";
const TEAM_AWARDS_TABLE = "teamAwards";
const ALL_STAR_AWARDS = new Set(["firstAS", "secondAS", "playoffAS"]);

type AwardKind = "player" | "team";
type UpsertArgs = {
  table: string;
  keyColumns: string[];
  rows: Row[];
  merge?: boolean;
  deleteMissing?: boolean | { filter?: Record<string, unknown> };
};

function isAwardsTable(table: string): boolean {
  return table === AWARDS_TABLE;
}

function isTeamAwardsTable(table: string): boolean {
  return table === TEAM_AWARDS_TABLE;
}

function isAllStarAward(award: unknown): boolean {
  return ALL_STAR_AWARDS.has(String(award ?? ""));
}

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function normalizeIdList(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeId(entry))
      .filter((entry): entry is string => Boolean(entry));
  }
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

async function safeGet(
  ctx: { db: any },
  idValue: unknown,
): Promise<Row | null> {
  const id = normalizeId(idValue);
  if (!id) return null;
  try {
    return ((await ctx.db.get(id as never)) as Row | null) ?? null;
  } catch {
    return null;
  }
}

async function firstByIndex(
  ctx: { db: any },
  table: string,
  field: string,
  value: unknown,
): Promise<ConvexRow | null> {
  const normalized = normalizeId(value);
  if (!normalized) return null;
  return ((await ctx.db
    .query(table as never)
    .withIndex(`by_${field}` as never, (q: any) =>
      q.eq(field as never, normalized),
    )
    .first()) ?? null) as ConvexRow | null;
}

function isPlayerRow(row: Row | null): boolean {
  return Boolean(row && ("fullName" in row || "posGroup" in row));
}

function isOwnerRow(row: Row | null): boolean {
  return Boolean(
    row && "firstName" in row && "lastName" in row && "owing" in row,
  );
}

function isFranchiseRow(row: Row | null): boolean {
  return Boolean(row && "ownerId" in row && "abbr" in row && "isActive" in row);
}

function isTeamRow(row: Row | null): boolean {
  return Boolean(
    row && "seasonId" in row && "franchiseId" in row && "confId" in row,
  );
}

async function resolvePlayerId(
  ctx: { db: any },
  value: unknown,
): Promise<string | null> {
  const normalized = normalizeId(value);
  if (!normalized) return null;

  const direct = await safeGet(ctx, normalized);
  if (isPlayerRow(direct)) return normalized;

  const byLegacyId = await firstByIndex(ctx, "players", "legacyId", normalized);
  return byLegacyId?._id ?? null;
}

async function resolveOwnerId(
  ctx: { db: any },
  value: unknown,
): Promise<string | null> {
  const normalized = normalizeId(value);
  if (!normalized) return null;

  const direct = await safeGet(ctx, normalized);
  if (isOwnerRow(direct)) return normalized;

  if (isPlayerRow(direct) && direct?.legacyId) {
    const ownerByLegacyId = await firstByIndex(
      ctx,
      "owners",
      "legacyId",
      direct.legacyId,
    );
    if (ownerByLegacyId) return ownerByLegacyId._id;
  }

  const ownerByLegacyId = await firstByIndex(
    ctx,
    "owners",
    "legacyId",
    normalized,
  );
  return ownerByLegacyId?._id ?? null;
}

async function resolveFranchiseId(
  ctx: { db: any },
  value: unknown,
): Promise<string | null> {
  const normalized = normalizeId(value);
  if (!normalized) return null;

  const direct = await safeGet(ctx, normalized);
  if (isFranchiseRow(direct)) return normalized;

  const byLegacyId = await firstByIndex(
    ctx,
    "franchises",
    "legacyId",
    normalized,
  );
  if (byLegacyId) return byLegacyId._id;

  const ownerId = await resolveOwnerId(ctx, normalized);
  if (!ownerId) return null;

  const byOwnerId = await firstByIndex(ctx, "franchises", "ownerId", ownerId);
  return byOwnerId?._id ?? null;
}

async function resolveTeamIdFromPlayer(
  ctx: { db: any },
  seasonId: unknown,
  playerId: unknown,
): Promise<string | null> {
  const normalizedSeasonId = normalizeId(seasonId);
  const normalizedPlayerId = normalizeId(playerId);
  if (!normalizedSeasonId || !normalizedPlayerId) return null;

  const playerTotals = (await ctx.db
    .query("playerTotalStatLines" as never)
    .withIndex("by_playerId" as never, (q: any) =>
      q.eq("playerId" as never, normalizedPlayerId),
    )
    .collect()) as ConvexRow[];

  for (const row of playerTotals) {
    if (!equals(row.seasonId, normalizedSeasonId)) continue;
    for (const teamId of normalizeIdList(row.gshlTeamIds)) {
      const team = await safeGet(ctx, teamId);
      if (isTeamRow(team) && equals(team?.seasonId, normalizedSeasonId)) {
        return teamId;
      }
    }
  }

  return null;
}

async function resolveTeamIdFromOwner(
  ctx: { db: any },
  seasonId: unknown,
  ownerId: unknown,
): Promise<string | null> {
  const normalizedSeasonId = normalizeId(seasonId);
  const normalizedOwnerId = normalizeId(ownerId);
  if (!normalizedSeasonId || !normalizedOwnerId) return null;

  const franchise = await firstByIndex(
    ctx,
    "franchises",
    "ownerId",
    normalizedOwnerId,
  );
  if (!franchise) return null;

  const seasonTeams = (await ctx.db
    .query("teams" as never)
    .withIndex("by_seasonId" as never, (q: any) =>
      q.eq("seasonId" as never, normalizedSeasonId),
    )
    .collect()) as ConvexRow[];
  const matchingTeam = seasonTeams.find((team) =>
    equals(team.franchiseId, franchise._id),
  );
  return matchingTeam?._id ?? null;
}

async function resolveTeamIdFromPlayerContract(
  ctx: { db: any },
  seasonId: unknown,
  playerId: unknown,
): Promise<string | null> {
  const normalizedSeasonId = normalizeId(seasonId);
  const normalizedPlayerId = normalizeId(playerId);
  if (!normalizedSeasonId || !normalizedPlayerId) return null;

  const contracts = (await ctx.db
    .query("contracts" as never)
    .withIndex("by_playerId" as never, (q: any) =>
      q.eq("playerId" as never, normalizedPlayerId),
    )
    .collect()) as ConvexRow[];
  const matchingContract = contracts.find((contract) =>
    equals(contract.seasonId, normalizedSeasonId),
  );
  if (!matchingContract) return null;

  return resolveTeamIdFromOwner(
    ctx,
    normalizedSeasonId,
    matchingContract.ownerId,
  );
}

async function resolveTeamIdFromPlayerCurrentTeam(
  ctx: { db: any },
  seasonId: unknown,
  player: Row | null,
): Promise<string | null> {
  const normalizedSeasonId = normalizeId(seasonId);
  const currentTeamId = normalizeId(player?.gshlTeamId);
  if (!normalizedSeasonId || !currentTeamId) return null;

  const currentTeam = await safeGet(ctx, currentTeamId);
  const franchiseId = normalizeId(currentTeam?.franchiseId);
  if (!franchiseId) return null;

  const seasonTeams = (await ctx.db
    .query("teams" as never)
    .withIndex("by_seasonId" as never, (q: any) =>
      q.eq("seasonId" as never, normalizedSeasonId),
    )
    .collect()) as ConvexRow[];
  const matchingTeam = seasonTeams.find((team) =>
    equals(team.franchiseId, franchiseId),
  );
  return matchingTeam?._id ?? null;
}

async function resolveTeamAwardOwnerId(
  ctx: { db: any },
  seasonId: unknown,
  value: unknown,
): Promise<string | null> {
  const normalizedSeasonId = normalizeId(seasonId);
  const normalizedValue = normalizeId(value);
  if (!normalizedSeasonId || !normalizedValue) return null;

  const direct = await safeGet(ctx, normalizedValue);
  if (isOwnerRow(direct)) return normalizedValue;

  if (isTeamRow(direct) && equals(direct?.seasonId, normalizedSeasonId)) {
    const franchise = await safeGet(ctx, direct?.franchiseId);
    return resolveOwnerId(ctx, franchise?.ownerId);
  }

  if (isPlayerRow(direct)) {
    const playerTeamId = await resolveTeamIdFromPlayer(
      ctx,
      normalizedSeasonId,
      normalizedValue,
    );
    if (playerTeamId) {
      const team = await safeGet(ctx, playerTeamId);
      const franchise = await safeGet(ctx, team?.franchiseId);
      const ownerId = await resolveOwnerId(ctx, franchise?.ownerId);
      if (ownerId) return ownerId;
    }

    const contractTeamId = await resolveTeamIdFromPlayerContract(
      ctx,
      normalizedSeasonId,
      normalizedValue,
    );
    if (contractTeamId) {
      const team = await safeGet(ctx, contractTeamId);
      const franchise = await safeGet(ctx, team?.franchiseId);
      const ownerId = await resolveOwnerId(ctx, franchise?.ownerId);
      if (ownerId) return ownerId;
    }

    const currentFranchiseTeamId = await resolveTeamIdFromPlayerCurrentTeam(
      ctx,
      normalizedSeasonId,
      direct,
    );
    if (currentFranchiseTeamId) {
      const team = await safeGet(ctx, currentFranchiseTeamId);
      const franchise = await safeGet(ctx, team?.franchiseId);
      const ownerId = await resolveOwnerId(ctx, franchise?.ownerId);
      if (ownerId) return ownerId;
    }
  }

  const teamByLegacyId = await firstByIndex(
    ctx,
    "teams",
    "legacyId",
    normalizedValue,
  );
  if (teamByLegacyId && equals(teamByLegacyId.seasonId, normalizedSeasonId)) {
    const franchise = await safeGet(ctx, teamByLegacyId.franchiseId);
    return resolveOwnerId(ctx, franchise?.ownerId);
  }

  const playerByLegacyId = await firstByIndex(
    ctx,
    "players",
    "legacyId",
    normalizedValue,
  );
  if (playerByLegacyId) {
    const playerTeamId = await resolveTeamIdFromPlayer(
      ctx,
      normalizedSeasonId,
      playerByLegacyId._id,
    );
    if (playerTeamId) {
      const team = await safeGet(ctx, playerTeamId);
      const franchise = await safeGet(ctx, team?.franchiseId);
      const ownerId = await resolveOwnerId(ctx, franchise?.ownerId);
      if (ownerId) return ownerId;
    }

    const contractTeamId = await resolveTeamIdFromPlayerContract(
      ctx,
      normalizedSeasonId,
      playerByLegacyId._id,
    );
    if (contractTeamId) {
      const team = await safeGet(ctx, contractTeamId);
      const franchise = await safeGet(ctx, team?.franchiseId);
      const ownerId = await resolveOwnerId(ctx, franchise?.ownerId);
      if (ownerId) return ownerId;
    }

    const currentFranchiseTeamId = await resolveTeamIdFromPlayerCurrentTeam(
      ctx,
      normalizedSeasonId,
      playerByLegacyId,
    );
    if (currentFranchiseTeamId) {
      const team = await safeGet(ctx, currentFranchiseTeamId);
      const franchise = await safeGet(ctx, team?.franchiseId);
      const ownerId = await resolveOwnerId(ctx, franchise?.ownerId);
      if (ownerId) return ownerId;
    }
  }

  const franchiseId = await resolveFranchiseId(ctx, normalizedValue);
  if (!franchiseId) return null;
  const franchise = await safeGet(ctx, franchiseId);
  return resolveOwnerId(ctx, franchise?.ownerId);
}

async function resolveAwardNomineeIds(
  ctx: { db: any },
  kind: AwardKind,
  seasonId: unknown,
  value: unknown,
): Promise<string[] | null> {
  const values = normalizeIdList(value);
  if (values.length === 0) return Array.isArray(value) ? [] : null;

  const resolved: string[] = [];
  for (const entry of values) {
    const id =
      kind === "player"
        ? await resolvePlayerId(ctx, entry)
        : await resolveTeamAwardOwnerId(ctx, seasonId, entry);
    if (!id) return null;
    resolved.push(id);
  }
  return resolved;
}

async function toAwardStorageDoc(
  ctx: { db: any },
  rawRow: Row,
): Promise<
  | { table: typeof PLAYER_AWARDS_TABLE; kind: "player"; doc: Row }
  | { table: typeof TEAM_AWARDS_TABLE; kind: "team"; doc: Row }
  | { missing: string }
> {
  const row = normalizeDoc(rawRow);
  const seasonId = normalizeId(row.seasonId);
  const award = normalizeId(row.award);
  if (!seasonId) return { missing: "seasonId" };
  if (!award) return { missing: "award" };

  const common = {
    ...(typeof row.legacyId === "string" ? { legacyId: row.legacyId } : {}),
    seasonId,
    award,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  if (isAllStarAward(award)) {
    const playerId = await resolvePlayerId(ctx, row.playerId ?? row.winnerId);
    if (!playerId) return { missing: "playerId" };

    const nomineeIds = await resolveAwardNomineeIds(
      ctx,
      "player",
      seasonId,
      row.nomineeIds,
    );

    return {
      table: PLAYER_AWARDS_TABLE,
      kind: "player",
      doc: {
        ...common,
        playerId,
        nomineeIds,
      },
    };
  }

  const ownerId = await resolveTeamAwardOwnerId(
    ctx,
    seasonId,
    row.ownerId ?? row.winnerId ?? row.teamId,
  );
  if (!ownerId) return { missing: "ownerId" };

  const nomineeIds = await resolveAwardNomineeIds(
    ctx,
    "team",
    seasonId,
    row.nomineeIds,
  );

  return {
    table: TEAM_AWARDS_TABLE,
    kind: "team",
    doc: {
      ...common,
      ownerId,
      nomineeIds,
    },
  };
}

function publicAwardRow(
  row: Row & { _id: string; _creationTime: number },
  kind: AwardKind,
) {
  const publicValue = publicRow(row) as Row;
  return {
    ...publicValue,
    winnerId: kind === "player" ? publicValue.playerId : publicValue.ownerId,
  };
}

async function publicTeamAwardRow(
  ctx: { db: any },
  row: Row & { _id: string; _creationTime: number },
) {
  const ownerId = await resolveTeamAwardOwnerId(
    ctx,
    row.seasonId,
    row.ownerId ?? row.teamId,
  );
  const nomineeIds = await resolveAwardNomineeIds(
    ctx,
    "team",
    row.seasonId,
    row.nomineeIds,
  );
  const publicValue = publicRow(row) as Row;
  return {
    ...publicValue,
    ownerId,
    nomineeIds,
    winnerId: ownerId,
  };
}

function translateAwardWhere(
  where: Record<string, unknown> | undefined,
  kind: AwardKind,
): Record<string, unknown> | undefined {
  if (!where || !("winnerId" in where)) return where;
  const { winnerId, ...rest } = where;
  return {
    ...rest,
    [kind === "player" ? "playerId" : "ownerId"]: winnerId,
  };
}

function translateAwardKeyColumns(
  columns: readonly string[],
  kind: AwardKind,
): string[] {
  return columns.map((column) => {
    if (column !== "winnerId") return column;
    return kind === "player" ? "playerId" : "ownerId";
  });
}

function translateAwardDeleteMissing(
  deleteMissing: UpsertArgs["deleteMissing"],
  kind: AwardKind,
): UpsertArgs["deleteMissing"] {
  if (!deleteMissing || typeof deleteMissing === "boolean")
    return deleteMissing;
  return {
    ...deleteMissing,
    filter: translateAwardWhere(deleteMissing.filter, kind),
  };
}

async function readAwardRows(
  ctx: { db: any },
  args: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, "asc" | "desc">;
    take?: number;
    skip?: number;
  },
): Promise<Row[]> {
  const playerRows = (
    await readCandidateRows(ctx, PLAYER_AWARDS_TABLE, {
      ...args,
      where: translateAwardWhere(args.where, "player"),
    })
  ).map((row) => publicAwardRow(row, "player"));
  const teamRows = await Promise.all(
    (
      await readCandidateRows(ctx, TEAM_AWARDS_TABLE, {
        ...args,
        where: translateAwardWhere(args.where, "team"),
      })
    ).map((row) => publicTeamAwardRow(ctx, row)),
  );
  const splitRows = [...playerRows, ...teamRows];

  const rows =
    splitRows.length > 0
      ? splitRows
      : (await readCandidateRows(ctx, AWARDS_TABLE, args)).map((row) =>
          publicRow(row),
        );

  return rows
    .filter((row) => matchesWhere(row, args.where))
    .sort((left, right) => compareRows(left, right, args.orderBy));
}

async function deleteAllRows(ctx: { db: any }, table: string): Promise<number> {
  const rows = await ctx.db.query(table as never).collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function applyUpsertByCompositeKey(ctx: { db: any }, args: UpsertArgs) {
  const deleteMissingFilter =
    args.deleteMissing && typeof args.deleteMissing === "object"
      ? args.deleteMissing.filter
      : undefined;
  const rowIndexedFilter = Object.fromEntries(
    Object.entries(args.rows[0] ?? {}).filter(([field, value]) => {
      return value !== undefined && indexesForTable(args.table).has(field);
    }),
  );
  const existingRows = (await readCandidateRows(ctx, args.table, {
    where:
      deleteMissingFilter ??
      (Object.keys(rowIndexedFilter).length > 0 ? rowIndexedFilter : undefined),
  })) as Array<Row & { _id: string; _creationTime: number }>;
  const existingByKey = new Map<
    string,
    Row & { _id: string; _creationTime: number }
  >();
  for (const row of existingRows) {
    existingByKey.set(compositeKey(row, args.keyColumns), row);
  }

  const incomingKeys = new Set<string>();
  let updated = 0;
  let inserted = 0;
  let unchanged = 0;
  const nowIso = new Date().toISOString();

  for (const rawRow of args.rows) {
    const row = normalizeDoc(rawRow);
    const key = compositeKey(row, args.keyColumns);
    if (!key || incomingKeys.has(key)) continue;
    incomingKeys.add(key);

    const existing = existingByKey.get(key);
    if (existing) {
      const patch = {
        ...((args.merge ?? true)
          ? {}
          : Object.fromEntries(
              Object.keys(existing).map((k) => [k, undefined]),
            )),
        ...row,
        updatedAt: row.updatedAt ?? nowIso,
      };
      const changed = Object.entries(patch).some(([field, value]) => {
        if (field === "_id" || field === "_creationTime") return false;
        return !equals(existing[field], value);
      });
      if (!changed) {
        unchanged += 1;
        continue;
      }
      await ctx.db.patch(existing._id as never, patch as never);
      updated += 1;
      continue;
    }

    await ctx.db.insert(
      args.table as never,
      {
        ...row,
        createdAt: row.createdAt ?? nowIso,
        updatedAt: row.updatedAt ?? nowIso,
      } as never,
    );
    inserted += 1;
  }

  let deleted = 0;
  if (args.deleteMissing) {
    const filter = deleteMissingFilter;
    for (const row of existingRows) {
      if (filter && !matchesWhere(row, filter)) continue;
      if (incomingKeys.has(compositeKey(row, args.keyColumns))) continue;
      await ctx.db.delete(row._id as never);
      deleted += 1;
    }
  }

  return {
    updated,
    inserted,
    deleted,
    duplicateDeletes: 0,
    unchanged,
    total: updated + inserted,
  };
}

async function applyAwardsUpsertByCompositeKey(
  ctx: { db: any },
  args: UpsertArgs,
) {
  const rowsByTable = {
    [PLAYER_AWARDS_TABLE]: [] as Row[],
    [TEAM_AWARDS_TABLE]: [] as Row[],
  };
  const missing: Array<{
    legacyId: string | null;
    award: unknown;
    field: string;
  }> = [];

  for (const rawRow of args.rows) {
    const mapped = await toAwardStorageDoc(ctx, rawRow);
    if ("missing" in mapped) {
      missing.push({
        legacyId: normalizeId(rawRow.legacyId ?? rawRow.id),
        award: rawRow.award,
        field: mapped.missing,
      });
      continue;
    }
    rowsByTable[mapped.table].push(mapped.doc);
  }

  if (missing.length > 0) {
    throw new Error(
      `Unable to resolve award references: ${JSON.stringify(missing)}`,
    );
  }

  const playerResult = await applyUpsertByCompositeKey(ctx, {
    ...args,
    table: PLAYER_AWARDS_TABLE,
    keyColumns: translateAwardKeyColumns(args.keyColumns, "player"),
    rows: rowsByTable[PLAYER_AWARDS_TABLE],
    deleteMissing: translateAwardDeleteMissing(args.deleteMissing, "player"),
  });
  const teamResult = await applyUpsertByCompositeKey(ctx, {
    ...args,
    table: TEAM_AWARDS_TABLE,
    keyColumns: translateAwardKeyColumns(args.keyColumns, "team"),
    rows: rowsByTable[TEAM_AWARDS_TABLE],
    deleteMissing: translateAwardDeleteMissing(args.deleteMissing, "team"),
  });

  return {
    updated: playerResult.updated + teamResult.updated,
    inserted: playerResult.inserted + teamResult.inserted,
    deleted: playerResult.deleted + teamResult.deleted,
    duplicateDeletes: 0,
    unchanged: playerResult.unchanged + teamResult.unchanged,
    total: playerResult.total + teamResult.total,
  };
}

export const list = queryGeneric({
  args: queryArgs,
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    if (isAwardsTable(args.table)) {
      const rows = await readAwardRows(ctx, args);
      const start = args.skip ?? 0;
      const end = args.take === undefined ? undefined : start + args.take;
      return rows.slice(start, end);
    }

    if (isTeamAwardsTable(args.table)) {
      const rows = await readCandidateRows(ctx, args.table, args);
      const normalized = await Promise.all(
        rows.map((row) => publicTeamAwardRow(ctx, row)),
      );
      const filtered = normalized
        .filter((row) => matchesWhere(row, args.where))
        .sort((left, right) => compareRows(left, right, args.orderBy));
      const start = args.skip ?? 0;
      const end = args.take === undefined ? undefined : start + args.take;
      return filtered.slice(start, end);
    }

    const rows = await readCandidateRows(ctx, args.table, args);
    const filtered = rows
      .map((row) => publicRow(row as never))
      .filter((row) => matchesWhere(row, args.where))
      .sort((left, right) => compareRows(left, right, args.orderBy));

    const start = args.skip ?? 0;
    const end = args.take === undefined ? undefined : start + args.take;
    return filtered.slice(start, end);
  },
});

/**
 * Bounded, cursor-based collection reads for user-facing lists. The cursor is
 * the opaque Convex continuation token and never depends on a client offset.
 */
export const listPage = queryGeneric({
  args: pageQueryArgs,
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50) {
      throw new Error("Page limit must be between 1 and 50");
    }

    const pageIndex = resolvePageIndex(args.table, args.where, args.orderBy);
    const orderDirection = Object.values(args.orderBy ?? {})[0] ?? "asc";
    let query: any = ctx.db.query(args.table as never);

    if (pageIndex) {
      const expected = args.where?.[pageIndex.equalityField];
      query = query.withIndex(pageIndex.name as never, (q: any) =>
        q.eq(pageIndex.equalityField as never, expected),
      );
    } else {
      const indexedWhere = firstIndexedWhere(args.table, args.where);
      if (indexedWhere) {
        const [field, expected] = indexedWhere;
        query = query.withIndex(`by_${field}` as never, (q: any) =>
          q.eq(field as never, expected),
        );
      }
    }

    const result = await query.order(orderDirection).paginate({
      cursor: args.cursor ?? null,
      numItems: args.limit,
    });
    const items = result.page
      .map((row: ConvexRow) => publicRow(row))
      .filter((row: Row) => matchesWhere(row, args.where));

    return {
      items,
      nextCursor: result.isDone ? null : result.continueCursor,
      hasMore: !result.isDone,
    };
  },
});

export const byId = queryGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    if (isAwardsTable(args.table)) {
      const direct = await safeGet(ctx, args.id);
      if (direct && "playerId" in direct) {
        return publicAwardRow(direct as ConvexRow, "player");
      }
      if (direct && ("ownerId" in direct || "teamId" in direct)) {
        return publicTeamAwardRow(ctx, direct as ConvexRow);
      }

      for (const [table, kind] of [
        [PLAYER_AWARDS_TABLE, "player"],
        [TEAM_AWARDS_TABLE, "team"],
      ] as const) {
        const row = await ctx.db
          .query(table as never)
          .withIndex("by_legacyId" as never, (q) =>
            q.eq("legacyId" as never, args.id),
          )
          .first();
        if (row)
          return kind === "team"
            ? publicTeamAwardRow(ctx, row as never)
            : publicAwardRow(row as never, kind);
      }
    }

    if (isTeamAwardsTable(args.table)) {
      const direct = await safeGet(ctx, args.id);
      if (direct) return publicTeamAwardRow(ctx, direct as ConvexRow);
      const legacy = await ctx.db
        .query(TEAM_AWARDS_TABLE as never)
        .withIndex("by_legacyId" as never, (q) =>
          q.eq("legacyId" as never, args.id),
        )
        .first();
      return legacy ? publicTeamAwardRow(ctx, legacy as never) : null;
    }

    const byId = await safeGet(ctx, args.id);
    if (byId) return publicRow(byId as never);

    const byLegacyId = await ctx.db
      .query(args.table as never)
      .withIndex("by_legacyId" as never, (q) =>
        q.eq("legacyId" as never, args.id),
      )
      .first();
    return byLegacyId ? publicRow(byLegacyId as never) : null;
  },
});

export const count = queryGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    where: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    if (isAwardsTable(args.table)) {
      const rows = await readAwardRows(ctx, { where: args.where });
      return rows.length;
    }

    if (isTeamAwardsTable(args.table)) {
      const rows = await readCandidateRows(ctx, args.table, {});
      const normalized = await Promise.all(
        rows.map((row) => publicTeamAwardRow(ctx, row)),
      );
      return normalized.filter((row) => matchesWhere(row, args.where)).length;
    }

    const rows = await readCandidateRows(ctx, args.table, {
      where: args.where,
    });
    return rows.filter((row) => matchesWhere(row as never, args.where)).length;
  },
});

export const snapshot = queryGeneric({
  args: {
    serverSecret: v.string(),
    tables: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const output: Record<string, Row[]> = {};
    for (const table of args.tables) {
      if (isAwardsTable(table)) {
        output[table] = await readAwardRows(ctx, {});
        continue;
      }
      if (isTeamAwardsTable(table)) {
        const rows = await ctx.db.query(table as never).collect();
        output[table] = await Promise.all(
          rows.map((row) => publicTeamAwardRow(ctx, row as never)),
        );
        continue;
      }
      const rows = await ctx.db.query(table as never).collect();
      output[table] = rows.map((row) => publicRow(row as never));
    }
    return output;
  },
});

export const clearTables = mutationGeneric({
  args: {
    serverSecret: v.string(),
    tables: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const deleted: Record<string, number> = {};
    for (const table of args.tables) {
      if (isAwardsTable(table)) {
        deleted[table] =
          (await deleteAllRows(ctx, PLAYER_AWARDS_TABLE)) +
          (await deleteAllRows(ctx, TEAM_AWARDS_TABLE)) +
          (await deleteAllRows(ctx, AWARDS_TABLE));
        continue;
      }
      deleted[table] = await deleteAllRows(ctx, table);
    }
    return { deleted };
  },
});

export const insertMany = mutationGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    rows: v.array(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const inserted: Array<{ legacyId: string | null; id: string }> = [];
    for (const row of args.rows) {
      if (isAwardsTable(args.table) || isTeamAwardsTable(args.table)) {
        const mapped = await toAwardStorageDoc(ctx, row);
        if ("missing" in mapped) {
          throw new Error(
            `Unable to resolve award ${keyPart(row.award)} ${keyPart(
              row.legacyId ?? row.id,
            )}: missing ${mapped.missing}`,
          );
        }
        if (isTeamAwardsTable(args.table) && mapped.kind !== "team") {
          throw new Error(
            "All-star player awards cannot be stored as team awards",
          );
        }
        const id = await ctx.db.insert(
          mapped.table as never,
          mapped.doc as never,
        );
        inserted.push({
          legacyId:
            typeof mapped.doc.legacyId === "string"
              ? mapped.doc.legacyId
              : null,
          id,
        });
        continue;
      }

      const doc = normalizeDoc(row);
      const id = await ctx.db.insert(args.table as never, doc as never);
      inserted.push({
        legacyId: typeof doc.legacyId === "string" ? doc.legacyId : null,
        id,
      });
    }
    return { inserted };
  },
});

export const updateById = mutationGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    id: v.string(),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    if (isAwardsTable(args.table) || isTeamAwardsTable(args.table)) {
      const mapped = await toAwardStorageDoc(ctx, args.data);
      if ("missing" in mapped) {
        throw new Error(
          `Unable to resolve award update ${args.id}: missing ${mapped.missing}`,
        );
      }
      if (isTeamAwardsTable(args.table) && mapped.kind !== "team") {
        throw new Error(
          "All-star player awards cannot be stored as team awards",
        );
      }

      const direct = await safeGet(ctx, args.id);
      const existing =
        (direct &&
        ("playerId" in direct || "ownerId" in direct || "teamId" in direct)
          ? (direct as ConvexRow)
          : null) ??
        (await ctx.db
          .query(mapped.table as never)
          .withIndex("by_legacyId" as never, (q) =>
            q.eq("legacyId" as never, args.id),
          )
          .first());

      if (!existing) {
        throw new Error(`${args.table} row ${args.id} not found`);
      }

      await ctx.db.patch(existing._id, mapped.doc as never);
      const updated = (await ctx.db.get(existing._id)) as ConvexRow;
      return mapped.kind === "team"
        ? publicTeamAwardRow(ctx, updated)
        : publicAwardRow(updated, mapped.kind);
    }

    const row =
      (await ctx.db.get(args.id as never)) ??
      (await ctx.db
        .query(args.table as never)
        .withIndex("by_legacyId" as never, (q) =>
          q.eq("legacyId" as never, args.id),
        )
        .first());

    if (!row) {
      throw new Error(`${args.table} row ${args.id} not found`);
    }

    await ctx.db.patch(row._id, normalizeDoc(args.data) as never);
    return publicRow((await ctx.db.get(row._id)) as never);
  },
});

export const upsertByCompositeKey = mutationGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    keyColumns: v.array(v.string()),
    rows: v.array(v.record(v.string(), v.any())),
    merge: v.optional(v.boolean()),
    deleteMissing: v.optional(
      v.union(
        v.boolean(),
        v.object({
          filter: v.optional(v.record(v.string(), v.any())),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    if (isAwardsTable(args.table)) {
      return applyAwardsUpsertByCompositeKey(ctx, args);
    }
    if (isTeamAwardsTable(args.table)) {
      const rows: Row[] = [];
      for (const row of args.rows) {
        const mapped = await toAwardStorageDoc(ctx, row);
        if ("missing" in mapped || mapped.kind !== "team") {
          throw new Error(
            `Unable to resolve team award ${keyPart(row.award)}: missing ${
              "missing" in mapped ? mapped.missing : "ownerId"
            }`,
          );
        }
        rows.push(mapped.doc);
      }
      return applyUpsertByCompositeKey(ctx, {
        ...args,
        keyColumns: args.keyColumns.map((column) =>
          column === "teamId" || column === "winnerId" ? "ownerId" : column,
        ),
        rows,
      });
    }

    return applyUpsertByCompositeKey(ctx, args);
  },
});

export const migrateTeamAwardsToOwners = mutationGeneric({
  args: { serverSecret: v.string(), apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const rows = (await ctx.db
      .query(TEAM_AWARDS_TABLE as never)
      .collect()) as ConvexRow[];
    const resolved: Array<{
      row: ConvexRow;
      ownerId: string;
      nomineeIds: string[] | null;
    }> = [];
    const missing: Array<{ id: string; award: unknown; field: string }> = [];

    for (const row of rows) {
      const ownerId = await resolveTeamAwardOwnerId(
        ctx,
        row.seasonId,
        row.ownerId ?? row.teamId,
      );
      const nomineeIds = await resolveAwardNomineeIds(
        ctx,
        "team",
        row.seasonId,
        row.nomineeIds,
      );
      if (!ownerId) {
        missing.push({ id: row._id, award: row.award, field: "ownerId" });
        continue;
      }
      if (nomineeIds === null && normalizeIdList(row.nomineeIds).length > 0) {
        missing.push({ id: row._id, award: row.award, field: "nomineeIds" });
        continue;
      }
      resolved.push({ row, ownerId, nomineeIds });
    }

    if (missing.length > 0) {
      throw new Error(
        `Team award owner migration could not resolve references: ${JSON.stringify(missing)}`,
      );
    }

    let updated = 0;
    let unchanged = 0;
    for (const entry of resolved) {
      const nextNominees = entry.nomineeIds ?? [];
      const changed =
        !equals(entry.row.ownerId, entry.ownerId) ||
        !equals(entry.row.nomineeIds, nextNominees) ||
        entry.row.teamId !== undefined;
      if (!changed) {
        unchanged += 1;
        continue;
      }
      if (args.apply !== true) {
        updated += 1;
        continue;
      }
      await ctx.db.patch(
        entry.row._id as never,
        {
          ownerId: entry.ownerId,
          nomineeIds: nextNominees,
          teamId: undefined,
          updatedAt: new Date().toISOString(),
        } as never,
      );
      updated += 1;
    }
    return {
      apply: args.apply === true,
      total: rows.length,
      updated: args.apply === true ? updated : 0,
      wouldUpdate: args.apply === true ? 0 : updated,
      unchanged,
    };
  },
});

export const splitLegacyAwards = mutationGeneric({
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    await deleteAllRows(ctx, PLAYER_AWARDS_TABLE);
    await deleteAllRows(ctx, TEAM_AWARDS_TABLE);

    const legacyAwards = (await ctx.db
      .query(AWARDS_TABLE as never)
      .collect()) as ConvexRow[];
    const missing: Array<{
      legacyId: string | null;
      award: unknown;
      winnerId: unknown;
      field: string;
    }> = [];
    let playerAwards = 0;
    let teamAwards = 0;

    for (const row of legacyAwards) {
      const mapped = await toAwardStorageDoc(ctx, publicRow(row));
      if ("missing" in mapped) {
        missing.push({
          legacyId: normalizeId(row.legacyId),
          award: row.award,
          winnerId: row.winnerId,
          field: mapped.missing,
        });
        continue;
      }

      await ctx.db.insert(mapped.table as never, mapped.doc as never);
      if (mapped.kind === "player") {
        playerAwards += 1;
      } else {
        teamAwards += 1;
      }
    }

    return {
      sourceAwards: legacyAwards.length,
      playerAwards,
      teamAwards,
      missing,
    };
  },
});
