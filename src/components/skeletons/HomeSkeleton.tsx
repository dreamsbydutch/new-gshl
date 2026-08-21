import { Skeleton } from "../ui/SkeletonPrimitive";

export function LeagueActivityRowsSkeleton() {
  return (
    <div className="divide-y divide-slate-100 px-3 sm:px-5">
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
    <section className="h-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
      <header className="space-y-2 border-b border-slate-100 px-3 py-3 sm:px-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-56 max-w-full" />
      </header>
      <LeagueActivityRowsSkeleton />
    </section>
  );
}

export function PowerRankingsHomeCardSkeleton() {
  return (
    <section className="h-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 sm:px-5">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-11 w-20 rounded-lg" />
      </header>
      <div className="grid grid-cols-1 px-3 sm:grid-cols-2 sm:gap-x-4 sm:px-5">
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
    <section className="space-y-4 rounded-xl border bg-card p-2 shadow-sm sm:space-y-6 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-3 w-96 max-w-[90%]" />
        </div>
        <Skeleton className="h-11 w-28 shrink-0 rounded-md sm:w-36" />
      </div>
      <div className="space-y-3 lg:hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-36 max-w-[80%]" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2">
              {Array.from({ length: 5 }).map((_, metricIndex) => (
                <Skeleton key={metricIndex} className="mx-auto h-7 w-10" />
              ))}
            </div>
            <Skeleton className="mt-2 h-11 w-full" />
            <Skeleton className="mt-3 h-11 w-full" />
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-lg border lg:block">
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
    <main
      aria-label="Loading GSHL league dashboard"
      aria-busy="true"
      className="container mx-auto w-full space-y-3 px-3 py-3 sm:space-y-4 sm:px-5 sm:py-5 lg:space-y-5 lg:px-6"
    >
      <section className="flex h-16 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 sm:rounded-2xl">
        <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-2.5 w-36 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-[90%]" />
        </div>
        <Skeleton className="h-11 w-20 shrink-0 rounded-full" />
      </section>
      <UfaHomeCardSkeleton />
      <div className="grid min-w-0 items-start gap-3 sm:gap-4 xl:grid-cols-2">
        <PowerRankingsHomeCardSkeleton />
        <LeagueActivityCardSkeleton />
      </div>
    </main>
  );
}
