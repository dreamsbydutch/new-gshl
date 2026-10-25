import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { buildLineupShame } from "../../src/lib/utils/features/lineup-shame";

export async function loadLineupShame(
  ctx: QueryCtx,
  seasonId: Id<"seasons">,
  recentDate: string,
) {
  const dateInstant = Date.parse(`${recentDate}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(recentDate) ||
    !Number.isFinite(dateInstant) ||
    new Date(dateInstant).toISOString().slice(0, 10) !== recentDate
  )
    throw Error("A valid scoring date is required");
  const [season, teams, history, recent] = await Promise.all([
    ctx.db.get(seasonId),
    ctx.db
      .query("teams")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", seasonId))
      .take(65),
    ctx.db
      .query("teamDayStatLines")
      .withIndex("by_seasonId_date", (q) =>
        q.eq("seasonId", seasonId).lt("date", recentDate),
      )
      .take(6001),
    ctx.db
      .query("playerDayStatLines")
      .withIndex("by_seasonId_date", (q) =>
        q.eq("seasonId", seasonId).eq("date", recentDate),
      )
      .take(2001),
  ]);
  if (!season) return null;
  if (teams.length === 65 || history.length === 6001 || recent.length === 2001)
    throw Error("Lineup dashboard exceeds its supported season scope");
  const franchises = new Map(
    await Promise.all(
      teams.map(
        async (team) =>
          [team.franchiseId, await ctx.db.get(team.franchiseId)] as const,
      ),
    ),
  );
  const missedPlayerIds = [
    ...new Set(
      recent
        .filter(
          (row) =>
            row.lineupAccountingFinalized !== false && Number(row.MS) > 0,
        )
        .map((row) => row.playerId),
    ),
  ];
  const players = new Map(
    await Promise.all(
      missedPlayerIds.map(async (id) => [id, await ctx.db.get(id)] as const),
    ),
  );
  return buildLineupShame({
    seasonName: season.name,
    recentDate,
    teams: teams.map((team) => {
      const franchise = franchises.get(team.franchiseId);
      return {
        id: team._id,
        name: franchise?.name ?? "Unknown team",
        abbr: franchise?.abbr ?? "GSHL",
        logoUrl: franchise?.logoUrl ?? null,
      };
    }),
    history: history
      .filter((row) => Boolean(row.date))
      .map((row) => ({ ...row, date: row.date ?? "" })),
    recent: recent.map((row) => ({
      ...row,
      id: row._id,
      date: row.date ?? recentDate,
      dailyPos: row.dailyPos ?? "BN",
      playerName: players.get(row.playerId)?.fullName ?? "Unknown player",
    })),
  });
}
