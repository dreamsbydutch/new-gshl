import type { DraftPick, GSHLTeam } from "./database";
import type { DraftBoardPlayer } from "./ui-components";

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
