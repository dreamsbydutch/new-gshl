/**
 * Secondary Toolbar Component
 *
 * Wrapper component for secondary navigation elements and toolbar controls.
 */

import { cn } from "@gshl-utils";
import type { ToolbarProps } from "@gshl-types";

/**
 * Secondary page toolbar component with consistent styling and positioning
 * @param props - Component props
 * @returns Secondary toolbar wrapper with NavContainer styling
 */
export function SecondaryPageToolbar({ children, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        "no-scrollbar mx-auto flex min-h-9 w-full items-center gap-1 overflow-x-auto overflow-y-hidden px-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
