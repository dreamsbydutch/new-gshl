import { LockerRoomContent } from "@gshl-components/locker-room/LockerRoomContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export default async function LockerRoomPage({
  searchParams,
}: ProtectedRoutePageProps) {
  await requireActiveUser("/lockerroom", await searchParams);
  return <LockerRoomContent />;
}
