"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useNavStore } from "@gshl-cache";
import type {
  GSHLTeam,
  LeagueOfficeNavigationView,
  LockerRoomNavigationView,
  ScheduleNavigationView,
  StandingsNavigationView,
  Week,
} from "@gshl-types";
import {
  buildContextualNavigationHref,
  buildDraftTeamsNavigationHref,
  buildGlobalSeasonNavigationHref,
  buildLeagueOfficeNavigationHref,
  buildLockerRoomNavigationHref,
  buildScheduleNavigationHref,
  buildStandingsNavigationHref,
  getCurrentNavigationHref,
  getLeagueOfficeNavigationViews,
  isGlobalSeasonUrlPath,
  isIsoDateInRange,
  isLockerRoomNavigationView,
  isScheduleNavigationView,
  isStandingsNavigationView,
  LOCKER_ROOM_NAVIGATION_VIEWS,
  readContextualNavigationQuery,
  resolveContextualSelection,
  SCHEDULE_NAVIGATION_VIEWS,
  STANDINGS_NAVIGATION_VIEWS,
  toLocalIsoDateOnly,
} from "@gshl-utils";
import {
  useAppPathname,
  useAppRouter,
  useAppSearchParams,
  useAuthSession,
  useNavigationHydration,
  useSeasonState,
  useTeams,
  useWeeks,
} from "../main";

function resolveId(
  explicitValue: string | null,
  persistedValue: string | null | undefined,
  validValues: readonly string[],
  fallbackValue: string | null,
): string | null {
  if (!fallbackValue) return null;
  return resolveContextualSelection({
    explicitValue,
    persistedValue,
    validValues,
    fallbackValue,
  }).value;
}

function uniqueOwnerIds(teams: readonly GSHLTeam[]): string[] {
  return [
    ...new Set(
      teams
        .map((team) => team.ownerId)
        .filter((ownerId): ownerId is string => Boolean(ownerId))
        .map(String),
    ),
  ];
}

function defaultWeekId(weeks: readonly Week[]): string | null {
  if (!weeks.length) return null;
  const today = toLocalIsoDateOnly(new Date());
  const current = weeks.find((week) =>
    isIsoDateInRange(today, week.startDate, week.endDate),
  );
  if (current?.id) return String(current.id);
  const next = weeks.find((week) => week.startDate > today);
  if (next?.id) return String(next.id);
  const previous = [...weeks].reverse().find((week) => week.endDate < today);
  return previous?.id ? String(previous.id) : String(weeks[0]!.id);
}

function useContextualRouter() {
  const { pathname } = useAppPathname();
  const { router } = useAppRouter();
  const { search } = useAppSearchParams();
  const currentHref = getCurrentNavigationHref(pathname, search);
  const pendingHref = useRef<string | null>(null);

  useEffect(() => {
    if (pendingHref.current === currentHref) pendingHref.current = null;
  }, [currentHref]);

  const push = useCallback(
    (href: string, updateStore: () => void) => {
      pendingHref.current = href;
      updateStore();
      router.push(href, { scroll: false });
    },
    [router],
  );

  const replace = useCallback(
    (href: string) => {
      router.replace(href, { scroll: false });
    },
    [router],
  );

  return {
    currentHref,
    pathname,
    push,
    replace,
    search,
    shouldSyncCurrentUrl:
      pendingHref.current === null || pendingHref.current === currentHref,
  };
}

function useResolvedSeasonId(explicitSeasonId: string | null) {
  const seasonState = useSeasonState({ autoSelect: false });
  const persistedSeasonId = useNavStore((state) => state.selectedSeasonId);
  const validSeasonIds = useMemo(
    () => seasonState.seasonOptions.map((season) => String(season.id)),
    [seasonState.seasonOptions],
  );
  const fallbackSeasonId = useMemo(() => {
    const candidates = [
      seasonState.currentSeason?.id,
      seasonState.defaultSeason?.id,
      validSeasonIds[0],
    ]
      .filter((value): value is string => value !== undefined)
      .map(String);
    return (
      candidates.find((candidate) => validSeasonIds.includes(candidate)) ?? null
    );
  }, [
    seasonState.currentSeason?.id,
    seasonState.defaultSeason?.id,
    validSeasonIds,
  ]);

  return {
    effectiveSeasonId: resolveId(
      explicitSeasonId,
      persistedSeasonId,
      validSeasonIds,
      fallbackSeasonId,
    ),
    isSeasonDataReady: !seasonState.isLoading,
    persistedSeasonId,
  };
}

