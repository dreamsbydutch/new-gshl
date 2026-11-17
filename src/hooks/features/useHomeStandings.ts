"use client";

import { usePowerRankingsPreview } from "../main/usePowerRankings";
import { useStandingsData } from "./useStandingsData";

export function useHomeStandings(seasonId: string) {
  const standings = useStandingsData({
    standingsType: "conference",
    seasonId,
    includeMatchups: false,
  });
  // The default preview takes eight; this card includes the entire league.
  const power = usePowerRankingsPreview(seasonId, 16);
  const entries = power.error ? [] : (power.data?.entries ?? []);
  const leader = Math.max(0, ...entries.map((entry) => entry.rating ?? 0));
  const byTeam = new Map(entries.map((entry) => [entry.team.id, entry]));
  const standingsHref =
    "/standings?view=conference&season=" + encodeURIComponent(seasonId);
  const powerHref =
    "/standings?view=power&season=" + encodeURIComponent(seasonId);
  const groups = standings.groups.map((group) => ({
    title: group.title,
    teams: group.teams.map((team, index) => {
      const ranking = byTeam.get(team.id);
      const score = ranking?.rating ?? null;
      const record = team.seasonStats
        ? `${team.seasonStats.teamW ?? 0}-${team.seasonStats.teamL ?? 0}${standings.selectedSeason?.usesLegacyTies ? `-${team.seasonStats.teamT ?? 0}` : ""}`
        : "—";
      return {
        ...team,
        name: team.name ?? team.abbr ?? "Team",
        place: index + 1,
        conference: group.title.replace(/ Conference$/i, ""),
        record,
        ranking,
        scoreWidth:
          score === null || leader <= 0
            ? null
            : Math.max(0, Math.min(100, (score / leader) * 100)),
        href: team.ownerId
          ? `/lockerroom?view=roster&owner=${encodeURIComponent(team.ownerId)}&season=${encodeURIComponent(seasonId)}`
          : standingsHref,
      };
    }),
  }));
  return {
    groups,
    isLoading: standings.isLoading,
    usesLegacyTies: standings.selectedSeason?.usesLegacyTies ?? false,
    standingsHref,
    powerHref,
    powerLabel: power.data?.latestWeek
      ? `Week ${power.data.latestWeek.weekNum}`
      : power.data?.isPreseason
        ? "Preseason"
        : power.data?.season.isActive
          ? "Current"
          : "Final",
    powerStatus: power.isLoading
      ? "Loading power rankings…"
      : power.error
        ? "Power rankings unavailable."
        : !entries.length
          ? "No power rankings yet."
          : null,
  };
}
