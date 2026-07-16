"use client";

import Image from "next/image";
import type {
  GSHLTeam,
  MatchupCategoryConfig,
  TeamWeekStatLine,
} from "@gshl-types";
import {
  didWinCategory,
  formatCategoryValue,
  getScoreCellClass,
  getStatCellClass,
  toCategoryNumber,
} from "@gshl-utils";

function TeamLogoCell({ team }: { team?: GSHLTeam | null }) {
  if (!team?.logoUrl) {
    return <td className="w-6" />;
  }

  return (
    <td className="w-6">
      <Image
        src={team.logoUrl}
        alt={team.name ?? "Team"}
        width={24}
        height={24}
        className="h-6 w-6"
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
  team?: GSHLTeam | null;
  teamStats: TeamWeekStatLine;
  opponentStats: TeamWeekStatLine;
  teamScore: number | null;
  opponentScore: number | null;
  categories: MatchupCategoryConfig[];
}) {
  const scoreWon = Number(teamScore) > Number(opponentScore);
  const categoryStates = categories.map((category) => {
    const teamValue = toCategoryNumber(teamStats, category);
    const opponentValue = toCategoryNumber(opponentStats, category);

    return {
      key: String(category.field),
      won: didWinCategory(teamValue, opponentValue, category.isInverse),
      display: formatCategoryValue(teamStats, category),
    };
  });

  return (
    <tr>
      <TeamLogoCell team={team} />
      <td className={getScoreCellClass(scoreWon)}>{teamScore}</td>
      {categoryStates.map((categoryState) => (
        <td key={categoryState.key} className={getStatCellClass(categoryState.won)}>
          {categoryState.display}
        </td>
      ))}
    </tr>
  );
}
