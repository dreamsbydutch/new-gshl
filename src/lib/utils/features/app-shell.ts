import {
  readContextualNavigationQuery,
  resolveMatchupBackHref,
} from "./contextual-navigation";

export type AppShellNavId =
  | "home"
  | "schedule"
  | "standings"
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
      activeNavId: "schedule",
      backHref,
      backLabel,
    };
  }

  if (pathname.startsWith("/headlines/")) {
    return {
      title: "Press Box",
      activeNavId: "more",
      backHref: "/headlines",
      backLabel: "Back to Press Box",
    };
  }

  if (pathname === "/leagueoffice/mock-draft") {
    return {
      title: "Mock Draft",
      activeNavId: "more",
      backHref: "/leagueoffice",
      backLabel: "Back to League Office",
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

  if (pathname === "/") return { title: "Home", activeNavId: "home" };
  if (isRoute(pathname, "/schedule")) {
    return { title: "Schedule", activeNavId: "schedule" };
  }
  if (isRoute(pathname, "/standings")) {
    return { title: "Standings", activeNavId: "standings" };
  }
  if (isRoute(pathname, "/lockerroom")) {
    return { title: "My Team", activeNavId: "lockerroom" };
  }
  if (isRoute(pathname, "/headlines")) {
    return { title: "Press Box", activeNavId: "more" };
  }
  if (isRoute(pathname, "/rulebook") || isRoute(pathname, "/rules")) {
    return { title: "Rulebook", activeNavId: "more" };
  }
  if (isRoute(pathname, "/leagueoffice")) {
    return { title: "League Office", activeNavId: "more" };
  }
  if (isRoute(pathname, "/draft") || isRoute(pathname, "/draftboard")) {
    return { title: "Draft Hub", activeNavId: "more" };
  }
  if (isRoute(pathname, "/signin")) {
    return { title: "Sign in", activeNavId: null };
  }

  return { title: "GSHL", activeNavId: null };
}
