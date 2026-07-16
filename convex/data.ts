/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion */
import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

type Row = Record<string, unknown>;

const queryArgs = {
  table: v.string(),
  where: v.optional(v.record(v.string(), v.any())),
  orderBy: v.optional(
    v.record(v.string(), v.union(v.literal("asc"), v.literal("desc"))),
  ),
  take: v.optional(v.number()),
  skip: v.optional(v.number()),
};

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

export const list = queryGeneric({
  args: queryArgs,
  handler: async (ctx, args) => {
    const rows = await ctx.db.query(args.table as never).collect();
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
    table: v.string(),
    id: v.string(),
  },
  handler: async (ctx, args) => {
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
    table: v.string(),
    where: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query(args.table as never).collect();
    return rows.filter((row) => matchesWhere(row as never, args.where)).length;
  },
});

export const snapshot = queryGeneric({
  args: {
    tables: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const output: Record<string, Row[]> = {};
    for (const table of args.tables) {
      const rows = await ctx.db.query(table as never).collect();
      output[table] = rows.map((row) => publicRow(row as never));
    }
    return output;
  },
});

export const clearTables = mutationGeneric({
  args: {
    tables: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const deleted: Record<string, number> = {};
    for (const table of args.tables) {
      const rows = await ctx.db.query(table as never).collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
      deleted[table] = rows.length;
    }
    return { deleted };
  },
});

export const insertMany = mutationGeneric({
  args: {
    table: v.string(),
    rows: v.array(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    const inserted: Array<{ legacyId: string | null; id: string }> = [];
    for (const row of args.rows) {
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
    table: v.string(),
    id: v.string(),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
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
    const existingRows = (await ctx.db
      .query(args.table as never)
      .collect()) as Array<Row & { _id: string; _creationTime: number }>;
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
      const filter =
        typeof args.deleteMissing === "object"
          ? args.deleteMissing.filter
          : undefined;
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
  },
});
