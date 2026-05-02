import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { LockerRoomContent } from "./LockerRoomContent";

export default async function LockerRoomPage() {
  await Promise.all([
    serverApi.player.getAll.prefetch({}),
    serverApi.contract.getAll.prefetch({}),
    serverApi.draftPick.getAll.prefetch({}),
  ]);

  return (
    <HydrateClient>
      <LockerRoomContent />
    </HydrateClient>
  );
}
