import { Skeleton } from "../ui/SkeletonPrimitive";

function DraftPickEntrySkeleton({
  emphasis = "none",
}: {
  emphasis?: "high" | "medium" | "none";
}) {
  return (
    <div
      className={`mx-auto flex w-5/6 items-center justify-center gap-2 px-2 ${
        emphasis === "high"
          ? "rounded-md border bg-green-50 p-2 shadow-lg"
          : emphasis === "medium"
            ? "rounded-md border p-1 shadow-sm"
            : "py-1"
      }`}
    >
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-4 rounded-sm" />
      <Skeleton className="h-4 w-24" />
    </div>
  );
}

function DraftPlayerTableSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "mt-6" : "mt-8"}>
      <Skeleton className="mb-2 h-6 w-36" />
      <div className="overflow-x-auto">
        <div className="min-w-[42rem]">
          <div className="grid grid-cols-[3rem_3rem_2.5rem_10rem_3rem_repeat(6,4rem)] gap-2 border-b px-1 py-2">
            {Array.from({ length: 11 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-full" />
            ))}
          </div>
          {Array.from({ length: compact ? 10 : 8 }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-[3rem_3rem_2.5rem_10rem_3rem_repeat(6,4rem)] items-center gap-2 border-b px-1 py-2"
            >
              <Skeleton className="h-3 w-6" />
              <Skeleton className="h-3 w-6" />
              <Skeleton className="h-5 w-5 rounded-sm" />
              <Skeleton className="h-4 w-28" />
              {Array.from({ length: 7 }).map((_, cellIndex) => (
                <Skeleton key={cellIndex} className="h-3 w-10" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RosterPlayerSkeleton() {
  return (
    <div className="col-span-2 space-y-1 px-1 py-1.5">
      <Skeleton className="mx-auto h-3 w-20" />
      <div className="flex justify-center gap-2">
        <Skeleton className="h-2.5 w-6" />
        <Skeleton className="h-4 w-4 rounded-sm" />
        <Skeleton className="h-3 w-8 rounded-lg" />
      </div>
    </div>
  );
}

function TeamRosterCardSkeleton() {
  return (
    <div className="w-80 px-2 py-3">
      <Skeleton className="mx-auto mb-1 h-12 w-12 rounded-md" />
      <Skeleton className="mx-auto h-6 w-40" />
      <Skeleton className="mx-auto mt-10 h-6 w-32" />
      <div className="mx-auto mt-5 max-w-md rounded-xl border bg-gray-50 p-2">
        {Array.from({ length: 5 }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-6">
            {Array.from({ length: rowIndex < 2 ? 3 : 2 }).map(
              (_, playerIndex) => (
                <RosterPlayerSkeleton key={playerIndex} />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DraftBoardTableSkeleton() {
  return <DraftPlayerTableSkeleton />;
}

export function DraftAdminListSkeleton() {
  return (
    <div className="mt-8">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <Skeleton className="mb-4 h-4 w-64" />
      <Skeleton className="mb-4 h-10 w-full rounded-md" />
      <div className="overflow-x-auto">
        <div className="min-w-[46rem]">
          <div className="grid grid-cols-[3rem_12rem_4rem_4rem_7rem_6rem_5rem] gap-3 border-b px-2 py-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-full" />
            ))}
          </div>
          {Array.from({ length: 10 }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-[3rem_12rem_4rem_4rem_7rem_6rem_5rem] items-center gap-3 border-b px-2 py-2"
            >
              <Skeleton className="h-6 w-6 rounded-sm" />
              <Skeleton className="h-4 w-32" />
              {Array.from({ length: 4 }).map((_, cellIndex) => (
                <Skeleton key={cellIndex} className="h-3 w-10" />
              ))}
              <Skeleton className="h-8 w-14 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockDraftPickSkeleton() {
  return (
    <div className="rounded-md border bg-slate-50 p-2 shadow-sm">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-sm" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
      <div className="mt-2 flex items-center gap-2 px-2">
        <Skeleton className="h-6 w-6 rounded-sm" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-2.5 w-20" />
        </div>
        <Skeleton className="h-7 w-16" />
      </div>
    </div>
  );
}

export function MockDraftSkeleton() {
  return (
    <div className="mt-8">
      <Skeleton className="mx-auto h-7 w-48" />
      <div className="mt-6 space-y-6">
        {Array.from({ length: 2 }).map((_, roundIndex) => (
          <section
            key={roundIndex}
            className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <Skeleton className="h-4 w-20" />
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
              {Array.from({ length: 4 }).map((_, pickIndex) => (
                <MockDraftPickSkeleton key={pickIndex} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function DraftBoardSkeleton() {
  return (
    <div className="mt-20 flex min-w-[72rem] flex-row gap-1">
      <div className="w-[425px] shrink-0">
        <div className="mb-6 space-y-2 text-center">
          <DraftPickEntrySkeleton emphasis="high" />
          <DraftPickEntrySkeleton emphasis="medium" />
          <DraftPickEntrySkeleton emphasis="medium" />
          <DraftPickEntrySkeleton />
          <DraftPickEntrySkeleton />
        </div>
        <DraftPlayerTableSkeleton compact />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-8">
        {[7, 5, 5].map((teamCount, sectionIndex) => (
          <div
            key={sectionIndex}
            className="flex flex-row flex-wrap items-center justify-center gap-2 rounded-lg bg-gray-50/50 p-1 shadow-md"
          >
            {Array.from({ length: teamCount }).map((_, teamIndex) => (
              <TeamRosterCardSkeleton key={teamIndex} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
