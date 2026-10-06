"use client";

import Image from "next/image";
import type {
  MatchupTeamWeekStats,
  MatchupCategoryConfig,
  TeamScheduleTeamSummary,
} from "@gshl-types";
import {
  buildCategoryResults,
  getScoreCellClass,
  getStatCellClass,
} from "@gshl-utils";

function TeamLogoCell({ team }: { team?: TeamScheduleTeamSummary | null }) {
  if (!team?.logoUrl) {
    return <td className="w-8 min-w-8" />;
  }

  return (
    <td className="w-8 min-w-8">
      <Image
        src={team.logoUrl}
        alt={team.name ?? "Team"}
        width={24}
        height={24}
        className="h-6 w-6 max-w-none object-contain"
      />
    </td>
  );
}

export function TeamStatsRow({
  team,
  teamStats,
  opponentStats,
  teamScore,
  opponentScore,
  categories,
}: {
  team?: TeamScheduleTeamSummary | null;
  teamStats: MatchupTeamWeekStats;
  opponentStats: MatchupTeamWeekStats;
  teamScore: number | null;
  opponentScore: number | null;
  categories: MatchupCategoryConfig[];
}) {
  const scoreWon = Number(teamScore) > Number(opponentScore);
  const categoryStates = buildCategoryResults(
    teamStats,
    opponentStats,
    categories,
  );

  return (
    <tr>
      <TeamLogoCell team={team} />
      <td className={getScoreCellClass(scoreWon)}>{teamScore}</td>
      {categoryStates.map((categoryState) => (
        <td
          key={categoryState.key}
          className={getStatCellClass(categoryState.winner === "home")}
        >
          {categoryState.homeValue}
        </td>
      ))}
    </tr>
  );
}
