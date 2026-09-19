import type { AdminNavigationView } from "@gshl-types";
import { ADMIN_NAVIGATION_VIEWS } from "./contextual-navigation";

export const DEFAULT_ADMIN_VIEW: AdminNavigationView = "contracts";

export function resolveAdminView(
  selectedView: string | null | undefined,
): AdminNavigationView {
  return selectedView &&
    ADMIN_NAVIGATION_VIEWS.includes(selectedView as AdminNavigationView)
    ? (selectedView as AdminNavigationView)
    : DEFAULT_ADMIN_VIEW;
}

export function resolveLegacyLeagueOfficeAdminView(
  selectedView: string | null | undefined,
): AdminNavigationView | null {
  if (selectedView === "imageUpload") return "images";
  return selectedView &&
    ADMIN_NAVIGATION_VIEWS.includes(selectedView as AdminNavigationView)
    ? (selectedView as AdminNavigationView)
    : null;
}
