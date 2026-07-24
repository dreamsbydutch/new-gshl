"use client";

import { LoadingSpinner } from "@gshl-ui";
import { useMatchups } from "@gshl-hooks";
import { MatchupDetailsContent } from "./MatchupDetailsContent";

export function MatchupPageContent({ matchupId }: { matchupId: string }) {
  const { data, isLoading } = useMatchups({ matchupId });
  const matchup = data[0];
  if (isLoading) return <LoadingSpinner />;
  if (!matchup) return <p className="p-6 text-center">Matchup not found.</p>;
  return (
    <MatchupDetailsContent
      matchupId={matchupId}
      seasonId={String(matchup.seasonId)}
      weekId={String(matchup.weekId)}
    />
  );
}
