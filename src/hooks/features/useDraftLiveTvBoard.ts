"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useDraftPicks,
  usePlayersByIds,
  useSeasonState,
  useTeams,
} from "@gshl-hooks/main";
import type { GSHLTeam } from "@gshl-types";
import {
  resolveDraftClockState,
  resolveDraftHubSeason,
} from "@gshl-utils/features/draft-hub";
import { buildDraftTvPicks } from "@gshl-utils/features/draft-tv";

/** Public, read-only draft display. Selection controls stay in the authenticated hub. */
export function useDraftLiveTvBoard() {
  const { seasons, isLoading: seasonsLoading } = useSeasonState({
    autoSelect: false,
  });
  const season = useMemo(() => resolveDraftHubSeason(seasons), [seasons]);
  const picksQuery = useDraftPicks({
    seasonId: season?.id,
    enabled: Boolean(season?.id),
  });
  const teamsQuery = useTeams({
    seasonId: season?.id,
    enabled: Boolean(season?.id),
  });
  const selectedPlayerIds = useMemo(
    () =>
      picksQuery.data.flatMap((pick) => (pick.playerId ? [pick.playerId] : [])),
    [picksQuery.data],
  );
  const playersQuery = usePlayersByIds(selectedPlayerIds);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const picks = useMemo(
    () =>
      buildDraftTvPicks(
        picksQuery.data,
        teamsQuery.data.filter(
          (team): team is GSHLTeam =>
            "franchiseId" in team &&
            "ownerId" in team &&
            !("seasonType" in team) &&
            !("weekId" in team) &&
            !("date" in team),
        ),
        playersQuery.data,
      ),
    [picksQuery.data, teamsQuery.data, playersQuery.data],
  );
  const picksById = useMemo(
    () => new Map(picks.map((pick) => [pick.pick.id, pick])),
    [picks],
  );
  const state = resolveDraftClockState(
    picksQuery.data,
    season?.draftStartAt,
    new Date(now),
  );
  const secondsUntil = (time: number | null) =>
    time === null ? 0 : Math.max(0, Math.ceil((time - now) / 1000));
  return {
    season,
    state,
    activePick: state.activePick
      ? (picksById.get(state.activePick.id) ?? null)
      : null,
    recentPicks: state.recentPicks.flatMap(
      (pick) => picksById.get(pick.id) ?? [],
    ),
    upcomingPicks: state.upcomingPicks.flatMap(
      (pick) => picksById.get(pick.id) ?? [],
    ),
    clockRemainingSeconds: secondsUntil(state.clockExpiresAt),
    draftStartRemainingSeconds: secondsUntil(
      season?.draftStartAt ? new Date(season.draftStartAt).getTime() : null,
    ),
    isLoading:
      seasonsLoading ||
      picksQuery.isLoading ||
      teamsQuery.isLoading ||
      playersQuery.isLoading,
  };
}
