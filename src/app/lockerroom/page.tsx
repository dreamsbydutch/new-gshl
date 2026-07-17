import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { resolveContractDefaultSeason } from "@gshl-utils";
import { LockerRoomContent } from "@gshl-components/locker-room/LockerRoomContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";

export default async function LockerRoomPage() {
  await requireActiveUser("/lockerroom");
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
    serverApi.team.getNHLTeams.prefetch(),
  ]);

  return (
    <HydrateClient>
      <LockerRoomContent />
    </HydrateClient>
  );
}
