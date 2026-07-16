import type { Contract, DraftPick, GSHLTeam, Player, Season } from "./database";
import type { RosterPosition } from "./enums";
import type { ToggleItem } from "./nav";

export interface DraftBoardToolbarProps {
  toolbarKeys: ToggleItem<string | null>[];
  activeKey: string | null;
  className?: [string?, string?, string?];
}

/**
 * Allow for legacy single-position string as well as current array form
 */
export type DraftBoardPlayer = Player & {
  nhlPos: RosterPosition[] | RosterPosition;
};

export interface TeamDraftPickListProps {
  teams: GSHLTeam[];
  allTeams: GSHLTeam[];
  draftPicks: DraftPick[] | undefined;
  contracts: Contract[];
  players: Player[] | undefined;
  seasons?: Season[];
  gshlTeamId: string;
  selectedSeasonId: string;
}

export interface ProcessedDraftPick {
  draftPick: DraftPick;
  originalTeam: GSHLTeam | undefined;
  isAvailable: boolean;
  selectedPlayer: Player | undefined;
}

export interface DraftPickItemProps {
  processedPick: ProcessedDraftPick;
  teams: GSHLTeam[];
}
