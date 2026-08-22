import { Skeleton } from "../ui/SkeletonPrimitive";

export function DraftClassesSkeleton() {
  return (
    <div className="mx-auto max-w-7xl pb-6" aria-label="Loading draft classes">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-2 border-b border-slate-200 py-3 md:grid-cols-3">
        <Skeleton className="h-11 md:col-span-3" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
      <div className="grid grid-cols-2 gap-3 border-b border-slate-200 py-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-8" />
        ))}
      </div>
      <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
