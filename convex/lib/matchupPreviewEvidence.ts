import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type {
  MatchupPreviewEvidence,
  MatchupPreviewFact,
} from "../../src/lib/types/matchup-preview-article";
import { utcTimestampToDateKey } from "./timestamps";
import { FRANCHISE_BEAT_WRITERS_BY_LEGACY_ID } from "./reporterDirectory";
import { buildMatchupCategoryComparison } from "../../src/lib/utils/features/weekly-edition-research";
import { preseasonPower } from "./preseasonPower";

const DAY = 86400000;
const RECENT_FORM_DAYS = 60;
const final = (matchup: Doc<"matchups">) =>
  Boolean(
    matchup.isComplete === true ||
      matchup.homeWin === true ||
      matchup.awayWin === true ||
      matchup.tie === true,
  );
const number = (value: unknown) =>
  value != null && value !== "" && Number.isFinite(Number(value))
    ? Number(value)
    : null;

async function teamEvidence(ctx: QueryCtx, team: Doc<"teams">, now: number) {
  const franchise = await ctx.db.get(team.franchiseId);
  if (!franchise) return null;
  const [roster, instances, seasonStats] = await Promise.all([
    ctx.db
      .query("players")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", franchise.ownerId))
      .take(60),
    ctx.db
      .query("teams")
      .withIndex("by_franchiseId", (q) => q.eq("franchiseId", franchise._id))
      .take(101),
    ctx.db
      .query("teamSeasonStatLines")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", team.seasonId))
      .collect(),
  ]);
  // Creation order reflects imports, not season chronology. Never silently
  // truncate the franchise directory and describe that subset as latest form.
  if (instances.length > 100)
    throw new Error("Preview franchise history exceeds bound");
  const currentInstances = [
    ...new Map([team, ...instances].map((row) => [row._id, row])).values(),
  ];
  const matchups = (
    await Promise.all(
      currentInstances.map(async (instance) => {
        const [home, away] = await Promise.all([
          ctx.db
            .query("matchups")
            .withIndex("by_homeTeamId", (q) => q.eq("homeTeamId", instance._id))
            .take(61),
          ctx.db
            .query("matchups")
            .withIndex("by_awayTeamId", (q) => q.eq("awayTeamId", instance._id))
            .take(61),
        ]);
        if (home.length > 60 || away.length > 60)
          throw new Error("Preview season matchup history exceeds bound");
        return [...home, ...away].filter(final);
      }),
    )
  ).flat();
  const ownIds = new Set(currentInstances.map((row) => row._id));
  const results = await Promise.all(
    matchups.map(async (matchup) => {
      const week = await ctx.db.get(matchup.weekId);
      const ownHome = ownIds.has(matchup.homeTeamId);
      return {
        id: String(matchup._id),
        date: utcTimestampToDateKey(week?.startDate),
        opponentTeamId: ownHome ? matchup.awayTeamId : matchup.homeTeamId,
        score: ownHome ? matchup.homeScore : matchup.awayScore,
        opponentScore: ownHome ? matchup.awayScore : matchup.homeScore,
        result: matchup.tie
          ? "T"
          : (ownHome ? matchup.homeWin : matchup.awayWin)
            ? "W"
            : (ownHome ? matchup.awayWin : matchup.homeWin)
              ? "L"
              : "Final; winner not recorded",
      };
    }),
  );
  const start = utcTimestampToDateKey(now - 14 * DAY)!;
  const middle = utcTimestampToDateKey(now - 7 * DAY)!;
  const end = utcTimestampToDateKey(now - DAY)!;
  const players = await Promise.all(
    roster.map(async (player) => {
      const days = await ctx.db
        .query("playerDayStatLines")
        .withIndex("by_seasonId_playerId_date", (q) =>
          q
            .eq("seasonId", team.seasonId)
            .eq("playerId", player._id)
            .gte("date", start)
            .lte("date", end),
        )
        .take(32);
      const summarize = (recent: boolean) => {
        const played = days.filter(
          (row) =>
            row.date != null &&
            row.date >= middle === recent &&
            Number(row.GP) > 0,
        );
        const stats: Record<string, number> = {};
        for (const key of [
          "GP",
          "G",
          "A",
          "P",
          "PPP",
          "SOG",
          "HIT",
          "BLK",
          "W",
          "GA",
          "SV",
          "SA",
        ] as const) {
          const values = played
            .map((row) => number(row[key]))
            .filter((value): value is number => value !== null);
          if (values.length)
            stats[key] = values.reduce((sum, value) => sum + value, 0);
        }
        return { recordedGameDays: played.length, ...stats };
      };
      return {
        id: String(player._id),
        name: player.fullName,
        positions: player.nhlPos,
        nhlTeams: player.nhlTeam,
        overallRank: number(player.overallRk),
        rosterStatus: player.lineupPos ?? "Not recorded",
        recentSevenDays: summarize(true),
        precedingSevenDays: summarize(false),
      };
    }),
  );
  const assignedWriter = franchise.beatWriter?.trim();
  return {
    teamIds: ownIds,
    name: franchise.name,
    writer: assignedWriter?.length
      ? assignedWriter
      : (FRANCHISE_BEAT_WRITERS_BY_LEGACY_ID[franchise.legacyId ?? ""] ?? null),
    results: results
      .filter((row) => row.date && row.date <= end)
      .sort((a, b) => b.date!.localeCompare(a.date!)),
    players,
    sample: { start, recentFrom: middle, end },
    season: seasonStats
      .filter((row) => row.gshlTeamId === team._id)
      .map((row) => ({
        seasonType: row.seasonType,
        wins: row.teamW,
        losses: row.teamL,
        ties: row.teamT,
        streak: row.streak,
        overallRank: row.overallRk,
      })),
  };
}

