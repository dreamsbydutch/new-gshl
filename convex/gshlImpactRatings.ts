import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import { syncPlayerDayPerformanceIndex } from "./lib/playerDayPerformanceIndex";

const VERSION = "gshl-category-impact-v3";
const TABLES = new Set([
  "playerDayStatLines",
  "playerWeekStatLines",
  "playerSplitStatLines",
  "playerTotalStatLines",
  "playerCareerSplitStatLines",
  "playerCareerTotalStatLines",
  "teamDayStatLines",
  "teamWeekStatLines",
  "teamSeasonStatLines",
]);
const FIELDS = [
  "Rating",
  "averageRating",
  "ratingVersion",
  "ratingAppearances",
] as const;
type Row = Record<string, unknown>;
const nextValidator = v.object({
  Rating: v.number(),
  averageRating: v.number(),
  ratingVersion: v.literal(VERSION),
  ratingAppearances: v.number(),
});
const restoreState = v.object({
  present: v.boolean(),
  value: v.optional(v.any()),
});
const restoreValidator = v.object({
  Rating: restoreState,
  averageRating: restoreState,
  ratingVersion: restoreState,
  ratingAppearances: restoreState,
});

function object(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Exact recursive equality preserves absent versus null fields and array order. */
function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => equal(x, b[i]))
    );
  if (!object(a) || !object(b)) return false;
  const left = Object.keys(a).sort(),
    right = Object.keys(b).sort();
  return (
    left.length === right.length &&
    left.every((k, i) => k === right[i] && equal(a[k], b[k]))
  );
}
function authorize(secret: string, table: string, ids: string[]) {
  if (
    !process.env.CONVEX_SERVER_SECRET ||
    secret !== process.env.CONVEX_SERVER_SECRET
  )
    throw Error("Unauthorized rating maintenance");
  if (!TABLES.has(table)) throw Error("Unsupported GSHL rating table");
  if (ids.length > 100 || new Set(ids).size !== ids.length)
    throw Error("Rating batches require unique IDs and at most 100 rows");
}
function validNext(next: Row) {
  if (
    Object.keys(next).length !== FIELDS.length ||
    FIELDS.some((k) => !Object.hasOwn(next, k)) ||
    next.ratingVersion !== VERSION ||
    typeof next.Rating !== "number" ||
    !Number.isFinite(next.Rating) ||
    typeof next.averageRating !== "number" ||
    !Number.isFinite(next.averageRating) ||
    typeof next.ratingAppearances !== "number" ||
    !Number.isSafeInteger(next.ratingAppearances) ||
    next.ratingAppearances < 0
  )
    throw Error("Invalid GSHL impact rating fields");
}
function expectedIdentity(expected: Row, id: string) {
  if (
    expected._id !== id ||
    typeof expected._creationTime !== "number" ||
    !Number.isFinite(expected._creationTime)
  )
    throw Error("Full canonical rating preimage required");
}

/** Population checks complement row CAS: new or removed source identities fail the operator. */
export const readScopeIds = queryGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    field: v.optional(v.union(v.literal("seasonId"), v.literal("weekId"))),
    id: v.optional(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    authorize(args.serverSecret, args.table, []);
    const career = args.table.startsWith("playerCareer");
    const field = args.table === "playerDayStatLines" ? "weekId" : "seasonId";
    if (
      career
        ? args.field !== undefined || args.id !== undefined
        : args.field !== field || !args.id
    )
      throw Error("Exact bounded rating population scope required");
    const query = ctx.db.query(args.table as never);
    const scoped = career
      ? query
      : query.withIndex(`by_${field}` as never, (q) =>
          q.eq(field as never, args.id as never),
        );
    const page = await scoped.paginate({
      numItems: 2000,
      cursor: args.cursor ?? null,
    });
    const rows = page.page;
    if (rows.length > 2000) throw Error("Rating population page exceeds bound");
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      ids: rows
        .map((row: unknown) => {
          if (!object(row) || typeof row._id !== "string")
            throw Error("Invalid rating population identity");
          return row._id;
        })
        .sort(),
    };
  },
});

export const readInventory = queryGeneric({
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    authorize(args.serverSecret, "playerDayStatLines", []);
    const [seasons, weeks, teams] = await Promise.all([
      ctx.db.query("seasons").take(17),
      ctx.db.query("weeks").take(336),
      ctx.db.query("teams").take(213),
    ]);
    if (seasons.length > 16 || weeks.length > 335 || teams.length > 212)
      throw Error("Rating metadata inventory exceeds reviewed bounds");
    return { seasons, weeks, teams };
  },
});

