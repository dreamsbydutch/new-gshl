import { Skeleton } from "../ui/SkeletonPrimitive";
import { TeamContractTableSkeleton } from "./TeamContractTableSkeleton";
import { TeamRosterSkeleton } from "./TeamRosterSkeleton";

export function LockerRoomHeaderSkeleton() {
  return (
    <header className="mx-auto flex max-w-3xl items-center justify-evenly p-4">
      <Skeleton className="h-24 w-24 shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-col items-center gap-2">
        <Skeleton className="h-8 w-52 max-w-[50vw]" />
        <Skeleton className="h-5 w-36 max-w-[40vw]" />
      </div>
    </header>
  );
}

export function CapLabSkeleton() {
  return (
    <section className="mx-auto mt-4 w-full max-w-6xl border-t border-slate-200 pt-3">
      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-4 w-16" />
        <Skeleton className="mx-auto h-3 w-96 max-w-[80%]" />
      </div>
      <div className="mx-auto mt-3 flex max-w-xl gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div className="w-32 space-y-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
    </section>
  );
}

export function ContractHistorySkeleton() {
  return (
    <section className="py-6">
      <Skeleton className="mx-auto mb-2 h-5 w-52" />
      <div className="no-scrollbar overflow-x-auto">
        <div className="mx-auto min-w-[64rem]">
          <div className="grid grid-cols-11 gap-2 bg-gray-800 px-2 py-1">
            {Array.from({ length: 11 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-full bg-gray-600" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-11 gap-2 border-b px-2 py-1"
            >
              {Array.from({ length: 11 }).map((_, cellIndex) => (
                <Skeleton key={cellIndex} className="h-3 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TeamHistorySkeleton() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 sm:px-6">
      <div className="grid gap-3 py-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-md justify-center gap-6 py-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-1 text-center">
            <Skeleton className="mx-auto h-7 w-10" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
      <div className="mx-auto mb-40 mt-8 w-full overflow-hidden rounded-md border border-slate-200">
        <div className="grid grid-cols-9 px-2 py-2">
          <Skeleton className="h-3 w-8 justify-self-center" />
          <Skeleton className="col-span-6 h-3 w-20 justify-self-center" />
          <Skeleton className="col-span-2 h-3 w-10 justify-self-center" />
        </div>
        <Skeleton className="h-8 w-full rounded-none bg-slate-200" />
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="grid min-h-10 grid-cols-9 items-center border-t px-2 py-2"
          >
            <Skeleton className="h-3 w-7 justify-self-center" />
            <Skeleton className="col-span-6 h-4 w-32 justify-self-center" />
            <Skeleton className="col-span-2 h-4 w-12 justify-self-center" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function TrophyCaseSkeleton() {
  return (
    <section className="pb-8 sm:pb-12">
      <div className="flex h-40 flex-col items-center pt-3">
        <Skeleton className="h-24 w-[85px] rounded-2xl" />
        <Skeleton className="-mt-3 h-10 w-10 rounded-full bg-slate-200" />
        <Skeleton className="mt-3 h-5 w-12" />
      </div>
      {Array.from({ length: 2 }).map((_, sectionIndex) => (
        <div key={sectionIndex}>
          <div className="mb-4 mt-8 flex items-center gap-3 px-3 sm:mb-6 sm:mt-12">
            <div className="h-0 flex-1 border-t-4 border-dotted border-gray-200" />
            <Skeleton className="h-3 w-28" />
            <div className="h-0 flex-1 border-t-4 border-dotted border-gray-200" />
          </div>
          <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8">
            {Array.from({ length: sectionIndex === 0 ? 3 : 2 }).map(
              (_, awardIndex) => (
                <div key={awardIndex}>
                  <div className="px-3 sm:px-4">
                    <Skeleton className="h-3 w-52 max-w-[80%] sm:h-4" />
                    <Skeleton className="mt-1 h-2.5 w-32" />
                  </div>
                  <div className="mt-2 grid grid-cols-6 border-y border-slate-200 bg-slate-50/80 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
                    {Array.from({ length: awardIndex + 2 }).map(
                      (_, trophyIndex) => (
                        <div
                          key={trophyIndex}
                          className="flex flex-col items-center border-r border-slate-200 px-1 py-2"
                        >
                          <Skeleton className="h-8 w-8" />
                          <Skeleton className="-mt-1 h-4 w-4 rounded-full bg-slate-200" />
                          <Skeleton className="mt-1 h-2.5 w-7" />
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

export function TeamRecordBookSkeleton() {
  return (
    <section className="pb-12 pt-2">
      <div className="mx-auto max-w-[96rem] px-3 sm:px-4">
        <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
          <div className="space-y-3 border-b border-slate-200 p-3 sm:p-4">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-20 rounded-md" />
              ))}
              <Skeleton className="ml-auto h-8 w-44 rounded-md" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[105rem]">
              <div className="grid grid-cols-[15rem_4rem_repeat(14,5rem)] gap-2 bg-slate-50 px-3 py-3">
                {Array.from({ length: 16 }).map((_, index) => (
                  <Skeleton key={index} className="h-3 w-full" />
                ))}
              </div>
              {Array.from({ length: 9 }).map((_, rowIndex) => (
                <div
                  key={rowIndex}
                  className="grid grid-cols-[15rem_4rem_repeat(14,5rem)] items-center gap-2 border-t px-3 py-2.5"
                >
                  {Array.from({ length: 16 }).map((_, cellIndex) => (
                    <Skeleton
                      key={cellIndex}
                      className={cellIndex === 0 ? "h-5 w-44" : "h-3 w-10"}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LockerRoomSalarySkeleton() {
  return (
    <>
      <LockerRoomHeaderSkeleton />
      <TeamContractTableSkeleton />
      <CapLabSkeleton />
      <ContractHistorySkeleton />
    </>
  );
}

export function LockerRoomSkeleton() {
  return (
    <>
      <LockerRoomHeaderSkeleton />
      <TeamRosterSkeleton />
    </>
  );
}
