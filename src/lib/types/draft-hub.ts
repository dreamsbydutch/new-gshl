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
  eligiblePlayers: DraftHubEligiblePlayerView[];
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  positionFilter: string;
  setPositionFilter: (value: string) => void;
  isCommissioner: boolean;
  canSubmitActivePick: boolean;
  clockRemainingSeconds: number;
  isSubmitting: boolean;
  submittingPlayerId: string | null;
  submitPlayer: (playerId: string) => Promise<void>;
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
}

export interface DraftHubNavbarProps {
  seasonId?: string;
}

export interface DraftHubCardProps {
  season: Season;
}
