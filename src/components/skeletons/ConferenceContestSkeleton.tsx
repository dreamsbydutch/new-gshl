import { Skeleton } from "../ui/SkeletonPrimitive";

export function ConferenceContestSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="overflow-hidden rounded-[2rem] border bg-slate-100 p-5 shadow-default sm:p-8">
        <div className="flex justify-center">
          <Skeleton className="h-7 w-40 rounded-full" />
        </div>
        <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-20 w-20 rounded-3xl" />
            <Skeleton className="h-7 w-28" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-20 w-16" />
            <Skeleton className="h-10 w-4" />
            <Skeleton className="h-20 w-16" />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-20 w-20 rounded-3xl" />
            <Skeleton className="h-7 w-28" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-[2rem]" />
      <Skeleton className="h-96 rounded-[2rem]" />
    </div>
  );
}
