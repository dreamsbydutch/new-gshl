import type {
  StatsFilters,
  StatsRow,
  StatsResult,
} from "../../types/stats-browser";

export const SKATER_STATS = [
  "GP",
  "G",
  "A",
  "P",
  "PM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "Rating",
] as const;
export const GOALIE_STATS = [
  "GP",
  "W",
  "GAA",
  "SVP",
  "SV",
  "SO",
  "Rating",
] as const;
export const STATS_PAGE_SIZE = 50;

export function statsColumns(position: StatsFilters["position"]) {
  return position === "goalie" ? GOALIE_STATS : SKATER_STATS;
}

/** Apply every filter before sorting and paging, including players outside the top 100. */
export function selectStatsPage(
  rows: readonly StatsRow[],
  filters: StatsFilters,
): StatsResult {
  const filtered = rows.filter((row) => {
    const goalie = row.positions.includes("G");
    return (
      (row.stats.GP ?? 0) > 0 &&
      (filters.position === "goalie"
        ? goalie
        : filters.position === "skater"
          ? !goalie
          : row.positions.includes(filters.position)) &&
      (!filters.teamId || row.teams.some((team) => team.id === filters.teamId))
    );
  });
  const sorted = [...filtered].sort((a, b) => {
    const left = a.stats[filters.stat],
      right = b.stats[filters.stat];
    if (left == null && right != null) return 1;
    if (right == null && left != null) return -1;
    const difference = (left ?? 0) - (right ?? 0);
    return (
      (filters.direction === "asc" ? difference : -difference) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
    );
  });
  const pages = Math.max(1, Math.ceil(sorted.length / STATS_PAGE_SIZE));
  const page = Math.min(Math.max(0, filters.page), pages - 1);
  return {
    rows: sorted.slice(page * STATS_PAGE_SIZE, (page + 1) * STATS_PAGE_SIZE),
    total: sorted.length,
    page,
    pages,
  };
}
