"use client";

/**
 * Season Navigation Component
 *
 * Dropdown interface for season selection with navigation store integration
 * and intelligent positioning.
 */

import type { Season } from "@gshl-types";
import { useAllSeasons } from "@gshl-hooks";
import { DropdownToggle } from "./toggle";
import { useSeasonNavigation } from "@gshl-cache";

interface SeasonToggleNavProps {
  className?: string;
  dropdownPosition?: "above" | "below" | "auto";
}

/**
 * Season selection dropdown component
 * @param props - Component props
 * @param props.className - Optional CSS classes
 * @param props.dropdownPosition - Dropdown positioning behavior
 * @returns Season selection dropdown
 */
export function SeasonToggleNav({
  className,
  dropdownPosition,
}: SeasonToggleNavProps) {
  const { data: seasons } = useAllSeasons();
  const { setSelectedSeasonId, selectedSeason } = useSeasonNavigation();

  /**
   * Handle season selection
   * @param season - Selected season object
   */
  const handleSeasonSelect = (season: Season) => {
    setSelectedSeasonId(season.id);
  };

  /**
   * Get unique key for season item
   * @param season - Season object
   * @returns Season ID as string
   */
  const getSeasonKey = (season: Season) => season.id.toString();

  /**
   * Get display label for season
   * @param season - Season object
   * @returns Season name
   */
  const getSeasonLabel = (season: Season) => season.name;

  return (
    <DropdownToggle<Season>
      items={seasons?.sort((a, b) => b.year - a.year) ?? []}
      selectedItem={selectedSeason}
      onSelect={handleSeasonSelect}
      getItemKey={getSeasonKey}
      getItemLabel={getSeasonLabel}
      className={className}
      dropdownPosition={dropdownPosition}
    />
  );
}
