import { RouteLoading } from "@gshl-components/skeletons/RouteLoading";
import { MatchupSkeleton } from "@gshl-skeletons";

export default function Loading() {
  return (
    <RouteLoading label="Loading matchup details">
      <MatchupSkeleton />
    </RouteLoading>
  );
}
