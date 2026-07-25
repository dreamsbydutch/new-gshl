"use client";

import dynamic from "next/dynamic";
import { useNav } from "@gshl-hooks";
import { TeamScheduleSkeleton, WeeklyScheduleSkeleton } from "@gshl-skeletons";

const WeeklySchedule = dynamic(
  () =>
    import("@gshl-components/league/WeeklySchedule").then(
      (module) => module.WeeklySchedule,
    ),
  { loading: () => <WeeklyScheduleSkeleton /> },
);
const TeamSchedule = dynamic(
  () =>
    import("@gshl-components/team/TeamSchedule").then(
      (module) => module.TeamSchedule,
    ),
  { loading: () => <TeamScheduleSkeleton /> },
);

export function ScheduleContent() {
  const { selectedScheduleType: scheduleType } = useNav();
  const isTeamSchedule = scheduleType === "team" || !scheduleType;

  return (
    <div
      className={`mx-auto w-full ${isTeamSchedule ? "max-w-5xl" : "max-w-2xl"}`}
    >
      {scheduleType === "week" && <WeeklySchedule />}
      {isTeamSchedule && <TeamSchedule />}
    </div>
  );
}
