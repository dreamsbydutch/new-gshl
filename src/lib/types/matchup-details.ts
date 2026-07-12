import type { GSHLTeam, Player, PlayerWeekStatLine } from "./database";

export interface MatchupDetailsContentProps {
  matchupId: string;
  seasonId: string;
  weekId: string;
}

export type MatchupPlayerStat = PlayerWeekStatLine & Partial<Player>;

export interface CategoryResult {
  key: string;
  label: string;
  homeValue: string;
  awayValue: string;
  winner: "home" | "away" | "tie";
}

export type StarPlayer = MatchupPlayerStat & {
  starRank: 1 | 2 | 3;
  team: GSHLTeam | null;
  numericRating: number;
};

export type PlayerStatColumnKey = keyof PlayerWeekStatLine | "player" | "pos";

export interface PlayerStatColumn {
  key: PlayerStatColumnKey;
  label: string;
  className?: string;
}
