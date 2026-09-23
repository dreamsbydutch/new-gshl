"use client";

import type {
  GSHLTeam,
  TeamHistoryTeamSummary,
  UseScheduleDataEnhancedMatchup,
} from "@gshl-types";
import { buildMatchupNavigationHref } from "@gshl-utils";
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
  teams: TeamHistoryTeamSummary[];
  teamInfo: GSHLTeam;
}) {
  return (
    <div className="mx-auto mb-4 w-full max-w-5xl">
      {rows.length === 0 && (
        <p className="py-6 text-sm text-slate-500">
          No matchups match these filters.
        </p>
      )}
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
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  {matchup.season?.name ?? "Previous season"}
                </div>
              ) : null}
              <TeamScheduleItem
                matchup={matchup}
                week={matchup.week}
                teams={teams}
                selectedTeamId={historicalTeam.id}
                matchupHref={buildMatchupNavigationHref(String(matchup.id), {
                  from: "lockerroom",
                  view: "history",
                  owner: teamInfo.ownerId,
                  side:
                    String(matchup.homeTeamId) === String(historicalTeam.id)
                      ? "home"
                      : "away",
                })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