export function useGlobalSeasonContextNavigation() {
  const navigation = useContextualRouter();
  const { hasHydrated } = useNavigationHydration();
  const seasonState = useSeasonState();
  const query = useMemo(
    () => readContextualNavigationQuery(navigation.search),
    [navigation.search],
  );
  const routeSeasonSummary = useMemo(() => {
    if (!isGlobalSeasonUrlPath(navigation.pathname) || !query.season) {
      return null;
    }
    return (
      seasonState.seasonOptions.find(
        (season) => String(season.id) === String(query.season),
      ) ?? null
    );
  }, [navigation.pathname, query.season, seasonState.seasonOptions]);
  const selectedSeasonSummary =
    routeSeasonSummary ??
    seasonState.selectedSeasonSummary ??
    seasonState.currentSeasonSummary ??
    seasonState.defaultSeasonSummary;
  const currentSeasonSummary =
    seasonState.currentSeasonSummary ??
    seasonState.selectableDefaultSeasonSummary ??
    seasonState.defaultSeasonSummary;
  const setSelectedSeasonId = seasonState.setSelectedSeasonId;

  useEffect(() => {
    if (
      !hasHydrated ||
      !navigation.shouldSyncCurrentUrl ||
      !routeSeasonSummary ||
      String(seasonState.selectedSeasonId) === String(routeSeasonSummary.id)
    ) {
      return;
    }
    setSelectedSeasonId(routeSeasonSummary.id);
  }, [
    hasHydrated,
    navigation.shouldSyncCurrentUrl,
    routeSeasonSummary,
    seasonState.selectedSeasonId,
    setSelectedSeasonId,
  ]);

  const selectSeason = useCallback(
    (seasonId: string) => {
      const href = buildGlobalSeasonNavigationHref(
        navigation.pathname,
        navigation.search,
        seasonId,
      );
      if (href && href !== navigation.currentHref) {
        navigation.push(href, () => setSelectedSeasonId(seasonId));
        return;
      }
      setSelectedSeasonId(seasonId);
    },
    [navigation, setSelectedSeasonId],
  );

  return {
    currentSeasonSummary,
    isHistoricalSeason: Boolean(
      selectedSeasonSummary &&
        currentSeasonSummary &&
        String(selectedSeasonSummary.id) !== String(currentSeasonSummary.id),
    ),
    isReady: hasHydrated && !seasonState.isLoading,
    seasonOptions: seasonState.seasonOptions,
    selectedSeasonSummary,
    selectSeason,
  };
}

