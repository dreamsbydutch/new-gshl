"use client";

import { useScheduleContextNavigation } from "@gshl-hooks";
import {
  HorizontalToggle,
  SecondaryPageToolbar,
  TeamsToggle,
  WeeksToggle,
  TertiaryPageToolbar,
} from "@gshl-nav";
import { SectionNavigation } from "@gshl-components/nav/SectionNavigation";
import type { LabeledToggleOption } from "@gshl-types";
import { ScheduleSkeleton } from "@gshl-skeletons";

export function ScheduleLayout({ children }: { children: React.ReactNode }) {
  const navigation = useScheduleContextNavigation();
  const scheduleType = navigation.selectedView;

  // Schedule type navigation items
  const scheduleTypes: LabeledToggleOption[] = [
    { key: "team", label: "By team" },
    { key: "week", label: "By week" },
    { key: "nhl", label: "NHL" },
  ];

  const selectedScheduleType =
    scheduleTypes.find((type) => type.key === scheduleType) ?? null;
  return (
    <div className="font-varela">
      <SectionNavigation section="league" />
      <div
        className="gshl-local-controls"
        role="group"
        aria-label="Schedule views"
      >
        <SecondaryPageToolbar className="text-center sm:justify-center">
          <HorizontalToggle<LabeledToggleOption>
            items={scheduleTypes}
            selectedItem={selectedScheduleType}
            onSelect={(type: LabeledToggleOption) =>
              navigation.selectView(
                type.key === "team"
                  ? "team"
                  : type.key === "nhl"
                    ? "nhl"
                    : "week",
              )
            }
            getItemKey={(type: LabeledToggleOption) => type.key}
            getItemLabel={(type: LabeledToggleOption) => type.label}
            itemClassName="text-sm"
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
          {scheduleType !== "team" && (
            <WeeksToggle
              seasonId={navigation.selectedSeasonId}
              selectedWeekId={navigation.selectedWeekId}
              onSelectWeek={navigation.selectWeek}
            />
          )}
        </TertiaryPageToolbar>
      </div>
      <main aria-labelledby="schedule-page-heading">
        <h1 id="schedule-page-heading" className="sr-only">
          Schedule
        </h1>
        {navigation.isReady ? children : <ScheduleSkeleton />}
      </main>
    </div>
  );
}
