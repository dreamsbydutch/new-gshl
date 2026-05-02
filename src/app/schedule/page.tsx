import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { ScheduleContent } from "./ScheduleContent";

export default async function SchedulePage() {
  const activeSeason = await serverApi.season.getActive();
  const seasonId = activeSeason?.id ? String(activeSeason.id) : undefined;

  // Find the current week to prefetch week-scoped stats
  const weeks = seasonId
    ? await serverApi.week.getAll({
        where: { seasonId },
        orderBy: { startDate: "asc" },
      })
    : [];
  const now = new Date();
  const currentWeek = weeks.find(
    (w) => new Date(w.startDate) <= now && new Date(w.endDate) >= now,
  );
  const weekId = currentWeek?.id ? String(currentWeek.id) : undefined;

  await Promise.all([
    serverApi.season.getAll.prefetch({ orderBy: { year: "asc" } }),
    seasonId
      ? serverApi.team.getAll.prefetch({ where: { seasonId } })
      : Promise.resolve(),
    seasonId
      ? serverApi.matchup.getAll.prefetch({
          where: { seasonId },
          orderBy: { seasonId: "asc" },
        })
      : Promise.resolve(),
    serverApi.player.getAll.prefetch({ where: { isActive: true } }),
    seasonId
      ? serverApi.week.getAll.prefetch({
          where: { seasonId },
          orderBy: { startDate: "asc" },
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
