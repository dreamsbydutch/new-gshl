import { Skeleton } from "../ui/skeleton";

const ConferenceContestRowSkeleton = () => (
  <tr className="border-b">
    <td className="p-2">
      <Skeleton className="h-4 w-24" />
    </td>
    <td className="p-2">
      <div className="flex gap-1">
        <Skeleton className="h-6 w-6 rounded-md" />
        <Skeleton className="h-6 w-6 rounded-md" />
        <Skeleton className="h-6 w-6 rounded-md" />
      </div>
    </td>
    <td className="p-2">
      <div className="flex gap-1">
        <Skeleton className="h-6 w-6 rounded-md" />
        <Skeleton className="h-6 w-6 rounded-md" />
        <Skeleton className="h-6 w-6 rounded-md" />
      </div>
    </td>
  </tr>
);

export function ConferenceContestSkeleton() {
  return (
    <div>
      <Skeleton className="mb-4 h-8 w-52" />
      <div className="mb-8">
        <Skeleton className="mb-2 h-6 w-20" />
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">
                  <Skeleton className="h-4 w-12" />
                </th>
                <th className="p-2 text-left">
                  <Skeleton className="h-4 w-24" />
                </th>
                <th className="p-2 text-left">
                  <Skeleton className="h-4 w-24" />
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <ConferenceContestRowSkeleton key={i} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
