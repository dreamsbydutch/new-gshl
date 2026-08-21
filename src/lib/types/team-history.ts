import type { MatchupType } from "./enums";
import type {
  TeamScheduleMatchupSummary,
  TeamScheduleTeamSummary,
  TeamScheduleWeekSummary,
} from "./team-schedule";
import type { FilterDropdownsProps } from "./team-ui";

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

export type TeamHistoryFilterDropdownsProps = Omit<
  FilterDropdownsProps,
  "seasonOptions"
> & {
  seasonOptions: TeamHistorySeasonSummary[] | undefined;
};
