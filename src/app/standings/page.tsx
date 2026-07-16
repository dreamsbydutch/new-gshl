import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { StandingsContent } from "@gshl-components/standings/StandingsContent";
import { SeasonType } from "@gshl-types";

export default async function StandingsPage() {
  const activeSeason = await serverApi.season.getActive();
  const seasonId = activeSeason?.id ? String(activeSeason.id) : undefined;

  await Promise.all([
    seasonId
      ? serverApi.teamStats.season.getAll.prefetch({
          where: { seasonId, seasonType: SeasonType.REGULAR_SEASON },
        })
      : Promise.resolve(),
    seasonId
      ? serverApi.matchup.getLiveStates.prefetch({
          where: { seasonId },
          orderBy: { seasonId: "asc" },
        })
      : Promise.resolve(),
    seasonId
      ? serverApi.award.getAll.prefetch({
          where: { seasonId },
          orderBy: { award: "asc" },
        })
      : Promise.resolve(),
  ]);

  return (
    <HydrateClient>
      <StandingsContent />
    </HydrateClient>
  );
}
