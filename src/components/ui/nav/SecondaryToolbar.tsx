/**
 * Secondary Toolbar Component
 *
 * Wrapper component for secondary navigation elements and toolbar controls.
 */

import { type ReactNode } from "react";
import { cn } from "@gshl-utils";
import { NavContainer } from "./BaseComponents";

interface SecondaryPageToolbarProps {
  children: ReactNode;
  className?: string;
}

/**
 * Secondary page toolbar component with consistent styling and positioning
 * @param props - Component props
 * @returns Secondary toolbar wrapper with NavContainer styling
 */
export function SecondaryPageToolbar({
  children,
  className,
}: SecondaryPageToolbarProps) {
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
