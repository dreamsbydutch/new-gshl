"use client";

import { useEffect } from "react";
import { useAuthSession, useTeamNavigation } from "@gshl-hooks";
import { canManageOwnTeam } from "@gshl-utils";

/**
 * NavDefaults
 * - Runs on client mount and replaces the legacy owner default with the
 *   authenticated user's team when their role permits it.
 * - Season and week defaults are owned by the route navigation hooks so the
 *   application shell does not subscribe to route-specific data.
 */
export function NavDefaults(): null {
  const { selectedOwnerId, setSelectedOwnerId } = useTeamNavigation();
  const { session } = useAuthSession();

  useEffect(() => {
    if (
      canManageOwnTeam(session?.user.role) &&
      session?.user.ownerId &&
      selectedOwnerId === "1"
    ) {
      setSelectedOwnerId(session.user.ownerId);
    }
  }, [selectedOwnerId, session, setSelectedOwnerId]);

  return null;
}
