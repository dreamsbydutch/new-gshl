/**
 * useDraftCountdown Hook
 *
 * Manages real-time countdown to the draft date with live status tracking.
 * Provides formatted countdown string and draft status (upcoming, live, past).
 *
 * @module hooks/features/useDraftCountdown
 */

import { useEffect, useState } from "react";

export interface UseDraftCountdownProps {
  /** Target draft date/time */
  draftDate: Date;
}

export interface DraftCountdownState {
  /** Current time for reactive updates */
  now: Date;
  /** Whether draft is currently live (within 3h window) */
  isLive: boolean;
  /** Whether draft has completed */
  isPast: boolean;
  /** Formatted countdown string (e.g., "2d 14h 30m 15s") or null */
  countdown: string | null;
}

/**
 * Formats a countdown number with leading zero padding
 */
function formatCountdownNumber(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Hook that provides real-time countdown to draft date
 *
 * Updates every second and calculates:
 * - Time remaining until draft
 * - Whether draft is currently live
 * - Whether draft has completed
 * - Formatted countdown string
 *
 * @example
 * ```tsx
 * const { isLive, isPast, countdown } = useDraftCountdown({
 *   draftDate: new Date("2025-10-04T20:00:00")
 * });
 * ```
 */
export function useDraftCountdown({
  draftDate,
}: UseDraftCountdownProps): DraftCountdownState {
  const [now, setNow] = useState<Date>(new Date());

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const diffMs = draftDate.getTime() - now.getTime();
  const isLive = diffMs <= 0 && diffMs > -3 * 60 * 60 * 1000; // within 3h window
  const isPast = diffMs <= -3 * 60 * 60 * 1000;

  let countdown: string | null = null;
  if (!isPast && !isLive) {
    const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    countdown = `${days}d ${formatCountdownNumber(hours)}h ${formatCountdownNumber(minutes)}m ${formatCountdownNumber(seconds)}s`;
  }

  return {
    now,
    isLive,
    isPast,
    countdown,
  };
}
