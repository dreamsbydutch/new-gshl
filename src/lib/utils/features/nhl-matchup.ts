import type { GSHLTeam, Player, PlayerDayStatLine } from "@gshl-types";
import type {
  NHLBoxscorePlayer,
  NHLGame,
  NHLMatchupPlayerRow,
} from "@gshl-lib/types/nhl";
import { getPlayerNhlAbbreviations } from "../domain/player";
import { z } from "zod";
import { nhlBoxscorePlayerSchema } from "./nhl";
import { buildNHLGameEvents } from "./nhl-events";

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

type NHLMatchupStatKey = keyof NHLBoxscorePlayer | "wins" | "gaa";
type NHLMatchupStatColumn = { key: NHLMatchupStatKey; label: string };

export function getNHLMatchupStatColumns(
  categories: readonly string[],
  goalies = false,
): NHLMatchupStatColumn[] {
  if (goalies)
    return [
      { key: "wins", label: "W" },
      { key: "goalsAgainst", label: "GA" },
      { key: "gaa", label: "GAA" },
      { key: "saves", label: "SV" },
      { key: "shotsAgainst", label: "SA" },
      { key: "savePctg", label: "SVP" },
      { key: "toi", label: "TOI" },
    ];
  const skaterColumns: Record<string, NHLMatchupStatColumn> = {
    G: { key: "goals", label: "G" },
    A: { key: "assists", label: "A" },
    P: { key: "points", label: "P" },
    PPP: { key: "powerPlayPoints", label: "PPP" },
    PPG: { key: "powerPlayGoals", label: "PPG" },
    SOG: { key: "sog", label: "SOG" },
    HIT: { key: "hits", label: "HIT" },
    BLK: { key: "blockedShots", label: "BLK" },
    PM: { key: "plusMinus", label: "+/−" },
    "+/-": { key: "plusMinus", label: "+/−" },
    PIM: { key: "pim", label: "PIM" },
  };
  const columns = categories.flatMap((category) => {
    const column = skaterColumns[category.trim().toUpperCase()];
    return column ? [column] : [];
  });
  return columns.filter(
    (column, index) =>
      columns.findIndex((entry) => entry.key === column.key) === index,
  );
}

export function formatNHLMatchupStat(
  stats: NHLBoxscorePlayer | null,
  key: NHLMatchupStatKey,
): string | number {
  if (!stats) return "–";
  if (key === "wins") return stats.decision === "W" ? 1 : 0;
  if (key === "gaa") {
    const match = /^(\d+):([0-5]\d)$/.exec(stats.toi ?? "");
    const seconds = match ? Number(match[1]) * 60 + Number(match[2]) : 0;
    return seconds > 0 && stats.goalsAgainst !== undefined
      ? ((stats.goalsAgainst * 3600) / seconds).toFixed(2)
      : "–";
  }
  const value = stats[key];
  return key === "savePctg" && typeof value === "number"
    ? value.toFixed(3)
    : (value ?? "–");
}

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
  season: z
    .object({ id: z.string(), categories: z.array(z.string()).default([]) })
    .nullable(),
  updatedAt: z.number(),
  players: z.array(
    z.object({
      id: z.string(),
      nhlPlayerId: z.number().nullable().optional(),
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
  const powerPlayPoints = new Map<number, number>();
  const powerPlayGoals = new Set(
    buildNHLGameEvents(game.eventFeed, [])
      .filter((event) => event.tags.includes("PP"))
      .map((event) => event.id),
  );
  for (const play of game.eventFeed?.plays ?? []) {
    if (!powerPlayGoals.has(play.eventId)) continue;
    for (const id of [
      play.details?.scoringPlayerId,
      play.details?.assist1PlayerId,
      play.details?.assist2PlayerId,
    ]) {
      if (id !== undefined)
        powerPlayPoints.set(id, (powerPlayPoints.get(id) ?? 0) + 1);
    }
  }
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
          nhlPlayerId:
            player.nhlApiId && /^\d+$/.test(player.nhlApiId)
              ? Number(player.nhlApiId)
              : null,
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
          stats: recorded
            ? {
                ...recorded.stats,
                powerPlayPoints: game.eventFeed
                  ? (powerPlayPoints.get(recorded.stats.playerId) ?? 0)
                  : recorded.stats.powerPlayPoints,
              }
            : null,
        } satisfies NHLMatchupPlayerRow,
      ];
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}
