"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useSession } from "next-auth/react";
import { api } from "../../../convex/_generated/api";
import {
  useContracts,
  useFranchises,
  useNHLTeams,
  usePlayers,
  useSeasons,
  useTeams,
} from "../main";
import { useAppMutation } from "../main/useAppMutation";
import type {
  Franchise,
  GSHLTeam,
  NHLTeam,
  UfaFreeAgentView,
  UfaOfferGroupView,
  UseUfaOverviewResult,
} from "@gshl-types";
import {
  findNhlTeamByAbbreviation,
  getAffordableUfaTerms,
  getUfaWindow,
  isUnsignedForSigningSeason,
  normalizeUfaPublicState,
  rankUfas,
  selectAffordableUfas,
} from "@gshl-utils";

export function useUfaOverview(): UseUfaOverviewResult {
  const { data: session } = useSession();
  const rawState = useQuery(api.ufa.publicState, {});
  const state = useMemo(() => normalizeUfaPublicState(rawState), [rawState]);
  const players = usePlayers({ isActive: true });
  const nhlTeamsQuery = useNHLTeams();
  const franchisesQuery = useFranchises();
  const teamsQuery = useTeams();
  const seasons = useSeasons({ orderBy: { year: "asc" } });
  const contracts = useContracts();
  const data = useMemo(() => {
    if (
      rawState === undefined ||
      players.isLoading ||
      nhlTeamsQuery.isLoading ||
      franchisesQuery.isLoading ||
      teamsQuery.isLoading ||
      seasons.isLoading ||
      contracts.isLoading
    ) {
      return undefined;
    }
    const nhlTeams = nhlTeamsQuery.data.filter(
      (team): team is NHLTeam => "abbreviation" in team,
    );
    const franchises = franchisesQuery.data.filter(
      (team): team is Franchise => "ownerId" in team && !("seasonId" in team),
    );
    const teams = teamsQuery.data.filter(
      (team): team is GSHLTeam =>
        "seasonId" in team &&
        "franchiseId" in team &&
        !("date" in team) &&
        !("weekId" in team) &&
        !("seasonType" in team),
    );
    const activeSeason = seasons.data.find((season) => season.isActive);
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
      players.data
        .filter(
          (player) =>
            player.isActive &&
            Boolean(activeSeason) &&
            isUnsignedForSigningSeason(
              String(player.id),
              String(activeSeason?.id ?? ""),
              contracts.data,
              seasons.data,
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
            seasons: seasons.data,
            contracts: contracts.data,
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
            stats: null,
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
  }, [
    contracts.data,
    contracts.isLoading,
    franchisesQuery.data,
    franchisesQuery.isLoading,
    nhlTeamsQuery.data,
    nhlTeamsQuery.isLoading,
    players.data,
    players.isLoading,
    seasons.data,
    seasons.isLoading,
    session?.user?.ownerId,
    rawState,
    state,
    teamsQuery.data,
    teamsQuery.isLoading,
  ]);
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
