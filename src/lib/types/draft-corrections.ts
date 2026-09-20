import type { FunctionArgs } from "convex/server";
import type { api } from "@gshl-convex/_generated/api";

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

export type DraftCorrectionWriteArgs = FunctionArgs<
  typeof api.draft.correctPicks
>;
type CorrectionEdit = DraftCorrectionWriteArgs["edits"][number];
export type DomainDraftCorrectionArgs = Omit<
  DraftCorrectionWriteArgs,
  "seasonId" | "edits"
> & {
  seasonId: string;
  edits: Array<
    Omit<CorrectionEdit, "pickId" | "changes"> & {
      pickId: string;
      changes: Omit<
        CorrectionEdit["changes"],
        "gshlTeamId" | "originalTeamId" | "playerId"
      > & {
        gshlTeamId: string | null;
        originalTeamId: string | null;
        playerId: string | null;
      };
    }
  >;
};
