/**
 * Input Component
 * ---------------
 * Styled wrapper around the native input element for consistent forms.
 */

import * as React from "react";
import { cn } from "@gshl-utils";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Text input element with Tailwind styling.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
