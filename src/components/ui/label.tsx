/**
 * Label Component
 * ---------------
 * Accessible label element with standard spacing and typography.
 */

import * as React from "react";
import { cn } from "@gshl-utils";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {}

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
