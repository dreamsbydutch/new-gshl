"use client";

import { cn, formatMoney, showDate } from "@gshl-utils";
import type { GSHLTeam } from "@gshl-types";
import type { FranchiseContractHistoryRowType } from "@gshl-hooks/main/useContract";

const EmptyState = () => (
  <div className="text-center text-xs text-muted-foreground">
    No expired contracts found for this franchise.
  </div>
);

const ScopeBadges = ({
  row,
  franchiseById,
}: {
  row: FranchiseContractHistoryRowType;
  franchiseById: Map<string, GSHLTeam>;
}) => {
  const signedTeamName =
    franchiseById.get(row.signingFranchiseId)?.name ?? "Signing franchise";
  const heldTeamName =
    franchiseById.get(row.currentFranchiseId)?.name ?? "Current holder";

  return (
    <div className="flex justify-center gap-1">
      {row.signedHere ? (
        <span
          className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800"
          title={signedTeamName ?? undefined}
        >
          Signed Here
        </span>
      ) : null}
      {row.heldHere ? (
        <span
          className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-800"
          title={heldTeamName ?? undefined}
        >
          Held Here
        </span>
      ) : null}
      {!row.signedHere && !row.heldHere ? (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
          Legacy
        </span>
      ) : null}
    </div>
  );
};

const ContractHistoryRow = ({
  row,
  franchiseById,
  rowBg,
}: {
  row: FranchiseContractHistoryRowType;
  franchiseById: Map<string, GSHLTeam>;
  rowBg: string;
}) => {
  return (
    <tr className={cn("text-center", rowBg)}>
      <td className={cn("sticky left-0 whitespace-nowrap px-2 py-1", rowBg)}>
        {row.playerName}
      </td>
      <td className="px-2 py-1">
        <ScopeBadges row={row} franchiseById={franchiseById} />
      </td>
      <td className="px-2 py-1 whitespace-nowrap">{row.season}</td>
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
    </tr>
  );
};

export interface FranchiseContractHistoryProps {
  rows: FranchiseContractHistoryRowType[];
  franchiseById: Map<string, GSHLTeam>;
  hasData: boolean;
}

export function FranchiseContractHistory({
  rows,
  franchiseById,
  hasData,
}: FranchiseContractHistoryProps) {
  return (
    <div className="py-6">
      <h2 className="mb-2 text-center text-lg font-bold">
        Franchise Contract History
      </h2>

      {!hasData && <EmptyState />}

      {hasData && (
        <div className="no-scrollbar overflow-x-auto">
          <table className="mx-auto min-w-max text-xs">
            <thead>
              <tr className="bg-gray-800 text-gray-200">
                <th className="sticky left-0 bg-gray-800 px-2 py-1 text-center font-normal">
                  Player
                </th>
                <th className="px-2 py-1 text-center font-normal">Scope</th>
                <th className="px-2 py-1 text-center font-normal">Season</th>
                <th className="px-2 py-1 text-center font-normal">Len</th>
                <th className="px-2 py-1 text-center font-normal">Salary</th>
                <th className="px-2 py-1 text-center font-normal">Cap Hit</th>
                <th className="px-2 py-1 text-center font-normal">Start</th>
                <th className="px-2 py-1 text-center font-normal">End</th>
                <th className="px-2 py-1 text-center font-normal">Signing</th>
                <th className="px-2 py-1 text-center font-normal">Expiry</th>
                <th className="px-2 py-1 text-center font-normal">Buyout End</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const rowBg = index % 2 === 0 ? "bg-white" : "bg-gray-100";
                return (
                  <ContractHistoryRow
                    key={row.id || `${row.playerName}-${row.start}-${index}`}
                    row={row}
                    franchiseById={franchiseById}
                    rowBg={rowBg}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const OwnerContractHistory = FranchiseContractHistory;
