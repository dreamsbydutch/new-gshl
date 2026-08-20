/**
 * Select Component
 * ----------------
 * Lightweight wrapper for the native select element with consistent styles.
 */

import * as React from "react";
import { cn } from "@gshl-utils";
import type { SelectProps } from "@gshl-types";

/**
 * Drop-down select element styled for app forms.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, onValueChange, onChange, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      onChange?.(event);
      onValueChange?.(event.target.value);
    };

    return (
      <select
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none lg:h-10",
          className,
        )}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
Select.displayName = "Select";
