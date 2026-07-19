"use client";

import Image from "next/image";
import { FileSignature } from "lucide-react";
import { useMemo } from "react";

import { useContracts, usePlayers, useTeams } from "@gshl-hooks";
import { ContractStatus, type GSHLTeam } from "@gshl-types";
import { formatMoney, showDate } from "@gshl-utils";

const RECENT_SIGNINGS_LIMIT = 6;
const SIGNING_STATUSES = [
  ContractStatus.DRAFTED,
  ContractStatus.RFA,
  ContractStatus.UFA,
];

export function RecentSigningsCard() {
  const {
    data: contracts,
    isLoading: contractsLoading,
    error: contractsError,
  } = useContracts({
    filters: {
      includeSigningStatuses: SIGNING_STATUSES,
      predicate: (contract) => Boolean(contract.signingDate),
    },
    sort: { by: "signingDate", direction: "desc" },
    take: RECENT_SIGNINGS_LIMIT,
  });
  const { data: players, isLoading: playersLoading } = usePlayers();
  const teamQuery = useTeams({ teamType: "gshl", statsLevel: "none" });
  const teams = teamQuery.data as GSHLTeam[];

  const playerById = useMemo(
    () => new Map(players.map((player) => [String(player.id), player])),
    [players],
  );
  const teamByOwnerAndSeason = useMemo(
    () =>
      new Map(
        teams.map((team) => [
          `${String(team.ownerId)}:${String(team.seasonId)}`,
          team,
        ]),
      ),
    [teams],
  );
  const latestTeamByOwner = useMemo(() => {
    const lookup = new Map<string, GSHLTeam>();
    teams.forEach((team) => {
      const ownerId = String(team.ownerId ?? "");
      if (!ownerId || lookup.has(ownerId)) return;
      lookup.set(ownerId, team);
    });
    return lookup;
  }, [teams]);

  const isLoading = contractsLoading || playersLoading || teamQuery.isLoading;

  return (
    <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-950 px-4 py-4 text-white sm:px-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
          <FileSignature className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-barlow text-[10px] uppercase tracking-[0.2em] text-emerald-300">
            Transaction wire
          </p>
          <h2 className="font-oswald text-2xl leading-none">Recent signings</h2>
        </div>
      </header>

      {isLoading ? (
        <div className="divide-y divide-slate-100 px-4 sm:px-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="flex animate-pulse items-center gap-3 py-3"
            >
              <div className="h-9 w-9 rounded-xl bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-36 rounded bg-slate-100" />
                <div className="h-2.5 w-24 rounded bg-slate-100" />
              </div>
              <div className="h-3 w-16 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : contractsError ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          Recent signings are unavailable right now.
        </p>
      ) : contracts.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          No contract signings have been recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 px-4 sm:px-5">
          {contracts.map((contract) => {
            const player = playerById.get(String(contract.playerId));
            const team =
              teamByOwnerAndSeason.get(
                `${String(contract.ownerId)}:${String(contract.seasonId)}`,
              ) ?? latestTeamByOwner.get(String(contract.ownerId));

            return (
              <li
                key={contract.id}
                className="flex min-w-0 items-center gap-3 py-3"
              >
                {team?.logoUrl ? (
                  <Image
                    src={team.logoUrl}
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 rounded-xl object-contain"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 font-oswald text-xs text-slate-500">
                    {team?.abbr?.slice(0, 3) ?? "GSHL"}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate font-oswald text-base text-slate-950">
                    {player?.fullName ?? "Unknown player"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {team?.name ?? "GSHL team"} · {contract.signingStatus}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold tabular-nums text-slate-800">
                    {contract.contractLength}{" "}
                    {contract.contractLength === 1 ? "yr" : "yrs"}
                    <span className="px-1 text-slate-300">·</span>
                    {formatMoney(contract.contractSalary, true)}
                  </p>
                  <time
                    dateTime={contract.signingDate}
                    className="text-[11px] text-slate-400"
                  >
                    {showDate(contract.signingDate)}
                  </time>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
