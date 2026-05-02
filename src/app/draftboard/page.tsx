import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { DraftBoardContent } from "./DraftBoardContent";

export default async function DraftBoardPage() {
  const activeSeason = await serverApi.season.getActive();
  const seasonId = activeSeason?.id ? String(activeSeason.id) : undefined;

  await Promise.all([
    serverApi.season.getAll.prefetch({ orderBy: { year: "asc" } }),
    seasonId
      ? serverApi.team.getAll.prefetch({ where: { seasonId } })
      : Promise.resolve(),
    serverApi.player.getAll.prefetch({}),
    serverApi.contract.getAll.prefetch({}),
    serverApi.draftPick.getAll.prefetch({}),
  ]);

  return (
    <HydrateClient>
      <DraftBoardContent />
    </HydrateClient>
  );
}
