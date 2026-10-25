import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { syncPlayerDayPerformanceIndex } from "./lib/playerDayPerformanceIndex";

const tables = new Set([
  "playerDayStatLines",
  "playerDayHighlights",
  "playerWeekStatLines",
  "playerSplitStatLines",
  "playerTotalStatLines",
  "playerCareerSplitStatLines",
  "playerCareerTotalStatLines",
  "teamDayStatLines",
  "teamWeekStatLines",
  "teamSeasonStatLines",
]);
type Row = Record<string, unknown>;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, canonical(v)]),
      )
    : value;
}
const withoutUpdateTimestamp = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== "updatedAt"),
      )
    : value;
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(withoutUpdateTimestamp(a))) ===
  JSON.stringify(canonical(withoutUpdateTimestamp(b)));

/** Operator-only accounting/source-team correction with full-row optimistic concurrency. */
export const applyBatch = mutation({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    apply: v.optional(v.boolean()),
    rows: v.array(
      v.object({
        id: v.string(),
        expected: v.record(v.string(), v.any()),
        patch: v.record(v.string(), v.any()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (
      !process.env.CONVEX_SERVER_SECRET ||
      args.serverSecret !== process.env.CONVEX_SERVER_SECRET
    )
      throw Error("Unauthorized lineup accounting maintenance");
    if (
      !tables.has(args.table) ||
      args.rows.length > 50 ||
      new Set(args.rows.map((r) => r.id)).size !== args.rows.length
    )
      throw Error("Unsupported lineup accounting batch scope");
    const daily =
      args.table === "playerDayStatLines" ||
      args.table === "playerDayHighlights";
    const changes: Array<{ id: string; patch: Row; post: Row }> = [];
    let already = 0;
    for (const row of args.rows) {
      if (row.expected._id !== row.id || !Object.keys(row.patch).length)
        throw Error("Canonical accounting source and nonempty patch required");
      for (const [field, value] of Object.entries(row.patch)) {
        if (daily && field === "nhlTeam") {
          if (
            !Array.isArray(value) ||
            value.length !== 1 ||
            typeof value[0] !== "string" ||
            !/^[A-Z]{3}$/.test(value[0])
          )
            throw Error("One canonical source-proven NHL team required");
        } else if (daily && ["fullPos", "bestPos"].includes(field)) {
          if (
            typeof value !== "string" ||
            !["C", "LW", "RW", "D", "G", "UTIL", "BN"].includes(
              value.toUpperCase(),
            )
          )
            throw Error("Invalid hindsight lineup position");
        } else if (
          !["MS", "BS", "MG"].includes(field) ||
          !(
            typeof value === "number" ||
            typeof value === "string" ||
            value === null
          ) ||
          !Number.isSafeInteger(Number(value)) ||
          Number(value) < 0 ||
          (daily && Number(value) > 1)
        ) {
          throw Error("Invalid or unsupported lineup accounting field");
        }
      }
      const id = ctx.db.normalizeId(args.table as never, row.id);
      const current: unknown = id ? await ctx.db.get(id) : null;
      if (!current) throw Error("Lineup accounting source row missing");
      const post = { ...row.expected, ...row.patch };
      if (equal(current, post)) {
        already++;
        continue;
      }
      if (!equal(current, row.expected))
        throw Error("Lineup accounting source preimage changed");
      changes.push({ id: row.id, patch: row.patch, post });
    }
    if (args.apply)
      for (const row of changes) {
        await ctx.db.patch(row.id as never, row.patch);
        await syncPlayerDayPerformanceIndex(
          ctx.db,
          args.table,
          row.id,
          row.post,
        );
      }
    return {
      total: args.rows.length,
      updated: args.apply ? changes.length : 0,
      wouldUpdate: args.apply ? 0 : changes.length,
      already,
    };
  },
});
