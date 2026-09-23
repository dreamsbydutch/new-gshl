"use client";

import Link from "next/link";
import type { TeamScheduleItemProps } from "@gshl-types";
import { useTeamScheduleMatchupDetails } from "@gshl-hooks";
import { MatchupStatsSkeleton } from "@gshl-skeletons";
import { formatScheduleOpponent } from "@gshl-utils";
import { GameResult } from "./GameResult";
import { MatchupStatsTable } from "./MatchupStatsTable";
import { OpponentDisplay } from "./OpponentDisplay";
import { WeekDisplay } from "./WeekDisplay";

export function TeamScheduleItem({
  matchup,
  week,
  teams,
  selectedTeamId,
  categories,
  matchupHref,
  isExpanded,
  onToggle,
}: TeamScheduleItemProps & {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const {
    awayTeam,
    canExpand,
    gameDisplay,
    gameLocation,
    hasStats,
    homeTeam,
    isLoadingStats,
    opponentScore,
    opponentStats,
    opponentTeam,
    selectedTeam,
    selectedTeamScore,
    selectedTeamStats,
  } = useTeamScheduleMatchupDetails({
    enabled: isExpanded,
    matchup,
    week,
    teams,
    selectedTeamId,
  });

  const opponentText = formatScheduleOpponent({
    awayTeam,
    homeTeam,
    location: gameLocation,
    matchup,
  });
  const disclosureId = `team-schedule-matchup-${matchup.id}-details`;
  const triggerId = `team-schedule-matchup-${matchup.id}-trigger`;

  return (
    <div className="border-b">
      <Link
        href={matchupHref ?? `/matchup/${matchup.id}`}
        className={`grid min-h-11 w-full grid-cols-9 py-2 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500 ${gameDisplay.className}`}
      >
        <WeekDisplay label={gameDisplay.label} />
        <OpponentDisplay opponentText={opponentText} />
        <GameResult
          matchup={matchup}
          selectedTeamId={selectedTeamId}
          week={week}
        />
      </Link>
      {canExpand ? (
        <div className="flex justify-end px-2">
          <button
            id={triggerId}
            type="button"
            aria-controls={isExpanded ? disclosureId : undefined}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Hide" : "Show"} stats: ${opponentText}, ${gameDisplay.label}`}
            onClick={onToggle}
            className="min-h-11 rounded px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            {isExpanded ? "Hide stats" : "Show stats"}
          </button>
        </div>
      ) : null}

      {canExpand && isExpanded ? (
        <div id={disclosureId} role="region" aria-labelledby={triggerId}>
          {!hasStats ? (
            isLoadingStats ? (
              <MatchupStatsSkeleton />
            ) : (
              <div className="mx-auto w-5/6 py-1.5 text-center text-sm text-gray-600">
                Matchup stats unavailable
              </div>
            )
          ) : (
            <div className="pb-2">
              <MatchupStatsTable
                selectedTeam={selectedTeam ?? null}
                selectedTeamStats={selectedTeamStats!}
                selectedTeamScore={selectedTeamScore}
                opponentTeam={opponentTeam ?? null}
                opponentStats={opponentStats!}
                opponentScore={opponentScore}
                categories={categories}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
