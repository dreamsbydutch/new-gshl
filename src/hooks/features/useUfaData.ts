"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useSession } from "next-auth/react";
import { api } from "../../../convex/_generated/api";
import { useAppMutation } from "../main/useAppMutation";
import type {
  Contract,
  Franchise,
  GSHLTeam,
  NHLTeam,
  Player,
  PlayerNHLStatLine,
  Season,
  UfaFreeAgentView,
  UfaOfferGroupView,
  UseUfaOverviewResult,
} from "@gshl-types";
import {
  findNhlTeamByAbbreviation,
  getAffordableUfaTerms,
  getUfaWindow,
  indexLatestUfaNhlStats,
  isEligibleUfaRank,
  isUnsignedForSigningSeason,
  normalizeUfaPublicState,
  rankUfas,
  selectAffordableUfas,
} from "@gshl-utils";

export function useUfaOverview(): UseUfaOverviewResult {
  const { data: session } = useSession();
  const rawState = useQuery(api.ufa.publicState, {});
  const rawCatalog = useQuery(api.frontend.ufaCatalog, {});
  const state = useMemo(() => normalizeUfaPublicState(rawState), [rawState]);
  const data = useMemo(() => {
    if (rawState === undefined || rawCatalog === undefined) {
      return undefined;
    }
    const players = rawCatalog.players as unknown as Player[];
    const nhlStats = rawCatalog.nhlStats as unknown as PlayerNHLStatLine[];
    const nhlTeams = rawCatalog.nhlTeams as unknown as NHLTeam[];
    const franchises = rawCatalog.franchises as unknown as Franchise[];
    const teams = rawCatalog.teams as unknown as GSHLTeam[];
    const seasons = rawCatalog.seasons as unknown as Season[];
    const contracts = rawCatalog.contracts as unknown as Contract[];
    const activeSeason = seasons.find((season) => season.isActive);
    const latestNhlStatsByPlayer = indexLatestUfaNhlStats(
      nhlStats,
      seasons,
      activeSeason?.year,
    );
    const window = getUfaWindow(activeSeason ?? null);
    const ownerId = session?.user?.ownerId;
    const ownerFranchise = franchises.find(
      (franchise) =>
        String(franchise.ownerId) === String(ownerId ?? "") &&
        franchise.isActive,
    );
    const ownerTeam = teams.find(
      (team) =>
        String(team.franchiseId) === String(ownerFranchise?.id ?? "") &&
        String(team.seasonId) === String(activeSeason?.id ?? ""),
    );
    const isSignedInOwner = Boolean(ownerId && ownerFranchise && ownerTeam);
    const rankedFreeAgents = rankUfas(
      players
        .filter(
          (player) =>
            player.isActive &&
            isEligibleUfaRank(player) &&
            Boolean(activeSeason) &&
            isUnsignedForSigningSeason(
              String(player.id),
              String(activeSeason?.id ?? ""),
              contracts,
              seasons,
            ) &&
            Number(player.salary ?? 0) > 0,
        )
        .map((player) => {
          const nhlTeam = findNhlTeamByAbbreviation(nhlTeams, player.nhlTeam);
          const group = state.groups.find(
            (candidate) =>
              String(candidate.playerId) === String(player.id) &&
              candidate.status === "open",
          );
          const mine = state.offers.find(
            (offer) => offer.groupId === group?._id && offer.isMine,
          );
          const salary = Math.round(Number(player.salary ?? 0) * 1.25);
          const affordableTerms = getAffordableUfaTerms({
            ownerId,
            salary,
            signingSeason: activeSeason ?? null,
            seasons,
            contracts,
            groups: state.groups,
            offers: state.offers,
          });
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
        }),
    );
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
    return {
      window: {
        isOpen: window.isOpen,
        signingEndDate: activeSeason?.signingEndDate ?? null,
        reason: window.isOpen ? null : "Summer Free Agency is closed.",
      },
      freeAgents,
      topFreeAgents: freeAgents.slice(0, 15),
      offerGroups,
      franchises,
      viewer: {
        isSignedInOwner,
      },
    };
  }, [rawCatalog, rawState, session?.user?.ownerId, state]);
  const error: Error | null = null;
  return {
    data,
    isLoading: data === undefined,
    error,
  };
}

export function useSubmitUfaOffer(options?: {
  onSuccess?: () => void;
  onError?: (message: string) => void;
}) {
  const mutation = useAppMutation(api.ufa.submitOffer);
  return {
    ...mutation,
    mutate: (args: { playerId: string; contractLength: 1 | 2 | 3 }) =>
      mutation.mutate(args, {
        onSuccess: options?.onSuccess,
        onError: (error) => options?.onError?.(error.message),
      }),
  };
}
