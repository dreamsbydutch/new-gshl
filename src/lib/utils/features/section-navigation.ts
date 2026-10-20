/** Keeps legacy feature URLs reachable under the new task-based navigation. */
export function getSectionNavigation(
  section: "league" | "players",
  pathname: string,
  search: string,
  selectedSeasonId?: string | null,
) {
  const query = new URLSearchParams(search);
  const view = query.get("view");
  const season = query.get("season") ?? selectedSeasonId;
  const seasonQuery = season ? `&season=${encodeURIComponent(season)}` : "";
  if (section === "league") {
    return [
      {
        label: "Overview",
        href: season
          ? `/league?season=${encodeURIComponent(season)}`
          : "/league",
        active:
          pathname === "/league" ||
          (pathname === "/leagueoffice" &&
            (view === "ownerRankings" || view === "confBattle")),
      },
      {
        label: "Schedule",
        href: `/schedule?view=week${seasonQuery}`,
        active:
          pathname === "/schedule" ||
          pathname.startsWith("/matchup/") ||
          pathname.startsWith("/nhl/matchup/"),
      },
      {
        label: "Standings",
        href: `/standings?view=overall${seasonQuery}`,
        active: pathname === "/standings",
      },
      {
        label: "Records",
        href: "/records",
        active: pathname === "/records",
      },
      {
        label: "News",
        href: "/headlines",
        active: pathname === "/headlines" || pathname.startsWith("/headlines/"),
      },
    ];
  }
  return [
    {
      label: "Research",
      href: "/players",
      active:
        pathname === "/players" ||
        (pathname === "/leagueoffice" && view === "performances"),
    },
    {
      label: "Free agency",
      href: "/leagueoffice?view=freeAgents",
      active: pathname === "/leagueoffice" && view === "freeAgents",
    },
    {
      label: "Draft classes",
      href: "/leagueoffice?view=draft",
      active:
        pathname === "/leagueoffice/mock-draft" ||
        (pathname === "/leagueoffice" && (!view || view === "draft")),
    },
    {
      label: "Draft hub",
      href: "/draft",
      active:
        pathname === "/draft" ||
        pathname.startsWith("/draft/") ||
        pathname === "/draftboard",
    },
  ];
}
