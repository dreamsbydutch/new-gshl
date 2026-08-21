import { cn } from "@gshl-utils";
import { Skeleton } from "../ui/SkeletonPrimitive";

export function SeasonToggleSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-2", className)}>
      <Skeleton className="h-11 w-32 rounded" />
    </div>
  );
}
