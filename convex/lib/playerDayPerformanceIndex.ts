import type { DatabaseWriter } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  performanceNumber,
  performanceStats,
  qualifiesForPerformance,
} from "../../src/lib/utils/features/performances";

export const PLAYER_DAY_SCORES = [
  "Rating",
  "GP",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "TOI",
  "days",
  "MG",
  "IR",
  "IRplus",
  "GS",
  "ADD",
  "MS",
  "BS",
] as const;
export type PlayerDayScore = (typeof PLAYER_DAY_SCORES)[number];
export type PlayerDaySource = "playerDayStatLines" | "playerDayHighlights";

export function playerDayScores(
  row: Record<string, unknown>,
): Record<string, number> {
  return Object.fromEntries(
    performanceStats("playerDay")
      .filter((stat) =>
        qualifiesForPerformance(row, {
          kind: "playerDay",
          stat,
          direction: "desc",
          position: "all",
          seasonType: "",
          startDate: "",
          endDate: "",
        }),
      )
      .map((stat) => [stat, performanceNumber(row[stat])!]),
  );
}

/** Keep the derived score document in the same transaction as its source. */
export async function syncPlayerDayPerformanceIndex(
  db: DatabaseWriter,
  table: string,
  sourceId: string,
  row: Record<string, unknown> | null,
) {
  if (table !== "playerDayStatLines" && table !== "playerDayHighlights") return;
  const existing = await db
    .query("playerDayPerformanceIndex")
    .withIndex("by_sourceId", (q) => q.eq("sourceId", sourceId))
    .unique();
  if (!row) {
    if (existing) await db.delete(existing._id);
    return;
  }
  const value: Omit<Doc<"playerDayPerformanceIndex">, "_id" | "_creationTime"> = {
    sourceId,
    source: table,
    seasonId: row.seasonId as Id<"seasons">,
    position: row.posGroup === "G" ? ("goalie" as const) : ("skater" as const),
    date: typeof row.date === "string" ? row.date : null,
    scores: playerDayScores(row),
  };
  if (
    existing?.source === value.source &&
    existing.seasonId === value.seasonId &&
    existing.position === value.position &&
    existing.date === value.date &&
    Object.keys(existing.scores).length === Object.keys(value.scores).length &&
    Object.entries(value.scores).every(
      ([stat, score]) => existing.scores[stat as PlayerDayScore] === score,
    )
  )
    return;
  if (existing) await db.replace(existing._id, value);
  else await db.insert("playerDayPerformanceIndex", value);
}
