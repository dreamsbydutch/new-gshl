import { Skeleton } from "../ui/SkeletonPrimitive";

export function LeagueActivityRowsSkeleton() {
  return (
    <div className="divide-y divide-slate-100 px-4 sm:px-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 py-2.5">
          <Skeleton className="h-6 w-[5.25rem] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-36 max-w-full" />
            <Skeleton className="h-3 w-52 max-w-[80%]" />
          </div>
          <Skeleton className="h-3 w-14 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function LeagueActivityCardSkeleton() {
  return (
    <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="space-y-2 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-56 max-w-full" />
      </header>
      <LeagueActivityRowsSkeleton />
    </section>
  );
}

export function PowerRankingsHomeCardSkeleton() {
  return (
    <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-8 w-24 rounded-lg" />
      </header>
      <div className="grid grid-cols-1 px-4 sm:grid-cols-2 sm:gap-x-5 sm:px-5">
        {Array.from({ length: 16 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem_3.25rem] items-center gap-2 border-b border-slate-100 py-2"
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
    <section className="space-y-4 rounded-xl border bg-card p-2 shadow-sm sm:space-y-6 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-3 w-96 max-w-[90%]" />
        </div>
        <Skeleton className="h-8 w-28 shrink-0 rounded-md sm:h-10 sm:w-36" />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-[2rem_minmax(7rem,1.5fr)_3rem_repeat(3,minmax(4rem,0.8fr))] gap-2 bg-muted/60 px-2 py-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-full" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid grid-cols-[2rem_minmax(7rem,1.5fr)_3rem_repeat(3,minmax(4rem,0.8fr))] items-center gap-2 border-t px-2 py-2"
          >
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-4 w-28 max-w-full" />
            <Skeleton className="h-3 w-7" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function HomeSkeleton() {
  return (
    <main className="container mx-auto space-y-8 px-2 py-4 sm:px-4">
      <UfaHomeCardSkeleton />
      <PowerRankingsHomeCardSkeleton />
      <LeagueActivityCardSkeleton />
    </main>
  );
}
