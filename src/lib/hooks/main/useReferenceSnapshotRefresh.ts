"use client";

import { useEffect } from "react";
import { referenceStore, CACHE_DURATIONS } from "@gshl-cache";
import { clientApi as api } from "@gshl-trpc";
import type {
  Conference,
  Franchise,
  GSHLTeam,
  Owner,
  Season,
  Team,
  Week,
} from "@gshl-types";

const REFERENCE_SNAPSHOT_MODELS = [
  "Season",
  "Week",
  "Team",
  "Franchise",
  "Conference",
  "Owner",
] as const;

let lastAppliedSnapshotAt = 0;

function normalizeIdString(
  value: string | number | null | undefined,
): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number") {
    return value.toString();
  }

  return undefined;
}

function enrichTeamsWithRelations(
  teams: Team[],
  franchises: Franchise[],
  owners: Owner[],
  conferences: Conference[],
): GSHLTeam[] {
  const franchiseMap = new Map(
    franchises.map((franchise) => [String(franchise.id), franchise]),
  );
  const ownerMap = new Map(owners.map((owner) => [String(owner.id), owner]));
  const conferenceMap = new Map(
    conferences.map((conference) => [String(conference.id), conference]),
  );

  return teams.map((team): GSHLTeam => {
    const franchise = franchiseMap.get(String(team.franchiseId));
    const owner = franchise
      ? ownerMap.get(String(franchise.ownerId))
      : undefined;
    const resolvedConfId =
      normalizeIdString(team.confId) ??
      normalizeIdString(franchise?.confId) ??
      null;
    const conference = resolvedConfId
      ? conferenceMap.get(resolvedConfId)
      : undefined;

    return {
      id: team.id,
      seasonId: team.seasonId,
      franchiseId: team.franchiseId,
      name: franchise?.name ?? null,
      abbr: franchise?.abbr ?? null,
      logoUrl: franchise?.logoUrl ?? null,
      isActive: franchise?.isActive ?? false,
      yahooId: team.yahooId ?? null,
      confId: resolvedConfId,
      confName: conference?.name ?? null,
      confAbbr: conference?.abbr ?? null,
      confLogoUrl: conference?.logoUrl ?? null,
      ownerId: owner?.id ?? null,
      ownerFirstName: owner?.firstName ?? null,
      ownerLastName: owner?.lastName ?? null,
      ownerNickname: owner?.nickName ?? null,
      ownerEmail: owner?.email ?? null,
      ownerOwing: owner?.owing ?? null,
      ownerIsActive: owner?.isActive ?? false,
    };
  });
}

function hasFreshReferenceSnapshot(updatedAt: number | null) {
  if (!updatedAt) {
    return false;
  }

  return Date.now() - updatedAt < CACHE_DURATIONS.STATIC;
}

export function useReferenceSnapshotRefresh(enabled: boolean) {
  const snapshotQuery = api.snapshot.get.useQuery(
    { models: [...REFERENCE_SNAPSHOT_MODELS] },
    {
      enabled,
      staleTime: CACHE_DURATIONS.STATIC,
      gcTime: CACHE_DURATIONS.STATIC,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  useEffect(() => {
    if (!enabled || !referenceStore.isSupported()) {
      return;
    }

    let isMounted = true;

    void referenceStore.getSnapshot().then((snapshot) => {
      if (
        !isMounted ||
        hasFreshReferenceSnapshot(snapshot?.updatedAt ?? null)
      ) {
        return;
      }

      void snapshotQuery.refetch();
    });

    return () => {
      isMounted = false;
    };
  }, [enabled, snapshotQuery]);

  useEffect(() => {
    if (!enabled || !snapshotQuery.data) {
      return;
    }

    if (snapshotQuery.dataUpdatedAt <= lastAppliedSnapshotAt) {
      return;
    }

    const seasons = (snapshotQuery.data.Season ?? []) as Season[];
    const weeks = (snapshotQuery.data.Week ?? []) as Week[];
    const franchises = (snapshotQuery.data.Franchise ?? []) as Franchise[];
    const owners = (snapshotQuery.data.Owner ?? []) as Owner[];
    const conferences = (snapshotQuery.data.Conference ?? []) as Conference[];
    const teams = enrichTeamsWithRelations(
      (snapshotQuery.data.Team ?? []) as Team[],
      franchises,
      owners,
      conferences,
    );

    lastAppliedSnapshotAt = snapshotQuery.dataUpdatedAt;
    void referenceStore.replaceSnapshot({
      seasons,
      weeks,
      teams,
      franchises,
    });
  }, [enabled, snapshotQuery.data, snapshotQuery.dataUpdatedAt]);
}
