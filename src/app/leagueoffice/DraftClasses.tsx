"use client";

import { HorizontalToggle, TertiaryPageToolbar } from "@gshl-components/ui/nav";
import { useActivePlayers, useContracts } from "@gshl-hooks";
import { ContractStatus, type ToggleItem } from "@gshl-types";
import { cn, getCurrentSeason } from "@gshl-utils";
import { useState } from "react";

export function DraftClasses() {
  const [selectedType, setSelectedType] = useState<string>("nyufa");
  const year = +getCurrentSeason();
  const { data: players } = useActivePlayers();
  const { data: contracts } = useContracts();
  const cyDraftClass = players.filter(
    (player) =>
      !contracts.find(
        (a) =>
          a.playerId === player.id &&
          new Date(a.expiryDate) >= new Date(year + 1, 3, 19) &&
          new Date(a.startDate) < new Date(year + 1, 3, 19),
      ),
  );

  const nyDraftClass = players.filter(
    (player) =>
      !contracts.find(
        (a) =>
          a.playerId === player.id &&
          new Date(a.expiryDate) >= new Date(year + 2, 3, 19) &&
          new Date(a.startDate) < new Date(year + 2, 3, 19),
      ),
  );

  const fyDraftClass = players.filter(
    (player) =>
      !contracts.find(
        (a) =>
          a.playerId === player.id &&
          new Date(a.expiryDate) >= new Date(year + 3, 3, 19) &&
          new Date(a.startDate) < new Date(year + 3, 3, 19),
      ),
  );

  const lyDraftClass = players.filter(
    (player) =>
      !contracts.find(
        (a) =>
          a.playerId === player.id &&
          new Date(a.expiryDate) >= new Date(year + 4, 3, 19) &&
          new Date(a.startDate) < new Date(year + 4, 3, 19),
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
        value: year.toString(),
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "nyufa",
        value: (+year + 1).toString(),
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "fyufa",
        value: (+year + 2).toString(),
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "lyufa",
        value: (+year + 3).toString(),
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
    ],
  };
  return (
    <>
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
              const contract = contracts.find(
                (c) =>
                  c.playerId === player.id &&
                  new Date(c.expiryDate) >=
                    new Date(
                      year +
                        (selectedType === "cyufa"
                          ? 0
                          : selectedType === "nyufa"
                            ? 1
                            : selectedType === "fyufa"
                              ? 2
                              : 3),
                      3,
                      19,
                    ),
              );
              return (
                <tr
                  key={player.id}
                  className={cn(
                    "border-b border-gray-400 py-0.5 text-sm",
                    contract?.expiryStatus === ContractStatus.UFA ? "font-semibold" : "",
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
    </>
  );
}
