import { Skeleton } from "../ui/skeleton";

const StandingsRowSkeleton = () => (
  <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
    <Skeleton className="h-4 w-4 rounded-sm" />
    <Skeleton className="h-8 w-8 rounded-full" />
    <div className="flex flex-1 flex-col gap-1">
      <Skeleton className="h-3 w-28" />
    </div>
    <div className="flex gap-4">
      <Skeleton className="h-3 w-8" />
      <Skeleton className="h-3 w-8" />
      <Skeleton className="h-3 w-8" />
      <Skeleton className="h-3 w-10" />
    </div>
  </div>
);

const StandingsGroupSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="mb-6 overflow-hidden rounded-lg border border-gray-200">
    {/* Group header */}
    <div className="flex items-center justify-between bg-gray-100 px-3 py-2">
      <Skeleton className="h-4 w-32" />
      <div className="flex gap-4 pr-1">
        <Skeleton className="h-3 w-6" />
        <Skeleton className="h-3 w-6" />
        <Skeleton className="h-3 w-6" />
        <Skeleton className="h-3 w-8" />
      </div>
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <StandingsRowSkeleton key={i} />
    ))}
  </div>
);

export function StandingsSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <StandingsGroupSkeleton rows={5} />
      <StandingsGroupSkeleton rows={5} />
    </div>
  );
}
