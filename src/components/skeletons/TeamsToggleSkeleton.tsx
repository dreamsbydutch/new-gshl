import { cn } from "@gshl-utils";
import { Skeleton } from "../ui/skeleton";

export function TeamsToggleSkeleton() {
  return (
    <div
      className={cn(
        "fixed bottom-14 left-0 right-0 z-30 mx-auto flex h-10 w-full flex-row bg-gray-200 px-2 shadow-nav",
      )}
    >
      {Array(10)
        .fill(1)
        .map((_a, i) => (
          <Skeleton
            key={i}
            className="mx-1 my-0.5 h-8 w-8 rounded-md bg-gray-300"
          />
        ))}
    </div>
  );
}