export function useScheduleContextNavigation() {
  const navigation = useContextualRouter();
  const { hasHydrated } = useNavigationHydration();
  const { session, status: authStatus } = useAuthSession();
  const query = useMemo(
    () => readContextualNavigationQuery(navigation.search),
    [navigation.search],
  );
  const persistedView = useNavStore((state) => state.selectedScheduleType);
  const persistedWeekId = useNavStore((state) => state.selectedWeekId);
  const persistedOwnerId = useNavStore((state) => state.selectedOwnerId);
  const setView = useNavStore((state) => state.setScheduleType);
  const setSeasonId = useNavStore((state) => state.setSeasonId);
  const setWeekId = useNavStore((state) => state.setWeekId);
  const setOwnerId = useNavStore((state) => state.setOwnerId);

  const view = resolveContextualSelection({
    explicitValue: query.view,
    persistedValue: persistedView,
    validValues: SCHEDULE_NAVIGATION_VIEWS,
    fallbackValue: "week",
  }).value;
  const { effectiveSeasonId, isSeasonDataReady, persistedSeasonId } =
    useResolvedSeasonId(query.season);
  const weeksQuery = useWeeks({
    seasonId: effectiveSeasonId,
    orderBy: { startDate: "asc" },
    enabled: view === "week" && Boolean(effectiveSeasonId),
  });
  const teamsQuery = useTeams({
    seasonId: effectiveSeasonId,
    enabled: view === "team" && Boolean(effectiveSeasonId),
  });
  const validWeekIds = useMemo(
    () => (weeksQuery.data ?? []).map((week) => String(week.id)),
    [weeksQuery.data],
  );
  const validOwnerIds = useMemo(
    () => uniqueOwnerIds((teamsQuery.data ?? []) as GSHLTeam[]),
    [teamsQuery.data],
  );
  const effectiveWeekId =
    view === "week"
      ? resolveId(
          query.week,
          persistedWeekId,
          validWeekIds,
          defaultWeekId(weeksQuery.data ?? []),
        )
      : null;
  const ownOwnerId = session?.user.ownerId
    ? String(session.user.ownerId)
    : null;
  const ownerFallback =
    (ownOwnerId && validOwnerIds.includes(ownOwnerId) ? ownOwnerId : null) ??
    validOwnerIds[0] ??
    null;
  const effectiveOwnerId =
    view === "team"
      ? resolveId(query.owner, persistedOwnerId, validOwnerIds, ownerFallback)
      : null;
  const routeDataReady =
    hasHydrated &&
    isSeasonDataReady &&
    (view === "week"
      ? !weeksQuery.isLoading
      : !teamsQuery.isLoading && authStatus !== "loading");
  const storeMatches =
    persistedView === view &&
    (effectiveSeasonId === null || persistedSeasonId === effectiveSeasonId) &&
    (view !== "week" ||
      effectiveWeekId === null ||
      persistedWeekId === effectiveWeekId) &&
    (view !== "team" ||
      effectiveOwnerId === null ||
      persistedOwnerId === effectiveOwnerId);

  useEffect(() => {
    if (!routeDataReady || !navigation.shouldSyncCurrentUrl) return;

    if (persistedView !== view) setView(view);
    if (effectiveSeasonId && persistedSeasonId !== effectiveSeasonId) {
      setSeasonId(effectiveSeasonId);
    }
    if (
      view === "week" &&
      effectiveWeekId &&
      persistedWeekId !== effectiveWeekId
    ) {
      setWeekId(effectiveWeekId);
    }
    if (
      view === "team" &&
      effectiveOwnerId &&
      persistedOwnerId !== effectiveOwnerId
    ) {
      setOwnerId(effectiveOwnerId);
    }

    const canonicalHref = buildScheduleNavigationHref(navigation.search, {
      view,
      season: effectiveSeasonId,
      week: effectiveWeekId,
      owner: effectiveOwnerId,
    });
    if (navigation.currentHref !== canonicalHref) {
      navigation.replace(canonicalHref);
    }
  }, [
    effectiveOwnerId,
    effectiveSeasonId,
    effectiveWeekId,
    navigation,
    persistedOwnerId,
    persistedSeasonId,
    persistedView,
    persistedWeekId,
    routeDataReady,
    setOwnerId,
    setSeasonId,
    setView,
    setWeekId,
    view,
  ]);

  const selectView = useCallback(
    (nextView: ScheduleNavigationView) => {
      if (!isScheduleNavigationView(nextView)) return;
      const href = buildScheduleNavigationHref(navigation.search, {
        view: nextView,
        season: effectiveSeasonId,
        week:
          nextView === "week" && persistedWeekId !== "0"
            ? persistedWeekId
            : null,
        owner: nextView === "team" ? persistedOwnerId : null,
      });
      navigation.push(href, () => setView(nextView));
    },
    [effectiveSeasonId, navigation, persistedOwnerId, persistedWeekId, setView],
  );

  const selectSeason = useCallback(
    (seasonId: string) => {
      const href = buildScheduleNavigationHref(navigation.search, {
        view,
        season: seasonId,
        week: null,
        owner: view === "team" ? persistedOwnerId : null,
      });
      navigation.push(href, () => setSeasonId(seasonId));
    },
    [navigation, persistedOwnerId, setSeasonId, view],
  );

  const selectWeek = useCallback(
    (weekId: string) => {
      const href = buildScheduleNavigationHref(navigation.search, {
        view: "week",
        season: effectiveSeasonId,
        week: weekId,
      });
      navigation.push(href, () => setWeekId(weekId));
    },
    [effectiveSeasonId, navigation, setWeekId],
  );

  const selectOwner = useCallback(
    (ownerId: string) => {
      const href = buildScheduleNavigationHref(navigation.search, {
        view: "team",
        season: effectiveSeasonId,
        owner: ownerId,
      });
      navigation.push(href, () => setOwnerId(ownerId));
    },
    [effectiveSeasonId, navigation, setOwnerId],
  );

  return {
    isReady: routeDataReady && storeMatches,
    selectedOwnerId: effectiveOwnerId,
    selectedSeasonId: effectiveSeasonId,
    selectedView: view,
    selectedWeekId: effectiveWeekId,
    selectOwner,
    selectSeason,
    selectView,
    selectWeek,
  };
}

