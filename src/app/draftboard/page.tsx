import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { DraftBoardContent } from "./DraftBoardContent";

export default async function DraftBoardPage() {
  await Promise.all([
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
