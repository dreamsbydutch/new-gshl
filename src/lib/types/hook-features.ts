import type {
  Contract,
  DraftPick,
  GSHLTeam,
  Matchup,
  NHLTeam,
  Player,
  Season,
  TeamSeasonStatLine,
  Week,
} from "./database";
import type { FranchiseContractView } from "./contracts";
import type { ProcessedDraftPick } from "./draft-ui";
import type { UseTeamSeasonStatsOptions } from "./hook-core";
import type { ReadQueryResult } from "./hook-query";
import type { PowerRankingsViewModel, StandingsGroup } from "./standings";
import type {
  TeamHistoryMatchupSummary,
  TeamHistorySeasonSummary,
  TeamHistoryTeamSummary,
  TeamHistoryWeekSummary,
} from "./team-history";
import type {
  WeeklyScheduleMatchupSummary,
  WeeklyScheduleTeamSummary,
} from "./weekly-schedule";
import type { TeamScheduleRow, TeamScheduleTeamSummary } from "./team-schedule";

export interface UseContractDataOptions {
  currentSeason?: Season;
  currentTeam?: GSHLTeam;
  ownerId?: string;
  teams?: GSHLTeam[];
  allTeams?: GSHLTeam[];
  players?: Player[];
  nhlTeams?: NHLTeam[];
  seasons?: Season[];
  draftPicks?: DraftPick[];
  enabled?: boolean;
}

export interface UseContractDataResult extends FranchiseContractView {
  table: FranchiseContractView["table"] & { ready: boolean };
  isLoading: boolean;
  error: Error | null;
}

export interface UseStandingsDataOptions {
  standingsType?: string;
  seasonId?: string;
  includeMatchups?: boolean;
}

export interface UseScheduleDataEnhancedMatchup
  extends TeamHistoryMatchupSummary {
  week: TeamHistoryWeekSummary | undefined;
  season: TeamHistorySeasonSummary | undefined;
}

export interface UseScheduleDataOptions {
  ownerID?: string;
  seasonID?: string;
  gameType?: string;
  oppOwnerID?: string;
  allMatchups?: TeamHistoryMatchupSummary[];
  teams?: TeamHistoryTeamSummary[];
  weeks?: TeamHistoryWeekSummary[];
  seasons?: TeamHistorySeasonSummary[];
}

export interface UseScheduleDataResult {
  data: UseScheduleDataEnhancedMatchup[];
  ready: boolean;
  isLoading: boolean;
  error: Error | null;
}

export interface UseSeasonDataBundleOptions {
  seasonId?: string | null;
  weekId?: string | null;
  includeMatchups?: boolean;
  includeWeeks?: boolean;
  includeSeasonStats?: boolean;
  useNavigation?: boolean;
  weeksOrderBy?: Record<string, "asc" | "desc">;
  teamQueryOptions?: Partial<Pick<UseTeamSeasonStatsOptions, "seasonType">>;
}

export interface UseSeasonDataBundleResult {
  seasonId: string | null;
  weekId: string | null;
  matchups: Matchup[];
  teams: GSHLTeam[];
  weeks: Week[];
  teamStats: TeamSeasonStatLine[];
  status: { isLoading: boolean };
  ready: boolean;
  matchupsQuery: ReadQueryResult<Matchup[]>;
  teamsQuery: ReadQueryResult<GSHLTeam[]>;
  weeksQuery?: ReadQueryResult<Week[]>;
  teamStatsQuery?: ReadQueryResult<TeamSeasonStatLine[]>;
}

export interface UseDraftCountdownProps {
  draftDate: Date;
}

export interface DraftCountdownState {
  now: Date;
  isLive: boolean;
  isPast: boolean;
  countdown: string | null;
}

export interface UseDraftBoardDataOptions {
  seasonId: string;
  selectedType?: string | null;
}

export interface UseTeamHistoryDataOptions {
  teamInfo: GSHLTeam;
}

export interface UseTeamRosterDataOptions {
  players?: Player[];
  contracts?: Contract[];
  currentTeam?: GSHLTeam;
}

export interface UseTeamRosterDataResult {
  currentRoster: Player[];
  teamLineup: Array<Array<Array<Player | null>>>;
  benchPlayers: Player[];
  irPlayers: Player[];
  injuryStatus: string | null;
  totalCapHit: number;
  isLoading: boolean;
  ready: boolean;
}

export interface UseTeamDraftPickListDataOptions {
  teams?: GSHLTeam[];
  draftPicks?: DraftPick[];
  contracts?: Contract[];
  players?: Player[];
  seasons?: Season[];
  gshlTeamId?: string;
  selectedSeasonId?: string;
  allTeams?: GSHLTeam[];
}

export interface UseTeamDraftPickListDataResult {
  processedDraftPicks: ProcessedDraftPick[];
  ready: boolean;
  activeSeason?: Season;
  resolvedTeamId?: string;
  isLoading: boolean;
  error: Error | null;
}

export type UseTeamScheduleEnhancedMatchup = TeamScheduleRow;

export interface UseTeamScheduleDataOptions {
  seasonId?: string | null;
  ownerId?: string | null;
}

export interface UseTeamScheduleDataResult {
  selectedSeasonId: string | null;
  selectedOwnerId: string | null;
  selectedTeam: TeamScheduleTeamSummary | null;
  matchups: UseTeamScheduleEnhancedMatchup[];
  teams: TeamScheduleTeamSummary[];
  seasonCategories: string[];
  isLoading: boolean;
  error: Error | null;
  ready: boolean;
}

export interface UseWeeklyScheduleDataOptions {
  seasonId?: string | null;
  weekId?: string | null;
}

export interface UseWeeklyScheduleDataResult {
  selectedSeasonId: string | null;
  selectedWeekId: string | null;
  matchups: WeeklyScheduleMatchupSummary[];
  teams: WeeklyScheduleTeamSummary[];
  isLoading: boolean;
  error: Error | null;
  ready: boolean;
}

export interface UseTeamHistoryDataResult {
  seasonOptions: TeamHistorySeasonSummary[];
  selectedSeasonIds: string[];
  setSelectedSeasonIds: (ids: string[]) => void;
  gameTypeValue: string;
  setGameTypeValue: (value: string) => void;
  ownerValue: string;
  setOwnerValue: (value: string) => void;
  gameTypeOptions: string[][];
  ownerOptions: string[][];
  schedule: UseScheduleDataEnhancedMatchup[];
  teams: TeamHistoryTeamSummary[];
  fullSchedule: TeamHistoryMatchupSummary[];
  winLossRecord: [number, number, number];
  isDataReady: boolean;
  isLoading: boolean;
  error: Error | null;
  ready: boolean;
}

export interface UseStandingsDataResult {
  selectedSeason: Season | null | undefined;
  selectedSeasonId: string | null | undefined;
  matchups: Matchup[];
  weeks: Week[];
  teams: GSHLTeam[];
  groups: StandingsGroup[];
  stats: TeamSeasonStatLine[];
  powerRankings: PowerRankingsViewModel;
  standingsType: string;
  isLoading: boolean;
  ready: boolean;
}
