"use client";

import { useState } from "react";
import { useAuthSession } from "@gshl-hooks/main/useAuthSession";
import {
  useDraftHubState,
  useSetDraftTeamMode,
} from "@gshl-hooks/main/useDraftHub";

export function useDraftModeControl(seasonId?: string) {
  const { session } = useAuthSession();
  const { data } = useDraftHubState({ seasonId });
  const mutation = useSetDraftTeamMode();
  const [selectedId, setSelectedId] = useState<string>("");
  const isCommissioner = session?.user.role === "commissioner";
  const teams = (data?.teams ?? []).filter(
    (team) =>
      isCommissioner ||
      (session?.user.role === "owner" && team.ownerId === session.user.ownerId),
  );
  const ownTeam = teams.find((team) => team.ownerId === session?.user.ownerId);
  const team =
    teams.find((team) => team.id === selectedId) ?? ownTeam ?? teams[0];
  return {
    teams,
    team,
    isCommissioner,
    setSelectedId,
    isPending: mutation.isPending,
    error: mutation.error?.message,
    toggle: () => {
      if (team && !mutation.isPending)
        mutation.mutate({ teamId: team.id, auto: !team.draftAuto });
    },
  };
}
