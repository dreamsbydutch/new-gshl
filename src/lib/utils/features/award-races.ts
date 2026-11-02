import {
  AWARD_CATALOG,
  AWARD_CATALOG_BY_KEY,
  PLAYER_TROPHY_ICON_AWARDS,
  PLAYER_TROPHY_ICON_URLS,
  getAwardLabel,
} from "@gshl-lib/config/awards";
import type {
  AwardRaceCard,
  SeasonAwardsProps,
  TeamSeasonStatLine,
} from "@gshl-types";
import { formatStandingsRecord } from "../domain/season";

const rankFields: Record<string, keyof TeamSeasonStatLine> = {
  hart: "hartRk",
  norris: "norrisRk",
  vezina: "vezinaRk",
  calder: "calderRk",
  gmoy: "GMOYRk",
  jackAdams: "jackAdamsRk",
};
const number = (value: unknown): number | null =>
  value === null ||
  value === undefined ||
  value === "" ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);

// A stable shuffle avoids revealing rank without moving names on every render.
function displayOrder(id: string): number {
  let hash = 2166136261;
  for (const character of id)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Public stats stay ordered; rated award finalists conceal both order and scores. */
export function buildAwardRaces({
  season,
  teams,
  teamStats,
  players,
  playerTotals,
}: SeasonAwardsProps): AwardRaceCard[] {
  if (!season) return [];
  const finish = (
    entries: {
      id: string;
      name: string;
      logoUrl: string | null;
      value: number;
      tie: number;
      stat?: string;
    }[],
    ranked: boolean,
    key: string,
  ) => {
    const finalists = [...entries]
      .sort(
        (a, b) =>
          b.value - a.value || b.tie - a.tie || a.id.localeCompare(b.id),
      )
      .slice(0, 4);
    if (!ranked)
      finalists.sort(
        (a, b) =>
          displayOrder(`${key}:${a.id}`) - displayOrder(`${key}:${b.id}`) ||
          a.id.localeCompare(b.id),
      );
    return finalists.map(({ id, name, logoUrl, stat }) => ({
      id,
      name,
      logoUrl,
      ...(ranked ? { stat } : {}),
    }));
  };
  const teamCards = AWARD_CATALOG.filter((c) => c.key !== "gshlCup").map(
    (c) => {
      const ranked = [
        "president",
        "sunview",
        "hickory",
        "brophy",
        "rocket",
        "artRoss",
      ].includes(c.key);
      const contenders = teamStats
        .filter((r) => r.seasonId === season.id && r.seasonType === "RS")
        .flatMap((row) => {
          const team = teams.find((t) => t.id === row.gshlTeamId);
          if (!team) return [];
          if (
            ["sunview", "hickory"].includes(c.key) &&
            !`${team.confName} ${team.confAbbr}`
              .toLowerCase()
              .includes(c.key === "sunview" ? "sunview" : "hickory")
          )
            return [];
          const rank = rankFields[c.key];
          let value = rank
            ? number(row[rank])
            : number(
                c.key === "rocket"
                  ? row.G
                  : c.key === "artRoss"
                    ? row.P
                    : c.key === "selke"
                      ? row.HIT + row.BLK
                      : c.key === "ladyByng"
                        ? row.playersUsed
                        : ["sunview", "hickory"].includes(c.key)
                          ? row.conferenceRk
                          : row.overallRk,
              );
          if (
            value === null ||
            ((rank ||
              ["president", "sunview", "hickory", "brophy"].includes(c.key)) &&
              value <= 0)
          )
            return [];
          if (rank || ["president", "sunview", "hickory"].includes(c.key))
            value = -value;
          return [
            {
              id: team.id,
              name: team.name ?? team.abbr ?? "GSHL",
              logoUrl: team.logoUrl ?? null,
              value,
              tie: -(number(row.overallRk) ?? Infinity),
              stat:
                c.key === "rocket"
                  ? `${Number(row.G)} G`
                  : c.key === "artRoss"
                    ? `${Number(row.P)} P`
                    : formatStandingsRecord(row, season),
            },
          ];
        });
      return {
        id: `team-${c.key}`,
        title: c.fullName,
        imageUrl: c.imageUrl,
        ranked,
        contenders: finish(contenders, ranked, c.key),
      };
    },
  );
  const playerCards = (
    [
      "crosby",
      "lidstrom",
      "brodeur",
      "gretzky",
      "ovechkin",
      "connSmythe",
    ] as const
  ).map((key) => {
    const ranked = key === "gretzky" || key === "ovechkin";
    const contenders = playerTotals
      .filter(
        (r) =>
          r.seasonId === season.id &&
          r.seasonType === (key === "connSmythe" ? "PO" : "RS") &&
          Number(r.GP) > 0,
      )
      .flatMap((row) => {
        if (key === "lidstrom" && !row.nhlPos?.includes("D")) return [];
        if (
          key === "brodeur" &&
          row.posGroup !== "G" &&
          !row.nhlPos?.includes("G")
        )
          return [];
        const value = number(
          key === "ovechkin" ? row.G : key === "gretzky" ? row.P : row.Rating,
        );
        const player = players.find((p) => p.id === row.playerId);
        if (value === null || !player) return [];
        const team = (row.gshlTeamIds ?? [])
          .map((id) => teams.find((t) => t.id === id))
          .find(Boolean);
        return [
          {
            id: player.id,
            name: player.fullName,
            logoUrl: team?.logoUrl ?? null,
            value,
            tie: number(row.Rating) ?? -Infinity,
            stat: `${value} ${key === "ovechkin" ? "G" : "P"}`,
          },
        ];
      });
    return {
      id: `player-${key}`,
      title: getAwardLabel(key),
      imageUrl:
        PLAYER_TROPHY_ICON_URLS.get(key) ??
        AWARD_CATALOG_BY_KEY.get(PLAYER_TROPHY_ICON_AWARDS.get(key) ?? key)
          ?.imageUrl ??
        null,
      ranked,
      contenders: finish(contenders, ranked, key),
    };
  });
  return [...teamCards, ...playerCards].filter((c) => c.contenders.length > 0);
}