export async function loadMatchupPreviewEvidence(
  ctx: QueryCtx,
  matchup: Doc<"matchups">,
  teamId: Id<"teams">,
  startsAt: number,
  now: number,
): Promise<MatchupPreviewEvidence | null> {
  const opponentId =
    matchup.homeTeamId === teamId ? matchup.awayTeamId : matchup.homeTeamId;
  const [team, opponent] = await Promise.all([
    ctx.db.get(teamId),
    ctx.db.get(opponentId),
  ]);
  if (!team || !opponent) return null;
  const [own, other] = await Promise.all([
    teamEvidence(ctx, team, now),
    teamEvidence(ctx, opponent, now),
  ]);
  if (!own || !other || !own.writer) return null;
  const weeks = await ctx.db
    .query("weeks")
    .withIndex("by_seasonId", (q) => q.eq("seasonId", team.seasonId))
    .collect();
  const completedWeek = [...weeks]
    .filter((week) => {
      const end = utcTimestampToDateKey(week.endDate);
      const start = utcTimestampToDateKey(week.startDate);
      return (
        end &&
        end < utcTimestampToDateKey(now)! &&
        start &&
        own.results.some((result) => result.date === start) &&
        other.results.some((result) => result.date === start)
      );
    })
    .sort((a, b) =>
      utcTimestampToDateKey(b.endDate)!.localeCompare(
        utcTimestampToDateKey(a.endDate)!,
      ),
    )[0];
  const [weekStats, weekMatchups] = completedWeek
    ? await Promise.all([
        ctx.db
          .query("teamWeekStatLines")
          .withIndex("by_weekId", (q) => q.eq("weekId", completedWeek._id))
          .collect(),
        ctx.db
          .query("matchups")
          .withIndex("by_weekId", (q) => q.eq("weekId", completedWeek._id))
          .collect(),
      ])
    : [[], []];
  const completedTeams = new Set(
    weekMatchups
      .filter(final)
      .flatMap((row) => [row.homeTeamId, row.awayTeamId]),
  );
  const preseasonRows = completedWeek
    ? []
    : await preseasonPower(ctx, team.seasonId);
  const categoryComparison =
    completedWeek || preseasonRows.length
      ? buildMatchupCategoryComparison({
          homeTeamId: String(matchup.homeTeamId),
          awayTeamId: String(matchup.awayTeamId),
          homeTeamName: matchup.homeTeamId === teamId ? own.name : other.name,
          awayTeamName: matchup.homeTeamId === teamId ? other.name : own.name,
          basis: completedWeek ? "completed_week" : "preseason_projection",
          startDate: utcTimestampToDateKey(
            completedWeek ? completedWeek.startDate : now,
          )!,
          endDate: utcTimestampToDateKey(
            completedWeek ? completedWeek.endDate : now,
          )!,
          rows: completedWeek
            ? weekStats
                .filter((row) => completedTeams.has(row.gshlTeamId))
                .map((row) => ({
                  gshlTeamId: String(row.gshlTeamId),
                  stats: row,
                }))
            : preseasonRows.map((row) => ({
                gshlTeamId: row.teamId,
                stats: row.projectedWeeklyStats,
                rosterSize: row.rosterSize,
                goalieQualification: row.goalieQualification,
              })),
        })
      : undefined;
  const meetings = own.results.filter((row) =>
    other.teamIds.has(row.opponentTeamId),
  );
  const recentFrom = utcTimestampToDateKey(now - RECENT_FORM_DAYS * DAY)!;
  const facts: MatchupPreviewFact[] = [
    {
      id: "matchup",
      text: JSON.stringify({
        team: own.name,
        opponent: other.name,
        startsAt,
        gameType: matchup.gameType,
        scoreMeaning: "GSHL fantasy categories",
      }),
    },
    {
      id: "head-to-head",
      text: JSON.stringify({
        scope:
          "Latest ten recorded completed meetings across all stored franchise team instances, sorted by matchup date. Database coverage is not independently verified all-time history.",
        totalRecordedMeetings: meetings.length,
        earliestRecordedMeeting: meetings.at(-1)?.date ?? null,
        meetings: meetings.slice(0, 10),
      }),
    },
  ];
  if (categoryComparison)
    facts.push({
      id: "category-comparison",
      text: JSON.stringify(categoryComparison),
    });
  for (const [label, data] of [
    ["team", own],
    ["opponent", other],
  ] as const) {
    facts.push({
      id: `${label}-form`,
      text: JSON.stringify({
        name: data.name,
        asOf: utcTimestampToDateKey(now),
        recentFormDays: RECENT_FORM_DAYS,
        recentCompletedMatchups: data.results
          .filter((row) => row.date! >= recentFrom)
          .slice(0, 5),
        latestHistoricalMatchups: data.results.slice(0, 5),
        note: "Internal editorial context, not article copy: recent form includes only the last 60 days. Use older completed results as dated past-season context alongside this year's roster. An empty recent sample is normal around the offseason; focus on the available roster and history without commenting on absent results or unproven momentum.",
        season: data.season,
      }),
    });
    facts.push({
      id: `${label}-sample`,
      text: JSON.stringify({
        ...data.sample,
        note: "Recorded GSHL daily performance, not NHL season totals. No recorded games means unavailable evidence, not a cold streak. IR and IRplus are roster designations only.",
      }),
    });
    for (const player of data.players)
      facts.push({ id: `${label}-${player.id}`, text: JSON.stringify(player) });
  }
  return {
    writer: own.writer,
    teamName: own.name,
    opponentName: other.name,
    homeTeamName: matchup.homeTeamId === teamId ? own.name : other.name,
    startsAt,
    facts,
  };
}
