import { Skeleton } from "../ui/skeleton";

const ContractRowSkeleton = () => (
  <div className="flex gap-1 border-b border-gray-100 py-1">
    <Skeleton className="h-4 w-32" />
    <Skeleton className="h-4 w-12" />
    <Skeleton className="h-4 w-8" />
    <Skeleton className="h-4 w-16" />
    <Skeleton className="h-4 w-16" />
    <Skeleton className="h-4 w-16" />
    <Skeleton className="h-4 w-16" />
    <Skeleton className="h-4 w-16" />
  </div>
);

export function TeamContractTableSkeleton() {
  return (
    <div className="mx-auto w-full">
      <Skeleton className="mx-auto mb-4 mt-4 h-6 w-40" />
      <div className="no-scrollbar overflow-x-auto">
        <div className="min-w-max px-4">
          {/* Header */}
          <div className="flex gap-1 border-b border-gray-400 pb-1">
            <Skeleton className="h-4 w-32 bg-gray-700" />
            <Skeleton className="h-4 w-12 bg-gray-700" />
            <Skeleton className="h-4 w-8 bg-gray-700" />
            <Skeleton className="h-4 w-16 bg-gray-700" />
            <Skeleton className="h-4 w-16 bg-gray-700" />
            <Skeleton className="h-4 w-16 bg-gray-700" />
            <Skeleton className="h-4 w-16 bg-gray-700" />
            <Skeleton className="h-4 w-16 bg-gray-700" />
          </div>
          {/* Player rows */}
          {Array.from({ length: 10 }).map((_, i) => (
            <ContractRowSkeleton key={i} />
          ))}
          {/* Cap space row */}
          <div className="flex gap-1 border-t border-gray-600 pt-1">
            <Skeleton className="h-4 w-32 bg-gray-300" />
            <Skeleton className="h-4 w-12 bg-gray-300" />
            <Skeleton className="h-4 w-8 bg-gray-300" />
            <Skeleton className="h-4 w-16 bg-gray-300" />
            <Skeleton className="h-4 w-16 bg-gray-300" />
            <Skeleton className="h-4 w-16 bg-gray-300" />
            <Skeleton className="h-4 w-16 bg-gray-300" />
            <Skeleton className="h-4 w-16 bg-gray-300" />
          </div>
        </div>
      </div>
    </div>
  );
}
