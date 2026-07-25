import { WeeklyScheduleSkeleton } from "@gshl-skeletons";
import { RouteLoading } from "@gshl-components/skeletons/RouteLoading";

export default function Loading() {
  return (
    <RouteLoading label="Loading schedule">
      <div className="mx-auto w-full max-w-2xl">
        <WeeklyScheduleSkeleton />
      </div>
    </RouteLoading>
  );
}
