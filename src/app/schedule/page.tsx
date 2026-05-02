import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { ScheduleContent } from "./ScheduleContent";

export default async function SchedulePage() {
  const activeSeason = await serverApi.season.getActive();
  const seasonId = activeSeason?.id ? String(activeSeason.id) : undefined;
  const activeWeek = seasonId ? await serverApi.week.getActive() : null;
  const weekId =
    activeWeek?.id && activeWeek.seasonId === seasonId
      ? String(activeWeek.id)
      : undefined;

  await Promise.all([
    seasonId
      ? serverApi.matchup.getLiveStates.prefetch({
          where: { seasonId },
          orderBy: { seasonId: "asc" },
        })
      : Promise.resolve(),
    seasonId && weekId
      ? serverApi.teamStats.weekly.getAll.prefetch({
          where: { seasonId, weekId },
        })
      : Promise.resolve(),
    seasonId && weekId
      ? serverApi.playerStats.weekly.getAll.prefetch({
          where: { seasonId, weekId },
        })
      : Promise.resolve(),
  ]);

  return (
    <HydrateClient>
      <ScheduleContent />
    </HydrateClient>
  );
}
