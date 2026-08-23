"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  useAuthSession,
  useContracts,
  useDraftPicks,
  useFranchises,
  usePlayers,
  useSeasonState,
  useTeams,
  useTeamScheduleSummary,
  useTradeBlockMarket,
  useWeeks,
} from "@gshl-hooks/main";
import type { Franchise, GSHLTeam, Season, Week } from "@gshl-types";
import type {
  OwnerCommandCenterData,
  OwnerCommandCenterMatchup,
} from "@gshl-lib/types/owner-command-center";
import {
  buildOwnerCommandCenterView,
  countUnreadOwnerActivity,
  newestOwnerActivityAt,
  ownerCommandCenterActivityStorageKey,
} from "@gshl-utils/features/owner-command-center";
import { useUfaOverview } from "./useUfaData";

function readActivityMarker(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeActivityMarker(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The command center remains usable when browser storage is unavailable.
  }
}

function seasonYear(season: Pick<Season, "year">) {
  const year = Number(season.year);
  return Number.isFinite(year) ? year : Number.NEGATIVE_INFINITY;
}

function projectMatchup(options: {
  matchup: ReturnType<
    typeof useTeamScheduleSummary
  >["data"]["matchups"][number]["matchup"];
  teams: ReturnType<typeof useTeamScheduleSummary>["data"]["teams"];
  weeks: Week[];
  fallbackWeek: ReturnType<
    typeof useTeamScheduleSummary
  >["data"]["matchups"][number]["week"];
  teamId: string;
}): OwnerCommandCenterMatchup {
  const { matchup, teams, weeks, fallbackWeek, teamId } = options;
  const week = weeks.find((candidate) => candidate.id === matchup.weekId);
  const opponentTeamId =
    matchup.homeTeamId === teamId ? matchup.awayTeamId : matchup.homeTeamId;
  const opponent = teams.find((team) => team.id === opponentTeamId);

  return {
    id: matchup.id,
    weekId: matchup.weekId,
    weekNum: week?.weekNum ?? fallbackWeek?.weekNum ?? null,
    weekStartDate: week?.startDate ?? null,
    weekEndDate: week?.endDate ?? fallbackWeek?.endDate ?? null,
    gameType: matchup.gameType,
    homeTeamId: matchup.homeTeamId,
    awayTeamId: matchup.awayTeamId,
    homeScore: matchup.homeScore ?? null,
    awayScore: matchup.awayScore ?? null,
    homeWin: matchup.homeWin ?? null,
    awayWin: matchup.awayWin ?? null,
    tie: matchup.tie ?? null,
    opponent: opponent
      ? {
          id: opponent.id,
          name: opponent.name,
          abbr: null,
          logoUrl: opponent.logoUrl,
        }
      : null,
  };
}

