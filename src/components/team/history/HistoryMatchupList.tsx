"use client";

import type { GSHLTeam, UseScheduleDataEnhancedMatchup } from "@gshl-types";
import { HistoryMatchupCard } from "./HistoryMatchupCard";

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
  return (
    <div className="mx-2 my-8 flex flex-col gap-2">
      {rows.map(({ matchup, showSeasonDivider }, index) => (
        <div key={`matchup-${matchup.id}-${index}`}>
          {showSeasonDivider ? (
            <div className="my-6 border-2 border-b border-slate-400"></div>
          ) : null}
          <HistoryMatchupCard matchup={matchup} teams={teams} teamInfo={teamInfo} />
        </div>
      ))}
    </div>
  );
}
