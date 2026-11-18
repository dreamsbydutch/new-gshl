"use client";

import {
  useLeagueActivity,
  useSeasonState,
  useTeamScheduleStats,
} from "../main";
import { useOwnerCommandCenter } from "./useOwnerCommandCenter";
import { useStandingsData } from "./useStandingsData";
import {
  prioritizeHomeActivity,
  matchupProgress,
} from "@gshl-utils/features/home-dashboard";
import { calculateStandingsPoints, resolveDraftHubSeason } from "@gshl-utils";

export function useHomeDashboard() {
  const seasonState = useSeasonState({ autoSelect: false });
  const season = seasonState.currentSeason ?? seasonState.defaultSeason;
  const owner = useOwnerCommandCenter();
  const standings = useStandingsData({
    standingsType: "overall",
    seasonId: season?.id,
    includeMatchups: false,
  });
  const teams = standings.groups.flatMap((group) => group.teams);
  const own = owner.data;
  const rankIndex = teams.findIndex((team) => team.id === own?.team?.id);
  const standing = teams[rankIndex];
  const matchup = own?.matchup.current ?? own?.matchup.next ?? null;
  const activity = useLeagueActivity(season?.id, 30, true);
  const stats = useTeamScheduleStats({
    seasonId: season?.id ?? "",
    weekId: matchup?.weekId ?? "",
    homeTeamId: matchup?.homeTeamId ?? "",
    awayTeamId: matchup?.awayTeamId ?? "",
    enabled: Boolean(own?.matchup.current),
  });
  const now = Date.now();
  const contractsDue =
    own?.contractDecisions.filter((item) => {
      const expiry = item.expiryDate ? Date.parse(item.expiryDate) : Number.NaN;
      return expiry >= now && expiry <= now + 30 * 86_400_000;
    }) ?? [];
  const attention: { label: string; href: string }[] = [];
  if (own?.cap[0] && own.cap[0].remaining < 0)
    attention.push({
      label: "Your team is over the cap",
      href: own.actions.viewContracts,
    });
  if (own?.offers.length)
    attention.push({
      label: `${own.offers.length} pending free-agent offer${own.offers.length === 1 ? "" : "s"}`,
      href: own.actions.reviewOffer,
    });
  if (contractsDue.length && own)
    attention.push({
      label: `${contractsDue.length} contract${contractsDue.length === 1 ? "" : "s"} expiring within 30 days`,
      href: own.actions.viewContracts,
    });
  return {
    season,
    draftSeason: resolveDraftHubSeason(seasonState.seasons),
    owner,
    matchup,
    attention,
    standingsLoading: standings.isLoading,
    standing:
      standing && season
        ? {
            rank: rankIndex + 1,
            points: standing.seasonStats
              ? calculateStandingsPoints(standing.seasonStats, season)
              : null,
          }
        : null,
    progress: matchupProgress(
      matchup?.weekStartDate ?? null,
      matchup?.weekEndDate ?? null,
    ),
    timestamps: stats.data.updatedAt,
    activityLoading: activity.isLoading,
    activity: prioritizeHomeActivity(
      activity.data,
      own?.team?.id,
      matchup?.opponent?.id,
      rankIndex >= 0
        ? teams
            .slice(Math.max(0, rankIndex - 1), rankIndex + 2)
            .map((team) => team.id)
        : [],
    ),
    teamHref: (teamId: string | null) => {
      const team = teams.find((item) => item.id === teamId);
      return team?.ownerId
        ? `/lockerroom?view=roster&owner=${team.ownerId}&season=${season?.id}`
        : "/activity";
    },
    isLoading: seasonState.isLoading || owner.isLoading,
  };
}
