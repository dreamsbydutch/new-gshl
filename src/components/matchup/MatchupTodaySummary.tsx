"use client";

import React from "react";
import {
  resolveMatchupCategories,
  formatCategoryValue,
} from "@gshl-utils/features/matchup-details";
import type { useMatchupActivity } from "@gshl-hooks/features/useMatchupActivity";

export function MatchupTodayValue({
  activity,
  categories,
  stat,
  side,
}: {
  activity: ReturnType<typeof useMatchupActivity>;
  categories?: string[];
  stat: string;
  side: "away" | "home";
}) {
  const team = activity.teams.find((t) => t.side === side);
  const category = resolveMatchupCategories(categories).find(
    (c) => c.field === stat,
  );
  if (
    !activity.isActive ||
    !team?.available ||
    !category ||
    team.stats[category.field] == null
  )
    return null;
  const value = formatCategoryValue(team.stats, category);
  const ratio = stat === "GAA" || stat === "SVP";
  if (!ratio && Number(value) === 0) return null;
  return (
    <span
      className="ml-1.5 inline-block whitespace-nowrap text-[10px] font-normal text-sky-700 sm:text-xs"
      title="Today's starting lineup contribution"
      aria-label={value + " today"}
    >
      {ratio ? value + " today" : (Number(value) >= 0 ? "+" : "") + value}
    </span>
  );
}