export function useStandingsContextNavigation() {
  const navigation = useContextualRouter();
  const { hasHydrated } = useNavigationHydration();
  const query = useMemo(
    () => readContextualNavigationQuery(navigation.search),
    [navigation.search],
  );
  const persistedView = useNavStore((state) => state.selectedStandingsType);
  const setView = useNavStore((state) => state.setStandingsType);
  const setSeasonId = useNavStore((state) => state.setSeasonId);
  const view = resolveContextualSelection({
    explicitValue: query.view,
    persistedValue: persistedView,
    validValues: STANDINGS_NAVIGATION_VIEWS,
    fallbackValue: "overall",
  }).value;
  const { effectiveSeasonId, isSeasonDataReady, persistedSeasonId } =
    useResolvedSeasonId(query.season);
  const routeDataReady = hasHydrated && isSeasonDataReady;
  const storeMatches =
    persistedView === view &&
    (effectiveSeasonId === null || persistedSeasonId === effectiveSeasonId);

  useEffect(() => {
    if (!routeDataReady || !navigation.shouldSyncCurrentUrl) return;
    if (persistedView !== view) setView(view);
    if (effectiveSeasonId && persistedSeasonId !== effectiveSeasonId) {
      setSeasonId(effectiveSeasonId);
    }
    const canonicalHref = buildStandingsNavigationHref(navigation.search, {
      view,
      season: effectiveSeasonId,
    });
    if (navigation.currentHref !== canonicalHref) {
      navigation.replace(canonicalHref);
    }
  }, [
    effectiveSeasonId,
    navigation,
    persistedSeasonId,
    persistedView,
    routeDataReady,
    setSeasonId,
    setView,
    view,
  ]);

  const selectView = useCallback(
    (nextView: StandingsNavigationView) => {
      if (!isStandingsNavigationView(nextView)) return;
      const href = buildStandingsNavigationHref(navigation.search, {
        view: nextView,
        season: effectiveSeasonId,
      });
      navigation.push(href, () => setView(nextView));
    },
    [effectiveSeasonId, navigation, setView],
  );
  const selectSeason = useCallback(
    (seasonId: string) => {
      const href = buildStandingsNavigationHref(navigation.search, {
        view,
        season: seasonId,
      });
      navigation.push(href, () => setSeasonId(seasonId));
    },
    [navigation, setSeasonId, view],
  );

  return {
    isReady: routeDataReady && storeMatches,
    selectedSeasonId: effectiveSeasonId,
    selectedView: view,
    selectSeason,
    selectView,
  };
}

