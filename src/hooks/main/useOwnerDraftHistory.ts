"use client";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function useOwnerDraftHistory(
  ownerId: string | null | undefined,
  seasonId: string | null,
) {
  const data = useQuery(
    api.frontend.ownerDraftHistory,
    ownerId
      ? {
          ownerId: ownerId as Id<"owners">,
          ...(seasonId ? { seasonId: seasonId as Id<"seasons"> } : {}),
        }
      : "skip",
  );
  return { data, isLoading: Boolean(ownerId) && data === undefined };
}
