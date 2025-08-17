"use client";

import { useLeagueOfficeNavigation } from "@gshl-cache";
import {
  HorizontalToggle,
  SecondaryPageToolbar,
} from "@gshl-nav";
import type { ToggleItem } from "@gshl-types";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { selectedType, setSelectedType } = useLeagueOfficeNavigation();

  const pageToolbarProps: {
    toolbarKeys: ToggleItem<string | null>[];
    activeKey: string | null;
    className?: [string?, string?, string?];
  } = {
    className: ["bottom-24 h-8", "h-6", "text-xs"],
    activeKey: selectedType,
    toolbarKeys: [
      {
        key: "freeagent",
        value: "Free Agency",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "draftboard",
        value: "Draft Board",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "records",
        value: "Record Books",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
    ],
  };



  return (
    <div className="mb-32 font-varela lg:mb-4">
      {children}
      <SecondaryPageToolbar>
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
      </SecondaryPageToolbar>
    </div>
  );
}
