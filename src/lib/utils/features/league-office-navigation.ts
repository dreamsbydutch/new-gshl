export const DEFAULT_LEAGUE_OFFICE_VIEW = "draft";

const MEMBER_LEAGUE_OFFICE_VIEWS = new Set([
  "draft",
  "tradeBlock",
  "freeAgents",
  "rules",
  "confBattle",
  "ownerRankings",
]);

/** Returns a route-renderable League Office view for the current role. */
export function resolveLeagueOfficeView(
  selectedView: string | null | undefined,
  _role?: string | null,
): string {
  if (selectedView && MEMBER_LEAGUE_OFFICE_VIEWS.has(selectedView)) {
    return selectedView;
  }
  return DEFAULT_LEAGUE_OFFICE_VIEW;
}
