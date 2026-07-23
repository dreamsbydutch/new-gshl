"use client";

import { useMemo } from "react";
import { clientApi as api } from "@gshl-trpc";

export function useUfaOverview() {
  const catalog = api.ufa.getOverview.useQuery(undefined, {
    staleTime: 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
  const live = api.ufa.getLiveState.useQuery(undefined, {
    staleTime: 15_000,
    refetchInterval: (query) =>
      query.state.data?.window.isOpen ? 30_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const data = useMemo(() => {
    if (!catalog.data) return undefined;
    if (!live.data) return catalog.data;

    const playerById = new Map(
      catalog.data.freeAgents.map((player) => [player.id, player]),
    );
    const offerGroupById = new Map(
      catalog.data.offerGroups.map((group) => [group.id, group]),
    );
    const franchiseById = new Map(
      catalog.data.franchises.map((franchise) => [franchise.id, franchise]),
    );
    return {
      ...catalog.data,
      window: live.data.window,
      offerGroups: live.data.groups.map((group) => ({
        id: group.id,
        deadlineAt: group.deadlineAt,
        player:
          offerGroupById.get(group.id)?.player ??
          playerById.get(group.playerId),
        offers: group.offers.map((offer) => {
          const franchise = franchiseById.get(offer.franchiseId);
          return {
            id: offer.id,
            franchiseName: franchise?.name ?? "Unknown franchise",
            franchiseLogoUrl: franchise?.logoUrl ?? null,
            years: offer.years,
            salary: offer.salary,
            probability: offer.probability,
          };
        }),
      })),
    };
  }, [catalog.data, live.data]);

  return {
    ...catalog,
    data,
    isLoading: catalog.isLoading || live.isLoading,
    error: catalog.error ?? live.error,
  };
}

export function useSubmitUfaOffer(options?: {
  onSuccess?: () => void;
  onError?: (message: string) => void;
}) {
  const utils = api.useUtils();
  return api.ufa.submitOffer.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.ufa.getOverview.invalidate(),
        utils.ufa.getLiveState.invalidate(),
      ]);
      options?.onSuccess?.();
    },
    onError: (error) => options?.onError?.(error.message),
  });
}
