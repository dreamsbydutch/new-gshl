import { Skeleton } from "../ui/skeleton";

const LockerRoomHeaderSkeleton = () => (
  <div className="flex flex-col items-center gap-3 px-4 py-6">
    <Skeleton className="h-24 w-24 rounded-lg" />
    <Skeleton className="h-6 w-40" />
    <Skeleton className="h-4 w-28" />
    <Skeleton className="h-4 w-20" />
  </div>
);

export function LockerRoomSkeleton() {
  return (
    <div className="mx-auto max-w-lg">
      <LockerRoomHeaderSkeleton />
      <div className="mt-2 px-4">
        {/* Simulates contract table rows */}
        <Skeleton className="mx-auto mb-2 h-5 w-36" />
        <div className="no-scrollbar overflow-x-auto">
          <div className="min-w-max">
            {/* Table header */}
            <div className="flex gap-1 border-b border-gray-300 pb-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
            {/* Player rows */}
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex gap-1 border-b border-gray-100 py-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
            {/* Cap space row */}
            <div className="flex gap-1 border-t border-gray-600 pt-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
