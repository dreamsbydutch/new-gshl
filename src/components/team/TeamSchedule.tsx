"use client";

import { useState } from "react";
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
    matchupCategories,
    selectedOwnerId,
    selectedSeasonId,
    selectedTeam,
    teams,
  } = useTeamScheduleView();
  const [expandedMatchupId, setExpandedMatchupId] = useState<string | null>(
    null,
  );

  if (isLoading) {
    return <TeamScheduleSkeleton />;
  }

  if (error) {
    return (
      <div className="mx-2 mt-4 rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
        The team schedule could not be loaded.
      </div>
    );
  }

  if (!selectedTeam) {
    return (
      <div className="mx-2 mb-8 mt-4">
        <div className="text-center text-gray-500">No team selected</div>
      </div>
    );
  }

  return (
    <div className="mx-2 mb-8 mt-4">
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
