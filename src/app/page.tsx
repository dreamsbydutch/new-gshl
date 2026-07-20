import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import {
  isBetweenSeasons,
  findOffseasonWindow,
  resolveDefaultSeason,
} from "@gshl-utils";
import { HomeContent } from "@gshl-components/home/HomeContent";

export default async function Home() {
  const seasons = await serverApi.season.getAll({ orderBy: { year: "asc" } });
  const offseasonWindow = findOffseasonWindow(seasons);
  const activitySeason = resolveDefaultSeason(seasons);

  await serverApi.season.getAll.prefetch({ orderBy: { year: "asc" } });
  await serverApi.ufa.getOverview.prefetch();

  if (activitySeason?.id) {
    await serverApi.activity.getRecent.prefetch({
      seasonId: String(activitySeason.id),
      take: 12,
    });
  }

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
