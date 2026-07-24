/**
 * Tertiary Toolbar Component
 *
 * Wrapper component for tertiary navigation elements and toolbar controls.
 */

import { cn } from "@gshl-utils";
import type { ToolbarProps } from "@gshl-types";
import { NavContainer } from "./BaseComponents";

/**
 * Tertiary page toolbar component with consistent styling and positioning
 * @param props - Component props
 * @returns Tertiary toolbar wrapper with NavContainer styling
 */
export function TertiaryPageToolbar({ children, className }: ToolbarProps) {
  return (
    <NavContainer
      position="tertiary"
      variant="tertiary"
      className={cn("justify-start", className)}
    >
      <div className="no-scrollbar flex w-full flex-row items-stretch gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap px-2">
        {children}
      </div>
    </NavContainer>
  );
}
