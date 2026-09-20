"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  DraftCorrectionWriteArgs,
  DomainDraftCorrectionArgs,
} from "@gshl-lib/types/draft-corrections";
import { useDomainMutation } from "./useDomainMutation";

function toDraftCorrectionWriteArgs(
  args: DomainDraftCorrectionArgs,
): DraftCorrectionWriteArgs {
  return {
    ...args,
    seasonId: args.seasonId as Id<"seasons">,
    edits: args.edits.map((edit) => {
      if (edit.changes.gshlTeamId === null)
        throw new Error("A team must be assigned to each draft pick");
      return {
        ...edit,
        pickId: edit.pickId as Id<"draftPicks">,
        changes: {
          ...edit.changes,
          gshlTeamId: edit.changes.gshlTeamId as Id<"teams">,
          originalTeamId: edit.changes.originalTeamId as Id<"teams"> | null,
          playerId: edit.changes.playerId as Id<"players"> | null,
        },
      };
    }),
  };
}

export function useDraftCorrections(seasonId: string, pickId?: string) {
  const data = useQuery(
    api.draft.adminPicks,
    seasonId ? { seasonId: seasonId as Id<"seasons"> } : "skip",
  );
  const history = useQuery(
    api.draft.correctionHistory,
    pickId ? { pickId: pickId as Id<"draftPicks"> } : "skip",
  );
  const mutation = useDomainMutation(
    api.draft.correctPicks,
    toDraftCorrectionWriteArgs,
  );
  return { data, history, ...mutation };
}
