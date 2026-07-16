import { notFound } from "next/navigation";
import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { MatchupDetailsContent } from "@gshl-components/matchup/MatchupDetailsContent";
import type { MatchupPageProps } from "@gshl-types";

export default async function MatchupPage({ params }: MatchupPageProps) {
  const { matchupId } = await params;
  const matchup = await serverApi.matchup.getById({ id: matchupId });

  if (!matchup) {
    notFound();
  }

  const seasonId = String(matchup.seasonId);
  const weekId = String(matchup.weekId);

  await Promise.all([
    serverApi.matchup.getLiveStates.prefetch({
      where: { seasonId, weekId },
    }),
    serverApi.team.getAll.prefetch({
      where: { seasonId },
    }),
    serverApi.teamStats.weekly.getAll.prefetch({
      where: { seasonId, weekId },
    }),
    serverApi.playerStats.weekly.getAll.prefetch({
      where: { seasonId, weekId },
    }),
  ]);

  return (
    <HydrateClient>
      <MatchupDetailsContent
        matchupId={matchupId}
        seasonId={seasonId}
        weekId={weekId}
      />
    </HydrateClient>
  );
}
