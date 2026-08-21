import type {
  Contract,
  DraftPick,
  GSHLTeam,
  NHLTeam,
  Player,
  Season,
} from "./database";
import type { CapSpaceEntry } from "./contracts";
import type { UfaStatView } from "./ufa";

export type DraftHubStatus =
  | "unavailable"
  | "upcoming"
  | "on_clock"
  | "commissioner_required"
  | "complete";

export interface DraftClockState {
  status: DraftHubStatus;
  activePick: DraftPick | null;
  completedCount: number;
  remainingCount: number;
  clockStartedAt: number | null;
  clockExpiresAt: number | null;
  recentPicks: DraftPick[];
  upcomingPicks: DraftPick[];
}

export interface DraftHubTeamSummary {
  id: string;
  franchiseId: string;
  ownerId: string | null;
  name: string;
  abbr: string;
  logoUrl: string | null;
}

export interface DraftHubPlayerSummary {
  id: string;
  fullName: string;
  nhlPos: string[];
  nhlTeam: string[];
}

export type DraftHubDraftPick = Omit<
  DraftPick,
  | "createdAt"
  | "updatedAt"
  | "onClockStartedAt"
  | "onClockExpiresAt"
  | "onClockEndedAt"
> & {
  onClockStartedAt: number | null;
  onClockExpiresAt: number | null;
  onClockEndedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export interface DraftHubPickView {
  pick: DraftHubDraftPick;
  team: DraftHubTeamSummary | null;
  originalTeam: DraftHubTeamSummary | null;
  player: DraftHubPlayerSummary | null;
}

export interface DraftHubMockProjection {
  playerId: string;
  fullName: string;
  nhlPos: string[];
}

export interface DraftHubSeasonSummary {
  id: string;
  name: string;
  year: number;
  startDate: number;
  draftStartAt: number;
}

export interface DraftHubStateData {
  season: DraftHubSeasonSummary;
  serverNow: number;
  status: DraftHubStatus;
  activePickId: string | null;
  completedCount: number;
  remainingCount: number;
  clockStartedAt: number | null;
  clockExpiresAt: number | null;
  recentPickIds: string[];
  upcomingPickIds: string[];
  picks: DraftHubPickView[];
}

export interface DraftHubEligiblePlayerView extends Player {
  nhlTeamLogoUrl: string | null;
  stats: UfaStatView | null;
}

export interface DraftHubNextPickNotice {
  pick: DraftHubPickView;
  picksAway: number;
  estimatedAt: number;
}

export type DraftPlayerSortKey =
  | "nhlTeam"
  | "fullName"
  | "nhlPosition"
  | "overallRk"
  | "yahooDraftRk"
  | "otherDraftRk"
  | "overallRating"
  | keyof UfaStatView;

export type DraftPlayerSortDirection = "asc" | "desc";

export interface UseDraftHubStateOptions {
  seasonId?: string | null;
  enabled?: boolean;
}

export interface DraftHubBoardViewModel {
  season: Season | undefined;
  state: DraftHubStateData | undefined;
  activePick: DraftHubPickView | null;
  recentPicks: DraftHubPickView[];
  upcomingPicks: DraftHubPickView[];
  nextUserPick: DraftHubNextPickNotice | null;
  mockProjectionByPickId: Record<string, DraftHubMockProjection>;
  eligiblePlayers: DraftHubEligiblePlayerView[];
  playerSortKey: DraftPlayerSortKey;
  playerSortDirection: DraftPlayerSortDirection;
  setPlayerSort: (key: DraftPlayerSortKey) => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  positionFilter: string;
  setPositionFilter: (value: string) => void;
  isCommissioner: boolean;
  canSubmitActivePick: boolean;
  canUndoLastPick: boolean;
  clockRemainingSeconds: number;
  draftStartRemainingSeconds: number;
  isSubmitting: boolean;
  submittingPlayerId: string | null;
  submitPlayer: (playerId: string) => Promise<void>;
  isUndoing: boolean;
  undoLastPick: () => Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  isLoading: boolean;
  error: string | null;
}

export interface DraftHubTeamData {
  season: Season | undefined;
  teams: GSHLTeam[];
  selectedTeam: GSHLTeam | undefined;
  players: Player[];
  contracts: Contract[];
  contractPlayers: Player[];
  nhlTeams: NHLTeam[];
  draftPicks: DraftPick[];
  contractTable: {
    contractGroups: Contract[][];
    capSpaceWindow: CapSpaceEntry[];
    ready: boolean;
  };
  isLoading: boolean;
}

export interface DraftHubTeamPageProps {
  mode: "my-team" | "other-team";
}

export interface DraftHubTeamToggleProps {
  seasonId?: string;
  excludedOwnerId?: string | null;
  isLoading?: boolean;
  teams?: readonly GSHLTeam[];
  selectedOwnerId?: string | null;
  onSelectOwner?: (ownerId: string) => void;
}

export interface DraftHubNavbarProps {
  seasonId?: string;
}

export interface DraftHubCardProps {
  season: Season;
}

export interface DraftRosterTeamView extends GSHLTeam {
  talentRating: number | null;
}

export interface DraftRosterConferenceView {
  id: string;
  name: string;
  abbr: string | null;
  logoUrl: string | null;
  teams: DraftRosterTeamView[];
}

export interface DraftRosterBoardViewModel {
  season: Season | undefined;
  conferences: DraftRosterConferenceView[];
  players: Player[];
  availablePlayers: DraftHubEligiblePlayerView[];
  nhlTeams: NHLTeam[];
  isLoading: boolean;
}
