/**
 * Tertiary Toolbar Component
 *
 * Wrapper component for tertiary navigation elements and toolbar controls.
 */

import { type ReactNode } from "react";
import { cn } from "@gshl-utils";
import { NavContainer } from "./BaseComponents";

interface TertiaryPageToolbarProps {
  children: ReactNode;
  className?: string;
}

/**
 * Tertiary page toolbar component with consistent styling and positioning
 * @param props - Component props
 * @returns Tertiary toolbar wrapper with NavContainer styling
 */
export function TertiaryPageToolbar({
  children,
  className,
}: TertiaryPageToolbarProps) {
  return (
    <NavContainer
      position="tertiary"
      variant="tertiary"
      className={cn(className)}
    >
      {children}
    </NavContainer>
  );
}
