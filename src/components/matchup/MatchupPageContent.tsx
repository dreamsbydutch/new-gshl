"use client";

import { useMatchups } from "@gshl-hooks";
import { MatchupSkeleton } from "@gshl-skeletons";
import { MatchupDetailsContent } from "./MatchupDetailsContent";

export function MatchupPageContent({ matchupId }: { matchupId: string }) {
  const { data, isLoading } = useMatchups({ matchupId });
  const matchup = data[0];
  if (isLoading) return <MatchupSkeleton />;
  if (!matchup) return <p className="p-6 text-center">Matchup not found.</p>;
  return (
    <MatchupDetailsContent
      matchupId={matchupId}
      seasonId={String(matchup.seasonId)}
      weekId={String(matchup.weekId)}
    />
  );
}
