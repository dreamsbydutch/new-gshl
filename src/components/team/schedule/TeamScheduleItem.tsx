"use client";

import Link from "next/link";
import type { TeamScheduleItemProps } from "@gshl-types";
import { useTeamScheduleMatchupDetails } from "@gshl-hooks";
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

  return (
    <div className="border-b">
      <button
        type="button"
        onClick={canExpand ? onToggle : undefined}
        className={`grid w-full grid-cols-9 py-2 text-left ${gameDisplay.className} ${
          canExpand ? "cursor-pointer hover:bg-gray-50" : ""
        }`}
      >
        <WeekDisplay label={gameDisplay.label} />
        <OpponentDisplay opponentText={opponentText} />
        <GameResult matchup={matchup} selectedTeamId={selectedTeamId} week={week} />
      </button>

      {isExpanded ? (
        !hasStats ? (
          <div className="mx-auto w-5/6 py-1.5 text-center text-sm text-gray-600">
            {isLoadingStats ? "Loading stats..." : "Matchup stats unavailable"}
          </div>
        ) : (
          <div className="pb-2">
            <div className="mx-auto flex w-5/6 justify-end pt-2">
              <Link
                href={`/matchup/${matchup.id}`}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 transition hover:border-slate-800 hover:text-slate-900"
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
        )
      ) : null}
    </div>
  );
}
