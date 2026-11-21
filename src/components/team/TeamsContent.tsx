"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useLockerRoomTeamOptions } from "@gshl-hooks/features/useLockerRoomTeamOptions";
import { Skeleton } from "@gshl-ui";

export function TeamsContent() {
  const catalog = useLockerRoomTeamOptions();
  return (
    <main className="gshl-page space-y-5" aria-labelledby="teams-heading">
      <header className="border-b border-slate-200 pb-4 pt-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Around the league
        </p>
        <h1
          id="teams-heading"
          className="mt-1 text-2xl font-bold tracking-tight"
        >
          GSHL teams
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Explore rosters, contracts, picks, and franchise history.
        </p>
      </header>
      {catalog.isLoading ? (
        <div
          role="status"
          aria-label="Loading teams"
          className="grid gap-3 sm:grid-cols-2"
        >
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.activeTeams.map((team) => (
              <Link
                key={team.id}
                href={`/lockerroom?view=roster&owner=${team.ownerId}&season=${team.seasonId}`}
                className="flex min-h-24 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-500"
              >
                {team.logoUrl ? (
                  <Image
                    src={team.logoUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="h-12 w-12 object-contain"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 font-bold">
                    {team.abbr?.slice(0, 3) ?? "GSHL"}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{team.name}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Roster & team details
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </Link>
            ))}
          </div>
          {!catalog.activeTeams.length ? (
            <p className="py-8 text-slate-500">
              Teams will appear when the league is set up.
            </p>
          ) : null}
          {catalog.inactiveTeams.length ? (
            <details className="border-t border-slate-200 pt-3">
              <summary className="cursor-pointer py-3 text-sm font-semibold">
                Past franchises
              </summary>
              <div className="grid gap-2 sm:grid-cols-3">
                {catalog.inactiveTeams.map((team) => (
                  <Link
                    key={team.id}
                    className="gshl-text-action"
                    href={`/lockerroom?view=history&owner=${team.ownerId}`}
                  >
                    {team.name}
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </main>
  );
}
