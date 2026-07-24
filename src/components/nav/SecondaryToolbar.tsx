/**
 * Secondary Toolbar Component
 *
 * Wrapper component for secondary navigation elements and toolbar controls.
 */

import { cn } from "@gshl-utils";
import type { ToolbarProps } from "@gshl-types";
import { NavContainer } from "./BaseComponents";

/**
 * Secondary page toolbar component with consistent styling and positioning
 * @param props - Component props
 * @returns Secondary toolbar wrapper with NavContainer styling
 */
export function SecondaryPageToolbar({ children, className }: ToolbarProps) {
  return (
    <NavContainer
      position="secondary"
      variant="secondary"
      className={cn(className)}
    >
      {children}
    </NavContainer>
  );
}
