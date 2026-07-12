"use client";

import { useEffect } from "react";
import { useNav, useWeekNavigation, useWeeks } from "@gshl-hooks";
import { isIsoDateInRange, toLocalIsoDateOnly } from "@gshl-utils";

/**
 * NavDefaults
 * - Runs on client mount and sets `selectedWeekId` to the "current" week
 *   based on inclusive YYYY-MM-DD comparisons (local date) if the nav
 *   store does not already have a selection.
 */
export default function NavDefaults(): null {
  const { selectedSeasonId } = useNav();
  const { selectedWeekId, setSelectedWeekId: setWeekId } = useWeekNavigation();

  const { data: weeks, isLoading } = useWeeks({
    seasonId: selectedSeasonId,
    orderBy: { startDate: "asc" },
    enabled: Boolean(selectedSeasonId),
  });

  useEffect(() => {
    if (isLoading) return;
    if (!weeks || weeks.length === 0) return;

    // If user already has a selected week (non-default), don't override
    if (selectedWeekId && selectedWeekId !== "0") return;

    const today = toLocalIsoDateOnly(new Date());

    // Find inclusive match
    const current = weeks.find((w) =>
      isIsoDateInRange(today, w.startDate, w.endDate),
    );
    if (current) {
      setWeekId(current.id);
      return;
    }

    // Fallback: most recent previous week (endDate < today)
    const previous = weeks
      .filter((w) => w.endDate < today)
      .sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0];
    if (previous) {
      setWeekId(previous.id);
      return;
    }

    // Final fallback: first week in the season
    setWeekId(weeks[0]!.id);
  }, [isLoading, weeks, selectedWeekId, selectedSeasonId, setWeekId]);

  return null;
}
