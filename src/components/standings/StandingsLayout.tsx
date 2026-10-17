"use client";

import { useStandingsContextNavigation } from "@gshl-hooks";
import { HorizontalToggle, SecondaryPageToolbar } from "@gshl-nav";
import { SectionNavigation } from "@gshl-components/nav/SectionNavigation";
import type { LabeledToggleOption } from "@gshl-types";
import { StandingsSkeleton } from "@gshl-skeletons";

export function StandingsLayout({ children }: { children: React.ReactNode }) {
  const navigation = useStandingsContextNavigation();
  const selectedType = navigation.selectedView;

  // Standings type navigation items
  const standingsTypes: LabeledToggleOption[] = [
    { key: "overall", label: "Overall" },
    { key: "conference", label: "Conference" },
    { key: "wildcard", label: "Wildcard" },
    { key: "power", label: "Power rankings" },
    { key: "playoff", label: "Playoffs" },
    { key: "awards", label: "Awards" },
    { key: "nhl", label: "NHL" },
  ];

  const selectedStandingsType =
    standingsTypes.find((type) => type.key === selectedType) ?? null;

  return (
    <div className="font-varela">
      <SectionNavigation section="league" />
      <div
        className="gshl-local-controls"
        role="group"
        aria-label="Standings views"
      >
        <SecondaryPageToolbar className="text-center sm:justify-center">
          <HorizontalToggle<LabeledToggleOption>
            items={standingsTypes}
            selectedItem={selectedStandingsType}
            onSelect={(type) => {
              if (
                type.key === "overall" ||
                type.key === "conference" ||
                type.key === "wildcard" ||
                type.key === "power" ||
                type.key === "playoff" ||
                type.key === "awards" ||
                type.key === "nhl"
              ) {
                navigation.selectView(type.key);
              }
            }}
            getItemKey={(type) => type.key}
            getItemLabel={(type) => type.label}
            itemClassName="text-sm"
          />
        </SecondaryPageToolbar>
      </div>
      <main aria-labelledby="standings-page-heading">
        <h1 id="standings-page-heading" className="sr-only">
          Standings
        </h1>
        {navigation.isReady ? children : <StandingsSkeleton />}
      </main>
    </div>
  );
}
