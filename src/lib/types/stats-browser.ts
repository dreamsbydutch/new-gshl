export interface StatsFilters {
  seasonId: string;
  weekId?: string;
  teamId?: string;
  seasonType: "RS" | "PO" | "LT";
  position: "skater" | "goalie" | "C" | "LW" | "RW" | "D";
  stat: string;
  direction: "asc" | "desc";
  page: number;
}

export interface StatsRow {
  id: string;
  playerId: string;
  name: string;
  positions: string[];
  nhlTeams: string[];
  teams: { id: string; name: string; ownerId: string | null }[];
  stats: Record<string, number | null>;
}

export interface StatsResult {
  rows: StatsRow[];
  total: number;
  page: number;
  pages: number;
}
