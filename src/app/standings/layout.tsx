"use client";

import { useStandingsNavigation } from "@gshl-hooks";
import {
  SeasonToggleNav,
  SecondaryPageToolbar,
  HorizontalToggle,
} from "@gshl-nav";
import type { LabeledToggleOption } from "@gshl-types";

export default function Layout({ children }: { children: React.ReactNode }) {
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
      <SecondaryPageToolbar>
        <SeasonToggleNav />
        <HorizontalToggle<LabeledToggleOption>
          items={standingsTypes}
          selectedItem={selectedStandingsType}
          onSelect={(type: LabeledToggleOption) => setSelectedType(type.key)}
          getItemKey={(type: LabeledToggleOption) => type.key}
          getItemLabel={(type: LabeledToggleOption) => type.label}
        />
      </SecondaryPageToolbar>
    </div>
  );
}
