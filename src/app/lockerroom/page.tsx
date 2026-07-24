import { LockerRoomContent } from "@gshl-components/locker-room/LockerRoomContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";

export default async function LockerRoomPage() {
  await requireActiveUser("/lockerroom");
  return <LockerRoomContent />;
}
