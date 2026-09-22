import type {
  PerformanceFilters,
  PerformanceColumnGroup,
  PerformanceKind,
  PerformanceRow,
} from "../../types/performances";

export const PERFORMANCE_KINDS: { value: PerformanceKind; label: string }[] = [
  { value: "playerDay", label: "Player days" },
  { value: "playerWeek", label: "Player weeks" },
  { value: "playerSplit", label: "Player splits" },
  { value: "playerTotal", label: "Player totals" },
  { value: "playerNhl", label: "Player NHL stats" },
  { value: "teamDay", label: "Team days" },
  { value: "teamWeek", label: "Team weeks" },
  { value: "teamSeason", label: "Team seasons" },
];
const hockeyStats = [
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
];
const commonStats = [
  "Rating",
  ...hockeyStats,
  "days",
  "MG",
  "IR",
  "IRplus",
  "GS",
  "ADD",
  "MS",
  "BS",
];
const goalieStats = new Set([
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "QS",
  "RBS",
]);
export function performanceStats(kind: PerformanceKind): string[] {
  if (kind === "playerNhl")
    return [
      "seasonRating",
      "overallRating",
      ...hockeyStats,
      "QS",
      "RBS",
      "age",
      "salary",
    ];
  if (kind === "teamWeek")
    return [
      ...commonStats,
      "powerRating",
      "powerElo",
      "powerEloPre",
      "powerEloPost",
      "powerEloDelta",
      "powerEloExpected",
      "powerEloK",
      "powerStatScore",
      "powerStatEwma",
      "powerTalent",
      "gmLadderRating",
      "powerGmScore",
      "powerHistoryPrior",
      "powerComposite",
      "powerRk",
    ];
  if (kind === "teamSeason")
    return [
      ...commonStats,
      "teamW",
      "teamHW",
      "teamHL",
      "teamL",
      "teamT",
      "teamCCW",
      "teamCCHW",
      "teamCCHL",
      "teamCCL",
      "teamCCT",
      "playersUsed",
      "powerRk",
      "overallRk",
      "conferenceRk",
      "wildcardRk",
      "hartRating",
      "hartRk",
      "norrisRating",
      "norrisRk",
      "vezinaRating",
      "vezinaRk",
      "calderRating",
      "calderRk",
      "jackAdamsRating",
      "jackAdamsRk",
      "GMOYRating",
      "GMOYRk",
    ];
  return commonStats;
}
export function performanceDirection(stat: string): "asc" | "desc" {
  return stat === "GA" ||
    stat === "GAA" ||
    stat === "RBS" ||
    stat.endsWith("Rk")
    ? "asc"
    : "desc";
}

export function performanceColumns(
  kind: PerformanceKind,
  group: PerformanceColumnGroup,
  sortStat: string,
): string[] {
  const stats = performanceStats(kind);
  const activity = [
    "ADD",
    "MS",
    "BS",
    "GP",
    "GS",
    "MG",
    "IR",
    "IRplus",
    "days",
    "playersUsed",
  ];
  const visible =
    group === "activity"
      ? activity.filter((stat) => stats.includes(stat))
      : group === "hockey"
        ? stats.filter(
            (stat) =>
              hockeyStats.includes(stat) || stat === "QS" || stat === "RBS",
          )
        : group === "ratings"
          ? stats.filter((stat) => /rating|power|Rk|gmLadder|GMOY/i.test(stat))
          : kind.startsWith("team")
            ? [...activity.filter((stat) => stats.includes(stat)), ...stats]
            : stats;
  return [
    ...new Set([...(stats.includes(sortStat) ? [sortStat] : []), ...visible]),
  ];
}
export function performanceNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  // Legacy time-on-ice values are stored as minutes:seconds.
  if (typeof value === "string" && /^\d+:\d{2}$/.test(value)) {
    const [minutes, seconds] = value.split(":").map(Number);
    return minutes! + seconds! / 60;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function qualifiesForPerformance(
  row: Record<string, unknown>,
  filters: Omit<PerformanceFilters, "seasonIds">,
): boolean {
  if (filters.seasonType && row.seasonType !== filters.seasonType) return false;
  if (filters.kind.startsWith("player")) {
    const goalie = row.posGroup === "G";
    if (filters.position === "goalie" && !goalie) return false;
    if (filters.position === "skater" && goalie) return false;
    if (goalieStats.has(filters.stat) && !goalie) return false;
  }
  // Availability stats can be meaningful on a day without a game played.
  const availabilityStat = [
    "days",
    "MG",
    "IR",
    "IRplus",
    "ADD",
    "MS",
    "BS",
  ].includes(filters.stat);
  // Empty/non-playing rows must not win rate-stat or shutout leaderboards.
  return (
    (availabilityStat || (performanceNumber(row.GP) ?? 0) > 0) &&
    performanceNumber(row[filters.stat]) !== null
  );
}
export function topPerformances(
  rows: readonly PerformanceRow[],
  stat: string,
  direction: "asc" | "desc",
): PerformanceRow[] {
  return [...rows]
    .filter((row) => row.stats[stat] != null)
    .sort((a, b) => {
      const difference =
        (a.stats[stat]! - b.stats[stat]!) * (direction === "asc" ? 1 : -1);
      return (
        difference || a.id.localeCompare(b.id) * (direction === "asc" ? 1 : -1)
      );
    })
    .slice(0, 100);
}
