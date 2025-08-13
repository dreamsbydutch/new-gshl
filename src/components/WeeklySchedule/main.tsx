"use client";

import { ScheduleHeader, WeekScheduleItem } from "./components";
import { useWeeklyScheduleData } from "./hooks";

export function WeeklySchedule() {
  const { matchups, teams } = useWeeklyScheduleData();

  return (
    <div className="mx-2 mb-40 mt-4">
      <ScheduleHeader />
      <div>
        {matchups.map((matchup) => (
          <WeekScheduleItem
            key={`week-${matchup.id}`}
            matchup={matchup}
            teams={teams}
          />
        ))}
      </div>
    </div>
  );
}
