import type {
  AdminNavigationContext,
  AdminNavigationView,
  ContextualNavigationQuery,
  ContextualSelection,
  ContextualSelectionOptions,
  LeagueOfficeNavigationContext,
  LeagueOfficeNavigationView,
  LockerRoomNavigationContext,
  LockerRoomNavigationView,
  MatchupNavigationContext,
  MatchupNavigationFallback,
  MatchupNavigationSide,
  ScheduleNavigationContext,
  ScheduleNavigationView,
  StandingsNavigationContext,
  StandingsNavigationView,
} from "@gshl-types";

export const SCHEDULE_NAVIGATION_VIEWS = ["week", "team"] as const;

export const STANDINGS_NAVIGATION_VIEWS = [
  "overall",
  "conference",
  "wildcard",
  "power",
  "playoff",
  "awards",
] as const;

export const LOCKER_ROOM_NAVIGATION_VIEWS = [
  "roster",
  "salary",
  "history",
  "trophy",
  "recordbook",
  "tradeBlock",
  "draft",
] as const;

export const MEMBER_LEAGUE_OFFICE_NAVIGATION_VIEWS = [
  "draft",
  "tradeBlock",
  "freeAgents",
  "rules",
  "confBattle",
  "ownerRankings",
] as const;

export const ADMIN_NAVIGATION_VIEWS = [
  "draftPicks",
  "contracts",
  "users",
  "jobs",
  "newsroom",
  "images",
  "tv",
] as const;

export const MATCHUP_NAVIGATION_SOURCES = [
  "schedule",
  "lockerroom",
  "headlines",
] as const;

export const MATCHUP_NAVIGATION_SIDES = ["away", "home"] as const;

const CONTEXTUAL_QUERY_KEYS = [
  "view",
  "season",
  "week",
  "owner",
  "from",
  "side",
] as const;

type ContextualQueryKey = (typeof CONTEXTUAL_QUERY_KEYS)[number];
type ContextualQueryValues = Partial<Record<ContextualQueryKey, string | null>>;

