"use client";

import { useState } from "react";
import { useTeamScheduleView } from "@gshl-hooks";
import { TeamScheduleHeader } from "./schedule/TeamScheduleHeader";
import { TeamScheduleItem } from "./schedule/TeamScheduleItem";

export function TeamSchedule() {
  const { matchups, matchupCategories, selectedTeam, teams } = useTeamScheduleView();
  const [expandedMatchupId, setExpandedMatchupId] = useState<string | null>(null);

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
            categories={matchupCategories}
            isExpanded={expandedMatchupId === matchup.id}
            onToggle={() =>
              setExpandedMatchupId((current) =>
                current === matchup.id ? null : matchup.id,
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
