/**
 * Navigation Utilities
 *
 * Helper components that provide common navigation functionality across the app.
 */

import { useNavStore } from "@gshl-cache";
import { cn } from "@gshl-utils";
import { ClickableNavItem } from "./BaseComponents";

/**
 * Navigation reset button component
 * @returns Clickable button that resets all navigation state to defaults
 */
export function NavResetButton() {
  const resetNavigation = useNavStore((state) => state.resetNavigation);

  return (
    <ClickableNavItem
      id="nav-reset"
      label="Reset"
      onClick={resetNavigation}
      className="text-red-600 hover:bg-red-50 hover:text-red-800"
    />
  );
}
