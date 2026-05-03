import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { isBetweenSeasons, findOffseasonWindow } from "@gshl-utils";
import { HomeContent } from "./HomeContent";

export default async function Home() {
  const seasons = await serverApi.season.getAll({ orderBy: { year: "asc" } });
  const offseasonWindow = findOffseasonWindow(seasons);

  await serverApi.season.getAll.prefetch({ orderBy: { year: "asc" } });

  if (isBetweenSeasons(seasons) && offseasonWindow?.upcomingSeason.id) {
    await Promise.all([
      serverApi.player.getAll.prefetch({}),
      serverApi.contract.getAll.prefetch({}),
      serverApi.draftPick.getAll.prefetch({}),
      serverApi.team.getAll.prefetch({
        where: { seasonId: String(offseasonWindow.upcomingSeason.id) },
      }),
      serverApi.team.getNHLTeams.prefetch(),
    ]);
  }

  return (
    <HydrateClient>
      <HomeContent />
    </HydrateClient>
  );
}
