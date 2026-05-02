import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { LockerRoomContent } from "./LockerRoomContent";

export default async function LockerRoomPage() {
  const activeSeason = await serverApi.season.getActive();
  const seasonId = activeSeason?.id ? String(activeSeason.id) : undefined;

  await Promise.all([
    serverApi.season.getAll.prefetch({ orderBy: { year: "asc" } }),
    serverApi.team.getAll.prefetch({}),
    serverApi.player.getAll.prefetch({}),
    serverApi.contract.getAll.prefetch({}),
    serverApi.draftPick.getAll.prefetch({}),
    serverApi.team.getNHLTeams.prefetch(undefined),
    seasonId
      ? serverApi.season.getById.prefetch({ id: seasonId })
      : Promise.resolve(),
  ]);

  return (
    <HydrateClient>
      <LockerRoomContent />
    </HydrateClient>
  );
}
