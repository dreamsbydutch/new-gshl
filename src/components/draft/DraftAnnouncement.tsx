"use client";

/**
 * DraftAnnouncement Component
 *
 * Displays a hero-style banner with live countdown to the draft date.
 * Shows different states: countdown (before draft), live indicator (during draft),
 * and completion message (after draft). Features animated gradient backgrounds
 * and real-time countdown timer.
 *
 * Features:
 * - Real-time countdown with days, hours, minutes, seconds
 * - Live status indicator when draft is active
 * - Completion message after draft ends
 * - Animated gradient background effects
 * - Responsive design with mobile optimization
 *
 * @example
 * ```tsx
 * <DraftAnnouncement />
 * ```
 */

import { useDraftCountdown } from "@gshl-hooks";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * AnnouncementBadge Component
 *
 * Decorative badge with animated dots indicating league announcement
 */
const AnnouncementBadge = () => (
  <div className="flex items-center gap-2">
    <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
      <span className="h-2 w-2 rounded-full bg-amber-400" />
      <span className="h-2 w-2 rounded-full bg-amber-400" />
      League Announcement
      <span className="h-2 w-2 rounded-full bg-amber-400" />
      <span className="h-2 w-2 rounded-full bg-amber-400" />
    </span>
  </div>
);

/**
 * LiveIndicator Component
 *
 * Animated indicator shown when draft is currently active
 */
const LiveIndicator = () => (
  <p className="animate-bounce text-2xl font-bold text-amber-300 drop-shadow-sm">
    Draft is LIVE!
  </p>
);

/**
 * CompletionMessage Component
 *
 * Message shown after draft has completed
 */
const CompletionMessage = () => (
  <p className="text-sm font-medium text-white/80">
    Draft completed. Good luck this season!
  </p>
);

/**
 * CountdownDisplay Component
 *
 * Displays formatted countdown timer with label
 */
const CountdownDisplay = ({ countdown }: { countdown: string }) => (
  <div className="mt-2 flex flex-col items-center">
    <span className="text-xs uppercase tracking-widest text-white/60">
      Starts In
    </span>
    <div className="mt-1 rounded-md bg-black/30 px-4 py-2 font-mono text-lg font-semibold text-amber-200 shadow-inner ring-1 ring-white/10">
      {countdown}
    </div>
  </div>
);

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function DraftAnnouncement() {
  const draftDate = new Date("2025-10-04T20:00:00"); // Local time
  const { isLive, isPast, countdown } = useDraftCountdown({ draftDate });

  return (
    <section
      aria-labelledby="draft-announcement-title"
      className="relative mx-auto mt-8 w-full max-w-5xl overflow-hidden rounded-xl border border-primary/50 bg-gradient-to-br from-primary/90 via-primary to-primary/80 p-8 text-center shadow-xl ring-2 ring-primary/40"
    >
      {/* moving gradient sheen */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
      <div className="pointer-events-none absolute -inset-1 animate-pulse bg-[linear-gradient(120deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0)_30%,rgba(255,255,255,0.12)_60%)] bg-[length:300%_100%] mix-blend-overlay" />

      <div className="relative flex flex-col items-center gap-2">
        <AnnouncementBadge />

        <h1
          id="draft-announcement-title"
          className="bg-gradient-to-br from-white via-white to-amber-200 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent drop-shadow-sm md:text-5xl"
        >
          2025 GSHL Draft
        </h1>

        <p className="text-lg font-medium text-white/90 md:text-xl">
          October 4th @ 8:00 PM
        </p>

        {isLive && <LiveIndicator />}
        {isPast && <CompletionMessage />}
        {countdown && <CountdownDisplay countdown={countdown} />}
      </div>
    </section>
  );
}

export default DraftAnnouncement;
