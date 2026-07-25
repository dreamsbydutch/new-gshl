import { StandingsSkeleton } from "@gshl-skeletons";
import { RouteLoading } from "@gshl-components/skeletons/RouteLoading";

export default function Loading() {
  return (
    <RouteLoading label="Loading standings">
      <StandingsSkeleton />
    </RouteLoading>
  );
}
