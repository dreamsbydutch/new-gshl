"use client";

import { Suspense } from "react";
import { useNav } from "@gshl-hooks";
import { WeeklySchedule } from "@gshl-components/league/WeeklySchedule";
import { TeamSchedule } from "@gshl-components/team/TeamSchedule";
import { ScheduleSkeleton } from "@gshl-skeletons";

export function ScheduleContent() {
  const { selectedScheduleType: scheduleType } = useNav();

  return (
    <div className="mx-auto max-w-2xl">
      <Suspense fallback={<ScheduleSkeleton />}>
        {scheduleType === "week" && <WeeklySchedule />}
        {(scheduleType === "team" || !scheduleType) && <TeamSchedule />}
      </Suspense>
    </div>
  );
}
