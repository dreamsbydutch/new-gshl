"use client";

/**
 * Season Navigation Component
 *
 * Dropdown interface for season selection with navigation store integration
 * and intelligent positioning.
 */

import { useMemo, useState, useEffect } from "react";

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
  const [mounted, setMounted] = useState(false);
  const { seasonOptions } = useSeasonState({ autoSelect: false });
  const { setSelectedSeasonId, selectedSeasonSummary } = useSeasonNavigation();

  // Prevent hydration mismatch by only rendering with store data on client
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSeasonSelect = (season: SeasonSummary) => {
    setSelectedSeasonId(season.id);
  };

  const getSeasonKey = (season: SeasonSummary) => season.id;
  const getSeasonLabel = (season: SeasonSummary) => season.name;

  const sortedOptions = useMemo(
    () => [...seasonOptions].sort((a, b) => b.year - a.year),
    [seasonOptions],
  );

  // Show loading state during SSR and initial client hydration
  if (!mounted) {
    return (
      <div className="mx-2 animate-pulse">
        <div className="h-8 w-32 rounded bg-muted" />
      </div>
    );
  }

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
