"use client";
import { useSeasonState } from "@gshl-hooks";
import { LeagueActivityCard } from "./LeagueActivityCard";

export function ActivityContent() {
  const { currentSeason, defaultSeason } = useSeasonState({
    autoSelect: false,
  });
  return (
    <main className="gshl-page space-y-4">
      <header className="py-3">
        <h1 className="text-2xl font-bold tracking-tight">League activity</h1>
        <p className="mt-1 text-sm text-slate-500">
          Roster moves, trades, and signings around the GSHL.
        </p>
      </header>
      <LeagueActivityCard seasonId={(currentSeason ?? defaultSeason)?.id} />
    </main>
  );
}
