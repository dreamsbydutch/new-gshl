import { Skeleton } from "@gshl-ui";

function DraftDecisionCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-40 max-w-[80%]" />
          <Skeleton className="h-3 w-28 max-w-[65%]" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/45 p-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-1.5 text-center">
            <Skeleton className="mx-auto h-2.5 w-8" />
            <Skeleton className="mx-auto h-4 w-10" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-2 h-11 w-full rounded-lg" />
      <Skeleton className="mt-3 h-11 w-full rounded-md" />
    </div>
  );
}

/** Loading state for the active transactional Draft Hub route. */
export function DraftHubBoardSkeleton() {
  return (
    <main className="container mx-auto space-y-6 px-3 py-5 sm:px-4">
      <section className="rounded-2xl border bg-slate-900 p-5 shadow-lg sm:p-7">
        <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24 bg-slate-700" />
            <Skeleton className="h-8 w-52 max-w-full bg-slate-700" />
            <Skeleton className="h-4 w-40 bg-slate-700" />
          </div>
          <Skeleton className="h-20 w-full rounded-xl bg-slate-700 md:w-44" />
          <div className="space-y-2 md:justify-self-end">
            <Skeleton className="h-4 w-32 bg-slate-700" />
            <Skeleton className="h-4 w-24 bg-slate-700" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        {Array.from({ length: 2 }).map((_, columnIndex) => (
          <div key={columnIndex} className="space-y-2">
            <Skeleton className="mx-auto h-4 w-24" />
            {Array.from({ length: 3 }).map((_, rowIndex) => (
              <div
                key={rowIndex}
                className="flex min-h-14 items-center gap-2 rounded-md border bg-white p-2"
              >
                <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-full max-w-28" />
                  <Skeleton className="h-2.5 w-20 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section>
        <div className="mb-4 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="mb-3 space-y-3 sm:flex sm:items-center sm:justify-between sm:space-y-0">
          <Skeleton className="h-11 w-full sm:max-w-md" />
          <div className="flex gap-1 overflow-hidden">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-11 shrink-0 rounded-md" />
            ))}
          </div>
        </div>

        <div className="space-y-3 lg:hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2">
            <Skeleton className="h-11 w-full rounded-md" />
            <Skeleton className="h-11 w-11 rounded-md" />
          </div>
          {Array.from({ length: 4 }).map((_, index) => (
            <DraftDecisionCardSkeleton key={index} />
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-lg border lg:block">
          <div className="grid min-w-[72rem] grid-cols-[3rem_10rem_repeat(16,4rem)] gap-2 bg-muted/70 px-2 py-3">
            {Array.from({ length: 18 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-full" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="grid min-w-[72rem] grid-cols-[3rem_10rem_repeat(16,4rem)] items-center gap-2 border-t px-2 py-3"
            >
              {Array.from({ length: 18 }).map((_, cellIndex) => (
                <Skeleton key={cellIndex} className="h-3 w-full" />
              ))}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
