import type { Contract, DraftPick, GSHLTeam, Player } from "@gshl-types";

export interface TeamDraftPickListProps {
  teams: GSHLTeam[] | undefined;
  draftPicks: DraftPick[] | undefined;
  contracts: Contract[] | undefined;
  players: Player[] | undefined;
}

export interface DraftPickItemProps {
  draftPick: DraftPick;
  originalTeam?: GSHLTeam;
  isAvailable: boolean;
  selectedPlayer?: Player;
}

export interface ProcessedDraftPick {
  draftPick: DraftPick;
  originalTeam?: GSHLTeam;
  isAvailable: boolean;
  selectedPlayer?: Player;
}
