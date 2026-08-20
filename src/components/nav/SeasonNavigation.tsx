"use client";

/**
 * Season Navigation Component
 *
 * Dropdown interface for season selection with navigation store integration
 * and intelligent positioning.
 */

import { useMemo, useState, useEffect } from "react";

import type { SeasonSummary, SeasonToggleNavProps } from "@gshl-types";
import { useSeasonNavigation, useSeasonState } from "@gshl-hooks";
import { SeasonToggleSkeleton } from "@gshl-skeletons";
import { DropdownToggle } from "./Toggle";

export function SeasonToggleNav({
  className,
  dropdownPosition,
  selectedSeasonId,
  onSelectSeason,
}: SeasonToggleNavProps) {
  const [mounted, setMounted] = useState(false);
  const { seasonOptions } = useSeasonState({ autoSelect: false });
  const { setSelectedSeasonId, selectedSeasonSummary } = useSeasonNavigation({
    autoSelect: selectedSeasonId === undefined,
  });

  // Prevent hydration mismatch by only rendering with store data on client
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSeasonSelect = (season: SeasonSummary) => {
    if (onSelectSeason) {
      onSelectSeason(season.id);
      return;
    }
    setSelectedSeasonId(season.id);
  };

  const getSeasonKey = (season: SeasonSummary) => season.id;
  const getSeasonLabel = (season: SeasonSummary) => season.name;

  const sortedOptions = useMemo(
    () => [...seasonOptions].sort((a, b) => b.year - a.year),
    [seasonOptions],
  );
  const selectedOption =
    selectedSeasonId !== undefined
      ? (sortedOptions.find(
          (season) => String(season.id) === String(selectedSeasonId),
        ) ?? null)
      : (selectedSeasonSummary ?? null);

  // Show loading state during SSR and initial client hydration
  if (!mounted) {
    return <SeasonToggleSkeleton className={className} />;
  }

  return (
    <DropdownToggle<SeasonSummary>
      items={sortedOptions}
      selectedItem={selectedOption}
      onSelect={handleSeasonSelect}
      getItemKey={getSeasonKey}
      getItemLabel={getSeasonLabel}
      ariaLabel="Season"
      className={className}
      dropdownPosition={dropdownPosition}
    />
  );
}
