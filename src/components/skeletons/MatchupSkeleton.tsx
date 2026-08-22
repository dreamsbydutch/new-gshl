import { Skeleton } from "../ui/SkeletonPrimitive";

function MatchupTeamSkeleton() {
  return (
    <div className="flex min-w-0 items-center justify-center gap-2 sm:gap-3">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full sm:h-11 sm:w-11" />
      <div className="min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-28 max-w-full sm:h-5 sm:w-36" />
        <Skeleton className="h-2.5 w-16" />
      </div>
      <Skeleton className="h-9 w-8 shrink-0 sm:h-10 sm:w-12" />
    </div>
  );
}

function CategoryComparisonSkeleton() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-4">
      <Skeleton className="mb-4 h-6 w-40" />
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <div className="min-w-[44rem]">
          {Array.from({ length: 3 }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-[5rem_repeat(10,minmax(3.5rem,1fr))] items-center gap-2 border-b border-slate-100 px-2 py-3 last:border-0 sm:grid-cols-[7rem_repeat(10,minmax(3.5rem,1fr))] sm:px-3"
            >
              <Skeleton className="h-3 w-14" />
              {Array.from({ length: 10 }).map((_, cellIndex) => (
                <Skeleton
                  key={cellIndex}
                  className={rowIndex === 0 ? "h-3" : "h-4"}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlayerPerformanceSkeleton() {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-3 w-16 shrink-0" />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[64rem]">
          {Array.from({ length: 9 }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-[7rem_repeat(12,minmax(3.25rem,1fr))] items-center gap-2 border-b border-slate-100 px-2 py-2.5 last:border-0 sm:grid-cols-[10rem_repeat(12,minmax(3.25rem,1fr))] sm:px-3"
            >
              <Skeleton className="h-4 w-24 sm:w-32" />
              {Array.from({ length: 12 }).map((_, cellIndex) => (
                <Skeleton
                  key={cellIndex}
                  className={rowIndex === 0 ? "h-3" : "h-4"}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MatchupSkeleton() {
  return (
    <main
      aria-labelledby="matchup-loading-heading"
      className="mx-auto max-w-6xl px-2 py-3 sm:px-4 sm:py-8"
    >
      <h1 id="matchup-loading-heading" className="sr-only">
        Loading matchup
      </h1>
      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-6">
        <Skeleton className="hidden h-11 w-40 rounded-full lg:block" />
        <Skeleton className="ml-auto h-3 w-44" />
      </div>
      <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-2 shadow-sm sm:rounded-3xl sm:p-5">
        <div className="mb-2 border-b border-slate-200 pb-2 sm:mb-5 sm:pb-5">
          <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-4">
            <MatchupTeamSkeleton />
            <div className="space-y-2">
              <Skeleton className="mx-auto h-6 w-8 sm:h-8" />
              <Skeleton className="hidden h-3 w-20 sm:block" />
            </div>
            <MatchupTeamSkeleton />
          </div>
        </div>
        <div className="space-y-2 sm:space-y-4">
          <CategoryComparisonSkeleton />
          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-4">
            <div className="mb-2 sm:mb-4">
              <Skeleton className="h-6 w-28" />
            </div>
            <div className="grid grid-cols-3 items-start gap-1.5 sm:gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className={`min-w-0 space-y-2 rounded-xl border p-1.5 text-center sm:p-3 ${
                    index === 0 ? "mt-4" : index === 2 ? "mt-8" : ""
                  }`}
                >
                  <Skeleton className="mx-auto h-7 w-12 max-w-full sm:w-16" />
                  <Skeleton className="mx-auto h-3 w-16 max-w-full sm:w-20" />
                  <Skeleton className="mx-auto h-4 w-20 max-w-full sm:w-28" />
                  <Skeleton className="mx-auto h-3 w-16 max-w-full sm:w-20" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
      <section className="mt-3 space-y-2 sm:mt-6 sm:space-y-4">
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={index}
              className="flex min-h-12 items-center justify-center gap-2 border-r p-2 last:border-0 sm:min-h-24 sm:gap-3 sm:p-3"
            >
              <Skeleton className="h-9 w-9 rounded-full sm:h-12 sm:w-12" />
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-5 w-28 max-w-full" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
        <PlayerPerformanceSkeleton />
      </section>
    </main>
  );
}
