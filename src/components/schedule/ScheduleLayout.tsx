"use client";

import { useScheduleContextNavigation } from "@gshl-hooks";
import {
  HorizontalToggle,
  PageContextNavigation,
  SeasonToggleNav,
  SecondaryPageToolbar,
  TeamsToggle,
  WeeksToggle,
  TertiaryPageToolbar,
} from "@gshl-nav";
import type { LabeledToggleOption } from "@gshl-types";
import { ScheduleSkeleton } from "@gshl-skeletons";

export function ScheduleLayout({ children }: { children: React.ReactNode }) {
  const navigation = useScheduleContextNavigation();
  const scheduleType = navigation.selectedView;

  // Schedule type navigation items
  const scheduleTypes: LabeledToggleOption[] = [
    { key: "team", label: "Team" },
    { key: "week", label: "Week" },
  ];

  const selectedScheduleType =
    scheduleTypes.find((type) => type.key === scheduleType) ?? null;
  return (
    <div className="font-varela">
      <PageContextNavigation ariaLabel="Schedule controls" mobileRows={2}>
        <SecondaryPageToolbar className="text-center sm:justify-center">
          <HorizontalToggle<LabeledToggleOption>
            items={scheduleTypes}
            selectedItem={selectedScheduleType}
            onSelect={(type: LabeledToggleOption) =>
              navigation.selectView(type.key === "team" ? "team" : "week")
            }
            getItemKey={(type: LabeledToggleOption) => type.key}
            getItemLabel={(type: LabeledToggleOption) => type.label}
            itemClassName="text-sm"
          />
          <SeasonToggleNav
            className="shrink-0"
            selectedSeasonId={navigation.selectedSeasonId}
            onSelectSeason={navigation.selectSeason}
          />
        </SecondaryPageToolbar>
        <TertiaryPageToolbar>
          {scheduleType === "team" && (
            <TeamsToggle
              seasonId={navigation.selectedSeasonId}
              selectedOwnerId={navigation.selectedOwnerId}
              onSelectOwner={navigation.selectOwner}
            />
          )}
          {scheduleType === "week" && (
            <WeeksToggle
              seasonId={navigation.selectedSeasonId}
              selectedWeekId={navigation.selectedWeekId}
              onSelectWeek={navigation.selectWeek}
            />
          )}
        </TertiaryPageToolbar>
      </PageContextNavigation>
      <main aria-labelledby="schedule-page-heading">
        <h1 id="schedule-page-heading" className="sr-only">
          Schedule
        </h1>
        {navigation.isReady ? children : <ScheduleSkeleton />}
      </main>
    </div>
  );
}
