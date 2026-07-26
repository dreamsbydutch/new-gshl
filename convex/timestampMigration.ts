import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import {
  DATE_KEY_TABLE_FIELDS,
  describeTimestampValue,
  timestampFieldsForTable,
  toUtcTimestamp,
  UTC_TIMESTAMP_TABLE_FIELDS,
} from "./lib/timestamps";

function requireServerSecret(serverSecret: string) {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || serverSecret !== expected) {
    throw new Error("Unauthorized server request");
  }
}

function requireTimestampTable(table: string): readonly string[] {
  const fields = timestampFieldsForTable(table);
  if (fields.length === 0) {
    throw new Error(`Unsupported timestamp migration table: ${table}`);
  }
  return fields;
}

export const plan = queryGeneric({
  args: { serverSecret: v.string() },
  handler: (_ctx, args) => {
    requireServerSecret(args.serverSecret);
    return {
      representation: "unix_epoch_milliseconds",
      tables: UTC_TIMESTAMP_TABLE_FIELDS,
      preservedDateKeys: DATE_KEY_TABLE_FIELDS,
    };
  },
});

export const migrateBatch = mutationGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    cursor: v.union(v.string(), v.null()),
    apply: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const fields = requireTimestampTable(args.table);
    const page = await ctx.db.query(args.table as never).paginate({
      cursor: args.cursor,
      numItems: Math.min(Math.max(Math.trunc(args.limit ?? 50), 1), 100),
    });
    let convertibleRows = 0;
    let convertedFields = 0;
    const invalid: Array<{ id: string; field: string; value: string }> = [];

    for (const row of page.page as Array<
      Record<string, unknown> & { _id: string }
    >) {
      const patch: Record<string, number> = {};
      for (const field of fields) {
        const value = row[field];
        if (
          value === null ||
          value === undefined ||
          typeof value === "number"
        ) {
          continue;
        }
        const timestamp = toUtcTimestamp(value);
        if (timestamp === null) {
          invalid.push({
            id: String(row._id),
            field,
            value: describeTimestampValue(value),
          });
          continue;
        }
        patch[field] = timestamp;
      }
      if (Object.keys(patch).length === 0) continue;
      convertibleRows += 1;
      convertedFields += Object.keys(patch).length;
      if (args.apply === true) {
        await ctx.db.patch(row._id as never, patch as never);
      }
    }

    return {
      table: args.table,
      apply: args.apply === true,
      scannedRows: page.page.length,
      convertibleRows,
      convertedRows: args.apply === true ? convertibleRows : 0,
      convertedFields: args.apply === true ? convertedFields : 0,
      wouldConvertFields: args.apply === true ? 0 : convertedFields,
      invalid,
      nextCursor: page.isDone ? null : page.continueCursor,
      hasMore: !page.isDone,
    };
  },
});
