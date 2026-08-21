import type { DraftPick, GSHLTeam, NHLTeam } from "./database";
import type { RosterPosition } from "./enums";
import type { DraftBoardPlayer } from "./draft-ui";

export interface LineupAssignment {
  playerId: string;
  lineupPos: RosterPosition;
}

export interface LineupCandidate {
  id: string;
  nhlPos: RosterPosition[];
  lineupPos?: RosterPosition | null;
  overallRating?: number | null;
}

export interface ProjectedDraftPick<
  TPlayer extends DraftBoardPlayer = DraftBoardPlayer,
> {
  pick: DraftPick;
  gshlTeam?: GSHLTeam;
  projectedPlayer?: TPlayer;
  score: number | null;
}

export interface MockDraftDisplayPlayer {
  fullName: string;
  nhlTeam?: string | string[] | null;
  nhlPos?: string | string[] | null;
  age?: number | string | null;
  seasonRating?: number | string | null;
  seasonRk?: number | string | null;
  overallRating?: number | string | null;
  overallRk?: number | string | null;
}

export interface MockDraftDisplayPick {
  pick: Pick<DraftPick, "id" | "round" | "pick">;
  gshlTeam?: Pick<GSHLTeam, "name" | "logoUrl">;
  projectedPlayer?: MockDraftDisplayPlayer;
}

export type MockDraftDisplayNhlTeam = Pick<
  NHLTeam,
  "abbr" | "name" | "logoUrl"
>;

export interface CompletedMockDraftPick<
  TPlayer extends DraftBoardPlayer = DraftBoardPlayer,
> {
  pick: DraftPick;
  player: TPlayer;
}

export interface BuildMockDraftProjectionOptions<
  TPlayer extends DraftBoardPlayer = DraftBoardPlayer,
> {
  seasonDraftPicks: DraftPick[];
  draftPlayers: TPlayer[];
  rosterPlayers: TPlayer[];
  completedPicks?: CompletedMockDraftPick<TPlayer>[];
  teams: GSHLTeam[];
  take?: number;
}
