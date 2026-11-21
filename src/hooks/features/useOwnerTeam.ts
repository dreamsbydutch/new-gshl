"use client";

import {
  useAuthSession,
  useFranchises,
  useSeasonState,
  useTeams,
} from "../main";

/** Personalization requires an active account and a team in the operational season. */
export function useOwnerTeam() {
  const { session, status } = useAuthSession();
  const {
    currentSeason,
    defaultSeason,
    isLoading: seasonLoading,
  } = useSeasonState({ autoSelect: false });
  const season = currentSeason ?? defaultSeason;
  const ownerId =
    status === "authenticated" &&
    session?.user.status === "active" &&
    (session.user.role === "owner" || session.user.role === "commissioner")
      ? session.user.ownerId
      : null;
  const franchises = useFranchises({ ownerId, enabled: Boolean(ownerId) });
  const franchise = franchises.data.find((item) => item.isActive);
  const teams = useTeams({
    franchiseId: franchise?.id,
    seasonId: season?.id,
    enabled: Boolean(franchise && season),
  });
  return {
    ownerId,
    team: ownerId ? (teams.data[0] ?? null) : null,
    isLoading:
      status === "loading" ||
      seasonLoading ||
      franchises.isLoading ||
      teams.isLoading,
  };
}
