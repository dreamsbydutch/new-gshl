"use client";

/**
 * Season Navigation Component
 *
 * Dropdown interface for season selection with navigation store integration
 * and intelligent positioning.
 */

import { useMemo } from "react";

import type { SeasonSummary } from "@gshl-utils";
import { useSeasonState } from "@gshl-hooks";
import { DropdownToggle } from "./toggle";
import { useSeasonNavigation } from "@gshl-cache";

interface SeasonToggleNavProps {
  className?: string;
  dropdownPosition?: "above" | "below" | "auto";
}

export function SeasonToggleNav({
  className,
  dropdownPosition,
}: SeasonToggleNavProps) {
  const { seasonOptions } = useSeasonState({ autoSelect: false });
  const { setSelectedSeasonId, selectedSeasonSummary } = useSeasonNavigation();

  const handleSeasonSelect = (season: SeasonSummary) => {
    setSelectedSeasonId(season.id);
  };

  const getSeasonKey = (season: SeasonSummary) => season.id;
  const getSeasonLabel = (season: SeasonSummary) => season.name;

  const sortedOptions = useMemo(
    () => [...seasonOptions].sort((a, b) => b.year - a.year),
    [seasonOptions],
  );

  return (
    <DropdownToggle<SeasonSummary>
      items={sortedOptions}
      selectedItem={selectedSeasonSummary ?? null}
      onSelect={handleSeasonSelect}
      getItemKey={getSeasonKey}
      getItemLabel={getSeasonLabel}
      className={className}
      dropdownPosition={dropdownPosition}
    />
  );
}
