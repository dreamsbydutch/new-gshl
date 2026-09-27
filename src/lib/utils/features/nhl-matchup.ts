import type { GSHLTeam, Player, PlayerDayStatLine } from "@gshl-types";
import type { NHLGame, NHLMatchupPlayerRow } from "@gshl-lib/types/nhl";
import { getPlayerNhlAbbreviations } from "../domain/player";
import { z } from "zod";
import { nhlBoxscorePlayerSchema } from "./nhl";

const startingPositions = new Set([
  "C",
  "LW",
  "RW",
  "W",
  "F",
  "D",
  "G",
  "UTIL",
  "Util",
]);
const nonStartingPositions = new Set(["BN", "IR", "IR+", "IRplus", "NA"]);

export function groupNHLMatchupPlayers(players: NHLMatchupPlayerRow[]) {
  const starters = players.filter((player) =>
    startingPositions.has(player.lineupPosition ?? ""),
  );
  return [
    {
      label:
        starters.length &&
        starters.every((player) => player.lineupStatus === "Planned")
          ? "Projected starters"
          : "Starters",
      players: starters,
    },
    {
      label: "Non-starters",
      players: players.filter((player) =>
        nonStartingPositions.has(player.lineupPosition ?? ""),
      ),
    },
    {
      label: "Position not recorded",
      players: players.filter(
        (player) =>
          !startingPositions.has(player.lineupPosition ?? "") &&
          !nonStartingPositions.has(player.lineupPosition ?? ""),
      ),
    },
  ].filter((group) => group.players.length);
}

export const nhlMatchupRosterSchema = z.object({
  season: z.object({ id: z.string() }).nullable(),
  updatedAt: z.number(),
  players: z.array(
    z.object({
      id: z.string(),
      fullName: z.string(),
      position: z.string(),
      goalie: z.boolean(),
      side: z.enum(["away", "home"]),
      gshlTeam: z.object({
        id: z.string(),
        name: z.string().nullable(),
        abbr: z.string().nullable(),
        logoUrl: z.string().nullable(),
      }),
      lineupPosition: z.string().nullable(),
      lineupStatus: z.enum([
        "Started",
        "Bench",
        "Out",
        "Planned",
        "Not recorded",
      ]),
      stats: nhlBoxscorePlayerSchema.nullable(),
    }),
  ),
});

export function buildNHLMatchupPlayers({
  game,
  players,
  days,
  teams,
  allowCurrentRoster,
}: {
  game: NHLGame;
  players: Pick<
    Player,
    | "id"
    | "nhlApiId"
    | "fullName"
    | "firstName"
    | "lastName"
    | "nhlPos"
    | "posGroup"
    | "nhlTeam"
    | "gshlTeamId"
    | "lineupPos"
  >[];
  days: Pick<
    PlayerDayStatLine,
    "playerId" | "gshlTeamId" | "date" | "dailyPos" | "nhlTeam"
  >[];
  teams: Pick<GSHLTeam, "id" | "name" | "abbr" | "logoUrl">[];
  allowCurrentRoster: boolean;
}): NHLMatchupPlayerRow[] {
  const gameDays = new Map(
    days
      .filter((day) => day.date === game.gameDate)
      .map((day) => [day.playerId, day]),
  );
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const uniquePlayers = new Map(players.map((player) => [player.id, player]));
  const gamePlayers = (["away", "home"] as const).flatMap((side) => {
    const group =
      game.playerByGameStats?.[side === "away" ? "awayTeam" : "homeTeam"];
    return [
      ...(group?.forwards ?? []),
      ...(group?.defense ?? []),
      ...(group?.goalies ?? []),
    ].map((stats) => ({ side, stats }));
  });
  return [...uniquePlayers.values()]
    .flatMap((player) => {
      const day = gameDays.get(player.id);
      const teamId = day
        ? day.gshlTeamId
        : allowCurrentRoster
          ? player.gshlTeamId
          : null;
      const gshlTeam = teamId ? teamsById.get(teamId) : undefined;
      if (!gshlTeam) return [];
      const recorded = gamePlayers.find(
        (entry) => String(entry.stats.playerId) === player.nhlApiId,
      );
      const abbreviations = getPlayerNhlAbbreviations(
        day?.nhlTeam ?? player.nhlTeam,
      );
      const side =
        recorded?.side ??
        (abbreviations.includes(game.awayTeam.abbrev)
          ? "away"
          : abbreviations.includes(game.homeTeam.abbrev)
            ? "home"
            : null);
      if (!side) return [];
      const lineupPosition =
        (day ? day.dailyPos : allowCurrentRoster ? player.lineupPos : null) ??
        null;
      const bench = lineupPosition === "BN";
      const out = ["IR", "IR+", "IRplus", "NA"].includes(lineupPosition ?? "");
      const active = startingPositions.has(lineupPosition ?? "");
      const lineupStatus =
        !day && lineupPosition
          ? "Planned"
          : bench
            ? "Bench"
            : out
              ? "Out"
              : active
                ? ["FUT", "PRE"].includes(game.gameState)
                  ? "Planned"
                  : "Started"
                : "Not recorded";
      return [
        {
          id: player.id,
          fullName: player.fullName || `${player.firstName} ${player.lastName}`,
          position:
            recorded?.stats.position ??
            player.nhlPos?.join("/") ??
            player.posGroup,
          goalie: recorded
            ? recorded.stats.position === "G"
            : player.posGroup === "G",
          side,
          gshlTeam,
          lineupPosition,
          lineupStatus,
          stats: recorded?.stats ?? null,
        } satisfies NHLMatchupPlayerRow,
      ];
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}
