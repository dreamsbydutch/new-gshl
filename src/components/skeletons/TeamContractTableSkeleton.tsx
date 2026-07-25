import { Skeleton } from "../ui/SkeletonPrimitive";

function ContractRowSkeleton() {
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

export function TeamContractTableSkeleton() {
  return (
    <div className="mx-auto w-full">
      <Skeleton className="mx-auto mb-4 mt-4 h-6 w-40" />
      <div className="no-scrollbar mb-8 w-full overflow-x-auto overflow-y-hidden">
        <table className="mx-auto mt-2 min-w-max whitespace-nowrap">
          <thead>
            <tr>
              {[
                "w-32",
                "w-12",
                "w-8",
                "w-20",
                "w-20",
                "w-20",
                "w-20",
                "w-20",
              ].map((width, index) => (
                <th
                  key={index}
                  className={`bg-gray-800 p-1 ${
                    index < 3
                      ? `sticky z-30 ${
                          index === 0
                            ? "left-0"
                            : index === 1
                              ? "left-[8rem]"
                              : "left-[11rem]"
                        }`
                      : ""
                  } ${width}`}
                >
                  <Skeleton className="mx-auto h-3 w-3/4 bg-gray-600" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, index) => (
              <ContractRowSkeleton key={index} />
            ))}
            <tr>
              <td className="sticky left-0 z-20 border-t border-gray-800 bg-gray-200 px-2 py-1">
                <Skeleton className="mx-auto h-3 w-20 bg-gray-300" />
              </td>
              <td className="sticky left-[8rem] z-20 border-t border-gray-800 bg-gray-200" />
              <td className="sticky left-[11rem] z-20 border-t border-gray-800 bg-gray-200" />
              {Array.from({ length: 5 }).map((_, index) => (
                <td
                  key={index}
                  className="border-t border-gray-800 bg-gray-200 px-2 py-1"
                >
                  <Skeleton className="mx-auto h-3 w-14 bg-gray-300" />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
