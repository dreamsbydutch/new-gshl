import type {
  MatchupPlayerDayRow,
  MatchupPlayerWeekRow,
  PlayerStatRow,
  MatchupTeamWeekStats,
  PlayerStatCategoryKey,
  PlayerStatColumnKey,
} from "@gshl-types";
import type { NHLSchedule } from "@gshl-lib/types/nhl";
import {
  getPlayerTodayGames,
  formatMatchupPlayerName,
} from "./matchup-details";
import { playerWeekPerformanceRating } from "../domain/player-week-rating";

type Games = NHLSchedule["gameWeek"][number]["games"];
export type MatchupPlayerSort = PlayerStatColumnKey | "activity";
export type MatchupPlayerSortDirection = "asc" | "desc";
export type MatchupPlayerView = "today" | "week";
export type PlayerActivity =
  | "live"
  | "upcoming"
  | "final"
  | "postponed"
  | "off";

/** Captured roster days and ratings alone do not establish a contribution. */
export function hasMatchupPlayerContribution(player: PlayerStatRow): boolean {
  return [
    "GP",
    "GS",
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
  ].some((key) => {
    const value = Number(player[key as keyof PlayerStatRow]);
    return Number.isFinite(value) && value !== 0;
  });
}

export function playerActivity(
  player: PlayerStatRow,
  games: Games,
): PlayerActivity {
  const relevant = getPlayerTodayGames(player, games);
  const eligible = relevant.filter(
    (g) => !["PPD", "CNCL"].includes(g.gameScheduleState),
  );
  if (eligible.some((g) => ["LIVE", "CRIT"].includes(g.gameState)))
    return "live";
  if (eligible.some((g) => !["FINAL", "OFF"].includes(g.gameState)))
    return "upcoming";
  if (eligible.length) return "final";
  return relevant.length ? "postponed" : "off";
}

export function isCountedLineupSlot(player: PlayerStatRow): boolean {
  return ["C", "LW", "RW", "D", "G", "UTIL"].includes(
    String(player.dailyPos ?? "").toUpperCase(),
  );
}

export function matchupDayPlayers(
  days: readonly MatchupPlayerDayRow[],
  date: string,
) {
  return days
    .filter((d) => d.date === date)
    .map((d) => ({
      ...d,
      currentNhlTeam: d.nhlTeam,
    }));
}

/** Neither query results nor caller-owned arrays are mutated by sorting. */
export function sortMatchupPlayers(
  players: readonly PlayerStatRow[],
  games: Games,
  sort: MatchupPlayerSort,
  direction: MatchupPlayerSortDirection = "desc",
) {
  const order: Record<PlayerActivity, number> = {
    live: 0,
    upcoming: 1,
    final: 2,
    postponed: 3,
    off: 4,
  };
  return [...players].sort((a, b) => {
    if (sort === "activity") {
      const activity =
        order[playerActivity(a, games)] - order[playerActivity(b, games)];
      if (activity) return activity;
      const lineup =
        Number(isCountedLineupSlot(b)) - Number(isCountedLineupSlot(a));
      if (lineup) return lineup;
    }

    const valueFor = (player: PlayerStatRow): string | number | null => {
      if (sort === "activity") return playerWeekPerformanceRating(player);
      if (sort === "player") return formatMatchupPlayerName(player);
      if (sort === "pos") return String(player.nhlPos ?? player.posGroup ?? "");
      if (sort === "Rating") return playerWeekPerformanceRating(player);
      const value = player[sort];
      if (value === null || value === undefined || value === "") return null;
      if (typeof value === "number") return value;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : String(value);
    };
    const left = valueFor(a);
    const right = valueFor(b);
    if (left === null && right !== null) return 1;
    if (left !== null && right === null) return -1;
    if (left !== null && right !== null) {
      const delta =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), undefined, {
              numeric: true,
              sensitivity: "base",
            });
      if (delta) return direction === "asc" ? delta : -delta;
    }
    return formatMatchupPlayerName(a).localeCompare(formatMatchupPlayerName(b));
  });
}

/** Only actual starter stats count. Goalie ratios are pooled from raw workload. */
export function matchupDaySummary(
  players: readonly MatchupPlayerDayRow[],
  games: Games,
) {
  const categories: PlayerStatCategoryKey[] = [
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
  ];
  const stats = Object.fromEntries(
    categories.map((k) => [k, null]),
  ) as MatchupTeamWeekStats;
  const starters = players.filter(isCountedLineupSlot);
  const appearances = starters.filter((p) => Number(p.GP) > 0);
  const goalies = appearances.filter((p) => p.posGroup === "G");
  const sum = (
    rows: readonly MatchupPlayerDayRow[],
    key: keyof MatchupPlayerDayRow,
  ) => rows.reduce((total, p) => total + Number(p[key] ?? 0), 0);
  for (const key of categories) {
    const goalieCategory = ["W", "GA", "GAA", "SV", "SA", "SVP", "SO"].includes(
      key,
    );
    const rows = goalieCategory
      ? goalies
      : appearances.filter((p) => p.posGroup !== "G");
    if (rows.length) stats[key] = sum(rows, key);
    else if (!goalieCategory) stats[key] = 0;
  }
  const toi = sum(goalies, "TOI"),
    shots = sum(goalies, "SA");
  stats.GAA = toi > 0 ? (60 * sum(goalies, "GA")) / toi : null;
  stats.SVP = shots > 0 ? sum(goalies, "SV") / shots : null;
  const counts = { live: 0, upcoming: 0, final: 0, postponed: 0, off: 0 };
  starters.forEach((p) => counts[playerActivity(p, games)]++);
  return {
    stats,
    counts,
    starters: starters.length,
    appearances: appearances.length,
    bench: players.length - starters.length,
    updatedAt: Math.max(0, ...players.map((p) => p.updatedAt ?? 0)) || null,
  };
}

export function todayPlayerRows(
  weeks: readonly MatchupPlayerWeekRow[],
  days: readonly MatchupPlayerDayRow[],
  date: string,
): PlayerStatRow[] {
  const today = matchupDayPlayers(days, date);
  // A missing day's capture is unavailable, never an all-zero inferred lineup.
  return today.length
    ? today
    : weeks.map((p) => ({
        id: p.id,
        gshlTeamId: p.gshlTeamId,
        fullName: p.fullName,
        firstName: p.firstName,
        lastName: p.lastName,
        nhlPos: p.nhlPos,
        posGroup: p.posGroup,
        nhlTeam: p.nhlTeam,
        currentNhlTeam: p.currentNhlTeam,
      }));
}
