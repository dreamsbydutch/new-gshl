"use client";

import { useTeamScheduleView } from "@gshl-hooks";
import { TeamScheduleSkeleton } from "@gshl-skeletons";
import { TeamScheduleHeader } from "./schedule/TeamScheduleHeader";
import { TeamScheduleItem } from "./schedule/TeamScheduleItem";
import { buildMatchupNavigationHref } from "@gshl-utils";

export function TeamSchedule() {
  const {
    error,
    isLoading,
    matchups,
    selectedOwnerId,
    selectedSeasonId,
    selectedTeam,
    teams,
  } = useTeamScheduleView();

  if (isLoading) {
    return <TeamScheduleSkeleton />;
  }

  if (error) {
    return (
      <div className="my-2 border-b border-rose-200 py-3 text-center text-sm text-rose-700">
        The team schedule could not be loaded.
      </div>
    );
  }

  if (!selectedTeam) {
    return (
      <div className="my-2">
        <div className="text-center text-gray-500">No team selected</div>
      </div>
    );
  }

  return (
    <div className="my-2">
      <TeamScheduleHeader />
      <div>
        {matchups.map(({ matchup, week }) => (
          <TeamScheduleItem
            key={`team-${matchup.id}`}
            matchup={matchup}
            week={week}
            teams={teams}
            selectedTeamId={selectedTeam.id}
            matchupHref={buildMatchupNavigationHref(String(matchup.id), {
              from: "schedule",
              view: "team",
              season: selectedSeasonId,
              owner: selectedOwnerId,
              side:
                String(matchup.homeTeamId) === String(selectedTeam.id)
                  ? "home"
                  : "away",
            })}
          />
        ))}
      </div>
    </div>
  );
}
