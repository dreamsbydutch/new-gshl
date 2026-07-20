import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { resolveContractDefaultSeason } from "@gshl-utils";
import { LockerRoomContent } from "@gshl-components/locker-room/LockerRoomContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";

export default async function LockerRoomPage() {
  await requireActiveUser("/lockerroom");
  const seasons = await serverApi.season.getAll({ orderBy: { year: "asc" } });
  const contractSeason = resolveContractDefaultSeason(seasons);

  await Promise.all([
    serverApi.season.getAll.prefetch({ orderBy: { year: "asc" } }),
    contractSeason?.id
      ? serverApi.team.getAll.prefetch({
          where: { seasonId: String(contractSeason.id) },
        })
      : Promise.resolve(),
  ]);

  return (
    <HydrateClient>
      <LockerRoomContent />
    </HydrateClient>
  );
}