export function useOwnerCommandCenter() {
  const { session, status } = useAuthSession();
  const ownerId = session?.user.ownerId ? String(session.user.ownerId) : null;
  const isLinkedOwner = Boolean(
    status === "authenticated" &&
      session?.user.status === "active" &&
      ownerId &&
      (session.user.role === "owner" || session.user.role === "commissioner"),
  );
  const seasonState = useSeasonState({ autoSelect: false });
  const operationalSeason =
    seasonState.currentSeason ?? seasonState.defaultSeason ?? null;
  const franchisesQuery = useFranchises({
    ownerId,
    enabled: isLinkedOwner && Boolean(ownerId),
  });
  const franchises = franchisesQuery.data.filter(
    (row): row is Franchise => "ownerId" in row && !("seasonId" in row),
  );
  const franchise =
    franchises.find((candidate) => candidate.isActive) ?? franchises[0] ?? null;
  const teamsQuery = useTeams({
    franchiseId: franchise?.id,
    enabled: isLinkedOwner && Boolean(franchise?.id),
  });
  const ownerTeams = teamsQuery.data.filter(
    (row): row is GSHLTeam => "seasonId" in row && "ownerId" in row,
  );
  const currentTeam = operationalSeason
    ? (ownerTeams.find(
        (team) => String(team.seasonId) === String(operationalSeason.id),
      ) ?? null)
    : null;
  const playersQuery = usePlayers({
    ownerId,
    isActive: true,
    enabled: isLinkedOwner && Boolean(ownerId),
  });
  const contractsQuery = useContracts({
    filters: ownerId ? { ownerIds: ownerId } : undefined,
    enabled: isLinkedOwner && Boolean(ownerId),
  });
  const draftPicksQuery = useDraftPicks({
    enabled: isLinkedOwner && ownerTeams.length > 0,
  });
  const scheduleQuery = useTeamScheduleSummary({
    seasonId: operationalSeason?.id ?? null,
    ownerId,
    enabled: isLinkedOwner,
  });
  const weeksQuery = useWeeks({
    seasonId: operationalSeason?.id,
    enabled: isLinkedOwner && Boolean(operationalSeason?.id),
  });
  const tradeQuery = useTradeBlockMarket(isLinkedOwner);
  const ufaQuery = useUfaOverview("home");

  const rawData = useMemo<OwnerCommandCenterData | null>(() => {
    if (!isLinkedOwner || !ownerId || !operationalSeason || !currentTeam) {
      return null;
    }

    const teamIds = new Set(ownerTeams.map((team) => String(team.id)));
    const activeYear = seasonYear(operationalSeason);
    const relevantSeasonIds = new Set(
      seasonState.seasons
        .filter((season) => {
          const year = seasonYear(season);
          return year >= activeYear && year <= activeYear + 3;
        })
        .map((season) => String(season.id)),
    );
    const seasonById = new Map(
      seasonState.seasons.map((season) => [String(season.id), season]),
    );
    const roster = playersQuery.data;
    const draftPicks = draftPicksQuery.data
      .filter(
        (pick) =>
          !pick.playerId &&
          teamIds.has(String(pick.gshlTeamId)) &&
          relevantSeasonIds.has(String(pick.seasonId)),
      )
      .map((pick) => ({
        id: String(pick.id),
        seasonId: String(pick.seasonId),
        seasonName:
          seasonById.get(String(pick.seasonId))?.name ?? "Future draft",
        round: String(pick.round),
        pick: pick.pick == null ? null : String(pick.pick),
        isTraded: Boolean(pick.isTraded),
        originalTeamId: pick.originalTeamId
          ? String(pick.originalTeamId)
          : null,
      }));
    const pendingOffers = (ufaQuery.data?.pendingOffers ?? []).map((offer) => ({
      ...offer,
      deadlineAt: new Date(offer.deadlineAt).toISOString(),
    }));
    const listedPlayers = (tradeQuery.data?.candidates ?? [])
      .filter((candidate) => candidate.listingId !== null)
      .map((candidate) => ({
        listingId: String(candidate.listingId),
        playerId: String(candidate.playerId),
        playerName: candidate.fullName,
        note: candidate.note ?? null,
        updatedAt: new Date(candidate.updatedAt ?? 0).toISOString(),
      }));
    const tradeActivity = (tradeQuery.data?.listings ?? [])
      .filter(
        (listing) =>
          String(listing.ownerId) !== ownerId && Boolean(listing.updatedAt),
      )
      .sort((left, right) =>
        String(right.updatedAt).localeCompare(String(left.updatedAt)),
      )
      .slice(0, 8)
      .map((listing) => ({
        id: `trade-${listing.listingId}`,
        listingId: String(listing.listingId),
        playerName: listing.fullName,
        teamName: listing.team.name,
        occurredAt: String(listing.updatedAt),
      }));
    const orderedSchedule = [...scheduleQuery.data.matchups].sort(
      (left, right) =>
        Number(left.week?.weekNum ?? 0) - Number(right.week?.weekNum ?? 0) ||
        left.matchup.id.localeCompare(right.matchup.id),
    );
    const isComplete = (row: (typeof orderedSchedule)[number]) =>
      row.matchup.homeScore !== null &&
      row.matchup.homeScore !== undefined &&
      row.matchup.awayScore !== null &&
      row.matchup.awayScore !== undefined;
    const nextRow = orderedSchedule.find((row) => !isComplete(row)) ?? null;
    const recentRows = orderedSchedule.filter(isComplete).reverse().slice(0, 5);
    const matchupOptions = {
      teams: scheduleQuery.data.teams,
      weeks: weeksQuery.data,
      teamId: currentTeam.id,
    };

    return {
      ownerId,
      ownerName: session?.user.name ?? "Owner",
      season: operationalSeason,
      seasons: seasonState.seasons,
      team: {
        id: currentTeam.id,
        name: currentTeam.name,
        abbr: currentTeam.abbr,
        logoUrl: currentTeam.logoUrl,
      },
      roster,
      contracts: contractsQuery.data,
      draftPicks,
      pendingOffers,
      listedPlayers,
      nextMatchup: nextRow
        ? projectMatchup({
            ...matchupOptions,
            matchup: nextRow.matchup,
            fallbackWeek: nextRow.week,
          })
        : null,
      recentMatchups: recentRows.map((row) =>
        projectMatchup({
          ...matchupOptions,
          matchup: row.matchup,
          fallbackWeek: row.week,
        }),
      ),
      tradeActivity,
    };
  }, [
    contractsQuery.data,
    currentTeam,
    draftPicksQuery.data,
    isLinkedOwner,
    operationalSeason,
    ownerId,
    ownerTeams,
    playersQuery.data,
    scheduleQuery.data,
    seasonState.seasons,
    session?.user.name,
    tradeQuery.data?.candidates,
    tradeQuery.data?.listings,
    ufaQuery.data?.pendingOffers,
    weeksQuery.data,
  ]);
  const view = useMemo(
    () => (rawData ? buildOwnerCommandCenterView(rawData) : null),
    [rawData],
  );
  const [lastViewedAt, setLastViewedAt] = useState<string | null>(null);
  const [activityReady, setActivityReady] = useState(false);

  useEffect(() => {
    if (!view) {
      setLastViewedAt(null);
      setActivityReady(false);
      return;
    }

    const key = ownerCommandCenterActivityStorageKey(view.ownerId);
    const stored = readActivityMarker(key);
    if (stored) {
      setLastViewedAt(stored);
    } else {
      const baseline =
        newestOwnerActivityAt(view.activity) ?? new Date().toISOString();
      writeActivityMarker(key, baseline);
      setLastViewedAt(baseline);
    }
    setActivityReady(true);
  }, [view]);

  const unreadCount = useMemo(
    () =>
      activityReady && view
        ? countUnreadOwnerActivity(view.activity, lastViewedAt)
        : 0,
    [activityReady, lastViewedAt, view],
  );

  const markActivityRead = useCallback(() => {
    if (!view) return;
    const newest = newestOwnerActivityAt(view.activity);
    if (!newest) return;
    writeActivityMarker(
      ownerCommandCenterActivityStorageKey(view.ownerId),
      newest,
    );
    setLastViewedAt(newest);
  }, [view]);

  const isLoading =
    status === "loading" ||
    (isLinkedOwner &&
      (seasonState.isLoading ||
        franchisesQuery.isLoading ||
        teamsQuery.isLoading ||
        playersQuery.isLoading ||
        contractsQuery.isLoading ||
        draftPicksQuery.isLoading ||
        scheduleQuery.isLoading ||
        weeksQuery.isLoading ||
        tradeQuery.isLoading ||
        ufaQuery.isLoading));

  return {
    data: view,
    isEligible: isLinkedOwner,
    isLoading,
    unreadCount,
    lastViewedAt,
    markActivityRead,
  };
}
