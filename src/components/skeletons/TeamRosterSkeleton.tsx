import { Skeleton } from "../ui/SkeletonPrimitive";

export function TeamRosterSkeleton() {
  return (
    <section aria-label="Loading roster" className="mx-auto max-w-4xl">
      <Skeleton className="mb-3 h-5 w-24" />
      {[6, 3, 1, 4].map((count, section) => (
        <div key={section} className="mb-3">
          <div className="border-b border-slate-200 py-2">
            <Skeleton className="h-3 w-20" />
          </div>
          {Array.from({ length: count }, (_, index) => (
            <div
              key={index}
              className="flex min-h-14 items-center gap-3 border-b border-slate-100 py-2"
            >
              <Skeleton className="h-3 w-7" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-36 max-w-full" />
                <Skeleton className="h-3 w-12" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="ml-auto h-4 w-10" />
                <Skeleton className="h-3 w-14" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
