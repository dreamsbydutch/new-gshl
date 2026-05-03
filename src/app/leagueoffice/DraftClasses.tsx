"use client";

import { HorizontalToggle, TertiaryPageToolbar } from "@gshl-components/ui/nav";
import { useActivePlayers, useContracts, useSeasonState } from "@gshl-hooks";
import { ContractStatus, type ToggleItem } from "@gshl-types";
import { cn, findMostRecentSeason } from "@gshl-utils";
import { useMemo, useState } from "react";
import { DraftClassesSkeleton } from "@gshl-skeletons";

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function DraftClasses() {
  const [selectedType, setSelectedType] = useState<string>("cyufa");
  const { currentSeason, defaultSeason, seasons } = useSeasonState();
  const draftClassSeason = useMemo(
    () => currentSeason ?? findMostRecentSeason(seasons) ?? defaultSeason,
    [currentSeason, defaultSeason, seasons],
  );
  const draftYear = Number(draftClassSeason?.year ?? new Date().getFullYear());
  const { data: players, isLoading: playersLoading } = useActivePlayers();
  const { data: contracts, isLoading: contractsLoading } = useContracts();

  if (playersLoading || contractsLoading) {
    return <DraftClassesSkeleton />;
  }

  const getDraftClassCutoff = (offset: number) =>
    new Date(draftYear + offset, 3, 19);

  const getDraftClassOffset = () =>
    selectedType === "cyufa"
      ? 0
      : selectedType === "nyufa"
        ? 1
        : selectedType === "fyufa"
          ? 2
          : 3;

  const cyDraftClass = players.filter(
    (player) =>
      !contracts.find(
        (a) =>
          a.playerId === player.id &&
          new Date(a.expiryDate) >= getDraftClassCutoff(0) &&
          new Date(a.startDate) < getDraftClassCutoff(0),
      ),
  );

  const nyDraftClass = players.filter(
    (player) =>
      !contracts.find(
        (a) =>
          a.playerId === player.id &&
          new Date(a.expiryDate) >= getDraftClassCutoff(1) &&
          new Date(a.startDate) < getDraftClassCutoff(1),
      ),
  );

  const fyDraftClass = players.filter(
    (player) =>
      !contracts.find(
        (a) =>
          a.playerId === player.id &&
          new Date(a.expiryDate) >= getDraftClassCutoff(2) &&
          new Date(a.startDate) < getDraftClassCutoff(2),
      ),
  );

  const lyDraftClass = players.filter(
    (player) =>
      !contracts.find(
        (a) =>
          a.playerId === player.id &&
          new Date(a.expiryDate) >= getDraftClassCutoff(3) &&
          new Date(a.startDate) < getDraftClassCutoff(3),
      ),
  );

  const pageToolbarProps: {
    toolbarKeys: ToggleItem<string | null>[];
    activeKey: string | null;
    className?: [string?, string?, string?];
  } = {
    className: ["bottom-24 h-8", "h-6", "text-xs"],
    activeKey: selectedType,
    toolbarKeys: [
      {
        key: "cyufa",
        value: draftYear.toString(),
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "nyufa",
        value: (draftYear + 1).toString(),
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "fyufa",
        value: (draftYear + 2).toString(),
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "lyufa",
        value: (draftYear + 3).toString(),
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
    ],
  };
  return (
    <div className="pb-20 lg:pb-8 lg:pt-8">
      <div className="mb-2 flex flex-col gap-4 text-center">
        <span className="text-2xs font-semibold">
          *Bold - UFAs guaranteed to be in draft class
        </span>
      </div>
      <table className="mx-auto">
        <thead>
          <tr>
            <td className="pb-2 text-center">Rk</td>
            <td className="pb-2 text-center">Player Name</td>
            <td className="pb-2 text-center">Overall</td>
            <td className="pb-2 text-center">This Yr</td>
          </tr>
        </thead>
        <tbody>
          {(selectedType === "cyufa"
            ? cyDraftClass
            : selectedType === "nyufa"
              ? nyDraftClass
              : selectedType === "fyufa"
                ? fyDraftClass
                : lyDraftClass
          )
            .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))
            .slice(0, 300)
            .map((player) => {
              const draftClassOffset = getDraftClassOffset();
              const previousCutoff = getDraftClassCutoff(draftClassOffset - 1);
              const cutoff = getDraftClassCutoff(getDraftClassOffset());
              const expiringContract = contracts
                .filter((contract) => String(contract.playerId) === String(player.id))
                .filter((contract) => {
                  const expiryDate = parseDate(contract.expiryDate);

                  if (!expiryDate) {
                    return false;
                  }

                  return (
                    previousCutoff.getTime() <= expiryDate.getTime() &&
                    expiryDate.getTime() < cutoff.getTime()
                  );
                })
                .sort((left, right) => {
                  const leftExpiry = parseDate(left.expiryDate)?.getTime() ?? 0;
                  const rightExpiry = parseDate(right.expiryDate)?.getTime() ?? 0;
                  return rightExpiry - leftExpiry;
                })[0];

              return (
                <tr
                  key={player.id}
                  className={cn(
                    "border-b border-gray-400 py-0.5 text-sm",
                    expiringContract?.expiryStatus === ContractStatus.UFA
                      ? "font-semibold"
                      : "",
                  )}
                >
                  <td className="text-center">{player.overallRk}</td>
                  <td className="text-center">
                    {player.firstName} {player.lastName}
                  </td>
                  <td className="text-center">{player.overallRating}</td>
                  <td className="text-center">{player.seasonRating}</td>
                </tr>
              );
            })}
        </tbody>
      </table>

      <TertiaryPageToolbar>
        <HorizontalToggle<ToggleItem<string | null>>
          items={pageToolbarProps.toolbarKeys}
          selectedItem={
            pageToolbarProps.toolbarKeys.find(
              (item) => item.key === pageToolbarProps.activeKey,
            ) ?? null
          }
          onSelect={(type: ToggleItem<string | null>) => type.setter(type.key)}
          getItemKey={(type: ToggleItem<string | null>) => type.key}
          getItemLabel={(type: ToggleItem<string | null>) => type.value}
          itemClassName="text-sm text-nowrap"
          className="no-scrollbar flex flex-row overflow-scroll"
        />
      </TertiaryPageToolbar>
    </div>
  );
}
