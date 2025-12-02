"use client";

import { Suspense } from "react";
import { useNavStore } from "@gshl-cache";
import { WeeklySchedule } from "@gshl-components/league/WeeklySchedule";
import { TeamSchedule } from "@gshl-components/team/TeamSchedule";
import { ScheduleSkeleton } from "@gshl-skeletons";

/**
 * Client-side schedule page component.
 *
 * @description
 * Simple page that renders either WeeklySchedule or TeamSchedule based on
 * user selection from the navigation store. Data is prefetched on the server
 * and hydrated automatically via tRPC.
 *
 * @features
 * - Dynamic view switching (week/team)
 * - Server-prefetched data
 * - Suspense boundaries for loading states
 */
export default function SchedulePage() {
  const scheduleType = useNavStore((state) => state.selectedScheduleType);

  return (
    <div className="mx-auto max-w-2xl">
      <Suspense fallback={<ScheduleSkeleton />}>
        {scheduleType === "week" && <WeeklySchedule />}
        {(scheduleType === "team" || !scheduleType) && <TeamSchedule />}
      </Suspense>
    </div>
  );
}
