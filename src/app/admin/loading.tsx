import { AdminPanelSkeleton } from "@gshl-skeletons";
import { RouteLoading } from "@gshl-components/skeletons/RouteLoading";

export default function Loading() {
  return (
    <RouteLoading label="Loading administration">
      <AdminPanelSkeleton />
    </RouteLoading>
  );
}