export function useLockerRoomContextNavigation() {
  const navigation = useContextualRouter();
  const { hasHydrated } = useNavigationHydration();
  const { session, status: authStatus } = useAuthSession();
  const query = useMemo(
    () => readContextualNavigationQuery(navigation.search),
    [navigation.search],
  );
  const persistedView = useNavStore((state) => state.selectedLockerRoomType);
  const persistedOwnerId = useNavStore((state) => state.selectedOwnerId);
  const setView = useNavStore((state) => state.setLockerRoomType);
  const setSeasonId = useNavStore((state) => state.setSeasonId);
  const setOwnerId = useNavStore((state) => state.setOwnerId);
  const { effectiveSeasonId, isSeasonDataReady, persistedSeasonId } =
    useResolvedSeasonId(query.season);
  const teamsQuery = useTeams({
    seasonId: effectiveSeasonId,
    enabled: Boolean(effectiveSeasonId),
  });
  const validOwnerIds = useMemo(
    () => uniqueOwnerIds((teamsQuery.data ?? []) as GSHLTeam[]),
    [teamsQuery.data],
  );
  const ownOwnerId = session?.user.ownerId
    ? String(session.user.ownerId)
    : null;
  const fallbackOwnerId =
    (ownOwnerId && validOwnerIds.includes(ownOwnerId) ? ownOwnerId : null) ??
    validOwnerIds[0] ??
    null;
  const ownerId = resolveId(
    query.owner,
    persistedOwnerId,
    validOwnerIds,
    fallbackOwnerId,
  );
  const view = resolveContextualSelection({
    explicitValue: query.view,
    persistedValue: persistedView,
    validValues: LOCKER_ROOM_NAVIGATION_VIEWS,
    fallbackValue: "roster",
  }).value;
  const routeDataReady =
    hasHydrated &&
    isSeasonDataReady &&
    !teamsQuery.isLoading &&
    authStatus !== "loading";
  const storeMatches =
    persistedView === view &&
    (effectiveSeasonId === null || persistedSeasonId === effectiveSeasonId) &&
    (ownerId === null || persistedOwnerId === ownerId);

  useEffect(() => {
    if (!routeDataReady || !navigation.shouldSyncCurrentUrl) return;
    if (persistedView !== view) setView(view);
    if (effectiveSeasonId && persistedSeasonId !== effectiveSeasonId) {
      setSeasonId(effectiveSeasonId);
    }
    if (ownerId && persistedOwnerId !== ownerId) setOwnerId(ownerId);
    const canonicalHref = buildLockerRoomNavigationHref(navigation.search, {
      view,
      season: effectiveSeasonId,
      owner: ownerId,
    });
    if (navigation.currentHref !== canonicalHref) {
      navigation.replace(canonicalHref);
    }
  }, [
    effectiveSeasonId,
    navigation,
    ownerId,
    persistedOwnerId,
    persistedSeasonId,
    persistedView,
    routeDataReady,
    setOwnerId,
    setSeasonId,
    setView,
    view,
  ]);

  const selectView = useCallback(
    (nextView: LockerRoomNavigationView) => {
      if (!isLockerRoomNavigationView(nextView)) return;
      const href = buildLockerRoomNavigationHref(navigation.search, {
        view: nextView,
        season: effectiveSeasonId,
        owner: ownerId,
      });
      navigation.push(href, () => setView(nextView));
    },
    [effectiveSeasonId, navigation, ownerId, setView],
  );
  const selectOwner = useCallback(
    (nextOwnerId: string) => {
      const href = buildLockerRoomNavigationHref(navigation.search, {
        view,
        season: effectiveSeasonId,
        owner: nextOwnerId,
      });
      navigation.push(href, () => setOwnerId(nextOwnerId));
    },
    [effectiveSeasonId, navigation, setOwnerId, view],
  );

  return {
    isReady: routeDataReady && storeMatches,
    selectedOwnerId: ownerId,
    selectedSeasonId: effectiveSeasonId,
    selectedView: view,
    selectOwner,
    selectView,
  };
}

export function useLeagueOfficeContextNavigation() {
  const navigation = useContextualRouter();
  const { hasHydrated } = useNavigationHydration();
  const { session, status } = useAuthSession();
  const query = useMemo(
    () => readContextualNavigationQuery(navigation.search),
    [navigation.search],
  );
  const persistedView = useNavStore((state) => state.selectedLeagueOfficeType);
  const setView = useNavStore((state) => state.setLeagueOfficeType);
  const setSeasonId = useNavStore((state) => state.setSeasonId);
  const isMockDraftPage = navigation.pathname === "/leagueoffice/mock-draft";
  const validViews = getLeagueOfficeNavigationViews(session?.user.role);
  const view = resolveContextualSelection({
    explicitValue: isMockDraftPage ? null : query.view,
    persistedValue: isMockDraftPage ? "draft" : persistedView,
    validValues: validViews,
    fallbackValue: "draft",
  }).value;
  const { effectiveSeasonId, isSeasonDataReady, persistedSeasonId } =
    useResolvedSeasonId(query.season);
  const routeDataReady =
    hasHydrated && isSeasonDataReady && status !== "loading";
  const storeMatches = isMockDraftPage
    ? persistedView === "mockDraft" &&
      (effectiveSeasonId === null || persistedSeasonId === effectiveSeasonId)
    : persistedView === view &&
      (effectiveSeasonId === null || persistedSeasonId === effectiveSeasonId);

  useEffect(() => {
    if (!routeDataReady || !navigation.shouldSyncCurrentUrl) return;
    if (effectiveSeasonId && persistedSeasonId !== effectiveSeasonId) {
      setSeasonId(effectiveSeasonId);
    }
    if (isMockDraftPage) {
      if (persistedView !== "mockDraft") setView("mockDraft");
      return;
    }
    if (persistedView !== view) setView(view);
    const canonicalHref = buildLeagueOfficeNavigationHref(navigation.search, {
      view,
      season: effectiveSeasonId,
    });
    if (navigation.currentHref !== canonicalHref) {
      navigation.replace(canonicalHref);
    }
  }, [
    effectiveSeasonId,
    isMockDraftPage,
    navigation,
    persistedSeasonId,
    persistedView,
    routeDataReady,
    setSeasonId,
    setView,
    view,
  ]);

  const selectView = useCallback(
    (nextView: LeagueOfficeNavigationView | "mockDraft") => {
      if (nextView === "mockDraft") {
        navigation.push(
          buildContextualNavigationHref(
            "/leagueoffice/mock-draft",
            navigation.search,
            { season: effectiveSeasonId },
          ),
          () => setView("mockDraft"),
        );
        return;
      }
      if (!validViews.includes(nextView)) return;
      const href = buildLeagueOfficeNavigationHref(navigation.search, {
        view: nextView,
        season: effectiveSeasonId,
      });
      navigation.push(href, () => setView(nextView));
    },
    [effectiveSeasonId, navigation, setView, validViews],
  );

  return {
    isMockDraftPage,
    isReady: routeDataReady && storeMatches,
    selectedSeasonId: effectiveSeasonId,
    selectedView: isMockDraftPage ? ("mockDraft" as const) : view,
    selectView,
  };
}

