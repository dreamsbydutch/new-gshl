import type { MatchupType } from "./enums";
import type {
  TeamScheduleMatchupSummary,
  TeamScheduleTeamSummary,
  TeamScheduleWeekSummary,
} from "./team-schedule";

export interface TeamHistoryMatchupSummary extends TeamScheduleMatchupSummary {
  gameType: MatchupType;
}

export interface TeamHistoryTeamSummary extends TeamScheduleTeamSummary {
  ownerId: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
}

export interface TeamHistoryWeekSummary extends TeamScheduleWeekSummary {
  id: string;
}

export interface TeamHistorySeasonSummary {
  id: string;
  year: string;
  name: string;
  categories: string[];
}

export interface TeamHistoryPayload {
  matchups: TeamHistoryMatchupSummary[];
  teams: TeamHistoryTeamSummary[];
  weeks: TeamHistoryWeekSummary[];
  seasons: TeamHistorySeasonSummary[];
}

export interface UseTeamHistorySummaryOptions {
  ownerId: string | null | undefined;
  enabled?: boolean;
}

export interface TeamHistoryFilterDropdownsProps {
  gameTypeValue: string;
  setGameTypeValue: (value: string) => void;
  ownerValue: string;
  setOwnerValue: (value: string) => void;
  gameTypeOptions: string[][];
  ownerOptions: string[][];
}
