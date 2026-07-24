/**
 * Loading Spinner Component
 *
 * Simple animated loading spinner with customizable styling.
 */

import { cn } from "@gshl-utils";

/**
 * Loading spinner component with animation
 * @param props - Component props with optional className
 * @returns Animated loading spinner
 */
export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "m-auto h-10 w-10 animate-spin place-self-center rounded-full border border-solid border-gray-500 border-t-transparent shadow-md",
        className,
      )}
    ></div>
  );
}
