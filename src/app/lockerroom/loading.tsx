import { LockerRoomSkeleton } from "@gshl-skeletons";
import { RouteLoading } from "@gshl-components/skeletons/RouteLoading";

export default function Loading() {
  return (
    <RouteLoading label="Loading locker room">
      <LockerRoomSkeleton />
    </RouteLoading>
  );
}
