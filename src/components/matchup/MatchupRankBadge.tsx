"use client";

import { createContext, useContext, type ReactNode } from "react";

export const MatchupRanksContext = createContext<ReadonlyMap<string, number>>(
  new Map(),
);
import { shouldDisplayRank } from "@gshl-utils";

export function MatchupRankBadge({
  rank,
  children,
  teamId,
}: {
  rank?: number | string | null;
  children: ReactNode;
  teamId?: string;
}) {
  const ranks = useContext(MatchupRanksContext);
  rank = rank ?? (teamId ? ranks.get(teamId) : undefined);
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      {shouldDisplayRank(rank) ? (
        <span
          aria-label={`Power ranking ${rank}`}
          className="absolute -left-2 -top-1 z-10 rounded bg-white/95 px-0.5 font-oswald text-[10px] font-bold leading-tight text-slate-600"
        >
          #{rank}
        </span>
      ) : null}
    </span>
  );
}
