import { Skeleton } from "../ui/SkeletonPrimitive";
import { TableViewport } from "../ui/TableViewport";

function ContractRowSkeleton() {
  return (
    <tr>
      <th
        scope="row"
        className="sticky left-0 z-20 w-28 min-w-28 max-w-28 border-y border-gray-300 bg-gray-50 p-1 lg:w-32 lg:min-w-32 lg:max-w-32"
      >
        <Skeleton className="mx-auto h-3 w-24" />
      </th>
      <td className="w-12 border-y border-gray-300 bg-gray-50 p-1 lg:sticky lg:left-[8rem] lg:z-20">
        <Skeleton className="mx-auto h-3 w-7" />
      </td>
      <td className="w-8 border-y border-gray-300 bg-gray-50 p-1 lg:sticky lg:left-[11rem] lg:z-20">
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
    <section
      id="cap-overview"
      aria-label="Loading salary cap"
      className="mx-auto w-full scroll-mt-44"
    >
      <Skeleton className="mb-3 h-5 w-40" />

      <TableViewport
        ariaLabel="Loading salary cap commitments"
        scrollHint="Scroll to compare cap seasons"
      >
        <table className="mx-auto min-w-max whitespace-nowrap">
          <caption className="sr-only">Loading salary cap commitments</caption>
          <thead>
            <tr>
              {[
                "w-28 min-w-28 max-w-28 lg:w-32 lg:min-w-32 lg:max-w-32",
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
                  scope="col"
                  className={`bg-gray-800 p-1 ${
                    index < 3
                      ? `lg:sticky lg:z-30 ${
                          index === 0
                            ? "sticky left-0 z-30"
                            : index === 1
                              ? "lg:left-[8rem]"
                              : "lg:left-[11rem]"
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
              <th
                scope="row"
                className="sticky left-0 z-20 border-t border-gray-800 bg-gray-200 px-2 py-1"
              >
                <Skeleton className="mx-auto h-3 w-20 bg-gray-300" />
              </th>
              <td className="border-t border-gray-800 bg-gray-200 lg:sticky lg:left-[8rem] lg:z-20" />
              <td className="border-t border-gray-800 bg-gray-200 lg:sticky lg:left-[11rem] lg:z-20" />
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
      </TableViewport>
    </section>
  );
}
