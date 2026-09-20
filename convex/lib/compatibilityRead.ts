import type { GenericDatabaseReader, GenericDataModel } from "convex/server";
import { timestampFieldsForTable, toUtcTimestamp } from "./timestamps";
type Row = Record<string, unknown>;
export type CompatibilityRow = Row & { _id: string; _creationTime: number };
export interface ReadOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, "asc" | "desc">;
  skip?: number;
  take?: number;
}
export interface CompatibilityIndexPlan {
  indexName: string;
  constrainedFields: string[];
}

/**
 * Selects the index whose leading fields are most fully constrained by a
 * generic browser query. Convex permits equality constraints on a compound
 * index prefix, so season + week requests can avoid scanning an entire season.
 */
export function selectCompatibilityIndexPlan(
  indexes: readonly (readonly string[])[],
  where: Readonly<Record<string, unknown>>,
  nonExactFields: ReadonlySet<string> = new Set(),
): CompatibilityIndexPlan | null {
  let best: CompatibilityIndexPlan | null = null;
  let bestIndexWidth = Number.POSITIVE_INFINITY;

  for (const fields of indexes) {
    const constrainedFields: string[] = [];
    for (const field of fields) {
      if (where[field] === undefined || nonExactFields.has(field)) break;
      constrainedFields.push(field);
    }
    if (!constrainedFields.length) continue;

    if (
      !best ||
      constrainedFields.length > best.constrainedFields.length ||
      (constrainedFields.length === best.constrainedFields.length &&
        fields.length < bestIndexWidth)
    ) {
      best = {
        indexName: `by_${fields.join("_")}`,
        constrainedFields,
      };
      bestIndexWidth = fields.length;
    }
  }

  return best;
}

export function canTakeRowsBeforeFiltering(
  where: Readonly<Record<string, unknown>>,
  plan: CompatibilityIndexPlan | null,
): boolean {
  const constrained = new Set(plan?.constrainedFields ?? []);
  return Object.entries(where).every(
    ([field, value]) => value === undefined || constrained.has(field),
  );
}

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

export function comparable(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const numeric = Number(trimmed);
    return trimmed !== "" && Number.isFinite(numeric) ? numeric : trimmed;
  }
  return JSON.stringify(value);
}
export function compatibilityEquals(left: unknown, right: unknown): boolean {
  return comparable(left) === comparable(right);
}
export function matchesWhere(
  table: string,
  row: Row,
  where?: ReadOptions["where"],
): boolean {
  const timestamps = new Set(timestampFieldsForTable(table));
  return Object.entries(where ?? {}).every(
    ([field, expected]) =>
      expected === undefined ||
      (timestamps.has(field)
        ? toUtcTimestamp(row[field]) === toUtcTimestamp(expected)
        : compatibilityEquals(row[field], expected)),
  );
}
export function compareRows(
  table: string,
  left: Row,
  right: Row,
  orderBy?: ReadOptions["orderBy"],
): number {
  const timestamps = new Set(timestampFieldsForTable(table));
  for (const [field, direction] of Object.entries(orderBy ?? {})) {
    const a = timestamps.has(field)
      ? toUtcTimestamp(left[field])
      : comparable(left[field]);
    const b = timestamps.has(field)
      ? toUtcTimestamp(right[field])
      : comparable(right[field]);
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
/** Numeric compatibility and timestamp equality cannot use type-exact indexes.
 * Null also matches absent fields, so it must remain a residual predicate. */
export function compatibilityIndexPlan(
  table: string,
  where: ReadOptions["where"] = {},
): CompatibilityIndexPlan | null {
  const nonExact = new Set<string>(timestampFieldsForTable(table));
  for (const [field, value] of Object.entries(where)) {
    if (
      value === null ||
      typeof comparable(value) === "number" ||
      (typeof value === "string" && value !== value.trim()) ||
      typeof value === "object"
    )
      nonExact.add(field);
  }
  return selectCompatibilityIndexPlan(
    indexFieldsByTable[table] ?? [["legacyId"]],
    where,
    nonExact,
  );
}
export function compatibilityQuery(
  db: GenericDatabaseReader<GenericDataModel>,
  table: string,
  where: ReadOptions["where"] = {},
) {
  const plan = compatibilityIndexPlan(table, where);
  const query = db.query(table);
  return plan
    ? query.withIndex(plan.indexName, (range) => {
        let constrained = range;
        for (const field of plan.constrainedFields)
          constrained = constrained.eq(field, where[field]) as typeof range;
        return constrained;
      })
    : query;
}
export async function readCandidateRows(
  ctx: { db: GenericDatabaseReader<GenericDataModel> },
  table: string,
  args: ReadOptions,
): Promise<CompatibilityRow[]> {
  const query = compatibilityQuery(ctx.db, table, args.where);
  return args.take !== undefined &&
    !args.orderBy &&
    canTakeRowsBeforeFiltering(
      args.where ?? {},
      compatibilityIndexPlan(table, args.where),
    )
    ? query.take((args.skip ?? 0) + args.take)
    : query.collect();
}
/** Apply residual predicates and ordering before offset/limit, after adapter projection. */
export function finishCompatibilityRead<T extends Row>(
  table: string,
  rows: readonly T[],
  args: ReadOptions,
): T[] {
  const result = rows
    .filter((row) => matchesWhere(table, row, args.where))
    .sort((left, right) => compareRows(table, left, right, args.orderBy));
  const start = args.skip ?? 0;
  return result.slice(
    start,
    args.take === undefined ? undefined : start + args.take,
  );
}
export async function readCompatibilityRows(
  ctx: { db: GenericDatabaseReader<GenericDataModel> },
  table: string,
  args: ReadOptions,
): Promise<CompatibilityRow[]> {
  return finishCompatibilityRead(
    table,
    await readCandidateRows(ctx, table, args),
    args,
  );
}
