"use client";

import { useMemo } from "react";
import { useQueries, useQuery, type RequestForQueries } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Player, PlayerDayStatLine } from "@gshl-types";
import type { NHLGame } from "@gshl-lib/types/nhl";
import { getPlayerNhlAbbreviations } from "@gshl-utils/domain/player";
import { useSeasons } from "./useSeason";
import { useTeams } from "./useTeam";
import { usePlayersByIds } from "./usePlayer";

export function useNHLMatchupRoster(game?: NHLGame) {
  const seasons = useSeasons({
    year: game ? game.season % 10000 : undefined,
    enabled: Boolean(game),
  });
  const season = seasons.data[0];
  const teams = useTeams({ seasonId: season?.id, enabled: Boolean(season) });
  const dayResult = useQuery(
    api.frontend.playerDayStats,
    game && season
      ? { where: { seasonId: season.id, date: game.gameDate } }
      : "skip",
  );
  const days = useMemo(() => {
    const rows = (dayResult ?? []) as PlayerDayStatLine[];
    return rows.filter((row) =>
      getPlayerNhlAbbreviations(row.nhlTeam).some(
        (abbr) =>
          abbr === game?.awayTeam.abbrev || abbr === game?.homeTeam.abbrev,
      ),
    );
  }, [dayResult, game?.awayTeam.abbrev, game?.homeTeam.abbrev]);
  const dayPlayers = usePlayersByIds(days.map((day) => day.playerId));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  // Never assign today's roster or lineup to a historical game.
  const allowCurrentRoster = Boolean(game && game.gameDate >= today);
  const requests = useMemo<RequestForQueries>(
    () =>
      Object.fromEntries(
        allowCurrentRoster
          ? teams.data.map((team) => [
              team.id,
              {
                query: api.frontend.players,
                args: { where: { gshlTeamId: team.id } },
              },
            ])
          : [],
      ),
    [allowCurrentRoster, teams.data],
  );
  const rosterResults = useQueries(requests);
  const values: unknown[] = Object.values(rosterResults);
  const currentPlayers = values.flatMap((value) =>
    Array.isArray(value) ? (value as Player[]) : [],
  );
  const error = values.some((value) => value instanceof Error)
    ? "GSHL roster data is temporarily unavailable."
    : null;
  return {
    season,
    teams: teams.data,
    days,
    players: [...currentPlayers, ...dayPlayers.data],
    allowCurrentRoster,
    error,
    isLoading:
      seasons.isLoading ||
      teams.isLoading ||
      (Boolean(game && season) && dayResult === undefined) ||
      dayPlayers.isLoading ||
      values.some((value) => value === undefined),
  };
}
