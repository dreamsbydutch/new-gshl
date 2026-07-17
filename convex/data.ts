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
  players: new Set(["legacyId", "gshlTeamId"]),
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
  teamAwards: new Set(["legacyId", "seasonId", "teamId"]),
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

  return resolveTeamIdFromOwner(ctx, normalizedSeasonId, matchingContract.ownerId);
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

async function resolveTeamAwardTeamId(
  ctx: { db: any },
  seasonId: unknown,
  value: unknown,
): Promise<string | null> {
  const normalizedSeasonId = normalizeId(seasonId);
  const normalizedValue = normalizeId(value);
  if (!normalizedSeasonId || !normalizedValue) return null;

  const direct = await safeGet(ctx, normalizedValue);
  if (isTeamRow(direct) && equals(direct?.seasonId, normalizedSeasonId)) {
    return normalizedValue;
  }

  if (isPlayerRow(direct)) {
    const playerTeamId = await resolveTeamIdFromPlayer(
      ctx,
      normalizedSeasonId,
      normalizedValue,
    );
    if (playerTeamId) return playerTeamId;

    const contractTeamId = await resolveTeamIdFromPlayerContract(
      ctx,
      normalizedSeasonId,
      normalizedValue,
    );
    if (contractTeamId) return contractTeamId;

    const currentFranchiseTeamId = await resolveTeamIdFromPlayerCurrentTeam(
      ctx,
      normalizedSeasonId,
      direct,
    );
    if (currentFranchiseTeamId) return currentFranchiseTeamId;
  }

  const teamByLegacyId = await firstByIndex(
    ctx,
    "teams",
    "legacyId",
    normalizedValue,
  );
  if (teamByLegacyId && equals(teamByLegacyId.seasonId, normalizedSeasonId)) {
    return teamByLegacyId._id;
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
    if (playerTeamId) return playerTeamId;

    const contractTeamId = await resolveTeamIdFromPlayerContract(
      ctx,
      normalizedSeasonId,
      playerByLegacyId._id,
    );
    if (contractTeamId) return contractTeamId;

    const currentFranchiseTeamId = await resolveTeamIdFromPlayerCurrentTeam(
      ctx,
      normalizedSeasonId,
      playerByLegacyId,
    );
    if (currentFranchiseTeamId) return currentFranchiseTeamId;
  }

  const franchiseId =
    (isTeamRow(direct) ? normalizeId(direct?.franchiseId) : null) ??
    (await resolveFranchiseId(ctx, normalizedValue));
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
        : await resolveTeamAwardTeamId(ctx, seasonId, entry);
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

  const teamId = await resolveTeamAwardTeamId(
    ctx,
    seasonId,
    row.teamId ?? row.winnerId ?? row.ownerId,
  );
  if (!teamId) return { missing: "teamId" };

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
      teamId,
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
    winnerId: kind === "player" ? publicValue.playerId : publicValue.teamId,
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
    [kind === "player" ? "playerId" : "teamId"]: winnerId,
  };
}

function translateAwardKeyColumns(
  columns: readonly string[],
  kind: AwardKind,
): string[] {
  return columns.map((column) => {
    if (column !== "winnerId") return column;
    return kind === "player" ? "playerId" : "teamId";
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
  const teamRows = (
    await readCandidateRows(ctx, TEAM_AWARDS_TABLE, {
      ...args,
      where: translateAwardWhere(args.where, "team"),
    })
  ).map((row) => publicAwardRow(row, "team"));
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
      if (direct && "teamId" in direct) {
        return publicAwardRow(direct as ConvexRow, "team");
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
        if (row) return publicAwardRow(row as never, kind);
      }
    }

    const byId = await ctx.db.get(args.id as never);
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
      if (isAwardsTable(args.table)) {
        const mapped = await toAwardStorageDoc(ctx, row);
        if ("missing" in mapped) {
          throw new Error(
            `Unable to resolve award ${keyPart(row.award)} ${keyPart(
              row.legacyId ?? row.id,
            )}: missing ${mapped.missing}`,
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
    if (isAwardsTable(args.table)) {
      const mapped = await toAwardStorageDoc(ctx, args.data);
      if ("missing" in mapped) {
        throw new Error(
          `Unable to resolve award update ${args.id}: missing ${mapped.missing}`,
        );
      }

      const direct = await safeGet(ctx, args.id);
      const existing =
        (direct && ("playerId" in direct || "teamId" in direct)
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
      return publicAwardRow(updated, mapped.kind);
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

    return applyUpsertByCompositeKey(ctx, args);
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
