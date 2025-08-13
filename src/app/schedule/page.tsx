"use client";

import { useNavStore } from "@gshl-cache";
import { WeeklySchedule } from "@gshl-components/WeeklySchedule";
import { TeamSchedule } from "@gshl-components/TeamSchedule";

export default function Schedule() {
  const scheduleType = useNavStore((state) => state.selectedScheduleType);

  return (
    <div className="mx-2 mb-40 mt-4">
      {scheduleType === "week" && <WeeklySchedule />}
      {(scheduleType === "team" || !scheduleType) && <TeamSchedule />}
    </div>
  );
}
