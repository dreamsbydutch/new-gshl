"use client";

import { TeamScheduleHeader, TeamScheduleItem } from "./components";
import { useTeamScheduleData } from "./hooks";

export function TeamSchedule() {
  const { selectedTeam, matchups, teams } = useTeamScheduleData();

  if (!selectedTeam) {
    return (
      <div className="mx-2 mb-40 mt-4">
        <div className="text-center text-gray-500">No team selected</div>
      </div>
    );
  }

  return (
    <div className="mx-2 mb-40 mt-4">
      <TeamScheduleHeader />
      <div>
        {matchups.map(({ matchup, week }) => (
          <TeamScheduleItem
            key={`team-${matchup.id}`}
            matchup={matchup}
            week={week}
            teams={teams}
            selectedTeamId={selectedTeam.id}
          />
        ))}
      </div>
    </div>
  );
}