function toSearchParams(search: string | URLSearchParams): URLSearchParams {
  if (typeof search !== "string") return new URLSearchParams(search);
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function cleanValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function isOneOf<T extends string>(
  value: string | null | undefined,
  values: readonly T[],
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function readContextualNavigationQuery(
  search: string | URLSearchParams,
): ContextualNavigationQuery {
  const params = toSearchParams(search);
  return {
    view: params.get("view"),
    season: params.get("season"),
    week: params.get("week"),
    owner: params.get("owner"),
    from: params.get("from"),
    side: params.get("side"),
  };
}

/**
 * Resolves an explicit URL value before persisted state. An explicitly invalid
 * value intentionally falls back to the route default instead of reopening a
 * personalized persisted selection.
 */
export function resolveContextualSelection<T extends string>({
  explicitValue,
  persistedValue,
  validValues,
  fallbackValue,
}: ContextualSelectionOptions<T>): ContextualSelection<T> {
  if (explicitValue !== null) {
    if (isOneOf(explicitValue, validValues)) {
      return { value: explicitValue, source: "url", urlWasInvalid: false };
    }
    return {
      value: fallbackValue,
      source: "default",
      urlWasInvalid: true,
    };
  }

  if (isOneOf(persistedValue, validValues)) {
    return {
      value: persistedValue,
      source: "persisted",
      urlWasInvalid: false,
    };
  }

  return {
    value: fallbackValue,
    source: "default",
    urlWasInvalid: false,
  };
}

/** Maps an unresolved data-backed selection to the store's empty sentinel. */
export function toPersistedNavigationId(value: string | null): string {
  return value ?? "";
}

/** Builds a route href while preserving query keys this feature does not own. */
export function buildContextualNavigationHref(
  pathname: string,
  currentSearch: string | URLSearchParams,
  values: ContextualQueryValues,
): string {
  const params = toSearchParams(currentSearch);
  for (const key of CONTEXTUAL_QUERY_KEYS) params.delete(key);

  for (const key of CONTEXTUAL_QUERY_KEYS) {
    const value = cleanValue(values[key]);
    if (value !== null) params.set(key, value);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function getCurrentNavigationHref(
  pathname: string,
  search: string | URLSearchParams,
): string {
  const query = toSearchParams(search).toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function isGlobalSeasonUrlPath(pathname: string): boolean {
  return pathname === "/schedule" || pathname === "/standings";
}

/** Updates the global season on routes that expose their context in the URL. */
export function buildGlobalSeasonNavigationHref(
  pathname: string,
  currentSearch: string | URLSearchParams,
  seasonId: string,
): string | null {
  const season = cleanValue(seasonId);
  if (!season || !isGlobalSeasonUrlPath(pathname)) return null;

  const params = toSearchParams(currentSearch);
  params.set("season", season);
  params.delete("week");
  return getCurrentNavigationHref(pathname, params);
}

export function buildScheduleNavigationHref(
  currentSearch: string | URLSearchParams,
  context: ScheduleNavigationContext,
): string {
  return buildContextualNavigationHref("/schedule", currentSearch, {
    view: context.view,
    season: context.season ?? null,
    week: context.view === "week" ? (context.week ?? null) : null,
    owner: context.view === "team" ? (context.owner ?? null) : null,
  });
}

export function buildStandingsNavigationHref(
  currentSearch: string | URLSearchParams,
  context: StandingsNavigationContext,
): string {
  return buildContextualNavigationHref("/standings", currentSearch, {
    view: context.view,
    season: context.season ?? null,
  });
}

export function buildLockerRoomNavigationHref(
  currentSearch: string | URLSearchParams,
  context: LockerRoomNavigationContext,
): string {
  return buildContextualNavigationHref("/lockerroom", currentSearch, {
    view: context.view,
    season: context.season ?? null,
    owner: context.owner ?? null,
  });
}

export function buildLeagueOfficeNavigationHref(
  currentSearch: string | URLSearchParams,
  context: LeagueOfficeNavigationContext,
): string {
  // Preserve old bookmarks and persisted League Office selections.
  if (context.view === "tradeBlock") {
    return buildLockerRoomNavigationHref(currentSearch, {
      view: "tradeBlock",
      owner: readContextualNavigationQuery(currentSearch).owner,
    });
  }
  return buildContextualNavigationHref("/leagueoffice", currentSearch, {
    view: context.view,
    season: context.season ?? null,
  });
}

export function buildAdminNavigationHref(
  currentSearch: string | URLSearchParams,
  context: AdminNavigationContext,
): string {
  return buildContextualNavigationHref("/admin", currentSearch, {
    view: context.view,
  });
}

export function buildDraftTeamsNavigationHref(
  currentSearch: string | URLSearchParams,
  owner: string | null | undefined,
): string {
  return buildContextualNavigationHref("/draft/teams", currentSearch, {
    owner: owner ?? null,
  });
}

export function getLeagueOfficeNavigationViews(
  _role?: string | null,
): readonly LeagueOfficeNavigationView[] {
  return MEMBER_LEAGUE_OFFICE_NAVIGATION_VIEWS;
}

export function isAdminNavigationView(
  view: string | null | undefined,
): view is AdminNavigationView {
  return Boolean(
    view && ADMIN_NAVIGATION_VIEWS.includes(view as AdminNavigationView),
  );
}

export function buildMatchupNavigationHref(
  matchupId: string,
  context: MatchupNavigationContext,
): string {
  return buildContextualNavigationHref(
    `/matchup/${encodeURIComponent(matchupId)}`,
    "",
    {
      from: context.from,
      view: context.view ?? null,
      season: context.season ?? null,
      week: context.week ?? null,
      owner: context.owner ?? null,
      side: context.side ?? null,
    },
  );
}

export function resolveMatchupNavigationSide(
  search: string | URLSearchParams,
  fallback: MatchupNavigationSide = "away",
): MatchupNavigationSide {
  const side = readContextualNavigationQuery(search).side;
  return isOneOf(side, MATCHUP_NAVIGATION_SIDES) ? side : fallback;
}

export function resolveMatchupBackHref(
  search: string | URLSearchParams,
  fallback: MatchupNavigationFallback = {},
): string {
  const query = readContextualNavigationQuery(search);
  const source = isOneOf(query.from, MATCHUP_NAVIGATION_SOURCES)
    ? query.from
    : null;

  if (source === "headlines") return "/headlines";

  if (source === "lockerroom") {
    const view = isOneOf(query.view, LOCKER_ROOM_NAVIGATION_VIEWS)
      ? query.view
      : "history";
    return buildLockerRoomNavigationHref("", {
      view,
      season: cleanValue(query.season) ?? cleanValue(fallback.season),
      owner: cleanValue(query.owner),
    });
  }

  if (source === "schedule") {
    const view = isOneOf(query.view, SCHEDULE_NAVIGATION_VIEWS)
      ? query.view
      : "week";
    return buildScheduleNavigationHref("", {
      view,
      season: cleanValue(query.season) ?? cleanValue(fallback.season),
      week: cleanValue(query.week) ?? cleanValue(fallback.week),
      owner: cleanValue(query.owner),
    });
  }

  return buildScheduleNavigationHref("", {
    view: "week",
    season: cleanValue(fallback.season),
    week: cleanValue(fallback.week),
  });
}

export function isScheduleNavigationView(
  value: string | null | undefined,
): value is ScheduleNavigationView {
  return isOneOf(value, SCHEDULE_NAVIGATION_VIEWS);
}

export function isStandingsNavigationView(
  value: string | null | undefined,
): value is StandingsNavigationView {
  return isOneOf(value, STANDINGS_NAVIGATION_VIEWS);
}

export function isLockerRoomNavigationView(
  value: string | null | undefined,
): value is LockerRoomNavigationView {
  return isOneOf(value, LOCKER_ROOM_NAVIGATION_VIEWS);
}

/** A fresh My Team visit belongs to the viewer; explicit team links take precedence. */
export function resolveLockerRoomOwnerId(
  explicitOwnerId: string | null,
  signedInOwnerId: string | null,
  persistedOwnerId: string | null | undefined,
  validOwnerIds: readonly string[],
): string | null {
  const ownOwnerId =
    signedInOwnerId && validOwnerIds.includes(signedInOwnerId)
      ? signedInOwnerId
      : null;
  const fallback = ownOwnerId ?? validOwnerIds[0] ?? null;
  if (explicitOwnerId !== null) {
    return validOwnerIds.includes(explicitOwnerId) ? explicitOwnerId : fallback;
  }
  if (ownOwnerId) return ownOwnerId;
  return persistedOwnerId && validOwnerIds.includes(persistedOwnerId)
    ? persistedOwnerId
    : fallback;
}
