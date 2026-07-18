"use client";

import { useState } from "react";
import type { GSHLTeam, UseScheduleDataEnhancedMatchup } from "@gshl-types";
import { resolveMatchupCategories } from "@gshl-utils";
import { TeamScheduleHeader } from "../schedule/TeamScheduleHeader";
import { TeamScheduleItem } from "../schedule/TeamScheduleItem";

export function HistoryMatchupList({
  rows,
  teams,
  teamInfo,
}: {
  rows: Array<{
    matchup: UseScheduleDataEnhancedMatchup;
    showSeasonDivider: boolean;
  }>;
  teams: GSHLTeam[];
  teamInfo: GSHLTeam;
}) {
  const [expandedMatchupId, setExpandedMatchupId] = useState<string | null>(
    null,
  );

  return (
    <div className="mx-2 mb-40 mt-8">
      <TeamScheduleHeader />
      <div>
        {rows.map(({ matchup, showSeasonDivider }, index) => {
          const historicalTeam = teams.find(
            (team) =>
              team.ownerId === teamInfo.ownerId &&
              (team.id === matchup.homeTeamId ||
                team.id === matchup.awayTeamId),
          );

          if (!historicalTeam) return null;

          return (
            <div key={`matchup-${matchup.id}-${index}`}>
              {index === 0 || showSeasonDivider ? (
                <div className="border-b border-slate-300 bg-slate-100 px-3 py-2 font-varela text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                  {matchup.season?.name ?? "Previous season"}
                </div>
              ) : null}
              <TeamScheduleItem
                matchup={matchup}
                week={matchup.week}
                teams={teams}
                selectedTeamId={historicalTeam.id}
                categories={resolveMatchupCategories(
                  matchup.season?.categories,
                )}
                isExpanded={expandedMatchupId === matchup.id}
                onToggle={() =>
                  setExpandedMatchupId((current) =>
                    current === matchup.id ? null : matchup.id,
                  )
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
