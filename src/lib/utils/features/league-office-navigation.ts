export const DEFAULT_LEAGUE_OFFICE_VIEW = "draft";

const MEMBER_LEAGUE_OFFICE_VIEWS = new Set([
  "draft",
  "freeAgents",
  "rules",
  "confBattle",
  "ownerRankings",
]);

const COMMISSIONER_LEAGUE_OFFICE_VIEWS = new Set([
  "contracts",
  "users",
  "jobs",
  "newsroom",
  "imageUpload",
]);

/** Returns a route-renderable League Office view for the current role. */
export function resolveLeagueOfficeView(
  selectedView: string | null | undefined,
  role: string | null | undefined,
): string {
  if (selectedView && MEMBER_LEAGUE_OFFICE_VIEWS.has(selectedView)) {
    return selectedView;
  }
  if (
    role === "commissioner" &&
    selectedView &&
    COMMISSIONER_LEAGUE_OFFICE_VIEWS.has(selectedView)
  ) {
    return selectedView;
  }
  return DEFAULT_LEAGUE_OFFICE_VIEW;
}
