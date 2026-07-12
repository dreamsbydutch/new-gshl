"use client";

import { useScheduleNavigation } from "@gshl-hooks";
import {
  HorizontalToggle,
  SeasonToggleNav,
  SecondaryPageToolbar,
  TeamsToggle,
  WeeksToggle,
  TertiaryPageToolbar,
} from "@gshl-nav";
import type { LabeledToggleOption } from "@gshl-types";
export default function Layout({ children }: { children: React.ReactNode }) {
  const { selectedType: scheduleType, setSelectedType: setScheduleType } =
    useScheduleNavigation();

  // Schedule type navigation items
  const scheduleTypes: LabeledToggleOption[] = [
    { key: "team", label: "Team" },
    { key: "week", label: "Week" },
  ];

  const selectedScheduleType =
    scheduleTypes.find((type) => type.key === scheduleType) ?? null;
  return (
    <div className="pb-24 font-varela lg:pb-8 lg:pt-20">
      {children}
      <SecondaryPageToolbar className="mx-auto text-center">
        <SeasonToggleNav />
        {scheduleType === "team" && (
          <>
            <TeamsToggle />
          </>
        )}
        {(!scheduleType ||
          scheduleType === "week" ||
          scheduleType === "playoff") && <WeeksToggle />}
      </SecondaryPageToolbar>
      <TertiaryPageToolbar>
        <HorizontalToggle<LabeledToggleOption>
          items={scheduleTypes}
          selectedItem={selectedScheduleType}
          onSelect={(type: LabeledToggleOption) => setScheduleType(type.key)}
          getItemKey={(type: LabeledToggleOption) => type.key}
          getItemLabel={(type: LabeledToggleOption) => type.label}
          itemClassName="py-0.5 text-sm"
        />
      </TertiaryPageToolbar>
    </div>
  );
}
