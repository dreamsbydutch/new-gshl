"use client";

import Link from "next/link";
import type { TeamScheduleItemProps } from "@gshl-types";
import { useTeamScheduleMatchupDetails } from "@gshl-hooks";
import { MatchupStatsSkeleton } from "@gshl-skeletons";
import { formatOpponentDisplay } from "@gshl-utils";
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

  const opponentText = formatOpponentDisplay(
    gameLocation,
    matchup,
    homeTeam,
    awayTeam,
  );
  const disclosureId = `team-schedule-matchup-${matchup.id}-details`;
  const triggerId = `team-schedule-matchup-${matchup.id}-trigger`;

  return (
    <div className="border-b">
      <button
        id={triggerId}
        type="button"
        aria-controls={canExpand ? disclosureId : undefined}
        aria-expanded={canExpand ? isExpanded : undefined}
        disabled={!canExpand}
        onClick={canExpand ? onToggle : undefined}
        className={`grid w-full grid-cols-9 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500 disabled:cursor-default ${gameDisplay.className} ${
          canExpand ? "cursor-pointer hover:bg-gray-50" : ""
        }`}
      >
        <WeekDisplay label={gameDisplay.label} />
        <OpponentDisplay opponentText={opponentText} />
        <GameResult
          matchup={matchup}
          selectedTeamId={selectedTeamId}
          week={week}
        />
      </button>

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
              <div className="mx-auto flex w-5/6 justify-end pt-2">
                <Link
                  href={matchupHref ?? `/matchup/${matchup.id}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 transition hover:border-slate-800 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                >
                  Open matchup page
                </Link>
              </div>
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
