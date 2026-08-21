import { Suspense } from "react";
import { MatchupPageContent } from "@gshl-components/matchup/MatchupPageContent";
import { MatchupSkeleton } from "@gshl-skeletons";
import type { MatchupPageProps } from "@gshl-types";

export default async function MatchupPage({ params }: MatchupPageProps) {
  const { matchupId } = await params;
  return (
    <Suspense fallback={<MatchupSkeleton />}>
      <MatchupPageContent matchupId={matchupId} />
    </Suspense>
  );
}
