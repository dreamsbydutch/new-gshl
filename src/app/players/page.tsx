import { PlayersContent } from "@gshl-components/player/PlayersContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export const metadata = { title: "Players" };

export default async function PlayersPage({
  searchParams,
}: ProtectedRoutePageProps) {
  await requireActiveUser("/players", await searchParams);
  return <PlayersContent />;
}
