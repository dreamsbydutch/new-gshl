"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AccountRecordInput } from "@gshl-lib/types/accounts";

export function useAccounts(
  ownerId: string,
  feePreview: { seasonId: string; amountCents: number } | null,
) {
  const overview = useQuery(api.accounts.overview, {});
  const history = usePaginatedQuery(
    api.accounts.history,
    ownerId ? { ownerId: ownerId as Id<"owners"> } : "skip",
    { initialNumItems: 25 },
  );
  const preview = useQuery(
    api.accounts.feePreview,
    feePreview
      ? { ...feePreview, seasonId: feePreview.seasonId as Id<"seasons"> }
      : "skip",
  );
  const recordMutation = useMutation(api.accounts.record);
  const voidMutation = useMutation(api.accounts.voidEntry);
  const assessMutation = useMutation(api.accounts.assessFees);
  return {
    overview,
    history,
    preview,
    record: (input: AccountRecordInput) =>
      recordMutation({ ...input, ownerId: input.ownerId as Id<"owners"> }),
    voidEntry: (entryId: string, reason: string) =>
      voidMutation({ entryId: entryId as Id<"ownerLedgerEntries">, reason }),
    assessFees: (seasonId: string, amountCents: number) =>
      assessMutation({ seasonId: seasonId as Id<"seasons">, amountCents }),
  };
}
