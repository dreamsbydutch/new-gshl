import {
  readContextualNavigationQuery,
  resolveMatchupBackHref,
} from "./contextual-navigation";

export type AppShellNavId =
  | "home"
  | "schedule"
  | "standings"
  | "rulebook"
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
          ? "Back to League news"
          : "Back to Matchups";
    return {
      title: "Matchup",
      activeNavId: query.from === "lockerroom" ? "lockerroom" : "schedule",
      backHref,
      backLabel,
    };
  }

  if (pathname.startsWith("/headlines/")) {
    return {
      title: "League news",
      activeNavId: "more",
      backHref: "/headlines",
      backLabel: "Back to League news",
    };
  }

  if (pathname === "/leagueoffice/mock-draft") {
    return {
      title: "Mock draft",
      activeNavId: "more",
      backHref: "/stats",
      backLabel: "Back to Stats",
    };
  }

  if (pathname === "/draft/my-team") {
    return {
      title: "Draft: My Team",
      activeNavId: "more",
      backHref: "/draft",
      backLabel: "Back to Draft Board",
    };
  }

  if (pathname === "/draft/teams" || pathname.startsWith("/draft/teams/")) {
    return {
      title: "Draft: Teams",
      activeNavId: "more",
      backHref: "/draft",
      backLabel: "Back to Draft Board",
    };
  }

  if (pathname === "/teams")
    return { title: "Teams", activeNavId: "lockerroom" };
  if (pathname === "/activity")
    return { title: "League activity", activeNavId: "home" };
  if (pathname === "/") return { title: "Home", activeNavId: "home" };
  if (isRoute(pathname, "/schedule")) {
    return { title: "Matchups", activeNavId: "schedule" };
  }
  if (isRoute(pathname, "/standings")) {
    return { title: "Standings", activeNavId: "standings" };
  }
  if (isRoute(pathname, "/records")) {
    return { title: "Records", activeNavId: "more" };
  }
  if (isRoute(pathname, "/lockerroom")) {
    return { title: "My Team", activeNavId: "lockerroom" };
  }
  if (isRoute(pathname, "/headlines")) {
    return { title: "League news", activeNavId: "more" };
  }
  if (isRoute(pathname, "/rulebook") || isRoute(pathname, "/rules")) {
    return { title: "Rulebook", activeNavId: "rulebook" };
  }
  if (isRoute(pathname, "/league"))
    return { title: "League", activeNavId: "more" };
  if (isRoute(pathname, "/stats") || isRoute(pathname, "/players"))
    return { title: "Stats", activeNavId: "more" };
  if (isRoute(pathname, "/leagueoffice")) {
    const view = readContextualNavigationQuery(search).view;
    return {
      title:
        view === "freeAgents"
          ? "Free agency"
          : view === "performances"
            ? "Historical stats"
            : view === "ownerRankings"
              ? "Owner history"
              : view === "confBattle"
                ? "Conference challenge"
                : "Draft classes",
      activeNavId: "more",
    };
  }
  if (pathname.startsWith("/nhl/matchup/"))
    return {
      title: "NHL matchup",
      activeNavId: "schedule",
      backHref: "/schedule?view=nhl",
      backLabel: "Back to NHL schedule",
    };
  if (isRoute(pathname, "/notifications"))
    return { title: "Notifications", activeNavId: "more" };
  if (isRoute(pathname, "/admin")) {
    return { title: "Admin", activeNavId: "more" };
  }
  if (pathname === "/nhl") {
    return { title: "NHL Explorer", activeNavId: "more" };
  }
  if (isRoute(pathname, "/draft") || isRoute(pathname, "/draftboard")) {
    return { title: "Draft hub", activeNavId: "more" };
  }
  if (isRoute(pathname, "/signin")) {
    return { title: "Sign in", activeNavId: null };
  }

  return { title: "GSHL", activeNavId: null };
}
