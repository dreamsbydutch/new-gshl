import {
  readContextualNavigationQuery,
  resolveMatchupBackHref,
} from "./contextual-navigation";

export type AppShellNavId =
  | "home"
  | "league"
  | "players"
  | "lockerroom"
  | "more";

export interface AppShellRouteContext {
  title: string;
  activeNavId: AppShellNavId | null;
  backHref?: string;
  backLabel?: string;
}

function isRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function calculatePageScrollProgress(
  scrollTop: number,
  scrollHeight: number,
  viewportHeight: number,
): number {
  const scrollableHeight = Math.max(0, scrollHeight - viewportHeight);
  if (scrollableHeight === 0) return 0;

  const progress = (scrollTop / scrollableHeight) * 100;
  return Math.round(Math.min(100, Math.max(0, progress)));
}

/**
 * Resolves global shell state without coupling navigation components to the
 * App Router. More-specific child routes must be checked before their parent.
 */
export function getAppShellRouteContext(
  pathname: string,
  search = "",
): AppShellRouteContext {
  if (pathname.startsWith("/matchup/")) {
    const query = readContextualNavigationQuery(search);
    const backHref = search ? resolveMatchupBackHref(search) : "/schedule";
    const backLabel =
      query.from === "lockerroom"
        ? "Back to My Team"
        : query.from === "headlines"
          ? "Back to Press Box"
          : "Back to Schedule";
    return {
      title: "Matchup",
      activeNavId: query.from === "lockerroom" ? "lockerroom" : "league",
      backHref,
      backLabel,
    };
  }

  if (pathname.startsWith("/headlines/")) {
    return {
      title: "League news",
      activeNavId: "league",
      backHref: "/headlines",
      backLabel: "Back to Press Box",
    };
  }

  if (pathname === "/leagueoffice/mock-draft") {
    return {
      title: "Mock draft",
      activeNavId: "players",
      backHref: "/players",
      backLabel: "Back to Players",
    };
  }

  if (pathname === "/draft/my-team") {
    return {
      title: "Draft: My Team",
      activeNavId: "players",
      backHref: "/draft",
      backLabel: "Back to Draft Board",
    };
  }

  if (pathname === "/draft/teams" || pathname.startsWith("/draft/teams/")) {
    return {
      title: "Draft: Teams",
      activeNavId: "players",
      backHref: "/draft",
      backLabel: "Back to Draft Board",
    };
  }

  if (pathname === "/") return { title: "Home", activeNavId: "home" };
  if (isRoute(pathname, "/schedule")) {
    return { title: "Schedule", activeNavId: "league" };
  }
  if (isRoute(pathname, "/standings")) {
    return { title: "Standings", activeNavId: "league" };
  }
  if (isRoute(pathname, "/records")) {
    return { title: "Records", activeNavId: "league" };
  }
  if (isRoute(pathname, "/lockerroom")) {
    return { title: "My Team", activeNavId: "lockerroom" };
  }
  if (isRoute(pathname, "/headlines")) {
    return { title: "League news", activeNavId: "league" };
  }
  if (isRoute(pathname, "/rulebook") || isRoute(pathname, "/rules")) {
    return { title: "Rulebook", activeNavId: "more" };
  }
  if (isRoute(pathname, "/league"))
    return { title: "League", activeNavId: "league" };
  if (isRoute(pathname, "/players"))
    return { title: "Players", activeNavId: "players" };
  if (isRoute(pathname, "/leagueoffice")) {
    const view = readContextualNavigationQuery(search).view;
    const isLeagueView = view === "ownerRankings" || view === "confBattle";
    return {
      title: isLeagueView ? "League" : "Players",
      activeNavId: isLeagueView ? "league" : "players",
    };
  }
  if (pathname.startsWith("/nhl/matchup/"))
    return {
      title: "NHL matchup",
      activeNavId: "league",
      backHref: "/schedule?view=nhl",
      backLabel: "Back to NHL schedule",
    };
  if (isRoute(pathname, "/notifications"))
    return { title: "Notifications", activeNavId: "more" };
  if (isRoute(pathname, "/admin")) {
    return { title: "Admin", activeNavId: "more" };
  }
  if (isRoute(pathname, "/draft") || isRoute(pathname, "/draftboard")) {
    return { title: "Draft hub", activeNavId: "players" };
  }
  if (isRoute(pathname, "/signin")) {
    return { title: "Sign in", activeNavId: null };
  }

  return { title: "GSHL", activeNavId: null };
}
