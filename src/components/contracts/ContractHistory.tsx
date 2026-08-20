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
      <td className="px-2 py-1 text-right">{row.length} years</td>
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
    </tr>
  );
};

function ContractHistoryCard({
  row,
}: {
  row: FranchiseContractHistoryRowType;
}) {
  const contractValueClassName = getContractValueClassName(row.contractValue);
  const termLabel = `${row.length} ${row.length === 1 ? "year" : "years"}`;

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-950">
            {row.playerName}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.season}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
          {termLabel}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Salary</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">
            {formatMoney(row.salary)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cap hit</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">
            {formatMoney(row.capHit)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Contract value</dt>
          <dd className={cn("mt-0.5 font-semibold", contractValueClassName)}>
            {row.contractValue === null
              ? "Unavailable"
              : formatMoney(row.contractValue)}
          </dd>
        </div>
      </dl>

      <details className="border-t border-slate-100">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500">
          Contract details
          <span aria-hidden="true" className="text-muted-foreground">
            +
          </span>
        </summary>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-100 bg-slate-50 px-3 py-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Type</dt>
            <dd className="mt-0.5">{row.type}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Signing</dt>
            <dd className="mt-0.5">{row.signingStatus}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Start</dt>
            <dd className="mt-0.5">{showDate(row.start)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">End</dt>
            <dd className="mt-0.5">{showDate(row.end)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Expiry</dt>
            <dd className="mt-0.5">{row.expiryStatus}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Buyout end</dt>
            <dd className="mt-0.5">
              {row.buyoutEnd ? showDate(row.buyoutEnd) : "-"}
            </dd>
          </div>
        </dl>
      </details>
    </article>
  );
}

export function FranchiseContractHistory({
  rows,
  hasData,
}: FranchiseContractHistoryProps) {
  return (
    <section
      id="contract-history"
      aria-labelledby="contract-history-heading"
      className="scroll-mt-44 py-6"
    >
      <h2
        id="contract-history-heading"
        className="mb-3 text-center text-lg font-bold"
      >
        Franchise Contract History
      </h2>

      {!hasData && <EmptyState />}

      {hasData && (
        <div className="space-y-3 px-3 lg:hidden">
          {rows.map((row, index) => (
            <ContractHistoryCard
              key={row.id || `${row.playerName}-${row.start}-${index}`}
              row={row}
            />
          ))}
        </div>
      )}

      {hasData && (
        <TableViewport
          ariaLabel="Franchise contract history"
          className="hidden lg:block"
          scrollHint="Scroll for complete contract details"
        >
          <table className="mx-auto min-w-max text-xs">
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
