import { AWARD_CATALOG, getAwardLabel } from "@gshl-lib/config/awards";
import type {
  AwardRaceCard,
  SeasonAwardsProps,
  TeamSeasonStatLine,
} from "@gshl-types";
import { getOwnerDisplayName } from "./season-awards";

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

/** Select by award merit, then alphabetize so display order never reveals the leader. */
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
    }[],
  ) =>
    [...entries]
      .sort(
        (a, b) =>
          b.value - a.value || b.tie - a.tie || a.id.localeCompare(b.id),
      )
      .slice(0, 5)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ id, name, logoUrl }) => ({ id, name, logoUrl }));
  const teamCards = AWARD_CATALOG.filter((c) => c.key !== "gshlCup").map(
    (c) => {
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
              name: ["gmoy", "jackAdams"].includes(c.key)
                ? (getOwnerDisplayName(team) ??
                  team.name ??
                  team.abbr ??
                  "GSHL")
                : (team.name ?? team.abbr ?? "GSHL"),
              logoUrl: team.logoUrl ?? null,
              value,
              tie: -(number(row.overallRk) ?? Infinity),
            },
          ];
        });
      return {
        id: `team-${c.key}`,
        title: c.fullName,
        contenders: finish(contenders),
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
          },
        ];
      });
    return {
      id: `player-${key}`,
      title: getAwardLabel(key),
      contenders: finish(contenders),
    };
  });
  return [...teamCards, ...playerCards].filter((c) => c.contenders.length > 0);
}
