"use client";

import { Suspense } from "react";
import { useNavStore } from "@gshl-cache";
import { WeeklySchedule } from "@gshl-components/league/WeeklySchedule";
import { TeamSchedule } from "@gshl-components/team/TeamSchedule";
import { ScheduleSkeleton } from "@gshl-skeletons";

export function ScheduleContent() {
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
