"use client";

import Image from "next/image";
import { useOwnerRankingsData } from "@gshl-hooks";
import { useDraftBoardFit } from "@gshl-hooks/features/useDraftBoardFit";
import { abbreviatePlayerName } from "@gshl-utils";
import type { DraftRosterTeamView } from "@gshl-types";

export function DraftOwnerLadder({ teams }: { teams: DraftRosterTeamView[] }) {
  const { data, isLoading } = useOwnerRankingsData();
  const { panelRef, contentRef } = useDraftBoardFit();
  const ownerIds = new Set(teams.map((team) => team.ownerId));
  const rankings = data.rankings.filter((entry) =>
    ownerIds.has(entry.owner.id),
  );
  return (
    <section
      ref={panelRef}
      aria-label="Owner ladder"
      className="min-h-0 flex-1 overflow-hidden"
    >
      <div ref={contentRef} className="w-full shrink-0">
        <header className="border-b border-slate-400 px-2 py-1.5">
          <h2 className="text-[1.1em] font-semibold text-slate-900">
            Owner ladder
          </h2>
          <p className="text-[0.75em] text-slate-600">
            Active owners &middot; All-time ranks
          </p>
        </header>
        {isLoading ? (
          <p role="status" className="p-2 text-[0.9em]">
            Loading owner ladder...
          </p>
        ) : rankings.length ? (
          <table className="w-full text-[0.9em] leading-snug">
            <thead className="text-left text-[0.8em] text-slate-600">
              <tr>
                <th scope="col" className="px-1 py-1 font-medium">
                  Rank
                </th>
                <th scope="col" className="px-1 py-1 font-medium">
                  Owner
                </th>
                <th scope="col" className="px-1 py-1 text-right font-medium">
                  Rating
                </th>
                <th scope="col" className="px-1 py-1 text-right font-medium">
                  W-L-T
                </th>
                <th
                  scope="col"
                  className="px-1 py-1 text-right font-medium"
                  title="Win percentage"
                >
                  Win%
                </th>
                <th
                  scope="col"
                  className="px-1 py-1 text-right font-medium"
                  title="Seasons played"
                >
                  Yrs
                </th>
                <th
                  scope="col"
                  className="px-1 py-1 text-right font-medium"
                  title="Playoff appearances"
                >
                  PO
                </th>
                <th
                  scope="col"
                  className="px-1 py-1 text-right font-medium"
                  title="Finals appearances"
                >
                  Finals
                </th>
                <th scope="col" className="px-1 py-1 text-right font-medium">
                  Cups
                </th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((entry) => (
                <tr
                  key={entry.owner.id}
                  className="border-t border-slate-300 even:bg-slate-100/60"
                >
                  <td className="px-1 py-0.5 tabular-nums text-slate-600">
                    {entry.rank}
                  </td>
                  <td className="px-1 py-0.5">
                    <div className="flex items-center gap-1">
                      {entry.primaryTeam?.logoUrl && (
                        <Image
                          src={entry.primaryTeam.logoUrl}
                          alt=""
                          width={24}
                          height={24}
                          className="h-[1.3em] w-[1.3em] shrink-0 object-contain"
                        />
                      )}
                      <span
                        className="whitespace-nowrap font-medium"
                        title={entry.displayName}
                      >
                        {abbreviatePlayerName(entry.displayName)}
                      </span>
                    </div>
                  </td>
                  <td className="px-1 py-0.5 text-right tabular-nums">
                    {Math.round(entry.rating).toLocaleString("en-CA")}
                  </td>
                  <td className="whitespace-nowrap px-1 py-0.5 text-right tabular-nums text-slate-700">
                    {entry.overallRecord.wins}-{entry.overallRecord.losses}-
                    {entry.overallRecord.ties}
                  </td>
                  <td className="px-1 py-0.5 text-right tabular-nums">
                    {(entry.overallRecord.winPercentage * 100).toFixed(0)}
                  </td>
                  <td className="px-1 py-0.5 text-right tabular-nums">
                    {entry.seasonsPlayed}
                  </td>
                  <td className="px-1 py-0.5 text-right tabular-nums">
                    {entry.playoffAppearances}
                  </td>
                  <td className="px-1 py-0.5 text-right tabular-nums">
                    {entry.finalsAppearances}
                  </td>
                  <td className="px-1 py-0.5 text-right tabular-nums">
                    {entry.cups}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-2 text-[0.9em]">
            Owner rankings are not available yet.
          </p>
        )}
      </div>
    </section>
  );
}