export const applyBatch = mutationGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    apply: v.optional(v.boolean()),
    rows: v.array(
      v.object({
        id: v.string(),
        expected: v.record(v.string(), v.any()),
        next: nextValidator,
      }),
    ),
  },
  handler: async (ctx, args) => {
    authorize(
      args.serverSecret,
      args.table,
      args.rows.map((r) => r.id),
    );
    const changes: Array<{ id: string; patch: Row; postimage: Row }> = [];
    let already = 0;
    for (const entry of args.rows) {
      expectedIdentity(entry.expected, entry.id);
      validNext(entry.next);
      const normalized: unknown = ctx.db.normalizeId(
        args.table as never,
        entry.id,
      );
      const current: unknown =
        typeof normalized === "string"
          ? await ctx.db.get(normalized as never)
          : null;
      if (!object(current))
        throw Error("Rating source row missing or wrong table");
      const postimage = { ...entry.expected, ...entry.next };
      if (equal(current, postimage)) {
        already++;
        continue;
      }
      if (!equal(current, entry.expected))
        throw Error("Rating source preimage changed");
      changes.push({ id: entry.id, patch: { ...entry.next }, postimage });
    }
    if (args.apply === true)
      for (const change of changes) {
        await ctx.db.patch(change.id as never, change.patch);
        await syncPlayerDayPerformanceIndex(
          ctx.db as never,
          args.table,
          change.id,
          change.postimage,
        );
      }
    return {
      table: args.table,
      apply: args.apply === true,
      total: args.rows.length,
      updated: args.apply === true ? changes.length : 0,
      wouldUpdate: args.apply === true ? 0 : changes.length,
      already,
    };
  },
});

export const rollbackBatch = mutationGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    apply: v.optional(v.boolean()),
    rows: v.array(
      v.object({
        id: v.string(),
        expected: v.record(v.string(), v.any()),
        restore: restoreValidator,
      }),
    ),
  },
  handler: async (ctx, args) => {
    authorize(
      args.serverSecret,
      args.table,
      args.rows.map((r) => r.id),
    );
    const changes: Array<{ id: string; patch: Row; postimage: Row }> = [];
    let already = 0;
    for (const entry of args.rows) {
      expectedIdentity(entry.expected, entry.id);
      validNext(Object.fromEntries(FIELDS.map((k) => [k, entry.expected[k]])));
      const postimage = { ...entry.expected },
        patch: Row = {};
      if (Object.keys(entry.restore).length !== FIELDS.length)
        throw Error("Exact rollback rating field states required");
      for (const field of FIELDS) {
        const state = entry.restore[field];
        if (
          !object(state) ||
          typeof state.present !== "boolean" ||
          Object.keys(state).some((k) => k !== "present" && k !== "value") ||
          (state.present
            ? !Object.hasOwn(state, "value")
            : Object.hasOwn(state, "value"))
        )
          throw Error("Invalid rollback field presence");
        if (!state.present) {
          delete postimage[field];
          patch[field] = undefined;
          continue;
        }
        const value: unknown = state.value;
        if (
          value !== null &&
          (field === "ratingVersion"
            ? typeof value !== "string"
            : field === "Rating" && typeof value === "string"
              ? false
              : typeof value !== "number" ||
                !Number.isFinite(value) ||
                (field === "ratingAppearances" &&
                  (!Number.isSafeInteger(value) || value < 0)))
        )
          throw Error("Invalid rollback rating value");
        postimage[field] = value;
        patch[field] = value;
      }
      const normalized: unknown = ctx.db.normalizeId(
        args.table as never,
        entry.id,
      );
      const current: unknown =
        typeof normalized === "string"
          ? await ctx.db.get(normalized as never)
          : null;
      if (!object(current))
        throw Error("Rating rollback source row missing or wrong table");
      if (equal(current, postimage)) {
        already++;
        continue;
      }
      if (!equal(current, entry.expected))
        throw Error("Rating rollback postimage changed");
      changes.push({ id: entry.id, patch, postimage });
    }
    if (args.apply === true)
      for (const change of changes) {
        await ctx.db.patch(change.id as never, change.patch);
        await syncPlayerDayPerformanceIndex(
          ctx.db as never,
          args.table,
          change.id,
          change.postimage,
        );
      }
    return {
      table: args.table,
      apply: args.apply === true,
      total: args.rows.length,
      updated: args.apply === true ? changes.length : 0,
      wouldUpdate: args.apply === true ? 0 : changes.length,
      already,
    };
  },
});
