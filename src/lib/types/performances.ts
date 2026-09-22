export type PerformanceKind =
  | "playerDay"
  | "playerWeek"
  | "playerSplit"
  | "playerTotal"
  | "playerNhl"
  | "teamDay"
  | "teamWeek"
  | "teamSeason";

export type PerformanceColumnGroup = "all" | "activity" | "hockey" | "ratings";

export interface PerformanceFilters {
  kind: PerformanceKind;
  seasonIds: string[];
  stat: string;
  direction: "asc" | "desc";
  position: "all" | "skater" | "goalie";
  seasonType: string;
  startDate: string;
  endDate: string;
}

export interface PerformanceRow {
  id: string;
  season: string;
  playerId: string | null;
  teamIds: string[];
  weekId: string | null;
  period: string;
  position: string;
  stats: Record<string, number | null>;
  name: string;
  team: string;
}

export interface PerformanceResult {
  rows: PerformanceRow[];
  highlightsOnly: boolean;
}
