import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { resolveContractDefaultSeason } from "@gshl-utils";
import { DraftBoardContent } from "./DraftBoardContent";

export default async function DraftBoardPage() {
  const seasons = await serverApi.season.getAll({ orderBy: { year: "asc" } });
  const contractSeason = resolveContractDefaultSeason(seasons);

  await Promise.all([
    serverApi.player.getAll.prefetch({}),
    serverApi.contract.getAll.prefetch({}),
    serverApi.draftPick.getAll.prefetch({}),
    serverApi.season.getAll.prefetch({ orderBy: { year: "asc" } }),
    serverApi.team.getAll.prefetch(
      contractSeason?.id
        ? { where: { seasonId: String(contractSeason.id) } }
        : {},
    ),
  ]);

  return (
    <HydrateClient>
      <DraftBoardContent />
    </HydrateClient>
  );
}
