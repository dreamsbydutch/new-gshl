import { Skeleton } from "../ui/skeleton";

const DraftPickEntrySkeleton = ({
  highlight = false,
}: {
  highlight?: boolean;
}) => (
  <div
    className={`mx-auto w-5/6 border-t border-gray-200 px-2 py-1 ${highlight ? "rounded-md border bg-gray-100 p-2 shadow-sm" : ""}`}
  >
    <Skeleton className={`mx-auto h-4 ${highlight ? "w-48" : "w-36"}`} />
  </div>
);

const TeamRosterCardSkeleton = () => (
  <div className="mx-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
    <Skeleton className="mx-auto mb-2 h-12 w-12 rounded" />
    <Skeleton className="mx-auto mb-2 h-5 w-24" />
    {Array.from({ length: 8 }).map((_, i) => (
      <div
        key={i}
        className="mx-auto w-5/6 border-t border-gray-100 px-2 py-0.5"
      >
        <Skeleton className="mx-auto h-3 w-32" />
      </div>
    ))}
  </div>
);

export function DraftBoardSkeleton() {
  return (
    <div className="mt-20 flex flex-row gap-1">
      {/* Left panel: upcoming picks + draft board list */}
      <div className="w-[425px]">
        <div className="mb-6 flex flex-col items-center justify-between">
          <div className="my-2 w-full space-y-2 text-center">
            <DraftPickEntrySkeleton highlight />
            <DraftPickEntrySkeleton highlight />
            <DraftPickEntrySkeleton />
            <DraftPickEntrySkeleton />
            <DraftPickEntrySkeleton />
          </div>
        </div>
        {/* Draft board list placeholder */}
        <div className="space-y-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <DraftPickEntrySkeleton key={i} />
          ))}
        </div>
      </div>
      {/* Right panel: team rosters */}
      <div className="flex flex-col gap-8">
        <div className="flex flex-row flex-wrap items-center justify-center gap-2 rounded-lg bg-gray-50 p-1 shadow-md">
          {Array.from({ length: 7 }).map((_, i) => (
            <TeamRosterCardSkeleton key={i} />
          ))}
        </div>
        <div className="flex flex-row flex-wrap items-center justify-center gap-2 rounded-lg p-1 shadow-md">
          {Array.from({ length: 5 }).map((_, i) => (
            <TeamRosterCardSkeleton key={i} />
          ))}
        </div>
        <div className="flex flex-row flex-wrap items-center justify-center gap-2 rounded-lg p-1 shadow-md">
          {Array.from({ length: 5 }).map((_, i) => (
            <TeamRosterCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
