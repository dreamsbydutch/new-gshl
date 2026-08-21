"use client";

import { useMatchups } from "@gshl-hooks";
import { MatchupSkeleton } from "@gshl-skeletons";
import { MatchupDetailsContent } from "./MatchupDetailsContent";

export function MatchupPageContent({ matchupId }: { matchupId: string }) {
  const { data, isLoading } = useMatchups({ matchupId });
  const matchup = data[0];
  if (isLoading) return <MatchupSkeleton />;
  if (!matchup) {
    return (
      <main
        aria-labelledby="matchup-route-not-found-heading"
        className="mx-auto max-w-3xl px-4 py-10"
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
          <h1
            id="matchup-route-not-found-heading"
            className="text-xl font-bold text-slate-900"
          >
            Matchup not found
          </h1>
          <p className="mt-2">No matchup exists for this link.</p>
        </div>
      </main>
    );
  }
  return (
    <MatchupDetailsContent
      matchupId={matchupId}
      seasonId={String(matchup.seasonId)}
      weekId={String(matchup.weekId)}
    />
  );
}
