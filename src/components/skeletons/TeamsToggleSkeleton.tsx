import { cn } from "@gshl-utils";
import { Skeleton } from "../ui/SkeletonPrimitive";

export function TeamsToggleSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "no-scrollbar mx-auto flex flex-row gap-1 overflow-x-auto overflow-y-hidden",
        className,
      )}
    >
      {Array.from({ length: 16 }).map((_, index) => (
        <Skeleton key={index} className="h-8 w-8 shrink-0 rounded-md" />
      ))}
    </div>
  );
}
