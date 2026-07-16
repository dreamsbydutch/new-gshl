"use client";

import Image from "next/image";
import type { GSHLTeam } from "@gshl-types";

export function HistoryTeamCard({
  team,
  rank,
}: {
  team: GSHLTeam;
  rank: number | null | undefined;
}) {
  const shouldShowRank = rank != null && Number(rank) <= 8;

  return (
    <div className="col-span-3 flex flex-col items-center justify-center gap-2 whitespace-nowrap p-2 text-center">
      {shouldShowRank ? (
        <div className="flex flex-row">
          <span className="xs:text-base pr-1 font-oswald text-sm font-bold text-black">
            #{rank}
          </span>
          {team.logoUrl ? (
            <Image
              className="xs:w-12 w-8"
              src={team.logoUrl}
              alt={`${team.name} logo`}
              width={48}
              height={48}
            />
          ) : (
            <div className="xs:w-12 xs:h-12 flex h-8 w-8 items-center justify-center rounded bg-gray-200">
              <span className="text-xs text-gray-400">?</span>
            </div>
          )}
        </div>
      ) : team.logoUrl ? (
        <Image
          className="xs:w-12 w-8"
          src={team.logoUrl}
          alt={`${team.name} logo`}
          width={48}
          height={48}
        />
      ) : (
        <div className="xs:w-12 xs:h-12 flex h-8 w-8 items-center justify-center rounded bg-gray-200">
          <span className="text-xs text-gray-400">?</span>
        </div>
      )}
      <div className="xs:text-lg font-oswald text-base">{team.name}</div>
    </div>
  );
}
