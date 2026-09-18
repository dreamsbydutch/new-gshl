"use client";

import Image from "next/image";
import Link from "next/link";
import { useOwnerRankingsData } from "@gshl-hooks";
import { useDraftBoardFit } from "@gshl-hooks/features/useDraftBoardFit";
import type { DraftRosterTeamView } from "@gshl-types";

export function DraftOwnerLadder({
  teams,
  seasonName,
}: {
  teams: DraftRosterTeamView[];
  seasonName?: string;
}) {
  const { data, isLoading } = useOwnerRankingsData();
  const { panelRef, contentRef } = useDraftBoardFit();
  const ownerIds = new Set(teams.map((team) => team.ownerId));
  const rankings = data.rankings.filter((entry) =>
    ownerIds.has(entry.owner.id),
  );
  return (
    <aside
      ref={panelRef}
      aria-label="Owner ladder"
      className="absolute bottom-1.5 left-1/2 z-10 flex h-[calc((100%_-_2.25em_-_24px)/2)] w-[calc(25%_+_3px)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-slate-400 bg-slate-200"
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
                      <span className="font-medium">{entry.displayName}</span>
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
        <footer className="mt-2 border-t border-slate-400 px-2 py-1.5 text-[0.75em] text-slate-700">
          <p className="mb-1">
            {seasonName ?? "GSHL Draft"} &middot; {teams.length} rosters
          </p>
          <nav
            aria-label="Draft screens"
            className="flex justify-between gap-2 underline underline-offset-4"
          >
            <Link href="/draft-roster-board/available">Available TV</Link>
            <Link href="/draft-roster-board/live">Live TV</Link>
            <Link href="/draft">Draft Hub</Link>
          </nav>
        </footer>
      </div>
    </aside>
  );
}
