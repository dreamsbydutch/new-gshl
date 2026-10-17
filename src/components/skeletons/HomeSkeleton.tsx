import { Skeleton } from "../ui/SkeletonPrimitive";

export function LeagueActivityRowsSkeleton() {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-start gap-2.5 py-2.5">
          <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <Skeleton className="h-3.5 w-36 max-w-full" />
              <Skeleton className="h-3 w-14 shrink-0" />
            </div>
            <Skeleton className="h-3 w-52 max-w-[80%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeagueActivityCardSkeleton() {
  return (
    <section className="gshl-section">
      <header className="space-y-2 border-b border-slate-200 py-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-56 max-w-full" />
      </header>
      <LeagueActivityRowsSkeleton />
    </section>
  );
}

export function PowerRankingsHomeCardSkeleton() {
  return (
    <section className="gshl-section">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 py-2">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-11 w-20 rounded-lg" />
      </header>
      <div className="py-1">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[1.75rem_minmax(0,1fr)_2.25rem_3rem] items-center gap-1.5 border-b border-slate-100 py-2 sm:gap-2"
          >
            <Skeleton className="h-4 w-4 justify-self-center" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-1 rounded-full" />
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-3 w-24 max-w-[60%]" />
            </div>
            <Skeleton className="h-3 w-5 justify-self-center" />
            <Skeleton className="h-3 w-8 justify-self-end" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function UfaHomeCardSkeleton() {
  return (
    <section className="mx-auto w-full max-w-5xl space-y-3 overflow-hidden border-y border-slate-300 py-3 sm:py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-3 w-96 max-w-[90%]" />
        </div>
        <Skeleton className="h-11 w-28 shrink-0 rounded-md sm:w-36" />
      </div>
      <div className="divide-y divide-slate-200 border-y border-slate-200">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-1.5 py-2"
          >
            <Skeleton className="h-4 w-4 rounded-sm" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-36 max-w-[70%]" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function NHLScheduleHomeCardSkeleton() {
  return (
    <section
      aria-label="Loading NHL schedule"
      aria-busy="true"
      className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <div className="space-y-3 border-b border-slate-100 p-4">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-11 w-full" />
      </div>
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    </section>
  );
}

export function HomeSkeleton() {
  return (
    <main
      aria-label="Loading GSHL league overview"
      aria-busy="true"
      className="gshl-page"
    >
      <div className="border-b border-slate-200 py-2">
        <Skeleton className="my-2 h-4 w-28" />
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-20 w-40 shrink-0" />
          ))}
        </div>
      </div>
      <div className="border-b border-slate-200 py-2">
        <Skeleton className="my-2 h-4 w-36" />
        <Skeleton className="h-14 w-full" />
      </div>
      <div className="grid gap-x-6 lg:grid-cols-2">
        <LeagueActivityCardSkeleton />
        <PowerRankingsHomeCardSkeleton />
      </div>
    </main>
  );
}
