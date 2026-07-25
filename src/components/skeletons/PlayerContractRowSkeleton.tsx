import type { PlayerContractRowSkeletonProps } from "@gshl-types";
import { Skeleton } from "../ui/SkeletonPrimitive";

export function PlayerContractRowSkeleton({
  contract: _contract,
}: PlayerContractRowSkeletonProps) {
  return (
    <tr>
      <td className="sticky left-0 z-20 w-32 border-y border-gray-300 bg-gray-50 p-1">
        <Skeleton className="mx-auto h-3 w-24" />
      </td>
      <td className="sticky left-[8rem] z-20 w-12 border-y border-gray-300 bg-gray-50 p-1">
        <Skeleton className="mx-auto h-3 w-7" />
      </td>
      <td className="sticky left-[11rem] z-20 w-8 border-y border-gray-300 bg-gray-50 p-1">
        <Skeleton className="mx-auto h-4 w-4 rounded-sm" />
      </td>
      {Array.from({ length: 5 }).map((_, index) => (
        <td key={index} className="border-y border-gray-300 px-2 py-1">
          <Skeleton className="mx-auto h-3 w-14" />
        </td>
      ))}
    </tr>
  );
}
