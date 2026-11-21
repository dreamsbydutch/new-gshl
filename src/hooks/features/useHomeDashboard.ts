"use client";

import { useLeagueActivity, useSeasonState } from "../main";
import { useLeagueToday } from "./useLeagueToday";
import { useOwnerCommandCenter } from "./useOwnerCommandCenter";
import { useStandingsData } from "./useStandingsData";
import { prioritizeHomeActivity } from "@gshl-utils/features/home-dashboard";
import { resolveDraftHubSeason } from "@gshl-utils";

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
  const matchup = own?.matchup.current ?? own?.matchup.next ?? null;
  const today = useLeagueToday();
  const activity = useLeagueActivity(season?.id, 30, false, {
    end: today,
    days: 1,
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
