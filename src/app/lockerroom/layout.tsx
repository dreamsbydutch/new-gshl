import { Suspense } from "react";
import { LockerRoomLayout } from "@gshl-components/locker-room/LockerRoomLayout";
import { LockerRoomRouteSkeleton } from "@gshl-skeletons";

export default function LockerRoomRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<LockerRoomRouteSkeleton />}>
      <LockerRoomLayout>{children}</LockerRoomLayout>
    </Suspense>
  );
}
