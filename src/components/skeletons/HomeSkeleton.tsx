import { cn } from "@gshl-utils";

import { Skeleton } from "../ui/SkeletonPrimitive";

export function LeagueWireRowsSkeleton() {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "flex items-start",
            index === 0
              ? "gap-4 bg-slate-50 px-4 py-5 sm:px-6 sm:py-6"
              : "gap-3 px-3 py-3 sm:px-5",
          )}
        >
          <Skeleton
            className={cn(
              "shrink-0",
              index === 0 ? "h-12 w-12 sm:h-14 sm:w-14" : "h-10 w-10",
            )}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton
              className={cn(
                "max-w-full",
                index === 0 ? "h-5 w-96" : "h-3.5 w-64",
              )}
            />
            <Skeleton className="h-3 w-72 max-w-[85%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeagueWireCardSkeleton() {
  return (
    <section className="h-full min-w-0 overflow-hidden border-y border-slate-300 bg-white sm:rounded-lg sm:border">
      <header className="space-y-2 border-b border-slate-800 bg-slate-950 px-4 py-4 sm:px-6 sm:py-5">
        <Skeleton className="h-7 w-40 bg-slate-700 sm:h-8" />
        <Skeleton className="h-3 w-64 max-w-full bg-slate-700 sm:h-3.5" />
      </header>
      <LeagueWireRowsSkeleton />
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

export function HomeSkeleton() {
  return (
    <main
      aria-label="Loading GSHL league dashboard"
      aria-busy="true"
      className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-5 sm:py-5"
    >
      <div className="space-y-3 sm:space-y-4 lg:space-y-5">
        <div className="-mx-3 w-[calc(100%+1.5rem)] min-w-0 sm:mx-auto sm:w-full sm:max-w-6xl">
          <LeagueWireCardSkeleton />
        </div>
        <UfaHomeCardSkeleton />
      </div>
    </main>
  );
}
