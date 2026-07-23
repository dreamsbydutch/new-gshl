"use client";

import { useEffect } from "react";
import {
  useSelectedSeasonId,
  useTeamNavigation,
  useWeekNavigation,
  useWeeks,
} from "@gshl-hooks";
import { isIsoDateInRange, toLocalIsoDateOnly } from "@gshl-utils";
import { canManageOwnTeam } from "@gshl-lib/auth/types";
import { useSession } from "next-auth/react";

/**
 * NavDefaults
 * - Runs on client mount and sets `selectedWeekId` to the "current" week
 *   based on inclusive YYYY-MM-DD comparisons (local date) if the nav
 *   store does not already have a selection.
 */
export default function NavDefaults(): null {
  const selectedSeasonId = useSelectedSeasonId();
  const { selectedOwnerId, setSelectedOwnerId } = useTeamNavigation();
  const { data: session } = useSession();
  const { selectedWeekId, setSelectedWeekId: setWeekId } = useWeekNavigation();

  const { data: weeks, isLoading } = useWeeks({
    seasonId: selectedSeasonId,
    orderBy: { startDate: "asc" },
    enabled: Boolean(selectedSeasonId),
  });

  useEffect(() => {
    if (
      canManageOwnTeam(session?.user.role) &&
      session?.user.ownerId &&
      selectedOwnerId === "1"
    ) {
      setSelectedOwnerId(session.user.ownerId);
    }
  }, [selectedOwnerId, session, setSelectedOwnerId]);

  useEffect(() => {
    if (isLoading) return;
    if (!weeks || weeks.length === 0) return;

    // Keep an existing selection only when it belongs to this season. This
    // also repairs persisted navigation state created before season changes
    // reset the selected week.
    if (weeks.some((week) => week.id === selectedWeekId)) return;

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
