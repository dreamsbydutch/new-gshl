import { Skeleton } from "../ui/skeleton";

const DraftClassRowSkeleton = ({ rank }: { rank: number }) => (
  <tr>
    <td className="py-1 text-center">
      <Skeleton className="mx-auto h-4 w-6" />
    </td>
    <td className="py-1 text-center">
      <Skeleton
        className="mx-auto h-4"
        style={{ width: `${100 + (rank % 3) * 20}px` }}
      />
    </td>
    <td className="py-1 text-center">
      <Skeleton className="mx-auto h-4 w-10" />
    </td>
    <td className="py-1 text-center">
      <Skeleton className="mx-auto h-4 w-10" />
    </td>
  </tr>
);

export function DraftClassesSkeleton() {
  return (
    <div>
      <div className="mb-2 flex flex-col gap-4 text-center">
        <Skeleton className="mx-auto h-4 w-64" />
      </div>
      <table className="mx-auto">
        <thead>
          <tr>
            <td className="pb-2 text-center">
              <Skeleton className="mx-auto h-4 w-6" />
            </td>
            <td className="pb-2 text-center">
              <Skeleton className="mx-auto h-4 w-24" />
            </td>
            <td className="pb-2 text-center">
              <Skeleton className="mx-auto h-4 w-14" />
            </td>
            <td className="pb-2 text-center">
              <Skeleton className="mx-auto h-4 w-14" />
            </td>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 20 }).map((_, i) => (
            <DraftClassRowSkeleton key={i} rank={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
