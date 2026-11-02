"use client";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { TradeFormInput, TradeSubmission } from "@gshl-lib/types/trades";
import { useDomainMutation } from "./useDomainMutation";

function tradeArgs(input: TradeFormInput) {
  return {
    effectiveDate: input.effectiveDate,
    notes: input.notes,
    seasonId: input.seasonId as Id<"seasons">,
    teamAId: input.teamAId as Id<"teams">,
    teamBId: input.teamBId as Id<"teams">,
    playerIdsA: input.playerIdsA as Id<"players">[],
    playerIdsB: input.playerIdsB as Id<"players">[],
    pickIdsA: input.pickIdsA as Id<"draftPicks">[],
    pickIdsB: input.pickIdsB as Id<"draftPicks">[],
  };
}
export function useTrades(
  input: TradeFormInput,
  review: TradeFormInput | null,
) {
  const catalog = useQuery(
    api.trades.catalog,
    input.seasonId &&
      input.teamAId &&
      input.teamBId &&
      input.teamAId !== input.teamBId
      ? {
          seasonId: input.seasonId as Id<"seasons">,
          teamAId: input.teamAId as Id<"teams">,
          teamBId: input.teamBId as Id<"teams">,
          effectiveDate: input.effectiveDate,
        }
      : "skip",
  );
  const preview = useQuery(
    api.trades.preview,
    review ? tradeArgs(review) : "skip",
  );
  const record = useDomainMutation(
    api.trades.record,
    (args: TradeSubmission) => ({
      ...tradeArgs(args),
      requestId: args.requestId,
      expectedVersion: args.expectedVersion,
    }),
  );
  return { catalog, preview, record };
}