export function useDraftTeamsContextNavigation({
  excludedOwnerId,
  isLoading,
  teams,
}: {
  excludedOwnerId?: string | null;
  isLoading: boolean;
  teams: readonly GSHLTeam[];
}) {
  const navigation = useContextualRouter();
  const { hasHydrated } = useNavigationHydration();
  const query = useMemo(
    () => readContextualNavigationQuery(navigation.search),
    [navigation.search],
  );
  const persistedOwnerId = useNavStore((state) => state.selectedOwnerId);
  const setOwnerId = useNavStore((state) => state.setOwnerId);
  const isTeamsPage =
    navigation.pathname === "/draft/teams" ||
    navigation.pathname.startsWith("/draft/teams/");
  const selectableTeams = useMemo(
    () =>
      teams
        .filter(
          (team) =>
            !excludedOwnerId ||
            String(team.ownerId) !== String(excludedOwnerId),
        )
        .sort((left, right) =>
          String(left.name ?? "").localeCompare(String(right.name ?? "")),
        ),
    [excludedOwnerId, teams],
  );
  const validOwnerIds = useMemo(
    () => uniqueOwnerIds(selectableTeams),
    [selectableTeams],
  );
  const ownerId = resolveId(
    query.owner,
    persistedOwnerId,
    validOwnerIds,
    validOwnerIds[0] ?? null,
  );
  const routeDataReady = !isTeamsPage || (hasHydrated && !isLoading);
  const storeMatches =
    !isTeamsPage || ownerId === null || persistedOwnerId === ownerId;

  useEffect(() => {
    if (!isTeamsPage || !routeDataReady || !navigation.shouldSyncCurrentUrl) {
      return;
    }
    if (ownerId && persistedOwnerId !== ownerId) setOwnerId(ownerId);
    const canonicalHref = buildDraftTeamsNavigationHref(
      navigation.search,
      ownerId,
    );
    if (navigation.currentHref !== canonicalHref) {
      navigation.replace(canonicalHref);
    }
  }, [
    isTeamsPage,
    navigation,
    ownerId,
    persistedOwnerId,
    routeDataReady,
    setOwnerId,
  ]);

  const selectOwner = useCallback(
    (nextOwnerId: string) => {
      const href = buildDraftTeamsNavigationHref(
        navigation.search,
        nextOwnerId,
      );
      navigation.push(href, () => setOwnerId(nextOwnerId));
    },
    [navigation, setOwnerId],
  );

  return {
    draftHref: buildContextualNavigationHref("/draft", navigation.search, {}),
    isReady: routeDataReady && storeMatches,
    isTeamsPage,
    selectableTeams,
    selectedOwnerId: ownerId,
    selectOwner,
    myTeamHref: buildContextualNavigationHref(
      "/draft/my-team",
      navigation.search,
      {},
    ),
    teamsHref: buildDraftTeamsNavigationHref(navigation.search, ownerId),
  };
}
