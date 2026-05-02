import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { StandingsContent } from "./StandingsContent";

export default async function StandingsPage() {
  const activeSeason = await serverApi.season.getActive();
  const seasonId = activeSeason?.id ? String(activeSeason.id) : undefined;

  await Promise.all([
    serverApi.season.getAll.prefetch({ orderBy: { year: "asc" } }),
    seasonId
      ? serverApi.team.getAll.prefetch({ where: { seasonId } })
      : Promise.resolve(),
    seasonId
      ? serverApi.teamStats.season.getAll.prefetch({ where: { seasonId } })
      : Promise.resolve(),
    seasonId
      ? serverApi.matchup.getAll.prefetch({
          where: { seasonId },
          orderBy: { seasonId: "asc" },
        })
      : Promise.resolve(),
    seasonId
      ? serverApi.week.getAll.prefetch({
          where: { seasonId },
          orderBy: { startDate: "asc" },
        })
      : Promise.resolve(),
  ]);

  return (
    <HydrateClient>
      <StandingsContent />
    </HydrateClient>
  );
}
