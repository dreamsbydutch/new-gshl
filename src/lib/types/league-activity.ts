import type { LeagueTradeSummary } from "./trades";

export type LeagueActivityType =
  | "signing"
  | "trade"
  | "add"
  | "drop"
  | "missed_start";

export interface LeagueActivityEvent {
  id: string;
  type: LeagueActivityType;
  date: string;
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamName: string;
  teamAbbr: string | null;
  teamLogoUrl: string | null;
  weeklyAddCount?: number | null;
  trade?: LeagueTradeSummary;
  signingStatus?: string;
  contractLength?: number;
  contractSalary?: number;
}
