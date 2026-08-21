"use client";

import { useLockerRoomContextNavigation } from "@gshl-hooks";
import {
  HorizontalToggle,
  PageContextNavigation,
  SecondaryPageToolbar,
  TeamsToggle,
  TertiaryPageToolbar,
} from "@gshl-nav";
import type { ToggleItem } from "@gshl-types";
import { LockerRoomSkeleton } from "@gshl-skeletons";

export function LockerRoomLayout({ children }: { children: React.ReactNode }) {
  const navigation = useLockerRoomContextNavigation();
  const selectedType = navigation.selectedView;

  const pageToolbarProps: {
    toolbarKeys: ToggleItem<string | null>[];
    activeKey: string | null;
  } = {
    activeKey: selectedType,
    toolbarKeys: [
      {
        key: "roster",
        value: "Current Roster",
        setter: () => navigation.selectView("roster"),
      },
      {
        key: "salary",
        value: "Salary Cap",
        setter: () => navigation.selectView("salary"),
      },
      {
        key: "history",
        value: "Matchups",
        setter: () => navigation.selectView("history"),
      },
      {
        key: "trophy",
        value: "Trophy Case",
        setter: () => navigation.selectView("trophy"),
      },
      {
        key: "recordbook",
        value: "Record Book",
        setter: () => navigation.selectView("recordbook"),
      },
      {
        key: "draft",
        value: "Draft",
        setter: () => navigation.selectView("draft"),
      },
    ],
  };
  return (
    <div className="font-varela">
      <PageContextNavigation ariaLabel="My Team controls">
        <SecondaryPageToolbar>
          <TeamsToggle
            seasonId={navigation.activeSeasonId}
            selectedOwnerId={navigation.selectedOwnerId}
            onSelectOwner={navigation.selectOwner}
          />
        </SecondaryPageToolbar>
        <TertiaryPageToolbar>
          <HorizontalToggle<ToggleItem<string | null>>
            items={pageToolbarProps.toolbarKeys}
            selectedItem={
              pageToolbarProps.toolbarKeys.find(
                (item) => item.key === pageToolbarProps.activeKey,
              ) ?? null
            }
            onSelect={(type: ToggleItem<string | null>) =>
              type.setter(type.key)
            }
            getItemKey={(type: ToggleItem<string | null>) => type.key}
            getItemLabel={(type: ToggleItem<string | null>) => type.value}
            itemClassName="text-sm"
          />
        </TertiaryPageToolbar>
      </PageContextNavigation>
      <main aria-labelledby="locker-room-page-heading">
        <h1 id="locker-room-page-heading" className="sr-only">
          Locker Room
        </h1>
        {navigation.isReady ? children : <LockerRoomSkeleton />}
      </main>
    </div>
  );
}
