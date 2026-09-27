import { Suspense } from "react";
import { NHLMatchupContent } from "@gshl-components/matchup/NHLMatchupContent";
import { MatchupSkeleton } from "@gshl-skeletons";

export default async function NHLMatchupPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  return (
    <Suspense fallback={<MatchupSkeleton />}>
      <NHLMatchupContent gameId={gameId} />
    </Suspense>
  );
}
