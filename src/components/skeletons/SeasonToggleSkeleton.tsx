import { cn } from "@gshl-utils";
import { Skeleton } from "../ui/SkeletonPrimitive";

export function SeasonToggleSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-2", className)}>
      <Skeleton className="h-9 w-28 rounded" />
    </div>
  );
}
