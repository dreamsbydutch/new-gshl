export interface DraftCorrectionPick {
  id: string;
  gshlTeamId: string | null;
  originalTeamId: string | null;
  round: string;
  pick: string;
  playerId: string | null;
  playerName: string | null;
  isTraded: boolean;
  isSigning: boolean;
  version: string;
}

export interface StagedDraftCorrection {
  before: DraftCorrectionPick;
  after: DraftCorrectionPick;
}
