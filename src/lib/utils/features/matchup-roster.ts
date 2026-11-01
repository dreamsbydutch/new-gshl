import type { MatchupPlayerDayRow, PlayerStatRow } from "@gshl-types";

/** Use a captured lineup when available; current membership fills missing days. */
export function matchupRosterForDate(
  players: readonly PlayerStatRow[],
  days: readonly MatchupPlayerDayRow[],
  date: string,
  currentRoster?: readonly PlayerStatRow[],
): PlayerStatRow[] {
  const captured = days.filter((player) => player.date === date);
  return captured.length
    ? captured.map((player) => ({ ...player, currentNhlTeam: player.nhlTeam }))
    : [...(currentRoster ?? players)];
}

export function groupMatchupPlayers(
  players: readonly PlayerStatRow[],
  roster: readonly PlayerStatRow[],
  isInjured: (player: PlayerStatRow) => boolean = () => false,
  splitStarters = false,
) {
  const byId = new Map(roster.map((player) => [player.id, player]));
  const groups = [
    {
      label: splitStarters ? "Starters" : "Active roster",
      players: [] as PlayerStatRow[],
    },
    { label: "Bench", players: [] as PlayerStatRow[] },
    { label: "No longer on roster", players: [] as PlayerStatRow[] },
    { label: "Injured / inactive", players: [] as PlayerStatRow[] },
  ];
  for (const player of players) {
    const member = byId.get(player.id);
    const status = {
      ...player,
      dailyPos: splitStarters
        ? (player.dailyPos ?? member?.dailyPos)
        : (member?.dailyPos ?? player.dailyPos),
    };
    const inactive = ["IR", "IR+", "IRPLUS", "NA", "IL", "IL+"].includes(
      String(status.dailyPos ?? "").toUpperCase(),
    );
    const starter = ["C", "LW", "RW", "D", "G", "UTIL"].includes(
      String(status.dailyPos ?? "").toUpperCase(),
    );
    const index = !member
      ? 2
      : inactive || isInjured(status)
        ? 3
        : splitStarters && !starter
          ? 1
          : 0;
    groups[index]!.players.push(player);
  }
  return groups.filter((group) => group.players.length > 0);
}
