import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { buildPreseasonProjections } from "../../scripts/src/runtime/preseason-projection";

/** Live preseason preview; never substitutes today's roster into historical weeks. */
export async function preseasonPower(ctx: QueryCtx, seasonId: Id<"seasons">) {
  const season = await ctx.db.get(seasonId);
  if (!season) return [];
  const openingWeek = await ctx.db
    .query("weeks")
    .withIndex("by_seasonId_startDate", (q) => q.eq("seasonId", seasonId))
    .first();
  if (!openingWeek?.startDate) return [];
  const openingTime = new Date(openingWeek.startDate).getTime();
  if (!Number.isFinite(openingTime) || openingTime <= Date.now()) return [];
  const [teams, seasons] = await Promise.all([
    ctx.db
      .query("teams")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", seasonId))
      .collect(),
    ctx.db.query("seasons").collect(),
  ]);
  const prior = seasons.filter(
    (row) =>
      Number(row.year) < Number(season.year) &&
      Number(row.year) >= Number(season.year) - 3,
  );
  const [rosters, nhl] = await Promise.all([
    Promise.all(
      teams.map((team) =>
        ctx.db
          .query("players")
          .withIndex("by_gshlTeamId", (q) => q.eq("gshlTeamId", team._id))
          .collect(),
      ),
    ),
    Promise.all(
      prior.map((row) =>
        ctx.db
          .query("playerNhlStatLines")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", row._id))
          .collect(),
      ),
    ),
  ]);
  if (!rosters.some((roster) => roster.length)) return [];
  return buildPreseasonProjections({
    season,
    seasons,
    teams,
    rosters: rosters
      .flat()
      .map((player) => ({ ...player, playerId: player._id })),
    playerNhlRows: nhl.flat(),
  });
}
