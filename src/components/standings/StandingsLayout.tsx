"use client";

import { useStandingsContextNavigation } from "@gshl-hooks";
import {
  HorizontalToggle,
  PageContextNavigation,
  SeasonToggleNav,
  SecondaryPageToolbar,
} from "@gshl-nav";
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
    { key: "power", label: "Power Ranks" },
    { key: "playoff", label: "Playoff" },
    { key: "awards", label: "Awards" },
  ];

  const selectedStandingsType =
    standingsTypes.find((type) => type.key === selectedType) ?? null;

  return (
    <div className="font-varela">
      <PageContextNavigation ariaLabel="Standings controls">
        <SecondaryPageToolbar className="text-center sm:justify-center">
          <SeasonToggleNav
            className="shrink-0"
            selectedSeasonId={navigation.selectedSeasonId}
            onSelectSeason={navigation.selectSeason}
          />
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
                type.key === "awards"
              ) {
                navigation.selectView(type.key);
              }
            }}
            getItemKey={(type) => type.key}
            getItemLabel={(type) => type.label}
            itemClassName="text-sm"
          />
        </SecondaryPageToolbar>
      </PageContextNavigation>
      <main aria-labelledby="standings-page-heading">
        <h1 id="standings-page-heading" className="sr-only">
          Standings
        </h1>
        {navigation.isReady ? children : <StandingsSkeleton />}
      </main>
    </div>
  );
}
