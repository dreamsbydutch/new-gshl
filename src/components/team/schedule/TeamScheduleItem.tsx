"use client";

import Link from "next/link";
import type { TeamScheduleItemProps } from "@gshl-types";
import {
  formatScheduleOpponent,
  getScheduleGameLocation,
  getScheduleGameTypeDisplay,
} from "@gshl-utils";
import { GameResult } from "./GameResult";
import { OpponentDisplay } from "./OpponentDisplay";
import { WeekDisplay } from "./WeekDisplay";

export function TeamScheduleItem({
  matchup,
  week,
  teams,
  selectedTeamId,
  matchupHref,
}: TeamScheduleItemProps) {
  const homeTeam = teams.find((team) => team.id === matchup.homeTeamId);
  const awayTeam = teams.find((team) => team.id === matchup.awayTeamId);
  const gameLocation = getScheduleGameLocation({ matchup, selectedTeamId });
  const gameDisplay = getScheduleGameTypeDisplay({
    awayTeam,
    gameType: String(matchup.gameType),
    homeTeam,
    location: gameLocation,
    week: week ?? undefined,
  });
  const opponentText = formatScheduleOpponent({
    awayTeam,
    homeTeam,
    location: gameLocation,
    matchup,
  });

  return (
    <div className="border-b">
      <Link
        href={matchupHref ?? `/matchup/${matchup.id}`}
        className={`grid w-full grid-cols-9 py-2 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500 ${gameDisplay.className}`}
      >
        <WeekDisplay label={gameDisplay.label} />
        <OpponentDisplay opponentText={opponentText} />
        <GameResult
          matchup={matchup}
          selectedTeamId={selectedTeamId}
          week={week}
        />
      </Link>
    </div>
  );
}
