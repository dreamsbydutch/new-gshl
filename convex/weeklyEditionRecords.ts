import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalQuery, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { WeeklyEditionFactPacket } from "../src/lib/types/weekly-edition";
import {
  weeklyRecordBenchmarks,
  weeklyPerformanceRecordCandidates,
  type WeeklyRecordRow,
  type WeeklyRecordBenchmark,
} from "../src/lib/utils/features/weekly-edition-highlights";
import { RECORD_STATS } from "../src/lib/utils/features/performance-records";
import { toUtcTimestamp, utcTimestampToDateKey } from "./lib/timestamps";
import { selectResearchEvidence } from "../src/lib/utils/features/weekly-edition-research";

function dateKey(value: unknown) {
  const timestamp = toUtcTimestamp(value);
  return timestamp === null ? "" : (utcTimestampToDateKey(timestamp) ?? "");
}

export const calendar = internalQuery({
  args: { weekId: v.id("weeks") },
  handler: async (ctx, { weekId }) => {
    const current = await ctx.db.get(weekId);
    if (
      !current ||
      !Number.isFinite(Number(current.gameDays)) ||
      Number(current.gameDays) <= 0
    )
      return null;
    const seasons = await ctx.db.query("seasons").take(101);
    if (seasons.length === 101)
      throw new Error("Record calendar exceeds its bounded season scope");
    const comparable: Id<"weeks">[] = [];
    for (const season of seasons) {
      const weeks = await ctx.db
        .query("weeks")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
        .take(101);
      if (weeks.length === 101)
        throw new Error("Record calendar exceeds its bounded week scope");
      comparable.push(
        ...weeks
          .filter(
            (week) =>
              week._id !== current._id &&
              week.isPlayoffs === current.isPlayoffs &&
              Number(week.gameDays) === Number(current.gameDays) &&
              Boolean(dateKey(week.endDate)) &&
              dateKey(week.endDate) < dateKey(current.startDate),
          )
          .map((week) => week._id),
      );
    }
    return {
      weekIds: comparable,
      gameDays: Number(current.gameDays),
      isPlayoffs: current.isPlayoffs,
    };
  },
});

export const readWeek = internalQuery({
  args: { weekId: v.id("weeks"), includeCurrent: v.boolean() },
  handler: async (ctx, { weekId, includeCurrent }) => {
    const [teams, players, games] = await Promise.all([
      ctx.db
        .query("teamWeekStatLines")
        .withIndex("by_weekId", (q) => q.eq("weekId", weekId))
        .take(101),
      ctx.db
        .query("playerWeekStatLines")
        .withIndex("by_weekId", (q) => q.eq("weekId", weekId))
        .take(1001),
      ctx.db
        .query("matchups")
        .withIndex("by_weekId", (q) => q.eq("weekId", weekId))
        .take(101),
    ]);
    if (teams.length === 101 || players.length === 1001 || games.length === 101)
      throw new Error("Record comparison exceeds its bounded weekly scope");
    const completed = new Set(
      games
        .filter((game) => game.isComplete && game.gameType !== "LT")
        .flatMap((game) => [String(game.homeTeamId), String(game.awayTeamId)]),
    );
    const current: WeeklyRecordRow[] = [];
    const seen = new Set<string>();
    for (const kind of ["team", "player"] as const) {
      for (const row of kind === "team" ? teams : players) {
        if (!completed.has(String(row.gshlTeamId))) continue;
        const playerId = "playerId" in row ? String(row.playerId) : undefined;
        const key = `${kind}:${String(row.gshlTeamId)}:${playerId ?? ""}`;
        if (seen.has(key))
          throw new Error("Ambiguous duplicate record performance");
        seen.add(key);
        current.push({
          id: String(row._id),
          kind,
          teamId: String(row.gshlTeamId),
          playerId,
          stats: Object.fromEntries(
            ["GP", "GS", ...RECORD_STATS].map((stat) => [
              stat,
              row[stat as keyof typeof row],
            ]),
          ),
        });
      }
    }
    const playerNames: { id: string; name: string }[] = [];
    if (includeCurrent) {
      const playerIds = [...new Set(players.map((row) => row.playerId))];
      const namedPlayers = await Promise.all(
        playerIds.map((id) => ctx.db.get(id)),
      );
      for (const player of namedPlayers) {
        if (player)
          playerNames.push({ id: String(player._id), name: player.fullName });
      }
    }
    return {
      benchmarks: weeklyRecordBenchmarks(current),
      current: includeCurrent ? current : [],
      playerNames,
    };
  },
});

/** Historical scans run outside the interactive mutation and transfer only weekly maxima. */
export async function enrichWeeklyEditionRecords(
  ctx: ActionCtx,
  packet: WeeklyEditionFactPacket,
) {
  if (packet.issueType !== "weekly") return packet;
  const weekId = packet.week.id as Id<"weeks">;
  const comparison = await ctx.runQuery(
    internal.weeklyEditionRecords.calendar,
    { weekId },
  );
  if (!comparison?.weekIds.length) return packet;
  const current = await ctx.runQuery(internal.weeklyEditionRecords.readWeek, {
    weekId,
    includeCurrent: true,
  });
  const historical: WeeklyRecordBenchmark[] = [];
  for (let offset = 0; offset < comparison.weekIds.length; offset += 6) {
    const results = await Promise.all(
      comparison.weekIds.slice(offset, offset + 6).map((historicalWeekId) =>
        ctx.runQuery(internal.weeklyEditionRecords.readWeek, {
          weekId: historicalWeekId,
          includeCurrent: false,
        }),
      ),
    );
    for (const result of results) historical.push(...result.benchmarks);
  }
  const records = weeklyPerformanceRecordCandidates({
    weekId: packet.week.id,
    endDate: packet.week.endDate,
    gameDays: comparison.gameDays,
    isPlayoffs: comparison.isPlayoffs,
    current: current.current,
    historical,
    teamNames: new Map(packet.teams.map((team) => [team.teamId, team.name])),
    playerNames: new Map(
      current.playerNames.map((player) => [player.id, player.name]),
    ),
  });
  return {
    ...packet,
    editorialCandidates: selectResearchEvidence([
      ...packet.editorialCandidates,
      ...records,
    ]),
  };
}
