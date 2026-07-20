import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { resolveContractDefaultSeason } from "@gshl-utils";
import { DraftBoardContent } from "@gshl-components/draft/DraftBoardContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";

export default async function DraftBoardPage() {
  await requireActiveUser("/draftboard");
  const seasons = await serverApi.season.getAll({ orderBy: { year: "asc" } });
  const contractSeason = resolveContractDefaultSeason(seasons);

  await Promise.all([
    serverApi.player.listPage.prefetch({ active: true, limit: 50 }),
    serverApi.contract.getAll.prefetch({}),
    contractSeason?.id
      ? serverApi.draftPick.listPage.prefetch({
          seasonId: String(contractSeason.id),
          limit: 50,
        })
      : Promise.resolve(),
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
