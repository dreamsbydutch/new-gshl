import type { LeagueOfficeNavigationView } from "@gshl-types";
import {
  MEMBER_LEAGUE_OFFICE_NAVIGATION_VIEWS,
  resolveContextualSelection,
} from "./contextual-navigation";

export const DEFAULT_LEAGUE_OFFICE_VIEW = "draft";

/** Returns a renderable member view, using Draft Classes for invalid selections. */
export function resolveLeagueOfficeView(
  selectedView: string | null | undefined,
): LeagueOfficeNavigationView {
  return resolveContextualSelection({
    explicitValue: selectedView ?? null,
    persistedValue: null,
    validValues: MEMBER_LEAGUE_OFFICE_NAVIGATION_VIEWS,
    fallbackValue: DEFAULT_LEAGUE_OFFICE_VIEW,
  }).value;
}
