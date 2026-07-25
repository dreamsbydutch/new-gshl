import { Skeleton } from "../ui/SkeletonPrimitive";

function StandingsRowSkeleton() {
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.75rem_2.75rem_3.5rem] items-center gap-1.5 border-t border-slate-100 px-1.5 py-2.5 sm:grid-cols-[3rem_minmax(0,1fr)_5rem_5rem_6rem] sm:gap-3 sm:px-3 sm:py-3">
      <Skeleton className="h-3 w-4 justify-self-center" />
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
        <Skeleton className="h-7 w-7 shrink-0 rounded-lg sm:h-8 sm:w-8" />
        <Skeleton className="h-4 w-28 max-w-[70%]" />
      </div>
      <Skeleton className="h-3 w-4 justify-self-center" />
      <Skeleton className="h-3 w-4 justify-self-center" />
      <Skeleton className="h-4 w-6 justify-self-center" />
    </div>
  );
}

function StandingsGroupSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
        <Skeleton className="h-11 w-11 shrink-0 rounded-xl sm:h-16 sm:w-16" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-36 max-w-full" />
          <Skeleton className="h-3 w-48 max-w-[80%]" />
        </div>
      </div>
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.75rem_2.75rem_3.5rem] items-center gap-1.5 bg-slate-50 px-1.5 py-2.5 sm:grid-cols-[3rem_minmax(0,1fr)_5rem_5rem_6rem] sm:gap-3 sm:px-3 sm:py-3">
        <Skeleton className="h-2.5 w-6 justify-self-center" />
        <Skeleton className="h-2.5 w-10" />
        <Skeleton className="h-2.5 w-3 justify-self-center" />
        <Skeleton className="h-2.5 w-3 justify-self-center" />
        <Skeleton className="h-2.5 w-6 justify-self-center" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <StandingsRowSkeleton key={index} />
      ))}
    </section>
  );
}

export function StandingsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-2.5 py-3 sm:px-6 sm:py-4 lg:py-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3.5 shadow-sm sm:px-5 sm:py-4">
        <Skeleton className="h-4 w-52 max-w-[80%]" />
      </div>
      <StandingsGroupSkeleton />
      <StandingsGroupSkeleton />
    </div>
  );
}

function BracketMatchupSkeleton() {
  return (
    <div className="min-h-[92px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b bg-slate-50 px-2.5 py-1.5">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-2.5 w-12" />
      </div>
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-2 border-t border-slate-100 px-2.5 py-1.5 first:border-0"
        >
          <Skeleton className="h-2.5 w-8" />
          <Skeleton className="h-6 w-6 rounded-md" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-4 w-5" />
        </div>
      ))}
    </div>
  );
}

function BracketColumnSkeleton({ cards }: { cards: number }) {
  return (
    <section className="min-w-[280px]">
      <div className="flex min-h-14 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36 max-w-full" />
        </div>
      </div>
      <div
        className={`mt-3 grid h-[28rem] gap-4 ${
          cards === 1
            ? "content-center"
            : cards === 2
              ? "content-around"
              : "grid-rows-4"
        }`}
      >
        {Array.from({ length: cards }).map((_, index) => (
          <BracketMatchupSkeleton key={index} />
        ))}
      </div>
    </section>
  );
}

export function PlayoffBracketSkeleton() {
  return (
    <section className="pb-12 pt-4">
      <div className="mx-auto max-w-[96rem] px-3 sm:px-6">
        <div className="border-b border-slate-200 pb-4">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-2.5 shadow-sm sm:p-5">
          <div className="grid min-w-[875px] grid-cols-3 gap-5">
            <BracketColumnSkeleton cards={4} />
            <BracketColumnSkeleton cards={2} />
            <BracketColumnSkeleton cards={1} />
          </div>
        </div>
      </div>
    </section>
  );
}

function AwardRowSkeleton() {
  return (
    <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] sm:items-center sm:px-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
        <Skeleton className="h-5 w-40 max-w-[75%]" />
      </div>
      <div className="flex items-center gap-2.5 pl-[3.25rem] sm:pl-0">
        <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-32 max-w-full" />
          <Skeleton className="h-3 w-24 max-w-[80%]" />
        </div>
      </div>
    </div>
  );
}

export function SeasonAwardsSkeleton() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6 lg:pt-6">
      <header className="border-b border-slate-200 pb-6">
        <Skeleton className="h-4 w-28" />
      </header>
      <div className="mt-8 space-y-10">
        {Array.from({ length: 2 }).map((_, sectionIndex) => (
          <section key={sectionIndex}>
            <div className="mb-3 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-44" />
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 border-b bg-slate-50 px-5 py-2.5 sm:grid">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-12" />
              </div>
              <div className="divide-y divide-slate-100">
                {Array.from({ length: sectionIndex === 0 ? 5 : 4 }).map(
                  (_, rowIndex) => (
                    <AwardRowSkeleton key={rowIndex} />
                  ),
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
