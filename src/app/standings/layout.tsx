"use client";

import { useStandingsNavigation } from "@gshl-hooks";
import {
  DropdownToggle,
  HorizontalToggle,
  SeasonToggleNav,
  SecondaryPageToolbar,
  TertiaryPageToolbar,
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
    <div className="pb-28 font-varela lg:pb-8">
      <div className="sticky top-16 z-30 hidden border-b border-slate-200 bg-white/95 backdrop-blur lg:block">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              League
            </p>
            <p className="truncate text-base font-semibold tracking-tight text-slate-950">
              Standings
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SeasonToggleNav
              className="m-0 w-[132px] sm:w-[160px]"
              dropdownPosition="below"
            />
            <DropdownToggle<LabeledToggleOption>
              items={standingsTypes}
              selectedItem={selectedStandingsType}
              onSelect={(type) => setSelectedType(type.key)}
              getItemKey={(type) => type.key}
              getItemLabel={(type) => type.label}
              className="m-0 w-[118px] sm:w-[140px]"
              buttonClassName="h-9 rounded-lg border-slate-200 bg-white px-3 font-medium shadow-none"
              dropdownClassName="right-0 min-w-[150px]"
              dropdownPosition="below"
              placeholder="View"
            />
          </div>
        </div>
      </div>
      {children}
      <SecondaryPageToolbar className="lg:hidden">
        <SeasonToggleNav dropdownPosition="above" />
      </SecondaryPageToolbar>
      <TertiaryPageToolbar className="lg:hidden">
        <HorizontalToggle<LabeledToggleOption>
          items={standingsTypes}
          selectedItem={selectedStandingsType}
          onSelect={(type) => setSelectedType(type.key)}
          getItemKey={(type) => type.key}
          getItemLabel={(type) => type.label}
          itemClassName="py-0.5 text-xs"
        />
      </TertiaryPageToolbar>
    </div>
  );
}
