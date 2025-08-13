"use client";

import { useStandingsNavigation } from "@gshl-cache";
import {
  SeasonToggleNav,
  SecondaryPageToolbar,
  HorizontalToggle,
} from "@gshl-nav";

type StandingsType = {
  key: string;
  label: string;
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { selectedType, setSelectedType } = useStandingsNavigation();

  // Standings type navigation items
  const standingsTypes: StandingsType[] = [
    { key: "overall", label: "Overall" },
    { key: "conference", label: "Conference" },
    { key: "wildcard", label: "Wildcard" },
    { key: "playoff", label: "Playoff" },
  ];

  const selectedStandingsType =
    standingsTypes.find((type) => type.key === selectedType) || null;

  return (
    <div className="mb-32 font-varela lg:mb-4">
      {children}
      <SecondaryPageToolbar>
        <SeasonToggleNav />
        <HorizontalToggle<StandingsType>
          items={standingsTypes}
          selectedItem={selectedStandingsType}
          onSelect={(type: StandingsType) => setSelectedType(type.key)}
          getItemKey={(type: StandingsType) => type.key}
          getItemLabel={(type: StandingsType) => type.label}
        />
      </SecondaryPageToolbar>
    </div>
  );
}
