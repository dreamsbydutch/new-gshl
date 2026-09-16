"use client";

import { cn, formatMoney, showDate } from "@gshl-utils";
import { TableViewport } from "@gshl-ui";
import type {
  FranchiseContractHistoryProps,
  FranchiseContractHistoryRowType,
} from "@gshl-types";

const EmptyState = () => (
  <div className="py-4 text-center text-sm text-muted-foreground">
    No expired contracts found for this franchise.
  </div>
);

function getContractValueClassName(contractValue: number | null) {
  return contractValue === null
    ? "text-muted-foreground"
    : contractValue > 0
      ? "text-emerald-700"
      : contractValue < 0
        ? "text-rose-700"
        : "";
}

const ContractHistoryRow = ({
  row,
  rowBg,
}: {
  row: FranchiseContractHistoryRowType;
  rowBg: string;
}) => {
  const contractValueClassName = getContractValueClassName(row.contractValue);

  return (
    <tr className={cn("text-center", rowBg)}>
      <th
        scope="row"
        className={cn(
          "sticky left-0 z-20 whitespace-nowrap px-2 py-1 font-normal",
          rowBg,
        )}
      >
        {row.playerName}
      </th>
      <td className="whitespace-nowrap px-2 py-1">{row.season}</td>
      <td className="px-2 py-1 text-right">
        {row.length} {row.length === 1 ? "year" : "years"}
      </td>
      <td className="px-2 py-1 text-right">{formatMoney(row.salary)}</td>
      <td className="px-2 py-1 text-right">{formatMoney(row.capHit)}</td>
      <td className="whitespace-nowrap px-2 py-1">{showDate(row.start)}</td>
      <td className="whitespace-nowrap px-2 py-1">{showDate(row.end)}</td>
      <td className="whitespace-nowrap px-2 py-1">{row.signingStatus}</td>
      <td className="whitespace-nowrap px-2 py-1">{row.expiryStatus}</td>
      <td className="whitespace-nowrap px-2 py-1">
        {row.buyoutEnd ? showDate(row.buyoutEnd) : "-"}
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-2 py-1 text-right",
          contractValueClassName,
        )}
      >
        {row.contractValue === null ? "-" : formatMoney(row.contractValue)}
      </td>
      <td className="px-2 py-1">{row.type}</td>
    </tr>
  );
};

export function FranchiseContractHistory({
  rows,
  hasData,
}: FranchiseContractHistoryProps) {
  return (
    <section
      id="contract-history"
      aria-labelledby="contract-history-heading"
      className="scroll-mt-44 py-1"
    >
      <h2
        id="contract-history-heading"
        className="mb-3 text-base font-semibold"
      >
        Franchise Contract History
      </h2>

      {!hasData && <EmptyState />}

      {hasData && (
        <TableViewport
          ariaLabel="Franchise contract history"
          viewportClassName="rounded-none border-0"
          scrollHint="Scroll for complete contract details"
        >
          <table className="mx-auto min-w-max whitespace-nowrap text-xs">
            <caption className="sr-only">
              Expired contract history for this franchise
            </caption>
            <thead>
              <tr className="bg-gray-800 text-gray-200">
                <th
                  scope="col"
                  className="sticky left-0 z-30 bg-gray-800 px-2 py-1 text-center font-normal"
                >
                  Player
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Season
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Len
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Salary
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Cap Hit
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Start
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  End
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Signing
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Expiry
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Buyout End
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Contract Value
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Type
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const rowBg = index % 2 === 0 ? "bg-white" : "bg-gray-100";
                return (
                  <ContractHistoryRow
                    key={row.id || `${row.playerName}-${row.start}-${index}`}
                    row={row}
                    rowBg={rowBg}
                  />
                );
              })}
            </tbody>
          </table>
        </TableViewport>
      )}
    </section>
  );
}

export const OwnerContractHistory = FranchiseContractHistory;
