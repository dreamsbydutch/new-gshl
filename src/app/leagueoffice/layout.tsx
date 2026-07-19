"use client";

import { useLeagueOfficeNavigation } from "@gshl-hooks";
import {
  HorizontalToggle,
  SecondaryPageToolbar,
} from "@gshl-components/ui/nav";
import type { ToggleItem } from "@gshl-types";
import { useSession } from "next-auth/react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { selectedType, setSelectedType } = useLeagueOfficeNavigation();
  const { data: session } = useSession();

  const pageToolbarProps: {
    toolbarKeys: ToggleItem<string | null>[];
    activeKey: string | null;
    className?: [string?, string?, string?];
  } = {
    className: ["bottom-24 h-8", "h-6", "text-xs"],
    activeKey: selectedType,
    toolbarKeys: [
      {
        key: "draft",
        value: "Draft Classes",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "rules",
        value: "Rulebook",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "confBattle",
        value: "Conf v Conf",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "ownerRankings",
        value: "Owner Ladder",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      ...(session?.user.role === "commissioner"
        ? [
            {
              key: "contracts",
              value: "Contracts",
              setter: (type: string | null) => setSelectedType(type ?? ""),
            },
            {
              key: "users",
              value: "User Access",
              setter: (type: string | null) => setSelectedType(type ?? ""),
            },
            {
              key: "jobs",
              value: "Jobs",
              setter: (type: string | null) => setSelectedType(type ?? ""),
            },
          ]
        : []),
    ],
  };

  return (
    <div className="pb-24 font-varela lg:pb-8 lg:pt-12">
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
