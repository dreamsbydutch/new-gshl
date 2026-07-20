"use client";

import dynamic from "next/dynamic";
import { useNav } from "@gshl-hooks";
import { ScheduleSkeleton } from "@gshl-skeletons";

const WeeklySchedule = dynamic(
  () =>
    import("@gshl-components/league/WeeklySchedule").then(
      (module) => module.WeeklySchedule,
    ),
  { loading: () => <ScheduleSkeleton /> },
);
const TeamSchedule = dynamic(
  () =>
    import("@gshl-components/team/TeamSchedule").then(
      (module) => module.TeamSchedule,
    ),
  { loading: () => <ScheduleSkeleton /> },
);

export function ScheduleContent() {
  const { selectedScheduleType: scheduleType } = useNav();

  return (
    <div className="mx-auto max-w-2xl">
      {scheduleType === "week" && <WeeklySchedule />}
      {(scheduleType === "team" || !scheduleType) && <TeamSchedule />}
    </div>
  );
}
