import { cn } from "@gshl-utils";
import { Skeleton } from "../ui/SkeletonPrimitive";

export function WeeksToggleSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "no-scrollbar mx-auto flex flex-row gap-1 overflow-x-auto overflow-y-hidden",
        className,
      )}
    >
      {Array.from({ length: 14 }).map((_, index) => (
        <Skeleton
          key={index}
          className={`h-9 shrink-0 rounded-sm ${index < 9 ? "w-9" : "w-10"}`}
        />
      ))}
    </div>
  );
}
