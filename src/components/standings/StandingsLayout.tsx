"use client";

import { useStandingsNavigation } from "@gshl-hooks";
import {
  HorizontalToggle,
  SeasonToggleNav,
  SecondaryPageToolbar,
} from "@gshl-nav";
import type { LabeledToggleOption } from "@gshl-types";

export function StandingsLayout({ children }: { children: React.ReactNode }) {
  const { selectedType, setSelectedType } = useStandingsNavigation();

  // Standings type navigation items
  const standingsTypes: LabeledToggleOption[] = [
    { key: "overall", label: "Overall" },
    { key: "conference", label: "Conference" },
    { key: "wildcard", label: "Wildcard" },
    { key: "playoff", label: "Playoff" },
    { key: "awards", label: "Awards" },
  ];

  const selectedStandingsType =
    standingsTypes.find((type) => type.key === selectedType) ?? null;

  return (
    <div className="pb-24 font-varela lg:pb-8 lg:pt-12">
      {children}
      <SecondaryPageToolbar className="mx-auto text-center">
        <SeasonToggleNav />
        <HorizontalToggle<LabeledToggleOption>
          items={standingsTypes}
          selectedItem={selectedStandingsType}
          onSelect={(type) => setSelectedType(type.key)}
          getItemKey={(type) => type.key}
          getItemLabel={(type) => type.label}
          itemClassName="py-0.5 text-sm"
        />
      </SecondaryPageToolbar>
    </div>
  );
}
