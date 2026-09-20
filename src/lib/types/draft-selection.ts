import type { Contract, GSHLTeam, NHLTeam, Player, Season } from "./database";
import type {
  DraftHubEligiblePlayerView,
  DraftPlayerSortDirection,
  DraftPlayerSortKey,
} from "./draft-hub";
import type { UfaStatView } from "./ufa";
import type { UseTeamDraftPickListDataResult } from "./hook-features";

export interface DraftPlayerCatalogInput {
  players: Player[];
  contracts: Contract[];
  activeOn?: string | Date | null;
  selectedPlayerIds: readonly string[];
  nhlTeams: readonly NHLTeam[];
  latestStats: ReadonlyMap<string, UfaStatView>;
}

export interface DraftPlayerCatalogFilter {
  searchTerm: string;
  positionFilter: string;
  sortKey: DraftPlayerSortKey;
  sortDirection: DraftPlayerSortDirection;
}

export interface DraftTeamSelection {
  ownTeam: GSHLTeam | undefined;
  selectedTeam: GSHLTeam | undefined;
}

export interface DraftPickListProjection
  extends Omit<UseTeamDraftPickListDataResult, "error"> {
  seasonOptions: Season[];
  selectionOptions: Array<Pick<Season, "id" | "name">>;
  activeSeasonId: string | undefined;
}

export type DraftPlayerCatalog = DraftHubEligiblePlayerView[];
