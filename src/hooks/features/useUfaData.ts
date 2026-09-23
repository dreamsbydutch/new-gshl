"use client";

import { useMemo } from "react";
import { useAuthSession } from "../main/useAuthSession";
import { useUfaCatalog, useUfaOfferMutation } from "../main/useUfa";
import type {
  UfaFreeAgentView,
  UfaOfferGroupView,
  UfaOverviewMode,
  UseUfaOverviewResult,
} from "@gshl-types";
import {
  buildUfaCatalogCandidates,
  findNhlTeamByAbbreviation,
  getUfaWindow,
  indexLatestUfaNhlStats,
  normalizeUfaPublicState,
  orderContractSeasons,
  resolveUfaViewerContext,
  selectAffordableUfas,
} from "@gshl-utils";
import { resolveUfaSigningSeason } from "@gshl-utils/features/ufa-deadline";

export function useUfaOverview(
  mode: UfaOverviewMode = "full",
): UseUfaOverviewResult {
  const { session } = useAuthSession();
  const { state: rawState, catalog: rawCatalog } = useUfaCatalog(mode);
  const state = useMemo(() => normalizeUfaPublicState(rawState), [rawState]);
  const data = useMemo(() => {
    if (rawState === undefined || rawCatalog === undefined) {
      return undefined;
    }
    const {
      players,
      nhlStats,
      nhlTeams,
      franchises,
      teams,
      seasons,
      contracts,
    } = rawCatalog;
    const activeSeason = resolveUfaSigningSeason(seasons);
    const latestNhlStatsByPlayer = indexLatestUfaNhlStats(
      nhlStats,
      seasons,
      activeSeason?.year,
    );
    const orderedSeasons = orderContractSeasons(seasons);
    const signingIndex = orderedSeasons.findIndex(
      (season) => season.id === activeSeason?.id,
    );
    const window = getUfaWindow(
      activeSeason ?? null,
      new Date(),
      signingIndex >= 0 ? (orderedSeasons[signingIndex + 1] ?? null) : null,
    );
    const ownerId = session?.user?.ownerId;
    const { ownerFranchise, ownerTeam, isSignedInOwner } =
      resolveUfaViewerContext({
        ownerId,
        signingSeasonId: activeSeason?.id,
        franchises,
        teams,
      });
    const rankedFreeAgents = buildUfaCatalogCandidates({
      players,
      signingSeason: activeSeason ?? null,
      seasons,
      contracts,
      ownerId,
      groups: state.groups,
      offers: state.offers,
    }).map(({ player, salary, affordableTerms, nextContractExpiryStatus }) => {
      const nhlTeam = findNhlTeamByAbbreviation(nhlTeams, player.nhlTeam);
      const group = state.groups.find(
        (candidate) =>
          String(candidate.playerId) === String(player.id) &&
          candidate.status === "open",
      );
      const mine = state.offers.find(
        (offer) => offer.groupId === group?._id && offer.isMine,
      );
      return {
        id: String(player.id),
        fullName: player.fullName,
        nhlTeam: String(player.nhlTeam ?? ""),
        nhlTeamLogoUrl: nhlTeam?.logoUrl ?? null,
        positions: Array.isArray(player.nhlPos)
          ? player.nhlPos.map(String)
          : [],
        positionGroup: String(player.posGroup),
        salary,
        nextContractExpiryStatus,
        seasonRating: Number(player.seasonRating ?? 0),
        overallRating: Number(player.overallRating ?? 0),
        stats: latestNhlStatsByPlayer.get(String(player.id)) ?? null,
        affordableTerms,
        existingOffer: mine
          ? { years: mine.contractLength, status: mine.status }
          : null,
        canOffer: Boolean(
          window.isOpen &&
            isSignedInOwner &&
            !mine &&
            affordableTerms.length > 0,
        ),
        disabledReason: !window.isOpen
          ? "Summer Free Agency is closed."
          : mine
            ? "Binding offer submitted."
            : !ownerId
              ? "Sign in with a linked owner account."
              : !ownerFranchise || !ownerTeam
                ? "Your account is not linked to an active franchise."
                : affordableTerms.length === 0
                  ? "Your franchise does not have enough available cap space."
                  : null,
      };
    });
    const freeAgents: UfaFreeAgentView[] = isSignedInOwner
      ? selectAffordableUfas(rankedFreeAgents)
      : rankedFreeAgents;
    const playerById = new Map(
      rankedFreeAgents.map((player) => [player.id, player]),
    );
    const franchiseById = new Map(
      franchises.map((franchise) => [String(franchise.id), franchise]),
    );
    const odds = state.oddsByGroup;
    const offerGroups: UfaOfferGroupView[] = state.groups
      .filter((group) => group.status === "open")
      .map((group) => ({
        id: String(group.id),
        deadlineAt: group.deadlineAt,
        player: playerById.get(String(group.playerId)),
        offers: state.offers
          .filter((offer) => offer.groupId === group._id)
          .map((offer) => {
            const franchise = franchiseById.get(String(offer.franchiseId));
            return {
              id: String(offer.id),
              franchiseName: franchise?.name ?? "Unknown franchise",
              franchiseLogoUrl: franchise?.logoUrl ?? null,
              years: offer.contractLength,
              salary: offer.salary,
              probability:
                odds[String(group.id)]?.find(
                  (entry) => entry.offerId === String(offer.id),
                )?.probability ?? 0,
            };
          }),
      }));
    const pendingOffers = state.offers.flatMap((offer) => {
      if (!offer.isMine || offer.status !== "pending") return [];
      const group = state.groups.find(
        (candidate) => candidate._id === offer.groupId,
      );
      const player = group ? playerById.get(String(group.playerId)) : undefined;
      return group && player
        ? [
            {
              id: offer.id,
              playerId: String(group.playerId),
              playerName: player.fullName,
              seasonId: String(group.seasonId),
              contractLength: offer.contractLength,
              salary: offer.salary,
              deadlineAt: group.deadlineAt,
              groupStatus: group.status,
            },
          ]
        : [];
    });
    return {
      window: {
        isOpen: window.isOpen,
        signingEndDate: activeSeason?.signingEndDate ?? null,
        contractSeasonName: orderedSeasons[signingIndex + 1]?.name ?? null,
        reason: window.isOpen
          ? null
          : "UFA offers open after the final signing period and close when the draft starts.",
      },
      freeAgents,
      topFreeAgents: freeAgents.slice(0, 15),
      offerGroups,
      pendingOffers,
      franchises,
      viewer: {
        isSignedInOwner,
      },
    };
  }, [rawCatalog, rawState, session?.user?.ownerId, state]);

  return {
    data,
    isLoading: data === undefined,
  };
}

export function useSubmitUfaOffer(options?: {
  onSuccess?: () => void;
  onError?: (message: string) => void;
}) {
  const mutation = useUfaOfferMutation();
  return {
    ...mutation,
    mutate: (args: { playerId: string; contractLength: 1 | 2 | 3 }) =>
      mutation.mutate(args, {
        onSuccess: options?.onSuccess,
        onError: (error) => options?.onError?.(error.message),
      }),
  };
}
