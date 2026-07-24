/**
 * Label Component
 * ---------------
 * Accessible label element with standard spacing and typography.
 */

import * as React from "react";
import { cn } from "@gshl-utils";
import type { LabelProps } from "@gshl-types";

/**
 * Form label with Tailwind styles.
 */
export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";
