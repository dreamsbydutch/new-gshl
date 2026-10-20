import { runDualRatingConvex, readDualRatingSeasons } from "./dual-ratings";
export type CleanupRow = Record<string, unknown> & { _id: string };
export type CleanupSnapshot = {
  deployment: string;
  seasons: Array<{
    season: CleanupRow;
    stats: CleanupRow[];
    values: CleanupRow[];
  }>;
  players: CleanupRow[];
};
/** Bounded operator inventory. No writes and no credentials enter returned data. */
export async function readNhlCleanupSnapshot(): Promise<CleanupSnapshot> {
  const selected = await readDualRatingSeasons();
  const seasons: CleanupSnapshot["seasons"] = [];
  for (const entry of selected) {
    const values = (await runDualRatingConvex([
      "--inline-query",
      `const rows=await ctx.db.query("nhlSeasonValues").withIndex("by_seasonId",q=>q.eq("seasonId",${JSON.stringify(entry.season._id)})).take(5001);if(rows.length===5001)throw Error("Value bound reached");return rows;`,
    ])) as CleanupRow[];
    seasons.push({ ...entry, values });
  }
  const players: CleanupRow[] = [];
  let cursor: string | null = null,
    done = false;
  for (let index = 0; index < 100 && !done; index++) {
    const page = (await runDualRatingConvex([
      "--inline-query",
      `return await ctx.db.query("players").paginate({numItems:1000,cursor:${JSON.stringify(cursor)}});`,
    ])) as { page: CleanupRow[]; continueCursor: string; isDone: boolean };
    players.push(...page.page);
    cursor = page.continueCursor;
    done = page.isDone;
  }
  if (!done) throw Error("Player inventory bound reached");
  return { deployment: "polished-tern-709", seasons, players };
}
