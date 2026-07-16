import type { DraftPick, GSHLTeam } from "./database";
import type { RosterPosition } from "./enums";
import type { DraftBoardPlayer } from "./draft-ui";

export interface LineupAssignment {
  playerId: string;
  lineupPos: RosterPosition;
}

export interface ProjectedDraftPick<
  TPlayer extends DraftBoardPlayer = DraftBoardPlayer,
> {
  pick: DraftPick;
  gshlTeam?: GSHLTeam;
  projectedPlayer?: TPlayer;
  score: number | null;
}

export interface BuildMockDraftProjectionOptions<
  TPlayer extends DraftBoardPlayer = DraftBoardPlayer,
> {
  seasonDraftPicks: DraftPick[];
  draftPlayers: TPlayer[];
  teams: GSHLTeam[];
  take?: number;
}
