"use client";

import { useLockerRoomNavigation } from "@gshl-cache";
import { useSeasonState } from "@gshl-hooks";
import {
  HorizontalToggle,
  SecondaryPageToolbar,
  TeamsToggle,
  TertiaryPageToolbar,
} from "@gshl-nav";
import type { ToggleItem } from "@gshl-types";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { selectedType, setSelectedType } = useLockerRoomNavigation();
  const { selectedSeason, currentSeason, defaultSeason } = useSeasonState();
  const activeSeason = selectedSeason ?? currentSeason ?? defaultSeason;
  const activeSeasonId = activeSeason?.id?.toString();

  const pageToolbarProps: {
    toolbarKeys: ToggleItem<string | null>[];
    activeKey: string | null;
    className?: [string?, string?, string?];
  } = {
    className: ["bottom-24 h-8", "h-6", "text-xs"],
    activeKey: selectedType,
    toolbarKeys: [
      {
        key: "roster",
        value: "Current Roster",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "salary",
        value: "Salary Cap",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "history",
        value: "History",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "trophy",
        value: "Trophy Case",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "draft",
        value: "Draft",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
    ],
  };
  return (
    <div className="mb-32 font-varela lg:mb-4">
      {children}
      <SecondaryPageToolbar>
        <TeamsToggle seasonId={activeSeasonId} />
      </SecondaryPageToolbar>
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
          itemClassName="py-0.5 text-sm"
        />
      </TertiaryPageToolbar>
    </div>
  );
}
