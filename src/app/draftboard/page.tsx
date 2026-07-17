import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { resolveContractDefaultSeason } from "@gshl-utils";
import { DraftBoardContent } from "@gshl-components/draft/DraftBoardContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";

export default async function DraftBoardPage() {
  await requireActiveUser("/draftboard");
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
