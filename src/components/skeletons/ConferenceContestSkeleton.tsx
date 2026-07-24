import { Skeleton } from "../ui/SkeletonPrimitive";

export function ConferenceContestSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <div className="overflow-hidden rounded-lg border bg-slate-100 p-4 sm:p-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-8">
          <div className="flex justify-center">
            <Skeleton className="h-16 w-16 rounded-xl sm:h-[4.5rem] sm:w-[4.5rem]" />
          </div>
          <Skeleton className="h-3 w-5" />
          <div className="flex justify-center">
            <Skeleton className="h-16 w-16 rounded-xl sm:h-[4.5rem] sm:w-[4.5rem]" />
          </div>
        </div>
      </div>
      <Skeleton className="h-64 rounded-lg sm:h-80" />
      <Skeleton className="h-80 rounded-lg sm:h-96" />
      <Skeleton className="h-64 rounded-lg sm:h-80" />
    </div>
  );
}
