import { useMemo } from "react";
import type { Contract, GSHLTeam, Player, Season } from "@gshl-types";
import { formatMoney } from "@gshl-utils";
import Image from "next/image";

export interface OwnerContractHistoryProps {
  ownerId: number; // target owner
  teams?: GSHLTeam[]; // optional season-constrained teams
  allTeams?: GSHLTeam[]; // full multi-season team list preferred
  contracts?: Contract[];
  players?: Player[];
  seasons?: Season[];
}

export function OwnerContractHistory({
  ownerId,
  teams,
  allTeams,
  contracts,
  players,
  seasons,
}: OwnerContractHistoryProps) {
  // Stable pooled team list across renders; prevents re-computation churn in downstream memos
  const teamPool = useMemo(() => allTeams ?? teams ?? [], [allTeams, teams]);

  const ownerFranchiseIds = useMemo(
    () =>
      teamPool
        .filter((t) => t.ownerId === ownerId)
        .map((t) => t.franchiseId)
        .filter((v, i, arr) => arr.indexOf(v) === i),
    [teamPool, ownerId],
  );

  const playerById = useMemo(() => {
    const map = new Map<number, Player>();
    players?.forEach((p) => map.set(p.id, p));
    return map;
  }, [players]);

  const franchiseById = useMemo(() => {
    const map = new Map<number, GSHLTeam>();
    teamPool.forEach((t) => map.set(t.franchiseId, t));
    return map;
  }, [teamPool]);

  const seasonById = useMemo(() => {
    const map = new Map<number, Season>();
    seasons?.forEach((s) => map.set(s.id, s));
    return map;
  }, [seasons]);

  const rows = useMemo(() => {
    if (!contracts) return [];
    return contracts
      .filter((c) => ownerFranchiseIds.includes(c.signingFranchiseId))
      .sort((a, b) => b.signingDate.getTime() - a.signingDate.getTime())
      .map((c) => {
        const player = playerById.get(c.playerId);
        const season = seasonById.get(c.seasonId);
        return {
          id: c.id,
          signingFranchiseId: c.signingFranchiseId,
          playerName: player?.fullName ?? "Unknown",
          season: season?.name ?? String(c.seasonId),
          type: Array.isArray(c.contractType)
            ? c.contractType.join(", ")
            : c.contractType
              ? String(c.contractType)
              : "-",
          length: c.contractLength,
          salary: c.contractSalary,
          capHit: c.capHit,
          start: c.startDate.toISOString().slice(0, 10),
          end: c.capHitEndDate.toISOString().slice(0, 10),
          expiryStatus: c.expiryStatus,
        };
      });
  }, [contracts, ownerFranchiseIds, playerById, seasonById]);

  return (
    <div className="py-6">
      <h2 className="mb-2 text-center text-lg font-bold">
        Owner Contract History
      </h2>
      {rows.length === 0 && (
        <div className="text-center text-xs text-muted-foreground">
          No contracts found for owner.
        </div>
      )}
      {rows.length > 0 && (
        <div className="no-scrollbar overflow-x-auto">
          <table className="mx-auto min-w-max text-xs">
            <thead>
              <tr className="bg-gray-800 text-gray-200">
                <th className="sticky left-0 bg-gray-800 px-2 py-1 text-center font-normal">
                  Player
                </th>
                <th className="px-2 py-1 text-center font-normal">Team</th>
                <th className="px-2 py-1 text-center font-normal">Len</th>
                <th className="px-2 py-1 text-center font-normal">Salary</th>
                <th className="px-2 py-1 text-center font-normal">Start</th>
                <th className="px-2 py-1 text-center font-normal">End</th>
                <th className="px-2 py-1 text-center font-normal">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .slice()
                .sort((a, b) => b.salary - a.salary)
                .map((r, idx) => {
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-100";
                  return (
                    <tr key={r.id} className={`text-center ${rowBg}`}>
                      <td
                        className={`sticky left-0 whitespace-nowrap px-2 py-1 ${rowBg}`}
                      >
                        {r.playerName}
                      </td>
                      <td className="px-2 py-1 text-center">
                        {(() => {
                          const team = franchiseById.get(r.signingFranchiseId);
                          if (!team?.logoUrl) return <span>-</span>;
                          return (
                            <Image
                              src={team.logoUrl}
                              alt={team.name + " logo"}
                              width={24}
                              height={24}
                              className="mx-auto h-6 w-6 object-contain"
                            />
                          );
                        })()}
                      </td>
                      <td className="px-2 py-1 text-right">{r.length} years</td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(r.salary)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1">{r.start}</td>
                      <td className="whitespace-nowrap px-2 py-1">{r.end}</td>
                      <td className="whitespace-nowrap px-2 py-1">
                        {r.expiryStatus}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
