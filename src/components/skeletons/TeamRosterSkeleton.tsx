import { Skeleton } from "../ui/SkeletonPrimitive";

function PlayerCardSkeleton({ wide = true }: { wide?: boolean }) {
  return (
    <div
      className={`${wide ? "col-span-2" : ""} grid grid-cols-3 gap-x-1 px-2 py-1 text-center`}
    >
      <Skeleton className="col-span-3 mx-auto mb-1 h-3.5 w-24 max-w-full" />
      <Skeleton className="mx-auto h-2.5 w-7" />
      <Skeleton className="mx-auto h-4 w-4 rounded-sm" />
      <Skeleton className="mx-auto h-3 w-9 rounded-lg" />
      <Skeleton className="col-span-3 mx-auto mt-1 h-5 w-16 rounded-xl" />
    </div>
  );
}

function LineupRowSkeleton({ players = 3 }: { players?: number }) {
  return (
    <div className="grid min-h-14 grid-cols-6 items-center py-1.5">
      {Array.from({ length: players }).map((_, index) => (
        <PlayerCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function TeamRosterSkeleton() {
  return (
    <>
      <Skeleton className="mx-auto mt-12 h-6 w-36" />
      <div className="mx-auto mt-5 flex max-w-md flex-col overflow-hidden rounded-xl border bg-gray-50 px-1 py-2">
        <LineupRowSkeleton />
        <LineupRowSkeleton />
        <div className="mx-auto my-1 w-4/6 border-b border-gray-300" />
        <LineupRowSkeleton players={2} />
        <LineupRowSkeleton players={2} />
        <div className="mx-auto my-1 w-4/6 border-b border-gray-300" />
        <LineupRowSkeleton players={1} />
      </div>
      <div className="mx-auto mt-2 max-w-md rounded-xl border bg-amber-50/50 px-1 py-2">
        <div className="grid grid-cols-2 items-center">
          {Array.from({ length: 4 }).map((_, index) => (
            <PlayerCardSkeleton key={index} wide={false} />
          ))}
        </div>
      </div>
      <div className="mx-auto mt-4 flex max-w-md justify-center gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-14 rounded-full" />
        ))}
      </div>
    </>
  );
}
