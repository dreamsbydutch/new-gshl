import { Skeleton } from "../ui/skeleton";

const PlayerCardSkeleton = () => (
  <div className="col-span-2 grid grid-cols-2 px-2 text-center">
    <Skeleton className="col-span-3 mx-auto mb-1 h-3 w-20" />
    <Skeleton className="mx-auto h-2 w-8" />
    <Skeleton className="mx-auto h-4 w-4 rounded-full" />
    <Skeleton className="mx-auto h-2 w-10 rounded-lg" />
    <Skeleton className="col-span-3 mx-auto mt-1 h-2 w-12 rounded-xl" />
  </div>
);

const PositionGroupSkeleton = ({
  label,
  count,
}: {
  label: string;
  count: number;
}) => (
  <div className="mb-4">
    <div className="mx-2 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-gray-500">
      <div className="col-span-3 border-b pb-1">{label}</div>
    </div>
    <div className="mx-2 mt-2 grid grid-cols-3 gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <PlayerCardSkeleton key={i} />
      ))}
    </div>
  </div>
);

export function TeamRosterSkeleton() {
  return (
    <div className="mx-auto max-w-lg px-2 py-4">
      <PositionGroupSkeleton label="Forwards" count={9} />
      <PositionGroupSkeleton label="Defense" count={4} />
      <PositionGroupSkeleton label="Goalies" count={2} />
      <div className="mt-4 border-t pt-3">
        <div className="mb-2 text-center text-xs font-semibold text-gray-500">
          Bench
        </div>
        <div className="mx-2 grid grid-cols-3 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <PlayerCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
