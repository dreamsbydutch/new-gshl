/**
 * Navigation Utilities
 *
 * Helper components that provide common navigation functionality across the app.
 */

import { useNavigationReset } from "@gshl-hooks";
import { ClickableNavItem } from "./BaseComponents";

/**
 * Navigation reset button component
 * @returns Clickable button that resets all navigation state to defaults
 */
export function NavResetButton() {
  const resetNavigation = useNavigationReset();

  return (
    <ClickableNavItem
      id="nav-reset"
      label="Reset"
      onClick={resetNavigation}
      className="text-red-600 hover:bg-red-50 hover:text-red-800"
    />
  );
}
