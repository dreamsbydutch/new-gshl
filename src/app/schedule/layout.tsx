"use client";

import { useNavStore } from "@gshl-cache";
import {
  HorizontalToggle,
  SeasonToggleNav,
  SecondaryPageToolbar,
  TeamsToggle,
  WeeksToggle,
  TertiaryPageToolbar,
} from "@gshl-nav";

type ScheduleType = {
  key: string;
  label: string;
};
export default function Layout({ children }: { children: React.ReactNode }) {
  const scheduleType = useNavStore((state) => state.selectedScheduleType);
  const setScheduleType = useNavStore((state) => state.setScheduleType);

  // Schedule type navigation items
  const scheduleTypes: ScheduleType[] = [
    { key: "team", label: "Team" },
    { key: "week", label: "Week" },
  ];

  const selectedScheduleType =
    scheduleTypes.find((type) => type.key === scheduleType) ?? null;
  return (
    <div className="mb-32 font-varela lg:mb-4">
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
        <HorizontalToggle<ScheduleType>
          items={scheduleTypes}
          selectedItem={selectedScheduleType}
          onSelect={(type: ScheduleType) => setScheduleType(type.key)}
          getItemKey={(type: ScheduleType) => type.key}
          getItemLabel={(type: ScheduleType) => type.label}
          itemClassName="py-0.5 text-sm"
        />
      </TertiaryPageToolbar>
    </div>
  );
}
